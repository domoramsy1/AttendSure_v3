# backend/apps/campus/urls.py
from django.urls import path
from .views import (
    BoundaryAuditView,
    CampusAnomalyListView,
    CampusBoundaryView,
    EmergencyRollCallView,
    FacultyCheckInView,
)

urlpatterns = [
    path("boundary/", CampusBoundaryView.as_view(), name="campus-boundary"),
    path("check-in/", FacultyCheckInView.as_view(), name="faculty-check-in"),
    path("audit/", BoundaryAuditView.as_view(), name="campus-audit"),
    path("anomalies/", CampusAnomalyListView.as_view(), name="campus-anomalies"),
    path("roll-call/", EmergencyRollCallView.as_view(), name="emergency-roll-call"),
]