from django.shortcuts import get_object_or_404
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
from expenses.stats import compute_stats
from django.contrib.auth import get_user_model

User = get_user_model()


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
        if self.action in ("retrieve", "update", "partial_update", "leave"):
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

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<member_id>\d+)")
    def remove_member(self, request, pk=None, member_id=None):
        trip = self.get_object()

        # только owner
        is_owner = TripMember.objects.filter(
            trip=trip, user=request.user, role=TripMember.Role.OWNER
        ).exists()
        if not is_owner:
            return Response({"detail": "Only owner can remove members."}, status=status.HTTP_403_FORBIDDEN)

        member = get_object_or_404(TripMember.objects.select_related("user"), trip=trip, id=member_id)

        # нельзя удалять owner'а
        if member.role == TripMember.Role.OWNER:
            return Response({"detail": "Cannot remove owner."}, status=status.HTTP_400_BAD_REQUEST)

        # нельзя удалять себя
        if member.user_id == request.user.id:
            return Response({"detail": "Cannot remove yourself."}, status=status.HTTP_400_BAD_REQUEST)

        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        trip = self.get_object()

        try:
            membership = TripMember.objects.get(trip=trip, user=request.user)
        except TripMember.DoesNotExist:
            return Response({"detail": "You are not a member of this trip."}, status=status.HTTP_403_FORBIDDEN)

        if membership.role == TripMember.Role.OWNER:
            return Response(
                {"detail": "Owner cannot leave the trip. Transfer ownership or delete the trip."},
                status=status.HTTP_400_BAD_REQUEST
            )

        membership.delete()
        return Response({"detail": "Left the trip."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path=r"members/add")
    def add_member(self, request, pk=None):
        trip = self.get_object()

        is_owner = TripMember.objects.filter(
            trip=trip, user=request.user, role=TripMember.Role.OWNER
        ).exists()
        if not is_owner:
            return Response({"detail": "Only owner can add members."}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "user_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)

        membership, created = TripMember.objects.get_or_create(
            trip=trip,
            user=target_user,
            defaults={"role": TripMember.Role.MEMBER},
        )

        if not created:
            return Response({"detail": "User is already a member."}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"detail": "Member added."}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def balance(self, request, pk=None):
        trip = self.get_object()
        data = compute_balance(trip.id)
        return Response(data)

    @action(detail=True, methods=["get"])
    def stats(self, request, pk=None):
        trip = self.get_object()
        data = compute_stats(trip)
        return Response(data)


class InviteAcceptViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def _get_active_invite(self, token: str):
        try:
            invite = TripInvite.objects.select_related("trip", "trip__owner").get(token=token)
        except TripInvite.DoesNotExist:
            return None, Response({"detail": "Invite not found."}, status=status.HTTP_404_NOT_FOUND)

        if invite.is_used:
            return None, Response({"detail": "Invite already used."}, status=status.HTTP_400_BAD_REQUEST)

        if invite.expires_at and timezone.now() > invite.expires_at:
            return None, Response({"detail": "Invite expired."}, status=status.HTTP_400_BAD_REQUEST)

        return invite, None

    @action(detail=False, methods=["get"], url_path=r"info/(?P<token>[^/.]+)")
    def info(self, request, token=None):
        invite, error_response = self._get_active_invite(token)
        if error_response:
            return error_response

        trip = invite.trip
        is_member = TripMember.objects.filter(trip=trip, user=request.user).exists()

        return Response(
            {
                "token": str(invite.token),
                "is_member": is_member,
                "trip": {
                    "id": trip.id,
                    "title": trip.title,
                    "start_date": trip.start_date,
                    "end_date": trip.end_date,
                    "owner": {
                        "id": trip.owner.id,
                        "username": trip.owner.username,
                        "email": trip.owner.email,
                    },
                },
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["post"], url_path=r"accept/(?P<token>[^/.]+)")
    def accept(self, request, token=None):
        invite, error_response = self._get_active_invite(token)
        if error_response:
            return error_response

        trip = invite.trip

        TripMember.objects.get_or_create(trip=trip, user=request.user, defaults={"role": TripMember.Role.MEMBER})

        invite.is_used = True
        invite.used_by = request.user
        invite.used_at = timezone.now()
        invite.save(update_fields=["is_used", "used_by", "used_at"])

        return Response({"trip_id": trip.id}, status=status.HTTP_200_OK)
