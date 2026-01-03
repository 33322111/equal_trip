from rest_framework.permissions import BasePermission
from .models import TripMember, Trip


class IsTripMember(BasePermission):
    """
    Разрешает доступ, если request.user является участником поездки.
    Работает как для Trip, так и для объектов, имеющих поле .trip (например Expense).
    """

    def has_object_permission(self, request, view, obj):
        trip = obj if isinstance(obj, Trip) else getattr(obj, "trip", None)
        if trip is None:
            return False
        return TripMember.objects.filter(trip=trip, user=request.user).exists()