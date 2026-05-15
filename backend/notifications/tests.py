from datetime import date, datetime, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from checklists.models import Checklist, ChecklistItem
from expenses.models import Expense
from itinerary.models import DayPlan, DayPlanItem
from notifications.email import (
    _log_async_failure,
    _normalize_recipients,
    _send_notification_sync,
    _submit_notification,
    send_notification,
)
from notifications.signals_expenses import capture_previous_expense_state
from notifications.utils import (
    build_trip_message,
    format_date_value,
    format_datetime_value,
    format_trip_period,
    trip_member_emails,
    trip_url,
    user_emails,
)
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
    def test_expense_update_uses_notification_actor_for_message_and_recipients(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Dinner",
            amount=Decimal("50.00"),
            currency="RUB",
            amount_rub=Decimal("50.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        expense._notification_actor = self.member
        expense.title = "Dinner updated"
        expense.save(update_fields=["title"])

        self.assertEqual(mocked_send.call_count, 1)
        _, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn(f"Пользователь {self.member.username} обновил расход.", message)
        self.assertEqual(recipients, [self.owner.email])

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_update_with_coordinates_includes_them_in_message(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Cafe",
            amount=Decimal("12.00"),
            currency="RUB",
            amount_rub=Decimal("12.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        expense.lat = Decimal("55.755800")
        expense.lng = Decimal("37.617300")
        expense.title = "Cafe updated"
        expense.save(update_fields=["lat", "lng", "title"])

        self.assertEqual(mocked_send.call_count, 1)
        _, message, _, _ = mocked_send.call_args[0]
        self.assertIn("Координаты: 55.755800, 37.617300", message)

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_receipt_only_update_does_not_send_notification(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Receipt only",
            amount=Decimal("55.00"),
            currency="RUB",
            amount_rub=Decimal("55.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        expense.receipt = "receipts/receipt-only.pdf"
        expense.save(update_fields=["receipt"])

        self.assertEqual(mocked_send.call_count, 0)

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
        self.assertEqual(recipients, [self.member.email])

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_delete_uses_notification_actor_for_message_and_recipients(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Delete by other",
            amount=Decimal("45.00"),
            currency="RUB",
            amount_rub=Decimal("45.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        expense._notification_actor = self.member
        expense.delete()

        self.assertEqual(mocked_send.call_count, 1)
        _, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn(f"Пользователь {self.member.username} удалил расход.", message)
        self.assertEqual(recipients, [self.owner.email])

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


class NotificationHelpersTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_ntf_helper", "owner_ntf_helper@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_ntf_helper", "member_ntf_helper@example.com", "StrongPass1!")
        self.trip = Trip.objects.create(
            title="Helpers trip",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=1),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

    @override_settings(FRONTEND_URL="https://example.com/")
    def test_notification_utils_formatters_and_message_helpers(self):
        trip_without_dates = Trip(title="No dates", owner=self.owner)
        trip_start_only = Trip(title="Start only", owner=self.owner, start_date=date(2026, 5, 1))
        trip_end_only = Trip(title="End only", owner=self.owner, end_date=date(2026, 5, 2))

        self.assertEqual(trip_url(self.trip), f"https://example.com/trips/{self.trip.id}")
        self.assertEqual(format_trip_period(self.trip), f"{self.trip.start_date:%d.%m.%Y} — {self.trip.end_date:%d.%m.%Y}")
        self.assertEqual(format_trip_period(trip_start_only), "с 01.05.2026")
        self.assertEqual(format_trip_period(trip_end_only), "до 02.05.2026")
        self.assertEqual(format_trip_period(trip_without_dates), "не указаны")
        self.assertEqual(format_date_value(None), "не указана")

        with timezone.override("Europe/Moscow"):
            self.assertEqual(
                format_datetime_value(datetime(2026, 5, 1, 10, 30)),
                "01.05.2026 10:30",
            )
            aware_value = timezone.make_aware(datetime(2026, 5, 1, 10, 30), timezone.get_current_timezone())
            self.assertEqual(format_datetime_value(aware_value, include_time=False), "01.05.2026")
        self.assertEqual(format_datetime_value(None), "не указано")
        self.assertEqual(
            format_datetime_value(None, include_time=False, date_only_value=date(2026, 5, 3)),
            "03.05.2026",
        )

        message = build_trip_message(self.trip, ["Первая строка", "", None, "Вторая строка"])
        self.assertIn("Поездка: Helpers trip", message)
        self.assertIn("Первая строка", message)
        self.assertIn("Вторая строка", message)
        self.assertNotIn("None", message)
        self.assertEqual(
            user_emails(self.owner, None, self.member, SimpleNamespace(email="other@example.com")),
            [self.owner.email, self.member.email, "other@example.com"],
        )

    def test_trip_member_emails_can_exclude_users(self):
        self.assertEqual(
            trip_member_emails(self.trip, exclude_user_ids=[self.owner.id]),
            [self.member.email],
        )

    @patch("notifications.email.send_mail")
    def test_send_notification_sync_and_normalize_recipients(self, mocked_send_mail):
        normalized = _normalize_recipients([" user@example.com ", "", "user@example.com", "other@example.com"])
        self.assertEqual(normalized, ["user@example.com", "other@example.com"])

        _send_notification_sync("Subject", "Body", normalized)
        mocked_send_mail.assert_called_once_with(
            subject="Subject",
            message="Body",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=["user@example.com", "other@example.com"],
            fail_silently=False,
        )

    @override_settings(EMAIL_NOTIFICATIONS_ASYNC=False)
    @patch("notifications.email._send_notification_sync")
    def test_send_notification_sync_path_uses_normalized_recipients(self, mocked_sync):
        send_notification("Subj", "Body", [" user@example.com ", "user@example.com", "other@example.com"])
        mocked_sync.assert_called_once_with("Subj", "Body", ["user@example.com", "other@example.com"])

    @patch("logging.error")
    def test_log_async_failure_ignores_success_and_logs_exception(self, mocked_log_error):
        successful_future = MagicMock()
        successful_future.exception.return_value = None
        _log_async_failure(successful_future)
        mocked_log_error.assert_not_called()

        failed_future = MagicMock()
        exc = RuntimeError("boom")
        failed_future.exception.return_value = exc
        _log_async_failure(failed_future)
        mocked_log_error.assert_called_once()

    @patch("notifications.email._EXECUTOR.submit")
    def test_submit_notification_registers_done_callback(self, mocked_submit):
        future = MagicMock()
        mocked_submit.return_value = future

        _submit_notification("Subject", "Body", ["user@example.com"])

        mocked_submit.assert_called_once()
        future.add_done_callback.assert_called_once()

    def test_capture_previous_expense_state_ignores_missing_previous_object(self):
        ghost_expense = SimpleNamespace(pk=123)
        fake_sender = MagicMock()
        fake_sender.DoesNotExist = Expense.DoesNotExist
        fake_sender.objects.get.side_effect = Expense.DoesNotExist

        capture_previous_expense_state(fake_sender, ghost_expense)

        self.assertFalse(hasattr(ghost_expense, "_notification_previous_state"))


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

    @patch("notifications.signals_expenses.safe_send_notification")
    def test_expense_update_via_api_notifies_author_when_other_member_edits(self, mocked_send):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Shared expense",
            amount=Decimal("90.00"),
            currency="RUB",
            amount_rub=Decimal("90.00"),
            fx_rate=Decimal("1.000000"),
        )
        mocked_send.reset_mock()

        self.auth(self.member)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            {"title": "Shared expense updated"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(mocked_send.call_count, 1)
        _, message, recipients, _ = mocked_send.call_args[0]
        self.assertIn(f"Пользователь {self.member.username} обновил расход.", message)
        self.assertEqual(recipients, [self.owner.email])

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
