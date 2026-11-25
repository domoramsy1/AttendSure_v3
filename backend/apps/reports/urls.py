# D:\AttendSure_V3\backend\apps\reports\urls.py

from django.urls import path
from .views import (
    DashboardOverviewView,
    DropoutRiskView,
    EdFiExportView,
    MonthlyDtrView,
    PrintPackView,
    ReportAuditLogView,
    ReportExportView,
    SdgImpactView,
    Sf1PrintView,
    Sf1ReportView,
    Sf2ReportView,
    Sf4ReportView,
    StandardDataExportView,
    SystemStatusView,
)

urlpatterns = [
    path("dashboard/", DashboardOverviewView.as_view(), name="dashboard"),
    path("sf1/", Sf1ReportView.as_view(), name="sf1"),
    path("sf1/<int:pk>/", Sf1ReportView.as_view(), name="sf1-detail"),
    path("sf1/print/", Sf1PrintView.as_view(), name="sf1-print"),
    path("sf2/", Sf2ReportView.as_view(), name="sf2"),
    path("sf2/<int:pk>/", Sf2ReportView.as_view(), name="sf2-detail"),
    path("sf4/", Sf4ReportView.as_view(), name="sf4"),
    path("dtr/", MonthlyDtrView.as_view(), name="dtr"),
    path("dtr/<int:pk>/", MonthlyDtrView.as_view(), name="dtr-detail"),
    path("export/", ReportExportView.as_view(), name="report-export"),
    path("print-pack/", PrintPackView.as_view(), name="report-print-pack"),
    path("edfi-export/", EdFiExportView.as_view(), name="edfi-export"),
    path("division-export/", StandardDataExportView.as_view(), name="division-export"),
    path("audit-logs/", ReportAuditLogView.as_view(), name="report-audit-logs"),
    path("dropout-risk/", DropoutRiskView.as_view(), name="dropout-risk"),
    path("sdg-impact/", SdgImpactView.as_view(), name="sdg-impact"),
    path("system-status/", SystemStatusView.as_view(), name="system-status"),
]