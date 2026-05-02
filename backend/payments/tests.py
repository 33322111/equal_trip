from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from payments.models import Settlement
from trips.models import Trip, TripMember

User = get_user_model()

VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"


class PaymentsApiTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user("owner_pay", "owner_pay@example.com", "StrongPass1!")
        self.member = User.objects.create_user("member_pay", "member_pay@example.com", "StrongPass1!")
        self.third = User.objects.create_user("third_pay", "third_pay@example.com", "StrongPass1!")

        self.trip = Trip.objects.create(
            title="Payments trip",
            owner=self.owner,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=1),
        )
        TripMember.objects.create(trip=self.trip, user=self.owner, role=TripMember.Role.OWNER)
        TripMember.objects.create(trip=self.trip, user=self.member, role=TripMember.Role.MEMBER)

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def create_settlement(self):
        return Settlement.objects.create(
            trip=self.trip,
            from_user=self.member,
            to_user=self.owner,
            amount=Decimal("100.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )

    def test_create_settlement_success(self):
        self.auth(self.member)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/",
            {
                "from_user": self.member.id,
                "to_user": self.owner.id,
                "amount": "250.00",
                "currency": "RUB",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        settlement = Settlement.objects.get(trip=self.trip, from_user=self.member, to_user=self.owner)
        self.assertEqual(settlement.status, Settlement.Status.PENDING)
        self.assertEqual(settlement.amount, Decimal("250.00"))

    def test_create_settlement_forbidden_when_spoofing_another_payer(self):
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/",
            {
                "from_user": self.member.id,
                "to_user": self.owner.id,
                "amount": "250.00",
                "currency": "RUB",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_create_settlement_rejects_same_users(self):
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/",
            {
                "from_user": self.owner.id,
                "to_user": self.owner.id,
                "amount": "50.00",
                "currency": "RUB",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_settlements(self):
        self.create_settlement()
        Settlement.objects.create(
            trip=self.trip,
            from_user=self.owner,
            to_user=self.member,
            amount=Decimal("35.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )

        self.auth(self.member)
        response = self.client.get(f"/api/trips/{self.trip.id}/settlements/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_settlements_forbidden_for_non_member(self):
        self.create_settlement()
        self.auth(self.third)
        response = self.client.get(f"/api/trips/{self.trip.id}/settlements/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_confirm_settlement_by_receiver(self):
        settlement = self.create_settlement()
        self.auth(self.owner)
        response = self.client.post(f"/api/trips/{self.trip.id}/settlements/{settlement.id}/confirm/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        settlement.refresh_from_db()
        self.assertEqual(settlement.status, Settlement.Status.CONFIRMED)
        self.assertIsNotNone(settlement.confirmed_at)

    def test_confirm_settlement_forbidden_for_non_receiver(self):
        settlement = self.create_settlement()
        self.auth(self.member)
        response = self.client.post(f"/api/trips/{self.trip.id}/settlements/{settlement.id}/confirm/", {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_confirm_settlement_with_proof_file(self):
        settlement = self.create_settlement()
        self.auth(self.owner)
        proof = SimpleUploadedFile("proof.pdf", VALID_PDF_BYTES, content_type="application/pdf")
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/{settlement.id}/confirm/",
            {"proof": proof},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        settlement.refresh_from_db()
        self.assertEqual(settlement.status, Settlement.Status.CONFIRMED)
        self.assertTrue(bool(settlement.proof))

    def test_confirm_settlement_rejects_invalid_proof_type(self):
        settlement = self.create_settlement()
        self.auth(self.owner)
        proof = SimpleUploadedFile("proof.exe", b"payload", content_type="application/octet-stream")
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/{settlement.id}/confirm/",
            {"proof": proof},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("proof", response.data)

    @override_settings(DOCUMENT_UPLOAD_MAX_BYTES=10)
    def test_confirm_settlement_rejects_oversize_proof(self):
        settlement = self.create_settlement()
        self.auth(self.owner)
        proof = SimpleUploadedFile("proof.pdf", VALID_PDF_BYTES, content_type="application/pdf")
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/{settlement.id}/confirm/",
            {"proof": proof},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("proof", response.data)

    def test_delete_settlement(self):
        settlement = self.create_settlement()
        self.auth(self.owner)
        response = self.client.delete(f"/api/trips/{self.trip.id}/settlements/{settlement.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Settlement.objects.filter(id=settlement.id).exists())

    def test_delete_settlement_allowed_for_payer(self):
        settlement = self.create_settlement()
        self.auth(self.member)
        response = self.client.delete(f"/api/trips/{self.trip.id}/settlements/{settlement.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Settlement.objects.filter(id=settlement.id).exists())

    def test_delete_settlement_forbidden_for_receiver_non_owner(self):
        settlement = Settlement.objects.create(
            trip=self.trip,
            from_user=self.owner,
            to_user=self.member,
            amount=Decimal("80.00"),
            currency="RUB",
            status=Settlement.Status.PENDING,
        )
        self.auth(self.member)
        response = self.client.delete(f"/api/trips/{self.trip.id}/settlements/{settlement.id}/")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Settlement.objects.filter(id=settlement.id).exists())

    def test_create_settlement_rejects_non_positive_amount(self):
        self.auth(self.owner)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/",
            {
                "from_user": self.member.id,
                "to_user": self.owner.id,
                "amount": "0.00",
                "currency": "RUB",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_settlement_rejects_non_member_user(self):
        self.auth(self.third)
        response = self.client.post(
            f"/api/trips/{self.trip.id}/settlements/",
            {
                "from_user": self.third.id,
                "to_user": self.owner.id,
                "amount": "10.00",
                "currency": "RUB",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_settlement_model_str(self):
        settlement = self.create_settlement()
        self.assertEqual(
            str(settlement),
            f"{self.trip.id}: {self.member.id}->{self.owner.id} 100.00 RUB [pending]",
        )
