"""
AttendSure V3 - Unified API Routing Architecture
File: backend/apps/api/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

# Core ViewSets with Full CRUD
from .views.viewsets import (
    StudentViewSet,
    FacultyViewSet,
    SectionViewSet,
    ScheduleViewSet,
    SubjectViewSet,
    RoomViewSet,
    GradeLevelViewSet,
    UserManagementViewSet,
    ScannerViewSet,
    GatePassViewSet,
    SmsOutboxViewSet,
)

# Geofence & Device Telemetry Views
from .views.geofence import (
    GeofenceStatusAPIView,
    GeofenceCheckInAPIView,
    FacultyDeviceResetAPIView,
)

# Auth, Dashboard, Classroom, Reports & Utility Views
from .views.auth import (
    DatabaseLoginView,
    LoginAPIView,
    CurrentUserView,
    CurrentUserProfileView,
    LiveFieldValidationAPIView,
    RegisterPushTokenAPIView,
)
from .views.dashboard import DashboardOverviewAPIView
from .views.gate import GateLogsAPIView
from .views.classroom import (
    ClassListAPIView,
    MyAssignedClassesAPIView,
    FacultyClassroomListAPIView,
    ClassroomBatchScanAPIView,
)
from .views.reports import (
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    DTRListAPIView,
    UnifiedReportExportAPIView,
    UnifiedReportPrintAPIView,
    ReportAuditLogAPIView,
)
from .views.sms import (
    PendingSmsDispatchAPIView,
    BulkSmsStatusAPIView,
    MarkSmsStatusAPIView,
)
from .views.utils import (
    SchoolSettingsAPIView,
    CalendarExceptionAPIView,
    ping_scanners,
    test_sms_gateway,
    db_check,
    flush_cache,
)

# Hardware & Telemetry Heartbeats
from apps.scanners.views import KioskHeartbeatView, GateScanAPIView
from apps.telemetry.views import AsyncTelemetryHeartbeatView

# ============================================================================
# 1. DEFAULT ROUTER (FULL CRUD FOR CORE RESOURCES)
# ============================================================================
router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='students')
router.register(r'sections', SectionViewSet, basename='sections')
router.register(r'schedules', ScheduleViewSet, basename='schedules')
router.register(r'faculty', FacultyViewSet, basename='faculty')
router.register(r'facultys', FacultyViewSet, basename='facultys')
router.register(r'teachers', FacultyViewSet, basename='teachers')
router.register(r'subjects', SubjectViewSet, basename='subjects')
router.register(r'rooms', RoomViewSet, basename='rooms')
router.register(r'grade-levels', GradeLevelViewSet, basename='grade-levels')
router.register(r'users', UserManagementViewSet, basename='users')
router.register(r'scanners', ScannerViewSet, basename='scanners')
router.register(r'gate-passes', GatePassViewSet, basename='gate-passes')
router.register(r'sms-outbox', SmsOutboxViewSet, basename='sms-outbox')

# ============================================================================
# 2. MAIN URL PATTERNS
# ============================================================================
urlpatterns = [
    # --- Authentication & User Identity ---
    path('auth/login/', DatabaseLoginView.as_view(), name='api-login'),
    path('login/', LoginAPIView.as_view(), name='api-login-alias'),
    path('me/', CurrentUserView.as_view(), name='api-me'),
    path('auth/me/', CurrentUserView.as_view(), name='api-auth-me'),
    path('profile/me/', CurrentUserProfileView.as_view(), name='api-profile-me'),
    path('validate-field/', LiveFieldValidationAPIView.as_view(), name='api-validate-field'),
    path('users/register-push-token/', RegisterPushTokenAPIView.as_view(), name='api-register-push-token'),

    # --- Geofence Perimeter & GPS Telemetry ---
    path('geofence/telemetry/', GeofenceCheckInAPIView.as_view(), name='api-geofence-telemetry'),
    path('geofence/checkin/', GeofenceCheckInAPIView.as_view(), name='api-geofence-checkin'),
    path('geofence/check-in/', GeofenceCheckInAPIView.as_view(), name='api-geofence-checkin-alias'),
    path('geofence/', GeofenceStatusAPIView.as_view(), name='api-geofence-status'),
    path('campus/geofence/', GeofenceStatusAPIView.as_view(), name='api-campus-geofence-alias'),
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='api-settings-school'),
    path('school/settings/', SchoolSettingsAPIView.as_view(), name='api-school-settings-alias'),

    # --- Device Lock Resets ---
    path('facultys/<int:pk>/reset-device/', FacultyDeviceResetAPIView.as_view(), name='api-reset-device-binding'),
    path('faculty/<int:pk>/reset-device/', FacultyDeviceResetAPIView.as_view(), name='api-faculty-reset-device-binding'),

    # --- Dashboard & Gate Operations ---
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='api-dashboard-overview'),
    path('gate/scan/', GateScanAPIView.as_view(), name='api-gate-scan'),
    path('gate/logs/', GateLogsAPIView.as_view(), name='api-gate-logs'),
    path('faculty-gate-logs/', GateLogsAPIView.as_view(), name='api-faculty-gate-logs-alias'),

    # --- Classroom Class Lists & Roster Attendance ---
    path('classroom/class_list/', ClassListAPIView.as_view(), name='api-classroom-class-list'),
    path('classroom/class-list/', ClassListAPIView.as_view(), name='api-classroom-class-list-dash'),
    path('classroom/classes/', ClassListAPIView.as_view(), name='api-classroom-classes-alias'),
    path('classroom/student_list/', FacultyClassroomListAPIView.as_view(), name='api-classroom-student_list'),
    path('classroom/student-list/', FacultyClassroomListAPIView.as_view(), name='api-classroom-student_list-dash'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='api-classroom-batch-scan'),
    path('classroom/my-classes/', MyAssignedClassesAPIView.as_view(), name='api-classroom-my-classes'),
    path('my-classes/', MyAssignedClassesAPIView.as_view(), name='api-my-classes-root'),

    # --- Kiosk Heartbeats & Asynchronous Telemetry ---
    path('scanners/heartbeat/', KioskHeartbeatView.as_view(), name='api-kiosk-heartbeat'),
    path('telemetry/heartbeat/', AsyncTelemetryHeartbeatView.as_view(), name='api-telemetry-heartbeat'),

    # --- CSC DTR / Form 48 ---
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

    # --- SMS Gateway Endpoints ---
    path('sms/bulk-status/', BulkSmsStatusAPIView.as_view(), name='api-sms-bulk-status'),
    path('sms/pending/', PendingSmsDispatchAPIView.as_view(), name='api-sms-pending'),
    path('sms/<int:pk>/status/', MarkSmsStatusAPIView.as_view(), name='api-sms-status'),

    # --- Academic Calendar & Maintenance ---
    path('calendar/exceptions/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-list'),
    path('calendar/exceptions/<slug:pk>/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-detail'),
    path('telemetry/ping-scanners/', ping_scanners, name='ping-scanners'),
    path('sms/test-gateway/', test_sms_gateway, name='test-sms-gateway'),
    path('core/maintenance/db-check/', db_check, name='db-check'),
    path('core/maintenance/flush-cache/', flush_cache, name='flush-cache'),

    # --- ViewSet Router (Handles all Core Model CRUD) ---
    path('', include(router.urls)),
]