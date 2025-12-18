from rest_framework.routers import DefaultRouter
from .views import TripViewSet, InviteAcceptViewSet

router = DefaultRouter()
router.register(r"trips", TripViewSet, basename="trips")
router.register(r"invites", InviteAcceptViewSet, basename="invites")

urlpatterns = router.urls