from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, TripExpenseViewSet, TripExportCSVView, TripExportPDFView

router = DefaultRouter()
router.register(r"categories", CategoryViewSet, basename="categories")

urlpatterns = router.urls + [
    path("trips/<int:trip_id>/expenses/", TripExpenseViewSet.as_view({"get": "list", "post": "create"})),
    path(
        "trips/<int:trip_id>/expenses/<int:pk>/",
        TripExpenseViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"})
    ),
    path("trips/<int:trip_id>/export/csv/", TripExportCSVView.as_view()),
    path("trips/<int:trip_id>/export/pdf/", TripExportPDFView.as_view()),
]