from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action

from trips.models import Trip, TripMember
from trips.permissions import IsTripMember
from .models import Expense, ExpenseCategory
from .serializers import (
    ExpenseSerializer, ExpenseCreateSerializer,
    CategorySerializer
)
from django.shortcuts import get_object_or_404
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from .export import export_trip_csv


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all().order_by("name")
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]


class TripExpenseViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTripMember]

    def get_trip(self) -> Trip:
        return Trip.objects.get(id=self.kwargs["trip_id"])

    def get_queryset(self):
        trip = self.get_trip()
        return Expense.objects.filter(trip=trip).select_related("created_by", "category").prefetch_related("shares__user").order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "create":
            return ExpenseCreateSerializer
        return ExpenseSerializer

    def get_object(self):
        obj = super().get_object()
        self.check_object_permissions(self.request, obj.trip)  # IsTripMember по trip
        return obj

    def list(self, request, *args, **kwargs):
        trip = self.get_trip()
        self.check_object_permissions(request, trip)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        trip = self.get_trip()
        self.check_object_permissions(request, trip)

        serializer = ExpenseCreateSerializer(data=request.data, context={"request": request, "trip": trip})
        serializer.is_valid(raise_exception=True)
        expense = serializer.save()

        return Response(ExpenseSerializer(expense).data, status=status.HTTP_201_CREATED)


class TripExportCSVView(APIView):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get(self, request, trip_id: int):
        trip = get_object_or_404(Trip, id=trip_id)
        self.check_object_permissions(request, trip)
        return export_trip_csv(trip)