from rest_framework.permissions import BasePermission
from .models import TripMember, Trip


class IsTripMember(BasePermission):
    def has_object_permission(self, request, view, obj: Trip):
        return TripMember.objects.filter(trip=obj, user=request.user).exists()