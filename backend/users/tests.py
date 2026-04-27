from types import SimpleNamespace
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from users.password_reset_signals import password_reset_token_created

User = get_user_model()


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

    @patch("users.password_reset_signals.send_mail")
    def test_password_reset_signal_sends_frontend_link(self, mocked_send_mail):
        token = SimpleNamespace(key="abc123", user=self.user)
        password_reset_token_created(sender=None, instance=None, reset_password_token=token)

        self.assertEqual(mocked_send_mail.call_count, 1)
        kwargs = mocked_send_mail.call_args.kwargs
        self.assertIn(f"{settings.FRONTEND_URL}/reset-password/abc123", kwargs["message"])
        self.assertEqual(kwargs["recipient_list"], [self.user.email])
