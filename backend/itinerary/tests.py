from datetime import date, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from itinerary.models import DayPlan, DayPlanComment, DayPlanItem
from trips.models import Trip, TripMember

User = get_user_model()


class ItineraryApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_day", "owner_day@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_day", "member_day@example.com", "StrongPass1!")
        self.outsider = User.objects.create_user("outsider_day", "outsider_day@example.com", "StrongPass1!")

        self.trip = Trip.objects.create(
            title="Itinerary trip",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=3),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def create_day(self):
        return DayPlan.objects.create(trip=self.trip, date=date.today(), title="Day 1")

    def create_item(self, day):
        return DayPlanItem.objects.create(
            day=day,
            title="Morning walk",
            time_from="09:00",
            time_to="10:00",
            assignee=self.member,
            description="Park",
        )

    def test_create_and_list_days(self):
        self.auth(self.owner)
        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/days/",
            {"date": str(date.today()), "title": "Arrival"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        list_response = self.client.get(f"/api/trips/{self.trip.id}/days/")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)
        self.assertEqual(list_response.data[0]["items_count"], 0)

    def test_create_day_item_with_member_assignee(self):
        day = self.create_day()
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/",
            {
                "title": "Museum",
                "time_from": "11:00",
                "time_to": "13:00",
                "description": "History museum",
                "assignee_id": self.member.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        item = DayPlanItem.objects.get(day=day, title="Museum")
        self.assertEqual(item.assignee_id, self.member.id)

    def test_create_day_item_with_non_member_assignee_rejected(self):
        day = self.create_day()
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/",
            {"title": "Bad assignee", "assignee_id": self.outsider.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assignee_id", response.data)

    def test_create_day_item_rejects_end_time_before_start_time(self):
        day = self.create_day()
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/",
            {
                "title": "Broken time",
                "time_from": "15:00",
                "time_to": "11:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("time_to", response.data)

    def test_patch_day_item(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {
                "title": "Updated walk",
                "description": "Updated description",
                "is_done": True,
                "time_from": "10:30",
                "time_to": "11:30",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Updated walk")
        self.assertEqual(response.data["description"], "Updated description")
        self.assertTrue(response.data["is_done"])
        self.assertEqual(response.data["time_from"], "10:30:00")

    def test_patch_day_item_rejects_end_time_before_start_time(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {
                "time_from": "18:00",
                "time_to": "12:00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("time_to", response.data)

    def test_patch_day_item_rejects_non_member_assignee(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {"assignee_id": self.outsider.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assignee_id", response.data)

    def test_patch_day_item_accepts_null_assignee(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {"assignee_id": None},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertIsNone(item.assignee_id)

    def test_comments_crud_and_permissions(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.owner)
        create_comment = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/comments/",
            {"text": "Meet at lobby"},
            format="json",
        )
        self.assertEqual(create_comment.status_code, status.HTTP_201_CREATED)
        comment_id = create_comment.data["id"]

        self.auth(self.member)
        forbidden_patch = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/comments/{comment_id}/",
            {"text": "Wrong edit"},
            format="json",
        )
        self.assertEqual(forbidden_patch.status_code, status.HTTP_403_FORBIDDEN)

        self.auth(self.owner)
        patch_response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/comments/{comment_id}/",
            {"text": "Meet at front desk"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["text"], "Meet at front desk")

        delete_response = self.client.delete(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/comments/{comment_id}/",
        )
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

    def test_empty_comment_rejected(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/comments/",
            {"text": "   "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_member_cannot_patch_day_item(self):
        day = self.create_day()
        item = self.create_item(day)

        self.auth(self.outsider)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {"title": "No access"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_member_cannot_list_or_create_days(self):
        self.auth(self.outsider)

        list_response = self.client.get(f"/api/trips/{self.trip.id}/days/")
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/days/",
            {"date": str(date.today()), "title": "Hack day"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_member_cannot_list_or_create_day_items(self):
        day = self.create_day()

        self.auth(self.outsider)

        list_response = self.client.get(f"/api/trips/{self.trip.id}/days/{day.id}/items/")
        self.assertEqual(list_response.status_code, status.HTTP_403_FORBIDDEN)

        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/",
            {"title": "Hack activity"},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_item_with_null_assignee(self):
        day = self.create_day()
        self.auth(self.owner)

        response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/",
            {
                "title": "No assignee",
                "assignee_id": None,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        item = DayPlanItem.objects.get(day=day, title="No assignee")
        self.assertIsNone(item.assignee_id)

    def test_patch_comment_empty_text_rejected(self):
        day = self.create_day()
        item = self.create_item(day)
        comment = DayPlanComment.objects.create(item=item, user=self.owner, text="start")

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/comments/{comment.id}/",
            {"text": " "},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_dayplan_model_str(self):
        day = self.create_day()
        self.assertEqual(str(day), f"{self.trip.id} — {day.date}")

    def test_retrieve_day_item_uses_read_serializer(self):
        day = self.create_day()
        item = self.create_item(day)
        DayPlanComment.objects.create(item=item, user=self.owner, text="Bring tickets")

        self.auth(self.owner)
        response = self.client.get(f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Morning walk")
        self.assertEqual(len(response.data["comments"]), 1)
        self.assertEqual(response.data["assignee"]["id"], self.member.id)

    @patch("itinerary.views.safe_send_notification")
    def test_create_day_item_assignment_sends_notification(self, mocked_send):
        day = self.create_day()
        self.auth(self.owner)

        response = self.client.post(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/",
            {
                "title": "Cafe",
                "assignee_id": self.member.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        mocked_send.assert_called_once()
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("назначена активность", subject)
        self.assertEqual(recipients, [self.member.email])

    @patch("itinerary.views.safe_send_notification")
    def test_patch_day_item_reassignment_sends_notification(self, mocked_send):
        day = self.create_day()
        item = DayPlanItem.objects.create(day=day, title="Self task", assignee=self.owner)
        mocked_send.reset_mock()

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {"assignee_id": self.member.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mocked_send.assert_called_once()
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("назначена активность", subject)
        self.assertEqual(recipients, [self.member.email])

    @patch("itinerary.views.safe_send_notification")
    def test_patch_day_item_details_for_same_assignee_sends_notification(self, mocked_send):
        day = self.create_day()
        item = self.create_item(day)
        mocked_send.reset_mock()

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {
                "title": "Evening walk",
                "time_from": "18:00",
                "time_to": "19:00",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mocked_send.assert_called_once()
        subject, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Активность обновлена", subject)
        self.assertIn("Evening walk", message)
        self.assertEqual(recipients, [self.member.email])
