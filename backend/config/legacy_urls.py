from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (
    AuditLogListView,
    CurrentProfileView,
    FieldAvailabilityView,
    LoginView,
    ResetBoundDeviceView,
    TeacherDropdownView,
    TeacherProfileViewSet,
    UnlockAccountsView,
    UserAccountViewSet,
)
from apps.attendance.views import (
    AdviserMatrixView,
    AssignedClassListView,
    ClassAttendanceView,
    ExitPassViewSet,
    OfflineQrSyncView,
    ScanStudentQrView,
    SectionStudentListView,
)
from apps.campus.views import (
    BoundaryAuditView,
    CampusAnomalyListView,
    CampusBoundaryView,
    CampusOverviewView,
    EmergencyRollCallView,
    LoafingIncidentViewSet,
    TeacherCheckInView,
    TeacherGpsPingView,
)
from apps.reports.views import (
    DashboardOverviewView,
    DropoutRiskView,
    EdFiExportView,
    MonthlyDtrView,
    ReportAuditLogView,
    ReportExportView,
    SdgImpactView,
    Sf1PrintView,
    Sf1ReportView,
    Sf2ReportView,
    Sf4ReportView,
    SystemStatusView,
)
from apps.school.views import (
    ClassPeriodViewSet,
    GradeLevelViewSet,
    PublicSchoolBrandingView,
    RoomViewSet,
    SchoolHolidayViewSet,
    SchoolSettingsView,
    SchoolYearViewSet,
    SectionViewSet,
    SubjectViewSet,
)
from apps.students.views import EnrollmentViewSet, StudentViewSet
from common.security import clear_system_cache_view, database_health_view

router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="compat-students")
router.register(r"teachers", TeacherProfileViewSet, basename="compat-teachers")
router.register(r"users", UserAccountViewSet, basename="compat-users")
router.register(r"sections", SectionViewSet, basename="compat-sections")
router.register(r"grade-levels", GradeLevelViewSet, basename="compat-grade-levels")
router.register(r"school-years", SchoolYearViewSet, basename="compat-school-years")
router.register(r"academic-years", SchoolYearViewSet, basename="compat-academic-years")
router.register(r"rooms", RoomViewSet, basename="compat-rooms")
router.register(r"subjects", SubjectViewSet, basename="compat-subjects")
router.register(r"schedules", ClassPeriodViewSet, basename="compat-schedules")
router.register(r"enrollments", EnrollmentViewSet, basename="compat-enrollments")
router.register(r"exit-passes", ExitPassViewSet, basename="compat-exit-passes")
router.register(r"gate-passes", ExitPassViewSet, basename="compat-gate-passes")
router.register(r"loafing", LoafingIncidentViewSet, basename="compat-loafing")
router.register(r"calendar/exceptions", SchoolHolidayViewSet, basename="compat-calendar-exceptions")

student_qr_cards = StudentViewSet.as_view({"get": "qr_cards"})

urlpatterns = [
    path("auth/login/", LoginView.as_view()),
    path("login/", LoginView.as_view()),
    path("auth/me/", CurrentProfileView.as_view()),
    path("me/", CurrentProfileView.as_view()),
    path("profile/", CurrentProfileView.as_view()),
    path("auth/validate-field/", FieldAvailabilityView.as_view()),
    path("validate-field/", FieldAvailabilityView.as_view()),
    path("auth/unlock-accounts/", UnlockAccountsView.as_view()),
    path("teachers/dropdown/", TeacherDropdownView.as_view()),
    path("dashboard/overview/", DashboardOverviewView.as_view()),
    path("dashboard/", DashboardOverviewView.as_view()),
    path("system/status/", SystemStatusView.as_view()),
    path("health/db/", database_health_view),
    path("cache/flush/", clear_system_cache_view),
    path("classroom/scan/", ScanStudentQrView.as_view()),
    path("classroom/offline-sync/", OfflineQrSyncView.as_view()),
    path("classroom/batch-scan/", OfflineQrSyncView.as_view()),
    path("classroom/attendance/", ClassAttendanceView.as_view()),
    path("classroom/logs/", ClassAttendanceView.as_view()),
    path("classroom/qr-cards/", student_qr_cards),
    path("classroom/classes/", AssignedClassListView.as_view()),
    path("classroom/assigned/", AssignedClassListView.as_view()),
    path("classroom/class-list/", AssignedClassListView.as_view()),
    path("classroom/class_list/", AssignedClassListView.as_view()),
    path("classroom/students/", SectionStudentListView.as_view()),
    path("classroom/adviser-matrix/", AdviserMatrixView.as_view()),
    path("geofence/", CampusOverviewView.as_view()),
    path("geofence/status/", CampusOverviewView.as_view()),
    path("geofence/manage/", CampusBoundaryView.as_view()),
    path("geofence/check-in/", TeacherCheckInView.as_view()),
    path("geofence/ping/", TeacherGpsPingView.as_view()),
    path("telemetry/heartbeat/", TeacherGpsPingView.as_view()),
    path("geofence/audit/", BoundaryAuditView.as_view()),
    path("geofence/reset-device/", ResetBoundDeviceView.as_view()),
    path("monitoring/loafing/", CampusAnomalyListView.as_view()),
    path("school/public-branding/", PublicSchoolBrandingView.as_view()),
    path("public-branding/", PublicSchoolBrandingView.as_view()),
    path("settings/school/", SchoolSettingsView.as_view()),
    path(
        "calendar/exceptions/",
        SchoolHolidayViewSet.as_view({"get": "list", "post": "create", "patch": "partial_update_settings"}),
    ),
    path("activity-logs/", AuditLogListView.as_view()),
    path("audit-logs/", AuditLogListView.as_view()),
    path("report-audit-logs/", ReportAuditLogView.as_view()),
    path("dtr/", MonthlyDtrView.as_view()),
    path("reports/dtr/", MonthlyDtrView.as_view()),
    path("reports/dtr/<int:pk>/", MonthlyDtrView.as_view()),
    path("reports/sf1/", Sf1ReportView.as_view()),
    path("reports/sf1/<int:pk>/", Sf1ReportView.as_view()),
    path("reports/print/", Sf1PrintView.as_view()),
    path("reports/sf2/", Sf2ReportView.as_view()),
    path("reports/sf2/<int:pk>/", Sf2ReportView.as_view()),
    path("reports/sf4/", Sf4ReportView.as_view()),
    path("reports/export/", ReportExportView.as_view()),
    path("enterprise/sardo-early-warning/", DropoutRiskView.as_view()),
    path("enterprise/emergency-roll-call/", EmergencyRollCallView.as_view()),
    path("enterprise/sdg-impact/", SdgImpactView.as_view()),
    path("enterprise/edfi-export/", EdFiExportView.as_view()),
    path("", include(router.urls)),
]
