from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Trip, TripMember, TripInvite
from .serializers import (
    TripSerializer, TripDetailSerializer, TripCreateSerializer,
    TripInviteSerializer
)
from .permissions import IsTripMember
from expenses.services import compute_balance

class TripViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Все поездки, где пользователь участник
        return Trip.objects.filter(memberships__user=self.request.user).distinct().order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return TripCreateSerializer
        if self.action in ("retrieve",):
            return TripDetailSerializer
        return TripSerializer

    def perform_destroy(self, instance):
        # удалять может только owner
        if not TripMember.objects.filter(trip=instance, user=self.request.user, role=TripMember.Role.OWNER).exists():
            raise permissions.PermissionDenied("Only owner can delete trip.")
        instance.delete()

    def get_permissions(self):
        if self.action in ("retrieve", "update", "partial_update"):
            return [permissions.IsAuthenticated(), IsTripMember()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def create_invite(self, request, pk=None):
        trip = self.get_object()
        # только owner может создавать инвайт
        if not TripMember.objects.filter(trip=trip, user=request.user, role=TripMember.Role.OWNER).exists():
            return Response({"detail": "Only owner can invite."}, status=status.HTTP_403_FORBIDDEN)

        invite = TripInvite.objects.create(trip=trip, created_by=request.user)
        return Response(TripInviteSerializer(invite).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def balance(self, request, pk=None):
        trip = self.get_object()
        data = compute_balance(trip.id)
        return Response(data)


class InviteAcceptViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=["post"], url_path=r"accept/(?P<token>[^/.]+)")
    def accept(self, request, token=None):
        try:
            invite = TripInvite.objects.select_related("trip").get(token=token)
        except TripInvite.DoesNotExist:
            return Response({"detail": "Invite not found."}, status=404)

        if invite.is_used:
            return Response({"detail": "Invite already used."}, status=400)

        if invite.expires_at and timezone.now() > invite.expires_at:
            return Response({"detail": "Invite expired."}, status=400)

        trip = invite.trip

        TripMember.objects.get_or_create(trip=trip, user=request.user, defaults={"role": TripMember.Role.MEMBER})

        invite.is_used = True
        invite.used_by = request.user
        invite.used_at = timezone.now()
        invite.save(update_fields=["is_used", "used_by", "used_at"])

        return Response({"trip_id": trip.id}, status=200)