from rest_framework.permissions import BasePermission
from trips.models import TripMember, Trip


class IsTripMember(BasePermission):
    """
    Разрешает доступ, если пользователь является участником поездки.

    Работает для:
      - /trips/<pk>/... (когда объект Trip)
      - /trips/<trip_id>/... (вложенные роуты)
      - объектов, у которых есть .trip или .checklist.trip и т.д.
    """

    def has_permission(self, request, view):
        # 1) Вложенные роуты вида /trips/<trip_id>/...
        trip_id = view.kwargs.get("trip_id")
        if trip_id:
            return TripMember.objects.filter(trip_id=trip_id, user=request.user).exists()

        # 2) Роуты вида /trips/<pk>/... (retrieve Trip)
        # Не режем на этом уровне – проверим в has_object_permission,
        # чтобы не ломать list/create и другие view без trip_id.
        return True

    def has_object_permission(self, request, view, obj):
        # obj может быть Trip или связанная сущность (Expense, ChecklistItem и т.д.)
        if isinstance(obj, Trip):
            trip = obj
        else:
            trip = getattr(obj, "trip", None)

            if trip is None:
                # checklist item -> checklist -> trip
                if hasattr(obj, "checklist") and getattr(obj.checklist, "trip", None):
                    trip = obj.checklist.trip
                # comment -> item -> checklist -> trip
                elif hasattr(obj, "item") and hasattr(obj.item, "checklist") and getattr(obj.item.checklist, "trip", None):
                    trip = obj.item.checklist.trip

        if trip is None:
            return False

        return TripMember.objects.filter(trip=trip, user=request.user).exists()