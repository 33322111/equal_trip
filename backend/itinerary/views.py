from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Count
from django.shortcuts import get_object_or_404

from trips.permissions import IsTripMember
from trips.models import Trip
from notifications.utils import build_trip_message, safe_send_notification, trip_member_emails, user_emails
from .models import DayPlan, DayPlanItem, DayPlanComment
from .serializers import (
    DayPlanSerializer,
    DayPlanItemSerializer,
    DayPlanItemCreateSerializer,
    DayPlanItemUpdateSerializer,
    DayPlanCommentSerializer,
)


class TripDayPlanViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get_trip(self):
        return Trip.objects.get(pk=self.kwargs["trip_id"])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["trip"] = self.get_trip()
        return ctx

    def get_queryset(self):
        return DayPlan.objects.filter(trip_id=self.kwargs["trip_id"]).annotate(
            items_count=Count("items")
        )

    def get_serializer_class(self):
        return DayPlanSerializer

    def perform_create(self, serializer):
        serializer.save(trip=self.get_trip())


class TripDayPlanItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get_trip(self):
        return Trip.objects.get(pk=self.kwargs["trip_id"])

    def get_day(self):
        return DayPlan.objects.get(pk=self.kwargs["day_id"], trip_id=self.kwargs["trip_id"])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["trip"] = self.get_trip()
        return ctx

    def get_queryset(self):
        return (
            DayPlanItem.objects.filter(day_id=self.kwargs["day_id"], day__trip_id=self.kwargs["trip_id"])
            .select_related("assignee")
            .prefetch_related("comments__user")
        )

    def get_serializer_class(self):
        if self.action == "create":
            return DayPlanItemCreateSerializer
        if self.action in ("update", "partial_update"):
            return DayPlanItemUpdateSerializer
        return DayPlanItemSerializer

    def perform_create(self, serializer):
        item = serializer.save(day=self.get_day())
        if item.assignee_id and item.assignee_id != self.request.user.id:
            trip = item.day.trip
            subject = f"[EqualTrip] Вам назначена активность в поездке «{trip.title}»"
            message = build_trip_message(
                trip,
                [
                    f"Пользователь {self.request.user.username} назначил вам активность.",
                    f"День: {item.day.date:%d.%m.%Y}",
                    f"Активность: {item.title}",
                    f"Время: {item.time_from or '—'} — {item.time_to or '—'}",
                ],
            )
            safe_send_notification(
                subject,
                message,
                user_emails(item.assignee),
                "Failed to send itinerary assignment notification email",
            )

    def perform_update(self, serializer):
        instance = serializer.instance
        previous_assignee_id = instance.assignee_id
        previous_status = instance.is_done
        previous_title = instance.title
        previous_time_from = instance.time_from
        previous_time_to = instance.time_to

        updated_item = serializer.save()
        trip = updated_item.day.trip

        if updated_item.assignee_id and updated_item.assignee_id != self.request.user.id:
            if previous_assignee_id != updated_item.assignee_id:
                subject = f"[EqualTrip] Вам назначена активность в поездке «{trip.title}»"
                message = build_trip_message(
                    trip,
                    [
                        f"Пользователь {self.request.user.username} назначил вам активность.",
                        f"День: {updated_item.day.date:%d.%m.%Y}",
                        f"Активность: {updated_item.title}",
                        f"Время: {updated_item.time_from or '—'} — {updated_item.time_to or '—'}",
                    ],
                )
                safe_send_notification(
                    subject,
                    message,
                    user_emails(updated_item.assignee),
                    "Failed to send itinerary reassignment notification email",
                )
            elif (
                previous_title != updated_item.title
                or previous_time_from != updated_item.time_from
                or previous_time_to != updated_item.time_to
            ):
                subject = f"[EqualTrip] Активность обновлена в поездке «{trip.title}»"
                message = build_trip_message(
                    trip,
                    [
                        f"Пользователь {self.request.user.username} обновил активность, назначенную вам.",
                        f"День: {updated_item.day.date:%d.%m.%Y}",
                        f"Активность: {updated_item.title}",
                        f"Время: {updated_item.time_from or '—'} — {updated_item.time_to or '—'}",
                    ],
                )
                safe_send_notification(
                    subject,
                    message,
                    user_emails(updated_item.assignee),
                    "Failed to send itinerary update notification email",
                )

        if previous_status != updated_item.is_done:
            subject = f"[EqualTrip] Статус активности изменён в поездке «{trip.title}»"
            message = build_trip_message(
                trip,
                [
                    f"Пользователь {self.request.user.username} изменил статус активности.",
                    f"День: {updated_item.day.date:%d.%m.%Y}",
                    f"Активность: {updated_item.title}",
                    f"Новый статус: {'выполнено' if updated_item.is_done else 'не выполнено'}",
                ],
            )
            recipients = trip_member_emails(trip, exclude_user_ids=[self.request.user.id])
            safe_send_notification(
                subject,
                message,
                recipients,
                "Failed to send itinerary status notification email",
            )

    @action(detail=True, methods=["post"])
    def comments(self, request, trip_id=None, day_id=None, pk=None):
        item = self.get_object()
        text = request.data.get("text", "").strip()
        if not text:
            return Response({"detail": "text required"}, status=400)
        c = DayPlanComment.objects.create(item=item, user=request.user, text=text)
        subject = f"[EqualTrip] Новый комментарий к активности в поездке «{item.day.trip.title}»"
        message = build_trip_message(
            item.day.trip,
            [
                f"Пользователь {request.user.username} оставил комментарий к активности.",
                f"День: {item.day.date:%d.%m.%Y}",
                f"Активность: {item.title}",
                f"Комментарий: {text}",
            ],
        )
        recipients = trip_member_emails(item.day.trip, exclude_user_ids=[request.user.id])
        safe_send_notification(
            subject,
            message,
            recipients,
            "Failed to send itinerary comment notification email",
        )
        return Response(DayPlanCommentSerializer(c).data, status=201)

    @action(detail=True, methods=["patch", "delete"], url_path=r"comments/(?P<comment_id>[^/.]+)")
    def comment_detail(self, request, trip_id=None, day_id=None, pk=None, comment_id=None):
        item = self.get_object()
        comment = get_object_or_404(DayPlanComment, pk=comment_id, item=item)

        if comment.user_id != request.user.id:
            return Response(
                {"detail": "Можно редактировать и удалять только свои комментарии."},
                status=status.HTTP_403_FORBIDDEN,
            )

        if request.method == "PATCH":
            text = (request.data.get("text") or "").strip()
            if not text:
                return Response({"detail": "text required"}, status=status.HTTP_400_BAD_REQUEST)
            comment.text = text
            comment.save(update_fields=["text"])
            return Response(DayPlanCommentSerializer(comment).data, status=status.HTTP_200_OK)

        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
