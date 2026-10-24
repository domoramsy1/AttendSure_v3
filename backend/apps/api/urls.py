"""
AttendSure V3 - API Routing Architecture
File: backend/apps/api/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

# Gate Scanner & Mobile Wake-Up Views
from apps.scanners.views import KioskHeartbeatView, GateScanAPIView

# Live Telemetry & Anti-Cheating View
from apps.telemetry.views import AsyncTelemetryHeartbeatView

# Direct Geofence Views from views/geofence.py
from .views.geofence import (
    FacultyDeviceResetAPIView,
    GeofenceCheckInAPIView,
    GeofenceStatusAPIView,
)

# Classroom Attendance & Class List Views (Direct Import)
from .views.classroom import (
    ClassListAPIView,
    ClassroomBatchScanAPIView,
    FacultyClassroomListAPIView, FacultyClassroomRosterAPIView,
    MyAssignedClassesAPIView,
    StudentListAPIView,
)

# Core API Views
from .views import (
    BulkSmsStatusAPIView,
    CalendarExceptionAPIView,
    CurrentUserProfileView,
    CurrentUserView,
    DashboardOverviewAPIView,
    DatabaseLoginView,
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    DTRListAPIView,
    FacultyViewSet,
    GateLogsAPIView,
    GatePassViewSet,
    GradeLevelViewSet,
    LiveFieldValidationAPIView,
    LoginAPIView,
    MarkSmsStatusAPIView,
    PendingSmsDispatchAPIView,
    RegisterPushTokenAPIView,
    ReportAuditLogAPIView,
    RoomViewSet,
    ScannerViewSet,
    ScheduleViewSet,
    SchoolSettingsAPIView,
    SectionDetailAPIView,
    SectionListAPIView,
    SmsOutboxViewSet,
    StudentViewSet,
    SubjectViewSet,
    UnifiedReportExportAPIView,
    UnifiedReportPrintAPIView,
    UserManagementViewSet,
    db_check,
    flush_cache,
    ping_scanners,
    test_sms_gateway,
)

# ============================================================================
# 1. CORE VIEWSET ROUTER
# ============================================================================
router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'faculty', FacultyViewSet, basename='faculty')
router.register(r'facultys', FacultyViewSet, basename='facultys')
router.register(r'teachers', FacultyViewSet, basename='teachers')
router.register(r'scanners', ScannerViewSet, basename='scanner')
router.register(r'gate-passes', GatePassViewSet, basename='gatepass')
router.register(r'schedules', ScheduleViewSet, basename='schedule')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'users', UserManagementViewSet, basename='user')
router.register(r'rooms', RoomViewSet, basename='rooms')
router.register(r'grade-levels', GradeLevelViewSet, basename='grade-levels')
router.register(r'sms-outbox', SmsOutboxViewSet, basename='sms-outbox')

# ============================================================================
# 2. MAIN URL ROUTING
# ============================================================================
urlpatterns = [
    # --- Authentication, Profile & Hardware Push Registration ---
    path('auth/login/', DatabaseLoginView.as_view(), name='api-login'),
    path('login/', LoginAPIView.as_view(), name='api-login-alias'),
    path('me/', CurrentUserView.as_view(), name='api-me'),
    path('auth/me/', CurrentUserView.as_view(), name='api-auth-me'),
    path('profile/me/', CurrentUserProfileView.as_view(), name='api-profile-me'),
    path('validate-field/', LiveFieldValidationAPIView.as_view(), name='api-validate-field'),
    path('users/register-push-token/', RegisterPushTokenAPIView.as_view(), name='api-register-push-token'),

    # --- SMS Management ---
    path(
        'sms-outbox/delete-delivered/',
        SmsOutboxViewSet.as_view({'delete': 'delete_delivered', 'post': 'delete_delivered'}),
        name='api-sms-delete-delivered',
    ),
    path(
        'sms-outbox/clear-pending/',
        SmsOutboxViewSet.as_view({'delete': 'clear_pending', 'post': 'clear_pending'}),
        name='api-sms-clear-pending',
    ),
    path(
        'sms-outbox/retry-all-failed/',
        SmsOutboxViewSet.as_view({'post': 'retry_all_failed'}),
        name='api-sms-retry-all-failed',
    ),
    path(
        'sms-outbox/metrics/',
        SmsOutboxViewSet.as_view({'get': 'get_metrics'}),
        name='api-sms-metrics',
    ),
    path(
        'sms-outbox/broadcast/',
        SmsOutboxViewSet.as_view({'post': 'broadcast'}),
        name='api-sms-broadcast',
    ),
    path('sms/bulk-status/', BulkSmsStatusAPIView.as_view(), name='api-sms-bulk-status'),
    path('sms/pending/', PendingSmsDispatchAPIView.as_view(), name='api-sms-pending'),
    path('sms/<int:pk>/status/', MarkSmsStatusAPIView.as_view(), name='api-sms-status'),

    # --- Hardware Device Lock Resets (Anti-Buddy Punching) ---
    path(
        'facultys/<int:pk>/reset-device/',
        FacultyDeviceResetAPIView.as_view(),
        name='api-reset-device-binding',
    ),
    path(
        'faculty/<int:pk>/reset-device/',
        FacultyDeviceResetAPIView.as_view(),
        name='api-faculty-reset-device-binding',
    ),

    # --- Campus & Institutional Overview ---
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='api-dashboard-overview'),
    path('sections/', SectionListAPIView.as_view(), name='api-sections'),
    path('sections/<int:pk>/', SectionDetailAPIView.as_view(), name='api-section-detail'),

    # --- School Perimeter & Anti-Cheating Geofence ---
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='api-settings-school'),
    path('school/settings/', SchoolSettingsAPIView.as_view(), name='api-school-settings-alias'),
    path('geofence/', GeofenceStatusAPIView.as_view(), name='api-geofence'),
    path('campus/geofence/', GeofenceStatusAPIView.as_view(), name='api-campus-geofence-alias'),
    path('geofence/checkin/', GeofenceCheckInAPIView.as_view(), name='api-geofence-checkin'),
    path('geofence/check-in/', GeofenceCheckInAPIView.as_view(), name='api-geofence-checkin-alias'),

    # --- Gate Scanner Operations (Card Taps & Barcode Scans) ---
    path('gate/scan/', GateScanAPIView.as_view(), name='api-gate-scan'),
    path('gate/logs/', GateLogsAPIView.as_view(), name='api-gate-logs'),
    path('faculty-gate-logs/', GateLogsAPIView.as_view(), name='api-faculty-gate-logs-alias'),

    # --- Classroom Class List & Attendance (Resolves Mobile 404s) ---
    path('classroom/class_list/', ClassListAPIView.as_view(), name='api-classroom-class-list'),
    path('classroom/class-list/', ClassListAPIView.as_view(), name='api-classroom-class-list-dash'),
    path('classroom/classes/', ClassListAPIView.as_view(), name='api-classroom-classes-alias'),
    path('classroom/student_list/', FacultyClassroomListAPIView.as_view(), name='api-classroom-student_list'),
    path('classroom/student-list/', FacultyClassroomListAPIView.as_view(), name='api-classroom-student_list-dash'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='api-classroom-batch-scan'),
    path('classroom/my-classes/', MyAssignedClassesAPIView.as_view(), name='api-classroom-my-classes'),
    path('my-classes/', MyAssignedClassesAPIView.as_view(), name='api-my-classes-root'),

    # --- Kiosk & Real-Time Telemetry ---
    path('scanners/heartbeat/', KioskHeartbeatView.as_view(), name='api-kiosk-heartbeat'),
    path('telemetry/heartbeat/', AsyncTelemetryHeartbeatView.as_view(), name='api-telemetry-heartbeat'),

    # --- CSC DTR / Form 48 Records ---
    path('dtr/', DTRListAPIView.as_view(), name='api-dtr'),
    path('dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='api-dtr-detail'),
    path('faculty/dtr/', DTRListAPIView.as_view(), name='api-faculty-dtr-alias'),
    path('reports/dtr/', DTRListAPIView.as_view(), name='api-reports-dtr-root'),
    path('reports/dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='api-reports-dtr'),

    # --- DepEd Automated Reports (SF1, SF2, SF4) ---
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-sf1-report'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-sf2-report'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='api-sf4-report'),
    path('reports/export/', UnifiedReportExportAPIView.as_view(), name='api-unified-report-export'),
    path('reports/print/', UnifiedReportPrintAPIView.as_view(), name='api-unified-report-print'),
    path('reports/audit-log/', ReportAuditLogAPIView.as_view(), name='api-report-audit-log'),
    path('reports/audit-logs/', ReportAuditLogAPIView.as_view(), name='api-report-audit-logs'),

    # --- Academic Calendar & Overrides ---
    path('calendar/exceptions/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-list'),
    path('calendar/exceptions/<slug:pk>/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-detail'),

    # --- Core Utilities & Hardware Health ---
    path('telemetry/ping-scanners/', ping_scanners, name='ping-scanners'),
    path('sms/test-gateway/', test_sms_gateway, name='test-sms-gateway'),
    path('core/maintenance/db-check/', db_check, name='db-check'),
    path('core/maintenance/flush-cache/', flush_cache, name='flush-cache'),

    # --- ViewSet Router ---
    path('', include(router.urls)),
]