from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from trips.models import TripMember
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

    def get_queryset(self):
        trip_id = self.kwargs["trip_id"]
        return Settlement.objects.filter(trip_id=trip_id).order_by("-created_at")

    def perform_create(self, serializer):
        trip_id = self.kwargs["trip_id"]

        # только участники поездки могут участвовать в оплате
        from_user = serializer.validated_data["from_user"]
        to_user = serializer.validated_data["to_user"]
        members = set(
            TripMember.objects.filter(trip_id=trip_id).values_list("user_id", flat=True)
        )
        if from_user.id not in members or to_user.id not in members:
            raise ValueError("Users must be members of the trip")

        serializer.save(trip_id=trip_id)

    def get_serializer_class(self):
        if self.action == "create":
            return SettlementCreateSerializer
        if self.action == "confirm":
            return SettlementConfirmSerializer
        return SettlementSerializer

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, trip_id=None, pk=None):
        settlement = self.get_object()

        # подтверждать должен получатель или организатор (можно упростить)
        # MVP: разрешим подтверждать только to_user
        if settlement.to_user_id != request.user.id:
            return Response({"detail": "Only receiver can confirm payment"}, status=403)

        serializer = self.get_serializer(settlement, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(SettlementSerializer(settlement).data, status=200)