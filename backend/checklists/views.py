from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action

from trips.permissions import IsTripMember
from trips.models import Trip, TripMember
from .models import Checklist, ChecklistItem, ChecklistComment
from .serializers import (
    ChecklistSerializer,
    ChecklistCreateSerializer,
    ChecklistItemSerializer,
    ChecklistItemCreateSerializer,
    ChecklistItemUpdateSerializer,
    ChecklistCommentSerializer,
)


class TripChecklistViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get_trip(self) -> Trip:
        return Trip.objects.get(pk=self.kwargs["trip_id"])

    def get_queryset(self):
        return (
            Checklist.objects.filter(trip_id=self.kwargs["trip_id"])
            .prefetch_related("items", "items__comments")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        if self.action == "create":
            return ChecklistCreateSerializer
        return ChecklistSerializer

    def perform_create(self, serializer):
        trip = self.get_trip()
        serializer.save(trip=trip, created_by=self.request.user)


class TripChecklistItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get_trip(self) -> Trip:
        return Trip.objects.get(pk=self.kwargs["trip_id"])

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx["trip"] = self.get_trip()
        return ctx

    def get_checklist(self) -> Checklist:
        return Checklist.objects.get(pk=self.kwargs["checklist_id"], trip_id=self.kwargs["trip_id"])

    def get_queryset(self):
        return (
            ChecklistItem.objects.filter(
                checklist_id=self.kwargs["checklist_id"],
                checklist__trip_id=self.kwargs["trip_id"]
            )
            .select_related("assignee")
            .prefetch_related("comments")
            .order_by("is_done", "-updated_at")
        )

    def get_serializer_class(self):
        if self.action == "create":
            return ChecklistItemCreateSerializer
        if self.action in ("update", "partial_update"):
            return ChecklistItemUpdateSerializer
        return ChecklistItemSerializer

    def perform_create(self, serializer):
        checklist = self.get_checklist()
        assignee_id = serializer.validated_data.pop("assignee_id", None)

        item = ChecklistItem.objects.create(
            checklist=checklist,
            title=serializer.validated_data["title"],
            due_date=serializer.validated_data.get("due_date"),
            created_by=self.request.user,
            assignee_id=assignee_id,
        )
        serializer.instance = item

    def perform_update(self, serializer):
        assignee_id = serializer.validated_data.pop("assignee_id", None)

        instance: ChecklistItem = serializer.instance
        if "title" in serializer.validated_data:
            instance.title = serializer.validated_data["title"]
        if "due_date" in serializer.validated_data:
            instance.due_date = serializer.validated_data["due_date"]
        if "is_done" in serializer.validated_data:
            instance.is_done = serializer.validated_data["is_done"]

        if assignee_id is not None or "assignee_id" in serializer.validated_data:
            instance.assignee_id = assignee_id

        instance.save()
        serializer.instance = instance

    @action(detail=True, methods=["post"], url_path="comments")
    def add_comment(self, request, trip_id=None, checklist_id=None, pk=None):
        item = self.get_object()
        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"detail": "text is required"}, status=status.HTTP_400_BAD_REQUEST)

        comment = ChecklistComment.objects.create(item=item, user=request.user, text=text)
        return Response(ChecklistCommentSerializer(comment).data, status=201)