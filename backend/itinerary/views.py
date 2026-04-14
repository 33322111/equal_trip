from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from django.db.models import Count
from django.shortcuts import get_object_or_404

from trips.permissions import IsTripMember
from trips.models import Trip
from .models import DayPlan, DayPlanItem, DayPlanComment
from .serializers import (
    DayPlanSerializer,
    DayPlanItemSerializer,
    DayPlanItemCreateSerializer,
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
        return DayPlanItemSerializer

    def perform_create(self, serializer):
        serializer.save(day=self.get_day())

    @action(detail=True, methods=["post"])
    def comments(self, request, trip_id=None, day_id=None, pk=None):
        item = self.get_object()
        text = request.data.get("text", "").strip()
        if not text:
            return Response({"detail": "text required"}, status=400)
        c = DayPlanComment.objects.create(item=item, user=request.user, text=text)
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
