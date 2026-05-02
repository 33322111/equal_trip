from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from trips.models import Trip, TripMember
from trips.permissions import IsTripMember
from .models import Expense, ExpenseCategory
from .serializers import (
    ExpenseSerializer, ExpenseCreateSerializer,
    CategorySerializer, ExpenseUpdateSerializer
)
from django.shortcuts import get_object_or_404
from rest_framework.views import APIView
from .export import export_trip_csv
from .export_pdf import export_trip_pdf
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .fx import get_all_currencies


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = ExpenseCategory.objects.all().order_by("name")
    serializer_class = CategorySerializer

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]


class TripExpenseViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTripMember]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_trip(self) -> Trip:
        return Trip.objects.get(id=self.kwargs["trip_id"])

    def get_queryset(self):
        trip = self.get_trip()
        return Expense.objects.filter(trip=trip).select_related("created_by", "category").prefetch_related(
            "shares__user").order_by("-created_at")

    def get_object(self):
        return super().get_object()

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

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        trip = self.get_trip()
        self.check_object_permissions(request, trip)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}

        output = ExpenseSerializer(instance, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_200_OK)

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def get_serializer_class(self):
        if self.action in ("update", "partial_update"):
            return ExpenseUpdateSerializer
        return ExpenseSerializer


class TripExportCSVView(APIView):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get(self, request, trip_id: int):
        trip = get_object_or_404(Trip, id=trip_id)
        self.check_object_permissions(request, trip)
        return export_trip_csv(trip)


class TripExportPDFView(APIView):
    permission_classes = [IsAuthenticated, IsTripMember]

    def get(self, request, trip_id: int):
        trip = get_object_or_404(Trip, id=trip_id)
        self.check_object_permissions(request, trip)
        return export_trip_pdf(trip)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_currencies(request):
    data = get_all_currencies()
    return Response(
        [
            {"code": code, "name": name}
            for code, name in sorted(data.items())
        ]
    )
