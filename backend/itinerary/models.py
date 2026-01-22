from django.conf import settings
from django.db import models
from trips.models import Trip

User = settings.AUTH_USER_MODEL


class DayPlan(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="day_plans")
    date = models.DateField()
    title = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("trip", "date")
        ordering = ("date",)

    def __str__(self):
        return f"{self.trip_id} — {self.date}"


class DayPlanItem(models.Model):
    day = models.ForeignKey(DayPlan, on_delete=models.CASCADE, related_name="items")
    title = models.CharField(max_length=255)

    time_from = models.TimeField(null=True, blank=True)
    time_to = models.TimeField(null=True, blank=True)

    description = models.TextField(blank=True)

    assignee = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    is_done = models.BooleanField(default=False)

    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class DayPlanComment(models.Model):
    item = models.ForeignKey(DayPlanItem, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)