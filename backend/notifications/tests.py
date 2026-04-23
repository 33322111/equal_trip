from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from expenses.models import Expense
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

    @patch("notifications.signals_expenses.send_notification")
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
        subject, _, recipients = mocked_send.call_args[0]
        self.assertIn("Новый расход", subject)
        self.assertIn(self.member.email, recipients)
        self.assertNotIn(self.owner.email, recipients)

    @patch("notifications.signals_expenses.send_notification")
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
        subject, _, recipients = mocked_send.call_args[0]
        self.assertIn("Расход обновлён", subject)
        self.assertIn(self.member.email, recipients)

    @patch("notifications.signals_expenses.send_notification")
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
        subject, _, recipients = mocked_send.call_args[0]
        self.assertIn("Расход удалён", subject)
        self.assertIn(self.owner.email, recipients)
        self.assertIn(self.member.email, recipients)

    @patch("notifications.signals_payments.send_notification")
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
        subject, _, recipients = mocked_send.call_args[0]
        self.assertIn("Вам отправлена оплата", subject)
        self.assertEqual(recipients, [self.member.email])

    @patch("notifications.signals_payments.send_notification")
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
        subject, _, recipients = mocked_send.call_args[0]
        self.assertIn("Оплата подтверждена", subject)
        self.assertEqual(recipients, [self.owner.email])

    @patch("notifications.signals_payments.send_notification")
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

    @patch("logging.exception")
    @patch("notifications.signals_expenses.send_notification", side_effect=Exception("boom"))
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

    @patch("logging.exception")
    @patch("notifications.signals_expenses.send_notification", side_effect=Exception("boom"))
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

    @patch("logging.exception")
    @patch("notifications.signals_payments.send_notification", side_effect=Exception("boom"))
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
