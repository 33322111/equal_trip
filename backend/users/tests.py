from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework import serializers
from rest_framework import status
from rest_framework.test import APITestCase

from users.password_reset_signals import password_reset_token_created
from users.serializers import ProfileSerializer, RegisterSerializer

User = get_user_model()

VALID_GIF_BYTES = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00"
    b"\x00\x00\x00\xff\xff\xff!"
    b"\xf9\x04\x01\x00\x00\x00\x00,"
    b"\x00\x00\x00\x00\x01\x00\x01\x00"
    b"\x00\x02\x02D\x01\x00;"
)


class UsersApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ivan",
            email="ivan@example.com",
            password="StrongPass1!",
        )

    def test_register_success(self):
        payload = {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "Another1!",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        created = User.objects.get(username="newuser")
        self.assertTrue(created.check_password("Another1!"))
        self.assertNotIn("password", response.data)

    def test_register_rejects_weak_password(self):
        payload = {
            "username": "weak",
            "email": "weak@example.com",
            "password": "123",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    def test_register_rejects_existing_email(self):
        payload = {
            "username": "newuser2",
            "email": "ivan@example.com",
            "password": "Another1!",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_existing_email_case_insensitive(self):
        payload = {
            "username": "newuser3",
            "email": "IVAN@EXAMPLE.COM",
            "password": "Another1!",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_blank_email(self):
        payload = {
            "username": "blankemail",
            "email": "",
            "password": "Another1!",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_register_rejects_whitespace_email(self):
        payload = {
            "username": "spaceemail",
            "email": "   ",
            "password": "Another1!",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_login_success_returns_tokens(self):
        payload = {"username": "ivan", "password": "StrongPass1!"}
        response = self.client.post("/api/auth/login/", payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_me_returns_current_user(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/auth/me/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["username"], self.user.username)
        self.assertEqual(response.data["email"], self.user.email)

    def test_profile_requires_auth(self):
        response = self.client.get("/api/profile/")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_profile_get_and_patch(self):
        self.client.force_authenticate(self.user)

        get_response = self.client.get("/api/profile/")
        self.assertEqual(get_response.status_code, status.HTTP_200_OK)
        self.assertEqual(get_response.data["username"], "ivan")

        patch_response = self.client.patch(
            "/api/profile/",
            {"username": "ivan_updated", "email": "ivan_updated@example.com"},
            format="json",
        )
        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["username"], "ivan_updated")
        self.assertEqual(patch_response.data["email"], "ivan_updated@example.com")

    def test_profile_patch_rejects_existing_username(self):
        User.objects.create_user(
            username="taken_name",
            email="taken_name@example.com",
            password="StrongPass1!",
        )
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            "/api/profile/",
            {"username": "TAKEN_NAME"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("username", response.data)

    def test_profile_patch_rejects_existing_email(self):
        User.objects.create_user(
            username="taken_email_user",
            email="taken_email@example.com",
            password="StrongPass1!",
        )
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            "/api/profile/",
            {"email": "taken_email@example.com"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_profile_patch_accepts_blank_email(self):
        self.client.force_authenticate(self.user)

        response = self.client.patch(
            "/api/profile/",
            {"email": ""},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["email"], "")

    @override_settings(IMAGE_UPLOAD_MAX_BYTES=10)
    def test_profile_patch_rejects_oversize_avatar(self):
        self.client.force_authenticate(self.user)
        avatar = SimpleUploadedFile("avatar.gif", VALID_GIF_BYTES, content_type="image/gif")

        response = self.client.patch(
            "/api/profile/",
            {"avatar": avatar},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("avatar", response.data)

    def test_profile_patch_rejects_invalid_avatar_with_russian_message(self):
        self.client.force_authenticate(self.user)
        avatar = SimpleUploadedFile("avatar.jpg", b"broken-avatar", content_type="image/jpeg")

        response = self.client.patch(
            "/api/profile/",
            {"avatar": avatar},
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["avatar"][0],
            "Загрузите корректное изображение. Файл поврежден или не является изображением.",
        )

    def test_user_search_requires_auth(self):
        response = self.client.get("/api/users/search/?q=iv")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_user_search_returns_limited_sorted_results(self):
        for i in range(25):
            User.objects.create_user(
                username=f"finder{i:02d}",
                email=f"finder{i:02d}@example.com",
                password="StrongPass1!",
            )

        self.client.force_authenticate(self.user)
        response = self.client.get("/api/users/search/?q=finder")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 20)

        usernames = [row["username"] for row in response.data]
        self.assertEqual(usernames, sorted(usernames))
        self.assertNotIn("email", response.data[0])

    def test_user_search_empty_query_returns_empty(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/users/search/?q=   ")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_register_rejects_password_without_digit(self):
        payload = {
            "username": "nodigit",
            "email": "nodigit@example.com",
            "password": "NoDigits!",
        }
        response = self.client.post("/api/auth/register/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("password", response.data)

    @patch("users.password_reset_signals.send_notification")
    def test_password_reset_signal_sends_frontend_link(self, mocked_send_notification):
        token = SimpleNamespace(key="abc123", user=self.user)
        password_reset_token_created(sender=None, instance=None, reset_password_token=token)

        self.assertEqual(mocked_send_notification.call_count, 1)
        kwargs = mocked_send_notification.call_args.kwargs
        self.assertIn(f"{settings.FRONTEND_URL}/reset-password/abc123", kwargs["message"])
        self.assertEqual(kwargs["recipients"], [self.user.email])

    def test_register_serializer_rejects_duplicate_username_case_insensitive(self):
        serializer = RegisterSerializer()
        with self.assertRaisesMessage(serializers.ValidationError, "Пользователь с таким именем уже существует."):
            serializer.validate_username("IVAN")

    def test_register_serializer_rejects_whitespace_email_directly(self):
        serializer = RegisterSerializer()
        with self.assertRaisesMessage(serializers.ValidationError, "Email обязателен."):
            serializer.validate_email("   ")

    def test_profile_serializer_accepts_none_avatar(self):
        serializer = ProfileSerializer(instance=self.user)
        self.assertIsNone(serializer.validate_avatar(None))
