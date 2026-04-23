from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory
from rest_framework.test import APITestCase

from expenses.models import Expense, ExpenseCategory, ExpenseShare
from trips.models import Trip, TripInvite, TripMember
from trips.permissions import IsTripMember

User = get_user_model()


class TripsApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner", "owner@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member", "member@example.com", "StrongPass1!")
        self.outsider = User.objects.create_user("outsider", "outsider@example.com", "StrongPass1!")

        self.trip = Trip.objects.create(
            title="Moscow",
            description="Test trip",
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
            owner=self.owner,
        )
        self.owner_membership = TripMember.objects.create(
            trip=self.trip,
            user=self.owner,
            role=TripMember.Role.OWNER,
        )
        self.member_membership = TripMember.objects.create(
            trip=self.trip,
            user=self.member,
            role=TripMember.Role.MEMBER,
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_create_trip_creates_owner_membership(self):
        self.auth(self.owner)
        payload = {
            "title": "New trip",
            "description": "Go",
            "start_date": str(date.today()),
            "end_date": str(date.today() + timedelta(days=5)),
        }
        response = self.client.post("/api/trips/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        trip_id = response.data["id"]
        self.assertTrue(
            TripMember.objects.filter(
                trip_id=trip_id,
                user=self.owner,
                role=TripMember.Role.OWNER,
            ).exists()
        )

    def test_create_trip_requires_dates(self):
        self.auth(self.owner)
        response = self.client.post(
            "/api/trips/",
            {"title": "Broken trip", "end_date": str(date.today())},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("start_date", response.data)

    def test_list_returns_only_member_trips(self):
        private_trip = Trip.objects.create(
            title="Private",
            owner=self.outsider,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=1),
        )
        TripMember.objects.create(trip=private_trip, user=self.outsider, role=TripMember.Role.OWNER)

        self.auth(self.owner)
        response = self.client.get("/api/trips/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        ids = {row["id"] for row in response.data}
        self.assertIn(self.trip.id, ids)
        self.assertNotIn(private_trip.id, ids)

    def test_create_invite_only_owner(self):
        self.auth(self.member)
        member_response = self.client.post(f"/api/trips/{self.trip.id}/create_invite/", {}, format="json")
        self.assertEqual(member_response.status_code, status.HTTP_403_FORBIDDEN)

        self.auth(self.owner)
        owner_response = self.client.post(f"/api/trips/{self.trip.id}/create_invite/", {}, format="json")
        self.assertEqual(owner_response.status_code, status.HTTP_201_CREATED)
        self.assertIn("token", owner_response.data)

    def test_add_member_only_owner_and_duplicate_guard(self):
        self.auth(self.member)
        forbidden = self.client.post(
            f"/api/trips/{self.trip.id}/members/add/",
            {"user_id": self.outsider.id},
            format="json",
        )
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        self.auth(self.owner)
        created = self.client.post(
            f"/api/trips/{self.trip.id}/members/add/",
            {"user_id": self.outsider.id},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertTrue(TripMember.objects.filter(trip=self.trip, user=self.outsider).exists())

        duplicate = self.client.post(
            f"/api/trips/{self.trip.id}/members/add/",
            {"user_id": self.outsider.id},
            format="json",
        )
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_remove_member_rules(self):
        outsider_membership = TripMember.objects.create(
            trip=self.trip,
            user=self.outsider,
            role=TripMember.Role.MEMBER,
        )

        self.auth(self.member)
        forbidden = self.client.delete(f"/api/trips/{self.trip.id}/members/{outsider_membership.id}/")
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        self.auth(self.owner)
        removed = self.client.delete(f"/api/trips/{self.trip.id}/members/{outsider_membership.id}/")
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TripMember.objects.filter(id=outsider_membership.id).exists())

        cannot_remove_owner = self.client.delete(f"/api/trips/{self.trip.id}/members/{self.owner_membership.id}/")
        self.assertEqual(cannot_remove_owner.status_code, status.HTTP_400_BAD_REQUEST)

    def test_leave_for_member_success_and_owner_rejected(self):
        self.auth(self.member)
        member_leave = self.client.post(f"/api/trips/{self.trip.id}/leave/", {}, format="json")
        self.assertEqual(member_leave.status_code, status.HTTP_200_OK)
        self.assertFalse(TripMember.objects.filter(trip=self.trip, user=self.member).exists())

        self.auth(self.owner)
        owner_leave = self.client.post(f"/api/trips/{self.trip.id}/leave/", {}, format="json")
        self.assertEqual(owner_leave.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invite_info_and_accept_flow(self):
        self.auth(self.owner)
        invite_response = self.client.post(f"/api/trips/{self.trip.id}/create_invite/", {}, format="json")
        token = invite_response.data["token"]

        self.auth(self.outsider)
        info = self.client.get(f"/api/invites/info/{token}/")
        self.assertEqual(info.status_code, status.HTTP_200_OK)
        self.assertFalse(info.data["is_member"])
        self.assertEqual(info.data["trip"]["id"], self.trip.id)

        accept = self.client.post(f"/api/invites/accept/{token}/", {}, format="json")
        self.assertEqual(accept.status_code, status.HTTP_200_OK)
        self.assertEqual(accept.data["trip_id"], self.trip.id)
        self.assertTrue(TripMember.objects.filter(trip=self.trip, user=self.outsider).exists())

        invite = TripInvite.objects.get(token=token)
        self.assertTrue(invite.is_used)
        self.assertEqual(invite.used_by_id, self.outsider.id)

        second_accept = self.client.post(f"/api/invites/accept/{token}/", {}, format="json")
        self.assertEqual(second_accept.status_code, status.HTTP_400_BAD_REQUEST)

    def test_balance_and_stats_endpoints(self):
        category = ExpenseCategory.objects.create(name="Food")
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Lunch",
            amount=Decimal("120.00"),
            currency="RUB",
            amount_rub=Decimal("120.00"),
            fx_rate=Decimal("1.000000"),
            category=category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("1.00"))

        self.auth(self.owner)
        balance_response = self.client.get(f"/api/trips/{self.trip.id}/balance/")
        self.assertEqual(balance_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(balance_response.data["net"][str(self.owner.id)]), Decimal("60.00"))
        self.assertEqual(Decimal(balance_response.data["net"][str(self.member.id)]), Decimal("-60.00"))
        self.assertEqual(len(balance_response.data["transfers"]), 1)
        self.assertEqual(balance_response.data["transfers"][0]["from_user"], self.member.id)
        self.assertEqual(balance_response.data["transfers"][0]["to_user"], self.owner.id)
        self.assertEqual(Decimal(balance_response.data["transfers"][0]["amount"]), Decimal("60.00"))

        stats_response = self.client.get(f"/api/trips/{self.trip.id}/stats/")
        self.assertEqual(stats_response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(stats_response.data["total"]), Decimal("120.00"))
        by_category = {row["category"]: Decimal(row["amount"]) for row in stats_response.data["by_category"]}
        self.assertEqual(by_category["Food"], Decimal("120.00"))

    def test_retrieve_trip_returns_members(self):
        self.auth(self.owner)
        response = self.client.get(f"/api/trips/{self.trip.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("members", response.data)
        self.assertEqual(len(response.data["members"]), 2)

    def test_trip_update_rejects_end_before_start(self):
        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/",
            {"end_date": str(date.today() - timedelta(days=1))},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", response.data)

    def test_trip_update_with_valid_dates(self):
        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/",
            {"end_date": str(date.today() + timedelta(days=4))},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["end_date"], str(date.today() + timedelta(days=4)))

    def test_create_trip_rejects_missing_end_and_bad_period(self):
        self.auth(self.owner)

        missing_end = self.client.post(
            "/api/trips/",
            {"title": "No end", "start_date": str(date.today())},
            format="json",
        )
        self.assertEqual(missing_end.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", missing_end.data)

        bad_period = self.client.post(
            "/api/trips/",
            {
                "title": "Bad period",
                "start_date": str(date.today() + timedelta(days=2)),
                "end_date": str(date.today()),
            },
            format="json",
        )
        self.assertEqual(bad_period.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("end_date", bad_period.data)

    def test_delete_trip_forbidden_for_non_owner(self):
        self.auth(self.member)
        response = self.client.delete(f"/api/trips/{self.trip.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_trip_for_owner(self):
        self.auth(self.owner)
        response = self.client.delete(f"/api/trips/{self.trip.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Trip.objects.filter(id=self.trip.id).exists())

    def test_remove_member_cannot_remove_self(self):
        self.auth(self.owner)
        response = self.client.delete(f"/api/trips/{self.trip.id}/members/{self.owner_membership.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Cannot remove yourself.")

    def test_remove_member_cannot_remove_another_owner(self):
        second_owner = TripMember.objects.create(
            trip=self.trip,
            user=self.outsider,
            role=TripMember.Role.OWNER,
        )
        self.auth(self.owner)
        response = self.client.delete(f"/api/trips/{self.trip.id}/members/{second_owner.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Cannot remove owner.")

    def test_add_member_requires_user_id_and_existing_user(self):
        self.auth(self.owner)

        missing_user_id = self.client.post(f"/api/trips/{self.trip.id}/members/add/", {}, format="json")
        self.assertEqual(missing_user_id.status_code, status.HTTP_400_BAD_REQUEST)

        not_found = self.client.post(
            f"/api/trips/{self.trip.id}/members/add/",
            {"user_id": 999999},
            format="json",
        )
        self.assertEqual(not_found.status_code, status.HTTP_404_NOT_FOUND)

    def test_invite_info_invalid_and_expired(self):
        self.auth(self.owner)

        invalid = self.client.get("/api/invites/info/00000000-0000-0000-0000-000000000000/")
        self.assertEqual(invalid.status_code, status.HTTP_404_NOT_FOUND)

        expired_invite = TripInvite.objects.create(
            trip=self.trip,
            created_by=self.owner,
            expires_at=timezone.now() - timedelta(minutes=5),
        )
        self.auth(self.member)
        expired = self.client.get(f"/api/invites/info/{expired_invite.token}/")
        self.assertEqual(expired.status_code, status.HTTP_400_BAD_REQUEST)

    def test_trip_model_str(self):
        self.assertEqual(str(self.trip), f"{self.trip.title} ({self.owner.id})")

    def test_is_trip_member_permission_item_paths_and_fallbacks(self):
        factory = APIRequestFactory()
        request = factory.get("/")
        request.user = self.owner
        permission = IsTripMember()

        checklist_item_obj = SimpleNamespace(item=SimpleNamespace(checklist=SimpleNamespace(trip=self.trip)))
        self.assertTrue(permission.has_object_permission(request, None, checklist_item_obj))

        day_item_obj = SimpleNamespace(item=SimpleNamespace(day=SimpleNamespace(trip=self.trip)))
        self.assertTrue(permission.has_object_permission(request, None, day_item_obj))

        wrong_item_obj = SimpleNamespace(item=SimpleNamespace())
        self.assertFalse(permission.has_object_permission(request, None, wrong_item_obj))

        unknown_obj = SimpleNamespace()
        self.assertFalse(permission.has_object_permission(request, None, unknown_obj))
