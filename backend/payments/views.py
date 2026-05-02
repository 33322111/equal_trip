from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import serializers
from django.shortcuts import get_object_or_404

from trips.models import Trip, TripMember
from trips.permissions import IsTripMember
from .models import Settlement
from .serializers import (
    SettlementSerializer,
    SettlementCreateSerializer,
    SettlementConfirmSerializer,
)


class TripSettlementViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTripMember]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def _is_owner(self, trip: Trip) -> bool:
        return TripMember.objects.filter(
            trip=trip,
            user=self.request.user,
            role=TripMember.Role.OWNER,
        ).exists()

    def get_trip(self) -> Trip:
        trip = get_object_or_404(Trip, id=self.kwargs["trip_id"])
        self.check_object_permissions(self.request, trip)
        return trip

    def get_queryset(self):
        trip = self.get_trip()
        return Settlement.objects.filter(trip=trip).order_by("-created_at")

    def perform_create(self, serializer):
        trip = self.get_trip()

        from_user = serializer.validated_data["from_user"]
        to_user = serializer.validated_data["to_user"]
        if from_user != self.request.user:
            raise PermissionDenied("You can only create a payment from your own account.")

        members = set(
            TripMember.objects.filter(trip=trip).values_list("user_id", flat=True)
        )
        if from_user.id not in members or to_user.id not in members:
            raise serializers.ValidationError("Users must be members of the trip")

        serializer.save(trip=trip)

    def perform_destroy(self, instance):
        trip = self.get_trip()
        if instance.from_user_id != self.request.user.id and not self._is_owner(trip):
            raise PermissionDenied("Only payer or trip owner can delete payment.")
        instance.delete()

    def get_serializer_class(self):
        if self.action == "create":
            return SettlementCreateSerializer
        if self.action == "confirm":
            return SettlementConfirmSerializer
        return SettlementSerializer

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, trip_id=None, pk=None):
        settlement = self.get_object()

        if settlement.to_user_id != request.user.id:
            return Response({"detail": "Only receiver can confirm payment"}, status=403)

        serializer = self.get_serializer(settlement, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SettlementSerializer(settlement).data, status=200)
