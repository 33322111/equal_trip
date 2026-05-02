from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from checklists.models import Checklist, ChecklistItem
from expenses.models import Expense
from itinerary.models import DayPlan, DayPlanItem
from notifications.email import send_notification
from payments.models import Settlement
from trips.models import Trip, TripMember

User = get_user_model()


class NotificationSignalsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_ntf", "owner_ntf@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_ntf", "member_ntf@example.com", "StrongPass1!")
        self.trip = Trip.objects.create(
            title="Notify trip",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=1),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_create_sends_notification_to_other_members(self, mocked_send):
        Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Taxi",
            amount=Decimal("10.00"),
            currency="USD",
            amount_rub=Decimal("750.00"),
            fx_rate=Decimal("75.000000"),
        )

        self.assertEqual(mocked_send.call_count, 1)
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Новый расход", subject)
        self.assertIn(self.member.email, recipients)
        self.assertNotIn(self.owner.email, recipients)

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_update_sends_notification(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Hotel",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        expense.title = "Hotel updated"
        expense.save(update_fields=["title"])

        self.assertEqual(mocked_send.call_count, 1)
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Расход обновлён", subject)
        self.assertIn(self.member.email, recipients)

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_delete_sends_notification(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Delete expense",
            amount=Decimal("45.00"),
            currency="RUB",
            amount_rub=Decimal("45.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        expense.delete()

        self.assertEqual(mocked_send.call_count, 1)
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Расход удалён", subject)
        self.assertIn(self.owner.email, recipients)
        self.assertIn(self.member.email, recipients)

    @patch("notifications.signals_payments.safe_send_notification")
    def test_settlement_create_notifies_receiver(self, mocked_send):
        Settlement.objects.create(
            trip=self.trip,
            from_user=self.owner,
            to_user=self.member,
            amount=Decimal("99.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )

        self.assertEqual(mocked_send.call_count, 1)
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Вам отправлена оплата", subject)
        self.assertEqual(recipients, [self.member.email])

    @patch("notifications.signals_payments.safe_send_notification")
    def test_settlement_confirm_notifies_sender(self, mocked_send):
        settlement = Settlement.objects.create(
            trip=self.trip,
            from_user=self.owner,
            to_user=self.member,
            amount=Decimal("25.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )
        mocked_send.reset_mock()

        settlement.status = Settlement.Status.CONFIRMED
        settlement.save(update_fields=["status"])

        self.assertEqual(mocked_send.call_count, 1)
        subject, _, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Оплата подтверждена", subject)
        self.assertEqual(recipients, [self.owner.email])

    @patch("notifications.signals_payments.safe_send_notification")
    def test_settlement_pending_update_does_not_notify(self, mocked_send):
        settlement = Settlement.objects.create(
            trip=self.trip,
            from_user=self.owner,
            to_user=self.member,
            amount=Decimal("10.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )
        mocked_send.reset_mock()

        settlement.amount = Decimal("12.00")
        settlement.save(update_fields=["amount"])

        self.assertEqual(mocked_send.call_count, 0)

    @patch("notifications.email.send_mail")
    def test_send_notification_skips_empty_recipients(self, mocked_send_mail):
        send_notification("Subj", "Body", [])
        self.assertEqual(mocked_send_mail.call_count, 0)

    @override_settings(EMAIL_NOTIFICATIONS_ASYNC=False)
    @patch("logging.exception")
    @patch("notifications.utils.send_notification", side_effect=Exception("boom"))
    def test_expense_signal_logs_exception_on_send_failure(self, _, mocked_log):
        Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Will fail",
            amount=Decimal("15.00"),
            currency="RUB",
            amount_rub=Decimal("15.00"),
            fx_rate=Decimal("1.000000"),
        )
        self.assertEqual(mocked_log.call_count, 1)

    @override_settings(EMAIL_NOTIFICATIONS_ASYNC=False)
    @patch("logging.exception")
    @patch("notifications.utils.send_notification", side_effect=Exception("boom"))
    def test_expense_delete_signal_logs_exception_on_send_failure(self, _, mocked_log):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Delete fail",
            amount=Decimal("19.00"),
            currency="RUB",
            amount_rub=Decimal("19.00"),
            fx_rate=Decimal("1.000000"),
        )

        mocked_log.reset_mock()
        expense.delete()
        self.assertEqual(mocked_log.call_count, 1)

    @override_settings(EMAIL_NOTIFICATIONS_ASYNC=False)
    @patch("logging.exception")
    @patch("notifications.utils.send_notification", side_effect=Exception("boom"))
    def test_settlement_signal_logs_exception_on_send_failure(self, _, mocked_log):
        Settlement.objects.create(
            trip=self.trip,
            from_user=self.owner,
            to_user=self.member,
            amount=Decimal("31.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )
        self.assertEqual(mocked_log.call_count, 1)

    @override_settings(EMAIL_NOTIFICATIONS_ASYNC=True)
    @patch("notifications.email._submit_notification")
    def test_send_notification_schedules_background_send(self, mocked_submit):
        with self.captureOnCommitCallbacks(execute=True):
            send_notification("Subj", "Body", ["member@example.com"])
        self.assertEqual(mocked_submit.call_count, 1)


class NotificationViewActionsTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_ntf_api", "owner_ntf_api@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_ntf_api", "member_ntf_api@example.com", "StrongPass1!")
        self.third = User.objects.create_user("third_ntf_api", "third_ntf_api@example.com", "StrongPass1!")
        self.trip = Trip.objects.create(
            title="Notify trip api",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

    def auth(self, user):
        self.client.force_authenticate(user=user)

    @patch("trips.views.safe_send_notification")
    def test_trip_update_notifies_other_members(self, mocked_send):
        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/",
            {"title": "Updated notify trip", "description": "New desc"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mocked_send.call_count, 1)
        subject, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn("обновлена", subject)
        self.assertIn("Описание поездки обновлено", message)
        self.assertEqual(recipients, [self.member.email])

    @patch("trips.views.safe_send_notification")
    def test_add_member_sends_notifications(self, mocked_send):
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/members/add/",
            {"user_id": self.third.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mocked_send.call_count, 2)
        first_call = mocked_send.call_args_list[0][0]
        second_call = mocked_send.call_args_list[1][0]
        self.assertEqual(first_call[2], [self.third.email])
        self.assertEqual(second_call[2], [self.member.email])

    @patch("checklists.views.safe_send_notification")
    def test_checklist_assignment_and_comment_send_notifications(self, mocked_send):
        checklist = Checklist.objects.create(trip=self.trip, title="Packing", created_by=self.owner)

        self.auth(self.owner)
        create_response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/",
            {"title": "Passport", "assignee_id": self.member.id, "due_date": str(date.today())},
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mocked_send.call_count, 1)
        self.assertEqual(mocked_send.call_args[0][2], [self.member.email])

        mocked_send.reset_mock()
        item_id = ChecklistItem.objects.get(checklist=checklist, title="Passport").id
        comment_response = self.client.post(
            f"/api/trips/{self.trip.id}/checklists/{checklist.id}/items/{item_id}/comments/",
            {"text": "Не забудь проверить визу"},
            format="json",
        )
        self.assertEqual(comment_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(mocked_send.call_count, 1)
        subject, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Новый комментарий", subject)
        self.assertIn("Не забудь проверить визу", message)
        self.assertEqual(recipients, [self.member.email])

    @patch("itinerary.views.safe_send_notification")
    def test_itinerary_status_change_sends_notification(self, mocked_send):
        day = DayPlan.objects.create(trip=self.trip, date=date.today(), title="Day 1")
        item = DayPlanItem.objects.create(day=day, title="Museum", assignee=self.member)

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/days/{day.id}/items/{item.id}/",
            {"is_done": True},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mocked_send.call_count, 1)
        subject, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn("Статус активности", subject)
        self.assertIn("выполнено", message)
        self.assertEqual(recipients, [self.member.email])
