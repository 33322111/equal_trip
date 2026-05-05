from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from .models import Trip, TripMember, TripInvite
from .serializers import (
    TripSerializer, TripDetailSerializer, TripCreateSerializer,
    TripInviteSerializer
)
from .permissions import IsTripMember
from expenses.services import compute_balance
from expenses.stats import compute_stats
from notifications.utils import (
    build_trip_message,
    format_date_value,
    safe_send_notification,
    trip_member_emails,
    user_emails,
)
from django.contrib.auth import get_user_model

User = get_user_model()


class TripViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def _is_owner(self, trip: Trip) -> bool:
        return TripMember.objects.filter(
            trip=trip,
            user=self.request.user,
            role=TripMember.Role.OWNER,
        ).exists()

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
        if not self._is_owner(instance):
            raise PermissionDenied("Только владелец поездки может удалить поездку.")
        instance.delete()

    def perform_update(self, serializer):
        trip = serializer.instance
        if not self._is_owner(trip):
            raise PermissionDenied("Только владелец поездки может редактировать поездку.")
        before = {
            "title": trip.title,
            "description": trip.description,
            "start_date": trip.start_date,
            "end_date": trip.end_date,
        }
        updated_trip = serializer.save()

        changes = []
        if before["title"] != updated_trip.title:
            changes.append(f"Новое название: {updated_trip.title}")
        if before["description"] != updated_trip.description:
            changes.append("Описание поездки обновлено.")
        if before["start_date"] != updated_trip.start_date or before["end_date"] != updated_trip.end_date:
            changes.append(
                f"Новые даты: {format_date_value(updated_trip.start_date)} — {format_date_value(updated_trip.end_date)}"
            )

        if changes:
            subject = f"[EqualTrip] Поездка «{updated_trip.title}» обновлена"
            message = build_trip_message(
                updated_trip,
                [f"Пользователь {self.request.user.username} обновил параметры поездки.", *changes],
            )
            recipients = trip_member_emails(updated_trip, exclude_user_ids=[self.request.user.id])
            safe_send_notification(subject, message, recipients, "Failed to send trip update notification email")

    def get_permissions(self):
        if self.action in ("retrieve", "update", "partial_update", "leave"):
            return [permissions.IsAuthenticated(), IsTripMember()]
        return super().get_permissions()

    @action(detail=True, methods=["post"])
    def create_invite(self, request, pk=None):
        trip = self.get_object()
        # только owner может создавать инвайт
        if not TripMember.objects.filter(trip=trip, user=request.user, role=TripMember.Role.OWNER).exists():
            return Response({"detail": "Только владелец поездки может создавать приглашения."}, status=status.HTTP_403_FORBIDDEN)

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
            return Response({"detail": "Только владелец поездки может удалять участников."}, status=status.HTTP_403_FORBIDDEN)

        member = get_object_or_404(TripMember.objects.select_related("user"), trip=trip, id=member_id)

        if member.user_id == request.user.id:
            return Response({"detail": "Нельзя удалить самого себя из поездки."}, status=status.HTTP_400_BAD_REQUEST)

        # нельзя удалять owner'а
        if member.role == TripMember.Role.OWNER:
            return Response({"detail": "Нельзя удалить владельца поездки."}, status=status.HTTP_400_BAD_REQUEST)

        removed_user = member.user
        member.delete()

        subject = f"[EqualTrip] Из поездки «{trip.title}» удалён участник"
        removed_message = build_trip_message(
            trip,
            [
                f"Пользователь {request.user.username} удалил вас из поездки.",
                f"Поездка: {trip.title}",
            ],
        )
        safe_send_notification(
            subject,
            removed_message,
            user_emails(removed_user),
            "Failed to send removed member notification email",
        )

        remaining_message = build_trip_message(
            trip,
            [
                f"Пользователь {request.user.username} удалил участника из поездки.",
                f"Удалённый участник: {removed_user.username}",
            ],
        )
        remaining_recipients = trip_member_emails(trip, exclude_user_ids=[request.user.id])
        safe_send_notification(
            subject,
            remaining_message,
            remaining_recipients,
            "Failed to send member removal notification email",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"])
    def leave(self, request, pk=None):
        trip = self.get_object()

        membership = TripMember.objects.get(trip=trip, user=request.user)

        if membership.role == TripMember.Role.OWNER:
            return Response(
                {"detail": "Владелец не может покинуть поездку. Сначала передайте права другому участнику или удалите поездку."},
                status=status.HTTP_400_BAD_REQUEST
            )

        leaving_user = request.user
        membership.delete()

        subject = f"[EqualTrip] Участник покинул поездку «{trip.title}»"
        message = build_trip_message(
            trip,
            [
                f"Пользователь {leaving_user.username} покинул поездку.",
                f"Пользователь: {leaving_user.username}",
            ],
        )
        recipients = trip_member_emails(trip)
        safe_send_notification(subject, message, recipients, "Failed to send leave trip notification email")
        return Response({"detail": "Вы покинули поездку."}, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path=r"members/add")
    def add_member(self, request, pk=None):
        trip = self.get_object()

        is_owner = TripMember.objects.filter(
            trip=trip, user=request.user, role=TripMember.Role.OWNER
        ).exists()
        if not is_owner:
            return Response({"detail": "Только владелец поездки может добавлять участников."}, status=status.HTTP_403_FORBIDDEN)

        user_id = request.data.get("user_id")
        if not user_id:
            return Response({"detail": "Не указан пользователь для добавления."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({"detail": "Пользователь не найден."}, status=status.HTTP_404_NOT_FOUND)

        membership, created = TripMember.objects.get_or_create(
            trip=trip,
            user=target_user,
            defaults={"role": TripMember.Role.MEMBER},
        )

        if not created:
            return Response({"detail": "Пользователь уже состоит в этой поездке."}, status=status.HTTP_400_BAD_REQUEST)

        subject = f"[EqualTrip] Вас добавили в поездку «{trip.title}»"
        direct_message = build_trip_message(
            trip,
            [
                f"Пользователь {request.user.username} добавил вас в поездку.",
                f"Организатор: {trip.owner.username}",
            ],
        )
        safe_send_notification(
            subject,
            direct_message,
            user_emails(target_user),
            "Failed to send member added notification email",
        )

        members_message = build_trip_message(
            trip,
            [
                f"Пользователь {request.user.username} добавил нового участника.",
                f"Новый участник: {target_user.username}",
            ],
        )
        recipients = trip_member_emails(trip, exclude_user_ids=[request.user.id, target_user.id])
        safe_send_notification(
            f"[EqualTrip] В поездке «{trip.title}» новый участник",
            members_message,
            recipients,
            "Failed to send member joined notification email",
        )
        return Response({"detail": "Участник добавлен."}, status=status.HTTP_201_CREATED)

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
            return None, Response({"detail": "Приглашение не найдено."}, status=status.HTTP_404_NOT_FOUND)

        if invite.is_used:
            return None, Response({"detail": "Это приглашение уже использовано."}, status=status.HTTP_400_BAD_REQUEST)

        if invite.expires_at and timezone.now() > invite.expires_at:
            return None, Response({"detail": "Срок действия приглашения истёк."}, status=status.HTTP_400_BAD_REQUEST)

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

        membership, created = TripMember.objects.get_or_create(
            trip=trip,
            user=request.user,
            defaults={"role": TripMember.Role.MEMBER},
        )

        invite.is_used = True
        invite.used_by = request.user
        invite.used_at = timezone.now()
        invite.save(update_fields=["is_used", "used_by", "used_at"])

        if created and membership.role == TripMember.Role.MEMBER:
            subject = f"[EqualTrip] В поездке «{trip.title}» новый участник"
            message = build_trip_message(
                trip,
                [
                    f"Пользователь {request.user.username} присоединился к поездке по приглашению.",
                    f"Новый участник: {request.user.username}",
                ],
            )
            recipients = trip_member_emails(trip, exclude_user_ids=[request.user.id])
            safe_send_notification(subject, message, recipients, "Failed to send invite accept notification email")

        return Response({"trip_id": trip.id}, status=status.HTTP_200_OK)
