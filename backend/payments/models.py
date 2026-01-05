from django.conf import settings
from django.db import models
from trips.models import Trip

User = settings.AUTH_USER_MODEL


class Settlement(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CONFIRMED = "confirmed", "Confirmed"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="settlements")
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="settlements_sent")
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="settlements_received")

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=8, default="RUB")

    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)

    proof = models.FileField(upload_to="settlement_proofs/", null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.trip_id}: {self.from_user_id}->{self.to_user_id} {self.amount} {self.currency} [{self.status}]"