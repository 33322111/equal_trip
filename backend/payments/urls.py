from django.urls import path
from .views import TripSettlementViewSet

urlpatterns = [
    path(
        "trips/<int:trip_id>/settlements/",
        TripSettlementViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "trips/<int:trip_id>/settlements/<int:pk>/",
        TripSettlementViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
    ),
    path(
        "trips/<int:trip_id>/settlements/<int:pk>/confirm/",
        TripSettlementViewSet.as_view({"post": "confirm"}),
    ),
]