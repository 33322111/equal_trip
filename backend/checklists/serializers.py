from django.contrib.auth import get_user_model
from rest_framework import serializers

from trips.models import TripMember
from .models import Checklist, ChecklistItem, ChecklistComment

User = get_user_model()


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")


class ChecklistCommentSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)

    class Meta:
        model = ChecklistComment
        fields = ("id", "user", "text", "created_at")
        read_only_fields = ("id", "user", "created_at")


class ChecklistItemSerializer(serializers.ModelSerializer):
    assignee = UserShortSerializer(read_only=True)
    comments = ChecklistCommentSerializer(many=True, read_only=True)

    class Meta:
        model = ChecklistItem
        fields = (
            "id",
            "checklist",
            "title",
            "assignee",
            "due_date",
            "is_done",
            "created_by",
            "created_at",
            "updated_at",
            "comments",
        )
        read_only_fields = ("id", "checklist", "created_by", "created_at", "updated_at")


class ChecklistItemCreateSerializer(serializers.ModelSerializer):
    assignee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = ChecklistItem
        fields = ("title", "assignee_id", "due_date")

    def validate_assignee_id(self, value):
        if value is None:
            return value
        trip = self.context["trip"]
        if not TripMember.objects.filter(trip=trip, user_id=value).exists():
            raise serializers.ValidationError("Assignee must be a trip member.")
        return value


class ChecklistItemUpdateSerializer(serializers.ModelSerializer):
    assignee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = ChecklistItem
        fields = ("title", "assignee_id", "due_date", "is_done")

    def validate_assignee_id(self, value):
        if value is None:
            return value
        trip = self.context["trip"]
        if not TripMember.objects.filter(trip=trip, user_id=value).exists():
            raise serializers.ValidationError("Assignee must be a trip member.")
        return value


class ChecklistSerializer(serializers.ModelSerializer):
    created_by = UserShortSerializer(read_only=True)
    items = ChecklistItemSerializer(many=True, read_only=True)

    class Meta:
        model = Checklist
        fields = ("id", "trip", "title", "created_by", "created_at", "items")
        read_only_fields = ("id", "trip", "created_by", "created_at")


class ChecklistCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Checklist
        fields = ("title",)