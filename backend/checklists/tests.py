from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from checklists.models import Checklist, ChecklistComment, ChecklistItem
from trips.models import Trip, TripMember

User = get_user_model()


class ChecklistsApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_chk", "owner_chk@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_chk", "member_chk@example.com", "StrongPass1!")
        self.outsider = User.objects.create_user("outsider_chk", "outsider_chk@example.com", "StrongPass1!")

        self.trip = Trip.objects.create(
            title="Checklist trip",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def create_checklist(self, title="Main list"):
        return Checklist.objects.create(trip=self.trip, title=title, created_by=self.owner)

    def create_item(self, checklist, title="Task 1"):
        return ChecklistItem.objects.create(
            checklist=checklist,
            title=title,
            assignee=self.member,
            created_by=self.owner,
        )

    def test_create_and_list_checklists(self):
        self.auth(self.owner)
        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/",
            {"title": "Packing"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data["title"], "Packing")

        list_response = self.client.get(f"/api/trips/{self.trip.id}/checklists/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["title"], "Packing")

    def test_create_item_with_member_assignee(self):
        checklist = self.create_checklist()
        self.auth(self.owner)

        response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/",
            {
                "title": "Buy tickets",
                "assignee_id": self.member.id,
                "due_date": str(date.today() + timedelta(days=1)),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        item = ChecklistItem.objects.get(checklist=checklist, title="Buy tickets")
        self.assertEqual(item.assignee_id, self.member.id)

    def test_create_item_with_non_member_assignee_rejected(self):
        checklist = self.create_checklist()
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/",
            {"title": "Invalid assignee", "assignee_id": self.outsider.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assignee_id", response.data)

    def test_update_item_done_and_assignee(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist)

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/",
            {"is_done": True, "assignee_id": self.owner.id, "title": "Task done"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertTrue(item.is_done)
        self.assertEqual(item.assignee_id, self.owner.id)
        self.assertEqual(item.title, "Task done")

    def test_comments_crud_and_permissions(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist)

        self.auth(self.owner)
        create_comment = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/comments/",
            {"text": "Initial note"},
            format="json",
        )
        self.assertEqual(create_comment.status_code, status.HTTP_201_CREATED)
        comment_id = create_comment.data["id"]

        self.auth(self.member)
        forbidden_patch = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/comments/{comment_id}/",
            {"text": "Hack"},
            format="json",
        )
        self.assertEqual(forbidden_patch.status_code, status.HTTP_403_FORBIDDEN)

        self.auth(self.owner)
        patch_response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/comments/{comment_id}/",
            {"text": "Updated note"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["text"], "Updated note")

        delete_response = self.client.delete(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/comments/{comment_id}/",
        )
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

    def test_empty_comment_rejected(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist)

        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/comments/",
            {"text": "   "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_member_cannot_retrieve_item(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist)

        self.auth(self.outsider)
        response = self.client.get(f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_member_cannot_list_or_create_checklists(self):
        self.auth(self.outsider)

        list_response = self.client.get(f"/api/trips/{self.trip.id}/checklists/")
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/",
            {"title": "Hack list"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_member_cannot_list_or_create_checklist_items(self):
        checklist = self.create_checklist()

        self.auth(self.outsider)

        list_response = self.client.get(f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/")
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/",
            {"title": "Hack task"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_and_update_item_with_null_assignee(self):
        checklist = self.create_checklist()
        self.auth(self.owner)

        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/",
            {"title": "No assignee", "assignee_id": None},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        item = ChecklistItem.objects.get(checklist=checklist, title="No assignee")
        self.assertIsNone(item.assignee_id)

        due = str(date.today() + timedelta(days=3))
        update_response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/",
            {"assignee_id": None, "due_date": due},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(str(item.due_date), due)
        self.assertIsNone(item.assignee_id)

    def test_list_items_uses_read_serializer(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist, title="List me")
        ChecklistComment.objects.create(item=item, user=self.owner, text="comment")

        self.auth(self.owner)
        response = self.client.get(f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "List me")
        self.assertEqual(len(response.data[0]["comments"]), 1)

    def test_comment_patch_empty_text_rejected(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist)
        comment = ChecklistComment.objects.create(item=item, user=self.owner, text="start")

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/comments/{comment.id}/",
            {"text": "   "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_models_str(self):
        checklist = self.create_checklist("Readable")
        item = self.create_item(checklist, title="Readable item")
        self.assertEqual(str(checklist), f"{self.trip.id}: Readable")
        self.assertEqual(str(item), f"{checklist.id}: Readable item")

    def test_update_item_with_non_member_assignee_rejected(self):
        checklist = self.create_checklist()
        item = self.create_item(checklist)
        self.auth(self.owner)

        response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/",
            {"assignee_id": self.outsider.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assignee_id", response.data)

    @patch("checklists.views.safe_send_notification")
    def test_update_item_reassignment_sends_notification(self, mocked_send):
        checklist = self.create_checklist()
        item = ChecklistItem.objects.create(
            checklist=checklist,
            title="Reassign me",
            created_by=self.owner,
            assignee=self.owner,
        )
        mocked_send.reset_mock()

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/",
            {"assignee_id": self.member.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mocked_send.assert_called_once()
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("назначена задача", subject)
        self.assertEqual(recipients, [self.member.email])

    @patch("checklists.views.safe_send_notification")
    def test_update_item_details_for_same_assignee_sends_notification(self, mocked_send):
        checklist = self.create_checklist()
        item = self.create_item(checklist, title="Original task")
        mocked_send.reset_mock()

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item.id}/",
            {
                "title": "Updated task",
                "due_date": str(date.today() + timedelta(days=5)),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mocked_send.assert_called_once()
        subject, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Задача обновлена", subject)
        self.assertIn("Updated task", message)
        self.assertEqual(recipients, [self.member.email])
