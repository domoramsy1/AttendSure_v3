from django.urls import path
from .views import (
    BoundaryAuditView,
    CampusAnomalyListView,
    CampusBoundaryView,
    EmergencyRollCallView,
    TeacherCheckInView,
)

urlpatterns = [
    path("boundary/", CampusBoundaryView.as_view(), name="campus-boundary"),
    path("check-in/", TeacherCheckInView.as_view(), name="teacher-check-in"),
    path("audit/", BoundaryAuditView.as_view(), name="campus-audit"),
    path("anomalies/", CampusAnomalyListView.as_view(), name="campus-anomalies"),
    path("roll-call/", EmergencyRollCallView.as_view(), name="emergency-roll-call"),
]