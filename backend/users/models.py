from django.db import models
from django.contrib.auth.models import AbstractUser
from django.db.models.functions import Lower


class User(AbstractUser):
    email = models.EmailField(
        "email address",
        blank=True,
    )
    avatar = models.ImageField(
        upload_to="avatars/",
        null=True,
        blank=True
    )

    class Meta(AbstractUser.Meta):
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~models.Q(email=""),
                name="users_user_email_ci_unique_nonblank",
            ),
        ]
