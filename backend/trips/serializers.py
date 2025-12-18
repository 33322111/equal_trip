from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Trip, TripMember, TripInvite

User = get_user_model()


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "username", "email")


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

    def create(self, validated_data):
        request = self.context["request"]
        trip = Trip.objects.create(owner=request.user, **validated_data)
        TripMember.objects.create(trip=trip, user=request.user, role=TripMember.Role.OWNER)
        return trip

class TripInviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TripInvite
        fields = ("token", "created_at", "expires_at", "is_used")