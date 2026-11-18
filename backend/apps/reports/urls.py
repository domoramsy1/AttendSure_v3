from django.urls import path
from .views import (
    DashboardOverviewView,
    DropoutRiskView,
    MonthlyDtrView,
    SdgImpactView,
    Sf1PrintView,
    Sf1ReportView,
    Sf2ReportView,
    Sf4ReportView,
    SystemStatusView,
)

urlpatterns = [
    path("dashboard/", DashboardOverviewView.as_view(), name="dashboard-overview"),
    path("sf1/", Sf1ReportView.as_view(), name="sf1-report"),
    path("sf1/<int:pk>/", Sf1ReportView.as_view(), name="sf1-report-detail"),
    path("sf1/print/", Sf1PrintView.as_view(), name="sf1-print"),
    path("sf2/", Sf2ReportView.as_view(), name="sf2-report"),
    path("sf2/<int:pk>/", Sf2ReportView.as_view(), name="sf2-report-detail"),
    path("sf4/", Sf4ReportView.as_view(), name="sf4-report"),
    path("dtr/", MonthlyDtrView.as_view(), name="monthly-dtr"),
    path("dtr/<int:pk>/", MonthlyDtrView.as_view(), name="monthly-dtr-detail"),
    path("dropout-risk/", DropoutRiskView.as_view(), name="dropout-risk"),
    path("sdg-impact/", SdgImpactView.as_view(), name="sdg-impact"),
    path("system-status/", SystemStatusView.as_view(), name="system-status"),
]