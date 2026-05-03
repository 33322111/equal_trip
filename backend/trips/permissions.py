from rest_framework.permissions import BasePermission
from trips.models import TripMember, Trip


class IsTripMember(BasePermission):
    """
    Разрешает доступ, если пользователь является участником поездки.

    Проверка членства происходит только на object-level.
    """

    def has_permission(self, request, view):
        trip_id = view.kwargs.get("trip_id")
        if trip_id is None:
            return True

        if not getattr(request.user, "is_authenticated", False):
            return False

        if TripMember.objects.filter(trip_id=trip_id, user=request.user).exists():
            return True

        return not Trip.objects.filter(pk=trip_id).exists()

    def has_object_permission(self, request, view, obj):
        """
        Проверяем, относится ли объект к поездке,
        и является ли пользователь участником этой поездки.
        """

        # Сам Trip
        if isinstance(obj, Trip):
            trip = obj

        # Прямое поле trip
        elif hasattr(obj, "trip"):
            trip = obj.trip

        # checklist item → checklist → trip
        elif hasattr(obj, "checklist") and hasattr(obj.checklist, "trip"):
            trip = obj.checklist.trip

        # itinerary item → day → trip
        elif hasattr(obj, "day") and hasattr(obj.day, "trip"):
            trip = obj.day.trip

        # comment → item → checklist/day → trip
        elif hasattr(obj, "item"):
            item = obj.item
            if hasattr(item, "checklist") and hasattr(item.checklist, "trip"):
                trip = item.checklist.trip
            elif hasattr(item, "day") and hasattr(item.day, "trip"):
                trip = item.day.trip
            else:
                return False
        else:
            return False

        return TripMember.objects.filter(trip=trip, user=request.user).exists()
