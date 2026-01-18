from django.conf import settings
from django.db import models
from trips.models import Trip

User = settings.AUTH_USER_MODEL


class Checklist(models.Model):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="checklists")
    title = models.CharField(max_length=255, default="Список дел / паковочный лист")
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_checklists")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.trip_id}: {self.title}"


class ChecklistItem(models.Model):
    checklist = models.ForeignKey(Checklist, on_delete=models.CASCADE, related_name="items")
    title = models.CharField(max_length=255)

    assignee = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="checklist_items")
    due_date = models.DateField(null=True, blank=True)

    is_done = models.BooleanField(default=False)

    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="created_checklist_items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.checklist_id}: {self.title}"


class ChecklistComment(models.Model):
    item = models.ForeignKey(ChecklistItem, on_delete=models.CASCADE, related_name="comments")
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name="checklist_comments")
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)