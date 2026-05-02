import csv
from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from reportlab.lib import colors
from rest_framework import serializers
from rest_framework import status
from rest_framework.test import APITestCase

from expenses.export import _split_mode, _to_decimal as csv_to_decimal, export_trip_csv
from expenses.export_pdf import (
    _build_horizontal_bar_chart,
    _fmt_dt,
    _register_fonts,
    _short,
    _to_decimal as pdf_to_decimal,
    export_trip_pdf,
)
from expenses.fx import fetch_rates_for_date, get_all_currencies, get_rate_to_rub
from expenses.models import ExchangeRate, Expense, ExpenseCategory, ExpenseShare
from expenses.serializers import _prepare_share_weights
from expenses.services import compute_balance
from payments.models import Settlement
from trips.models import Trip, TripMember

User = get_user_model()

VALID_GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
    b"\x00\x00\x00\xff\xff\xff!"
    b"\xf9\x04\x01\x00\x00\x00\x00,"
    b"\x00\x00\x00\x00\x01\x00\x01\x00"
    b"\x00\x02\x02D\x01\x00;"
)

VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"


class ExpensesApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_exp", "owner_exp@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_exp", "member_exp@example.com", "StrongPass1!")
        self.outsider = User.objects.create_user("outsider_exp", "outsider_exp@example.com", "StrongPass1!")
        self.admin = User.objects.create_superuser("admin_exp", "admin_exp@example.com", "StrongPass1!")

        self.trip = Trip.objects.create(
            title="Trip expenses",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

        self.category = ExpenseCategory.objects.create(name="Transport")
        self.category_2 = ExpenseCategory.objects.create(name="Food")

    def auth(self, user):
        self.client.force_authenticate(user=user)

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("2.500000"))
    def test_create_expense_defaults_to_all_members_shares(self, _):
        self.auth(self.owner)
        payload = {
            "title": "Taxi",
            "amount": "100.00",
            "currency": "USD",
            "category_id": self.category.id,
        }
        response = self.client.post(f"/api/trips/{self.trip.id}/expenses/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data["amount_rub"]), Decimal("250.00"))
        self.assertEqual(Decimal(response.data["fx_rate"]), Decimal("2.500000"))

        shares = response.data["shares"]
        self.assertEqual(len(shares), 2)
        users = sorted(s["user"]["id"] for s in shares)
        self.assertEqual(users, sorted([self.owner.id, self.member.id]))

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_create_expense_custom_split_success(self, _):
        self.auth(self.owner)
        payload = {
            "title": "Hotel",
            "amount": "100.00",
            "currency": "RUB",
            "category_id": self.category.id,
            "share_amounts": [
                {"user_id": self.owner.id, "amount": "70.00"},
                {"user_id": self.member.id, "amount": "30.00"},
            ],
        }
        response = self.client.post(f"/api/trips/{self.trip.id}/expenses/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        weights = {
            s["user"]["id"]: Decimal(s["weight"])
            for s in response.data["shares"]
        }
        self.assertEqual(weights[self.owner.id], Decimal("70.00"))
        self.assertEqual(weights[self.member.id], Decimal("30.00"))

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_create_expense_rejects_mismatched_custom_split(self, _):
        self.auth(self.owner)
        payload = {
            "title": "Broken split",
            "amount": "100.00",
            "currency": "RUB",
            "share_amounts": [
                {"user_id": self.owner.id, "amount": "70.00"},
                {"user_id": self.member.id, "amount": "20.00"},
            ],
        }
        response = self.client.post(f"/api/trips/{self.trip.id}/expenses/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("share_amounts", response.data)

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_create_expense_rejects_non_member_share_user(self, _):
        self.auth(self.owner)
        payload = {
            "title": "Wrong member",
            "amount": "50.00",
            "currency": "RUB",
            "share_user_ids": [self.owner.id, self.outsider.id],
        }
        response = self.client.post(f"/api/trips/{self.trip.id}/expenses/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("share_user_ids", response.data)

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_create_expense_rejects_both_share_fields(self, _):
        self.auth(self.owner)
        payload = {
            "title": "Too many split modes",
            "amount": "80.00",
            "currency": "RUB",
            "share_user_ids": [self.owner.id, self.member.id],
            "share_amounts": [
                {"user_id": self.owner.id, "amount": "40.00"},
                {"user_id": self.member.id, "amount": "40.00"},
            ],
        }
        response = self.client.post(f"/api/trips/{self.trip.id}/expenses/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("3.000000"))
    def test_update_expense_recalculates_rate_and_shares(self, _):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Old expense",
            amount=Decimal("50.00"),
            currency="RUB",
            amount_rub=Decimal("50.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("1.00"))

        self.auth(self.owner)
        payload = {
            "amount": "200.00",
            "currency": "EUR",
            "category_id": self.category_2.id,
            "share_amounts": [
                {"user_id": self.owner.id, "amount": "120.00"},
                {"user_id": self.member.id, "amount": "80.00"},
            ],
        }
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        expense.refresh_from_db()
        self.assertEqual(expense.amount_rub, Decimal("600.00"))
        self.assertEqual(expense.fx_rate, Decimal("3.000000"))
        self.assertEqual(expense.category_id, self.category_2.id)

        weights = {s.user_id: s.weight for s in ExpenseShare.objects.filter(expense=expense)}
        self.assertEqual(weights[self.owner.id], Decimal("120.00"))
        self.assertEqual(weights[self.member.id], Decimal("80.00"))

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_upload_receipt_returns_full_expense_payload(self, _):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Receipt expense",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("60.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("40.00"))

        receipt = SimpleUploadedFile(
            "receipt.gif",
            VALID_GIF_BYTES,
            content_type="image/gif",
        )

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            {"receipt": receipt},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["receipt"])
        self.assertEqual(response.data["created_by"]["id"], self.owner.id)
        self.assertEqual(response.data["category"]["id"], self.category.id)
        self.assertEqual(len(response.data["shares"]), 2)
        self.assertEqual(Decimal(response.data["amount_rub"]), Decimal("100.00"))

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_upload_pdf_receipt_returns_full_expense_payload(self, _):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="PDF receipt expense",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("60.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("40.00"))

        receipt = SimpleUploadedFile(
            "receipt.pdf",
            VALID_PDF_BYTES,
            content_type="application/pdf",
        )

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            {"receipt": receipt},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["receipt"].endswith(".pdf"))
        self.assertEqual(response.data["created_by"]["id"], self.owner.id)
        self.assertEqual(response.data["category"]["id"], self.category.id)
        self.assertEqual(len(response.data["shares"]), 2)
        self.assertEqual(Decimal(response.data["amount_rub"]), Decimal("100.00"))

    @override_settings(IMAGE_UPLOAD_MAX_BYTES=10)
    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_upload_receipt_rejects_oversize_file(self, _):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Big receipt expense",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("60.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("40.00"))

        receipt = SimpleUploadedFile("receipt.gif", VALID_GIF_BYTES, content_type="image/gif")

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            {"receipt": receipt},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("receipt", response.data)

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_upload_receipt_rejects_invalid_image_with_russian_message(self, _):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Broken receipt expense",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("60.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("40.00"))

        receipt = SimpleUploadedFile("receipt.jpg", b"not-an-image", content_type="image/jpeg")

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            {"receipt": receipt},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["receipt"][0],
            "Загрузите корректное изображение. Файл поврежден или не является изображением.",
        )

    def test_delete_expense(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Delete me",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))

        self.auth(self.member)
        response = self.client.delete(f"/api/trips/{self.trip.id}/expenses/{expense.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Expense.objects.filter(id=expense.id).exists())

    def test_trip_expenses_list_requires_membership(self):
        self.auth(self.outsider)
        response = self.client.get(f"/api/trips/{self.trip.id}/expenses/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_categories_list_authenticated(self):
        self.auth(self.owner)
        response = self.client.get("/api/categories/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [row["name"] for row in response.data]
        self.assertEqual(sorted(names), names)

    def test_categories_write_forbidden_for_regular_user(self):
        self.auth(self.owner)

        create_response = self.client.post("/api/categories/", {"name": "Housing"}, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_403_FORBIDDEN)

        patch_response = self.client.patch(f"/api/categories/{self.category.id}/", {"name": "Renamed"}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_403_FORBIDDEN)

        delete_response = self.client.delete(f"/api/categories/{self.category.id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)

    def test_categories_write_allowed_for_admin(self):
        self.auth(self.admin)

        create_response = self.client.post("/api/categories/", {"name": "Housing"}, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        category_id = create_response.data["id"]

        patch_response = self.client.patch(f"/api/categories/{category_id}/", {"name": "Accommodation"}, format="json")
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["name"], "Accommodation")

        delete_response = self.client.delete(f"/api/categories/{category_id}/")
        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)

    @patch("expenses.views.get_all_currencies")
    def test_currencies_endpoint_sorted(self, mocked):
        mocked.return_value = {
            "USD": "US Dollar",
            "AED": "United Arab Emirates Dirham",
            "RUB": "Russian Ruble",
        }
        self.auth(self.owner)
        response = self.client.get("/api/currencies/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [row["code"] for row in response.data]
        self.assertEqual(codes, ["AED", "RUB", "USD"])

    def test_export_csv_contains_report_data(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="CSV expense",
            amount=Decimal("90.00"),
            currency="RUB",
            amount_rub=Decimal("90.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("1.00"))

        self.auth(self.owner)
        response = self.client.get(f"/api/trips/{self.trip.id}/export/csv/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        text = response.content.decode("utf-8-sig")
        self.assertIn("EqualTrip Trip Report", text)
        self.assertIn("CSV expense", text)
        self.assertIn("Balance summary (RUB)", text)

    def test_export_pdf_returns_attachment(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="PDF expense",
            amount=Decimal("50.00"),
            currency="RUB",
            amount_rub=Decimal("50.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("1.00"))

        self.auth(self.owner)
        response = self.client.get(f"/api/trips/{self.trip.id}/export/pdf/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        self.assertIn(".pdf", response["Content-Disposition"])

    @patch("expenses.serializers.get_rate_to_rub", return_value=Decimal("1.000000"))
    def test_update_expense_rejects_both_share_fields(self, _):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Conflict update",
            amount=Decimal("20.00"),
            currency="RUB",
            amount_rub=Decimal("20.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))

        self.auth(self.owner)
        response = self.client.patch(
            f"/api/trips/{self.trip.id}/expenses/{expense.id}/",
            {
                "share_user_ids": [self.owner.id, self.member.id],
                "share_amounts": [
                    {"user_id": self.owner.id, "amount": "10.00"},
                    {"user_id": self.member.id, "amount": "10.00"},
                ],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_trip_expenses_list_for_member(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Visible",
            amount=Decimal("10.00"),
            currency="RUB",
            amount_rub=Decimal("10.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("1.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("1.00"))

        self.auth(self.member)
        response = self.client.get(f"/api/trips/{self.trip.id}/expenses/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["title"], "Visible")


class ExpenseUnitLogicTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_logic", "owner_logic@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_logic", "member_logic@example.com", "StrongPass1!")
        self.third = User.objects.create_user("third_logic", "third_logic@example.com", "StrongPass1!")

        self.trip = Trip.objects.create(
            title="Logic trip",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=2),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)
        self.category = ExpenseCategory.objects.create(name="Logic category")

    def test_models_str(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Str expense",
            amount=Decimal("12.00"),
            currency="USD",
            amount_rub=Decimal("900.00"),
            fx_rate=Decimal("75.000000"),
            category=self.category,
        )
        rate = ExchangeRate.objects.create(
            currency="USD",
            date=date.today(),
            rate_to_rub=Decimal("75.000000"),
        )

        self.assertEqual(str(self.category), "Logic category")
        self.assertEqual(str(expense), f"{self.trip.id}: Str expense 12.00 USD")
        self.assertEqual(str(rate), f"USD {rate.date} = 75.000000 RUB")

    def test_prepare_share_weights_share_amounts_validations(self):
        with self.assertRaises(serializers.ValidationError):
            _prepare_share_weights(
                trip=self.trip,
                expense_amount=Decimal("10.00"),
                share_user_ids=None,
                share_amounts=[],
                default_to_all_members=True,
            )

        with self.assertRaises(serializers.ValidationError):
            _prepare_share_weights(
                trip=self.trip,
                expense_amount=Decimal("10.00"),
                share_user_ids=None,
                share_amounts=[
                    {"user_id": self.owner.id, "amount": Decimal("5.00")},
                    {"user_id": self.owner.id, "amount": Decimal("5.00")},
                ],
                default_to_all_members=True,
            )

        with self.assertRaises(serializers.ValidationError):
            _prepare_share_weights(
                trip=self.trip,
                expense_amount=Decimal("10.00"),
                share_user_ids=None,
                share_amounts=[
                    {"user_id": self.owner.id, "amount": Decimal("5.00")},
                    {"user_id": self.third.id, "amount": Decimal("5.00")},
                ],
                default_to_all_members=True,
            )

    def test_prepare_share_weights_share_user_ids_validations_and_disabled_default(self):
        share_rows = _prepare_share_weights(
            trip=self.trip,
            expense_amount=Decimal("10.00"),
            share_user_ids=None,
            share_amounts=None,
            default_to_all_members=False,
        )
        self.assertIsNone(share_rows)

        with self.assertRaises(serializers.ValidationError):
            _prepare_share_weights(
                trip=self.trip,
                expense_amount=Decimal("10.00"),
                share_user_ids=[],
                share_amounts=None,
                default_to_all_members=False,
            )

        with self.assertRaises(serializers.ValidationError):
            _prepare_share_weights(
                trip=self.trip,
                expense_amount=Decimal("10.00"),
                share_user_ids=[self.owner.id, self.owner.id],
                share_amounts=None,
                default_to_all_members=False,
            )

    def test_compute_balance_handles_edge_cases_and_confirmed_settlements(self):
        empty_split_expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="No shares",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
        )
        zero_weight_expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Zero shares",
            amount=Decimal("40.00"),
            currency="RUB",
            amount_rub=Decimal("40.00"),
            fx_rate=Decimal("1.000000"),
        )
        ExpenseShare.objects.create(expense=zero_weight_expense, user=self.owner, weight=Decimal("0.00"))
        ExpenseShare.objects.create(expense=zero_weight_expense, user=self.member, weight=Decimal("0.00"))

        Settlement.objects.create(
            trip=self.trip,
            from_user=self.member,
            to_user=self.third,
            amount=Decimal("10.00"),
            currency="RUB",
            status=Settlement.Status.CONFIRMED,
        )
        Settlement.objects.create(
            trip=self.trip,
            from_user=self.member,
            to_user=self.owner,
            amount=Decimal("0.00"),
            currency="RUB",
            status=Settlement.Status.CONFIRMED,
        )

        data = compute_balance(self.trip.id)
        self.assertEqual(Decimal(data["paid"][str(self.owner.id)]), Decimal("140.00"))
        self.assertIn(str(self.member.id), data["net"])
        self.assertIn(str(self.third.id), data["net"])
        self.assertGreater(len(data["transfers"]), 0)
        self.assertTrue(Expense.objects.filter(id=empty_split_expense.id).exists())

    def test_compute_balance_transfers_are_deterministically_sorted(self):
        fourth = User.objects.create_user("fourth_logic", "fourth_logic@example.com", "StrongPass1!")
        TripMember.objects.create(trip=self.trip, user=self.third, role=TripMember.Role.MEMBER)
        TripMember.objects.create(trip=self.trip, user=fourth, role=TripMember.Role.MEMBER)

        expense_owner = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="Owner paid",
            amount=Decimal("70.00"),
            currency="RUB",
            amount_rub=Decimal("70.00"),
            fx_rate=Decimal("1.000000"),
        )
        ExpenseShare.objects.create(expense=expense_owner, user=self.member, weight=Decimal("70.00"))

        expense_third = Expense.objects.create(
            trip=self.trip,
            created_by=self.third,
            title="Third paid",
            amount=Decimal("30.00"),
            currency="RUB",
            amount_rub=Decimal("30.00"),
            fx_rate=Decimal("1.000000"),
        )
        ExpenseShare.objects.create(expense=expense_third, user=fourth, weight=Decimal("30.00"))

        data = compute_balance(self.trip.id)
        self.assertEqual(
            data["transfers"],
            [
                {"from_user": self.member.id, "to_user": self.owner.id, "amount": "70.00"},
                {"from_user": fourth.id, "to_user": self.third.id, "amount": "30.00"},
            ],
        )

    def test_export_csv_helpers_and_zero_weight_shares(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="CSV zero",
            amount=Decimal("100.00"),
            currency="RUB",
            amount_rub=Decimal("100.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("0.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("0.00"))

        response = export_trip_csv(self.trip)
        text = response.content.decode("utf-8-sig")

        self.assertEqual(csv_to_decimal(None), Decimal("0"))
        self.assertEqual(_split_mode([]), "none")
        self.assertIn("0.00 RUB", text)

    def test_export_csv_totals_by_user_use_split_amounts(self):
        expense = Expense.objects.create(
            trip=self.trip,
            created_by=self.owner,
            title="CSV split totals",
            amount=Decimal("90.00"),
            currency="RUB",
            amount_rub=Decimal("90.00"),
            fx_rate=Decimal("1.000000"),
            category=self.category,
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("30.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("60.00"))

        response = export_trip_csv(self.trip)
        rows = list(csv.reader(StringIO(response.content.decode("utf-8-sig"))))

        start_index = next(
            i for i, row in enumerate(rows)
            if row and row[0] == "Totals by participant after split (RUB)"
        )
        self.assertEqual(rows[start_index + 1], ["Username", "Amount RUB"])

        section_rows = []
        i = start_index + 2
        while i < len(rows) and any(cell.strip() for cell in rows[i]):
            section_rows.append(rows[i])
            i += 1

        totals = {row[0]: Decimal(row[1]) for row in section_rows}
        self.assertEqual(totals[self.owner.username], Decimal("30.00"))
        self.assertEqual(totals[self.member.username], Decimal("60.00"))


class ExpenseFxTests(TestCase):
    @patch("expenses.fx.requests.get")
    def test_fetch_rates_for_date_returns_rates(self, mocked_get):
        mocked_get.return_value.json.return_value = {"rates": {"USD": 1, "RUB": 80}}
        mocked_get.return_value.raise_for_status.return_value = None

        result = fetch_rates_for_date(date(2026, 1, 10))

        self.assertEqual(result["RUB"], 80)
        mocked_get.assert_called_once()
        self.assertIn("2026-01-10.json", mocked_get.call_args.kwargs.get("url", mocked_get.call_args.args[0]))

    @patch("expenses.fx.fetch_rates_for_date")
    def test_get_rate_to_rub_uses_db_and_fetch_fallback(self, mocked_fetch):
        today = date.today()
        ExchangeRate.objects.create(currency="USD", date=today, rate_to_rub=Decimal("74.123456"))
        self.assertEqual(get_rate_to_rub("USD", today), Decimal("74.123456"))
        self.assertEqual(mocked_fetch.call_count, 0)

        self.assertEqual(get_rate_to_rub("USD"), Decimal("74.123456"))

        mocked_fetch.return_value = {"USD": 1, "RUB": 90, "EUR": 0.5}
        eur_rate = get_rate_to_rub("EUR", today)
        self.assertEqual(eur_rate, Decimal("180.000000"))
        self.assertTrue(ExchangeRate.objects.filter(currency="EUR", date=today).exists())

        mocked_fetch.return_value = {"USD": 1}
        with self.assertRaises(ValueError):
            get_rate_to_rub("GBP", today)

        self.assertEqual(get_rate_to_rub("RUB", today), Decimal("1"))

    @patch("expenses.fx.requests.get")
    def test_get_all_currencies_fetches_then_uses_cache(self, mocked_get):
        cache.delete("openexchangerates_currencies")
        mocked_get.return_value.json.return_value = {"USD": "US Dollar"}
        mocked_get.return_value.raise_for_status.return_value = None

        first = get_all_currencies()
        second = get_all_currencies()

        self.assertEqual(first, {"USD": "US Dollar"})
        self.assertEqual(second, {"USD": "US Dollar"})
        self.assertEqual(mocked_get.call_count, 1)


class ExpensePdfTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_pdf", "owner_pdf@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_pdf", "member_pdf@example.com", "StrongPass1!")

    def test_pdf_helpers(self):
        self.assertEqual(_fmt_dt(None), "—")
        self.assertEqual(_short("abcdef", 4), "abc…")
        self.assertEqual(pdf_to_decimal(None), Decimal("0"))
        self.assertIsNone(_build_horizontal_bar_chart("Chart", [], 200, 100, colors.HexColor("#2563eb")))

    @patch("expenses.export_pdf.pdfmetrics.registerFont")
    @patch("expenses.export_pdf.pdfmetrics.getRegisteredFontNames")
    def test_register_fonts_skips_registered(self, mocked_get_names, mocked_register):
        mocked_get_names.return_value = {"DejaVuSans", "DejaVuSans-Bold", "DejaVuSans-Oblique"}
        _register_fonts()
        self.assertEqual(mocked_register.call_count, 0)

    def test_export_pdf_handles_empty_trip_branches(self):
        trip_start_only = Trip.objects.create(
            title="Start only",
            owner=self.owner,
            start_date=date.today(),
            end_date=None,
        )
        trip_end_only = Trip.objects.create(
            title="End only",
            owner=self.owner,
            start_date=None,
            end_date=date.today(),
        )
        TripMember.objects.create(trip=trip_start_only, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=trip_end_only, user=self.owner, role=TripMember.Role.OWNER)

        response_start = export_trip_pdf(trip_start_only)
        response_end = export_trip_pdf(trip_end_only)

        self.assertIn(".pdf", response_start.headers.get("Content-Disposition", ""))
        self.assertIn(".pdf", response_end.headers.get("Content-Disposition", ""))
        self.assertGreater(len(b"".join(response_start.streaming_content)), 0)
        self.assertGreater(len(b"".join(response_end.streaming_content)), 0)

    def test_export_pdf_handles_zero_weight_share_rows(self):
        trip = Trip.objects.create(
            title="PDF weights",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=1),
        )
        TripMember.objects.create(trip=trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=trip, user=self.member, role=TripMember.Role.MEMBER)
        category = ExpenseCategory.objects.create(name="PDF category")
        expense = Expense.objects.create(
            trip=trip,
            created_by=self.owner,
            title="Zero weight PDF",
            amount=Decimal("55.00"),
            currency="RUB",
            amount_rub=Decimal("55.00"),
            fx_rate=Decimal("1.000000"),
            category=category,
            spent_at=timezone.now(),
        )
        ExpenseShare.objects.create(expense=expense, user=self.owner, weight=Decimal("0.00"))
        ExpenseShare.objects.create(expense=expense, user=self.member, weight=Decimal("0.00"))

        response = export_trip_pdf(trip)
        self.assertIn(".pdf", response.headers.get("Content-Disposition", ""))
        self.assertGreater(len(b"".join(response.streaming_content)), 0)
