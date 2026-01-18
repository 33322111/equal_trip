from django.urls import path
from .views import TripChecklistViewSet, TripChecklistItemViewSet

urlpatterns = [
    path(
        "trips/<int:trip_id>/checklists/",
        TripChecklistViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "trips/<int:trip_id>/checklists/<int:pk>/",
        TripChecklistViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
    ),

    path(
        "trips/<int:trip_id>/checklists/<int:checklist_id>/items/",
        TripChecklistItemViewSet.as_view({"get": "list", "post": "create"}),
    ),
    path(
        "trips/<int:trip_id>/checklists/<int:checklist_id>/items/<int:pk>/",
        TripChecklistItemViewSet.as_view({"patch": "partial_update", "delete": "destroy", "get": "retrieve"}),
    ),
    path(
        "trips/<int:trip_id>/checklists/<int:checklist_id>/items/<int:pk>/comments/",
        TripChecklistItemViewSet.as_view({"post": "add_comment"}),
    ),
]