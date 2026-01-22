from django.urls import path
from .views import TripDayPlanViewSet, TripDayPlanItemViewSet

urlpatterns = [
    path("trips/<int:trip_id>/days/", TripDayPlanViewSet.as_view({"get": "list", "post": "create"})),
    path("trips/<int:trip_id>/days/<int:pk>/", TripDayPlanViewSet.as_view({"delete": "destroy"})),

    path(
        "trips/<int:trip_id>/days/<int:day_id>/items/",
        TripDayPlanItemViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "trips/<int:trip_id>/days/<int:day_id>/items/<int:pk>/",
        TripDayPlanItemViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
    ),
    path(
        "trips/<int:trip_id>/days/<int:day_id>/items/<int:pk>/comments/",
        TripDayPlanItemViewSet.as_view({"post": "comments"}),
    ),
]