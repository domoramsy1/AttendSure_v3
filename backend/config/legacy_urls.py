from django.urls import include, path
from rest_framework.routers import DefaultRouter

from common.security import clear_system_cache_view, database_health_view
from apps.accounts.views import (
    AuditLogListView,
    AuditLogViewSet,
    CurrentProfileView,
    LoginView,
    ResetDeviceBindingView,
    SavePushTokenView,
    TeacherViewSet,
    UserAccountViewSet,
    ValidateFieldView,
)
from apps.attendance.views import (
    AdviserMatrixView,
    AssignedClassRosterView,
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
    EmergencyRollCallView,
    TeacherCheckInView,
)
from apps.messaging.views import (
    ChatMessageView,
    ChatThreadListView,
    MarkNotificationsReadView,
    NotificationViewSet,
)
from apps.reports.views import (
    DashboardOverviewView,
    DropoutRiskView,
    MonthlyDtrView,
    ReportAuditLogView,
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
    RoomViewSet,
    SchoolHolidayViewSet,
    SchoolSettingsView,
    SchoolYearViewSet,
    SectionViewSet,
    SubjectViewSet,
)
from apps.students.views import EnrollmentViewSet, ParentPortalView, StudentViewSet

router = DefaultRouter()
router.register(r"students", StudentViewSet, basename="legacy-students")
router.register(r"faculty", TeacherViewSet, basename="legacy-faculty")
router.register(r"facultys", TeacherViewSet, basename="legacy-facultys")
router.register(r"teachers", TeacherViewSet, basename="legacy-teachers")
router.register(r"users", UserAccountViewSet, basename="legacy-users")
router.register(r"sections", SectionViewSet, basename="legacy-sections")
router.register(r"grade-levels", GradeLevelViewSet, basename="legacy-grade-levels")
router.register(r"academic-years", SchoolYearViewSet, basename="legacy-academic-years")
router.register(r"rooms", RoomViewSet, basename="legacy-rooms")
router.register(r"subjects", SubjectViewSet, basename="legacy-subjects")
router.register(r"schedules", ClassPeriodViewSet, basename="legacy-schedules")
router.register(r"enrollments", EnrollmentViewSet, basename="legacy-enrollments")
router.register(r"gate-passes", ExitPassViewSet, basename="legacy-gate-passes")
router.register(r"exit-passes", ExitPassViewSet, basename="legacy-exit-passes")
router.register(r"notifications", NotificationViewSet, basename="legacy-notifications")
router.register(r"activity-logs", AuditLogViewSet, basename="legacy-activity-logs")

student_qr_cards = StudentViewSet.as_view({"get": "qr_cards"})
holiday_list_create = SchoolHolidayViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    # Authentication & Personal Profile
    path("auth/login/", LoginView.as_view()),
    path("login/", LoginView.as_view()),
    path("auth/me/", CurrentProfileView.as_view()),
    path("me/", CurrentProfileView.as_view()),
    path("profile/", CurrentProfileView.as_view()),
    path("auth/validate-field/", ValidateFieldView.as_view()),
    path("validate-field/", ValidateFieldView.as_view()),
    path("auth/register-push-token/", SavePushTokenView.as_view()),
    path("register-push-token/", SavePushTokenView.as_view()),

    # Dashboard, Health & Cache Maintenance
    path("dashboard/overview/", DashboardOverviewView.as_view()),
    path("dashboard/", DashboardOverviewView.as_view()),
    path("system/status/", SystemStatusView.as_view()),
    path("health/db/", database_health_view),
    path("core/maintenance/db-check/", database_health_view),
    path("cache/flush/", clear_system_cache_view),
    path("core/maintenance/flush-cache/", clear_system_cache_view),

    # Classroom Scanning, Class Lists & Rosters
    path("classroom/scan/", ScanStudentQrView.as_view()),
    path("classroom/student-scan/", ScanStudentQrView.as_view()),
    path("classroom/offline-sync/", OfflineQrSyncView.as_view()),
    path("classroom/sync-offline/", OfflineQrSyncView.as_view()),
    path("classroom/attendance/", ClassAttendanceView.as_view()),
    path("attendance-logs/", ClassAttendanceView.as_view()),
    path("classroom/qr-cards/", student_qr_cards),
    path("classroom/signed-qr-cards/", student_qr_cards),
    path("classroom/classes/", AssignedClassRosterView.as_view()),
    path("classroom/class-list/", AssignedClassRosterView.as_view()),
    path("classroom/class_list/", AssignedClassRosterView.as_view()),
    path("my-classes/", AssignedClassRosterView.as_view()),
    path("classroom/students/", SectionStudentListView.as_view()),
    path("classroom/student-list/", SectionStudentListView.as_view()),
    path("classroom/student_list/", SectionStudentListView.as_view()),
    path("student-list/", SectionStudentListView.as_view()),
    path("classroom/adviser-matrix/", AdviserMatrixView.as_view()),
    path("adviser-matrix/", AdviserMatrixView.as_view()),

    # Campus GPS Boundary & Device Security
    path("geofence/", CampusBoundaryView.as_view()),
    path("geofence/status/", CampusBoundaryView.as_view()),
    path("geofence/manage/", CampusBoundaryView.as_view()),
    path("geofence/check-in/", TeacherCheckInView.as_view()),
    path("telemetry/heartbeat/", TeacherCheckInView.as_view()),
    path("geofence/audit/", BoundaryAuditView.as_view()),
    path("geofence/reset-device/", ResetDeviceBindingView.as_view()),
    path("monitoring/loafing/", CampusAnomalyListView.as_view()),

    # Parent Portal & Messaging
    path("parent/portal/", ParentPortalView.as_view()),
    path("parent/children/", ParentPortalView.as_view()),
    path("parent/notifications/read/", MarkNotificationsReadView.as_view()),
    path("notifications/mark-read/", MarkNotificationsReadView.as_view()),
    path("chat/threads/", ChatThreadListView.as_view()),
    path("chat/messages/", ChatMessageView.as_view()),

    # Settings & Audit Logs
    path("settings/school/", SchoolSettingsView.as_view()),
    path("settings/calendar-exceptions/", holiday_list_create),
    path("user-activity-logs/", AuditLogListView.as_view()),
    path("report-audit-logs/", ReportAuditLogView.as_view()),
    path("audit-logs/", AuditLogListView.as_view()),

    # Official DepEd Forms & Reports
    path("reports/dtr/", MonthlyDtrView.as_view()),
    path("reports/dtr/<int:pk>/", MonthlyDtrView.as_view()),
    path("reports/sf1/", Sf1ReportView.as_view()),
    path("reports/sf1/<int:pk>/", Sf1ReportView.as_view()),
    path("reports/print/", Sf1PrintView.as_view()),
    path("reports/sf2/", Sf2ReportView.as_view()),
    path("reports/sf2/<int:pk>/", Sf2ReportView.as_view()),
    path("reports/sf4/", Sf4ReportView.as_view()),
    path("reports/audit-log/", AuditLogListView.as_view()),

    # Analytics & Roll Call
    path("enterprise/sardo-early-warning/", DropoutRiskView.as_view()),
    path("enterprise/emergency-roll-call/", EmergencyRollCallView.as_view()),
    path("enterprise/sdg-impact/", SdgImpactView.as_view()),

    path("auth/validate-field/", ValidateFieldView.as_view()),
    path("auth/validate/", ValidateFieldView.as_view()),
    path("validate-field/", ValidateFieldView.as_view()),
    path("validate/", ValidateFieldView.as_view()),

    path("", include(router.urls)),
]