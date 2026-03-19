from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Trip, TripMember, TripInvite

User = get_user_model()


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email", 'avatar')


class TripMemberSerializer(serializers.ModelSerializer):
    user = UserShortSerializer(read_only=True)

    class Meta:
        model = TripMember
        fields = ("id", "user", "role", "joined_at")


class TripSerializer(serializers.ModelSerializer):
    owner = UserShortSerializer(read_only=True)

    class Meta:
        model = Trip
        fields = ("id", "title", "description", "start_date", "end_date", "owner", "created_at")

    def validate(self, attrs):
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))

        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "Дата окончания не может быть раньше даты начала."})

        return attrs


class TripDetailSerializer(serializers.ModelSerializer):
    owner = UserShortSerializer(read_only=True)
    members = serializers.SerializerMethodField()

    class Meta:
        model = Trip
        fields = ("id", "title", "description", "start_date", "end_date", "owner", "created_at", "members")

    def get_members(self, obj: Trip):
        qs = obj.memberships.select_related("user").order_by("joined_at")
        return TripMemberSerializer(qs, many=True).data


class TripCreateSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Trip
        fields = ("id", "title", "description", "start_date", "end_date")

    def validate(self, attrs):
        start = attrs.get("start_date")
        end = attrs.get("end_date")

        if not start:
            raise serializers.ValidationError({"start_date": "Укажите дату начала поездки."})
        if not end:
            raise serializers.ValidationError({"end_date": "Укажите дату окончания поездки."})

        if end < start:
            raise serializers.ValidationError({"end_date": "Дата окончания не может быть раньше даты начала."})

        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        trip = Trip.objects.create(owner=request.user, **validated_data)
        TripMember.objects.create(trip=trip, user=request.user, role=TripMember.Role.OWNER)
        return trip


class TripInviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripInvite
        fields = ("token", "created_at", "expires_at", "is_used")