from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BoundaryAuditView,
    CampusAnomalyListView,
    CampusBoundaryView,
    CampusOverviewView,
    EmergencyRollCallView,
    LoafingIncidentViewSet,
    TeacherCheckInView,
    TeacherGpsPingView,
)

router = DefaultRouter()
router.register(r"loafing", LoafingIncidentViewSet, basename="loafing-incidents")
router.register(r"loafing-incidents", LoafingIncidentViewSet, basename="loafing-incidents-alias")

urlpatterns = [
    path("overview/", CampusOverviewView.as_view(), name="campus-overview"),
    path("boundary/", CampusBoundaryView.as_view(), name="campus-boundary"),
    path("ping/", TeacherGpsPingView.as_view(), name="teacher-gps-ping"),
    path("check-in/", TeacherCheckInView.as_view(), name="teacher-check-in"),
    path("audit/", BoundaryAuditView.as_view(), name="campus-audit"),
    path("anomalies/", CampusAnomalyListView.as_view(), name="campus-anomalies"),
    path("roll-call/", EmergencyRollCallView.as_view(), name="emergency-roll-call"),
    path("", include(router.urls)),
]
