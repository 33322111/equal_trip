from django.contrib.auth import get_user_model
from rest_framework import serializers
from trips.models import TripMember
from .models import DayPlan, DayPlanItem, DayPlanComment

User = get_user_model()


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")


class DayPlanCommentSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)

    class Meta:
        model = DayPlanComment
        fields = ("id", "user", "text", "created_at")
        read_only_fields = ("id", "user", "created_at")


class DayPlanItemSerializer(serializers.ModelSerializer):
    assignee = UserShortSerializer(read_only=True)
    comments = DayPlanCommentSerializer(many=True, read_only=True)

    class Meta:
        model = DayPlanItem
        fields = (
            "id",
            "title",
            "time_from",
            "time_to",
            "description",
            "assignee",
            "is_done",
            "lat",
            "lng",
            "comments",
        )


class DayPlanItemCreateSerializer(serializers.ModelSerializer):
    assignee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = DayPlanItem
        fields = (
            "title",
            "time_from",
            "time_to",
            "description",
            "assignee_id",
            "lat",
            "lng",
        )

    def validate_assignee_id(self, value):
        if value is None:
            return value
        trip = self.context["trip"]
        if not TripMember.objects.filter(trip=trip, user_id=value).exists():
            raise serializers.ValidationError("Ответственный должен быть участником поездки.")
        return value

    def validate(self, attrs):
        time_from = attrs.get("time_from")
        time_to = attrs.get("time_to")
        if time_from and time_to and time_to < time_from:
            raise serializers.ValidationError({"time_to": "Время окончания не может быть раньше времени начала."})
        return attrs


class DayPlanItemUpdateSerializer(serializers.ModelSerializer):
    assignee_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = DayPlanItem
        fields = (
            "title",
            "time_from",
            "time_to",
            "description",
            "assignee_id",
            "is_done",
            "lat",
            "lng",
        )

    def validate_assignee_id(self, value):
        if value is None:
            return value
        trip = self.context["trip"]
        if not TripMember.objects.filter(trip=trip, user_id=value).exists():
            raise serializers.ValidationError("Ответственный должен быть участником поездки.")
        return value

    def validate(self, attrs):
        instance = getattr(self, "instance", None)
        time_from = attrs.get("time_from", getattr(instance, "time_from", None))
        time_to = attrs.get("time_to", getattr(instance, "time_to", None))
        if time_from and time_to and time_to < time_from:
            raise serializers.ValidationError({"time_to": "Время окончания не может быть раньше времени начала."})
        return attrs


class DayPlanSerializer(serializers.ModelSerializer):
    items_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = DayPlan
        fields = ("id", "date", "title", "items_count")
