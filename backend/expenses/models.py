from django.conf import settings
from django.db import models
from trips.models import Trip, TripMember


class ExpenseCategory(models.Model):
    name = models.CharField(max_length=64, unique=True)

    def __str__(self):
        return self.name


class Expense(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="expenses")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_expenses")

    title = models.CharField(max_length=120)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=8, default="RUB")

    category = models.ForeignKey(ExpenseCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="expenses")
    spent_at = models.DateTimeField(null=True, blank=True)

    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    receipt = models.ImageField(upload_to="receipts/", null=True, blank=True)

    def __str__(self):
        return f"{self.trip_id}: {self.title} {self.amount} {self.currency}"


class ExpenseShare(models.Model):
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name="shares")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="expense_shares")
    weight = models.DecimalField(max_digits=8, decimal_places=2, default=1)  # на будущее: неравные доли

    class Meta:
        unique_together = ("expense", "user")