"""
AttendSure V3 - API Routing Architecture
File: backend/apps/api/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.scanners.views import KioskHeartbeatView
from apps.telemetry.views import AsyncTelemetryHeartbeatView

from .views import (
    ClassroomBatchScanAPIView,
    CurrentUserProfileView,
    DashboardOverviewAPIView,
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    DTRListAPIView,
    FacultyClassroomRosterAPIView,
    FacultyViewSet,
    GateLogsAPIView,
    GatePassViewSet,
    GateScanAPIView,
    GeofenceAPIView,
    GradeLevelViewSet,
    LoginAPIView,
    MarkSmsStatusAPIView,
    PendingSmsDispatchAPIView,
    DatabaseLoginView,
    ReportAuditLogAPIView,
    ResetFacultyDeviceBindingAPIView,
    RoomViewSet,
    ScannerViewSet,
    ScheduleViewSet,
    SchoolSettingsAPIView,
    SectionListAPIView,
    SmsOutboxViewSet,
    StudentViewSet,
    SubjectViewSet,
    TelemetryHeartbeatAPIView,
    UserManagementViewSet,
    CurrentUserView,
)

# Optional bulk view fallback to prevent ImportError if not yet defined in views.py
try:
    from .views import BulkSmsStatusAPIView
except ImportError:
    BulkSmsStatusAPIView = None

# 1. Register Core Entity ViewSets
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

# 2. Main API Route Configuration

urlpatterns = [
    # Explicit SMS Outbox Action Routes
    path(
        'sms-outbox/delete-delivered/',
        SmsOutboxViewSet.as_view({'delete': 'delete_delivered', 'post': 'delete_delivered'}),
        name='api-sms-delete-delivered',
    ),
    path(
        'sms-outbox/broadcast/',
        SmsOutboxViewSet.as_view({'post': 'broadcast'}),
        name='api-sms-broadcast',
    ),

    # Primary ViewSets
    path('', include(router.urls)),

    # Authentication & Profile (Single Canonical Definitions)
    path('auth/login/', DatabaseLoginView.as_view(), name='api-login'),
    path('me/', CurrentUserView.as_view(), name='api-me'),
    path('auth/me/', CurrentUserView.as_view(), name='api-auth-me'),

    # Hardware GSM Modem Daemon Endpoints
    path('sms/pending/', PendingSmsDispatchAPIView.as_view(), name='api-sms-pending'),
    path('sms/<int:pk>/status/', MarkSmsStatusAPIView.as_view(), name='api-sms-status'),

    # Faculty Device Binding & Security
    path('facultys/<int:faculty_id>/reset-device/', ResetFacultyDeviceBindingAPIView.as_view(), name='api-reset-device-binding'),
    path('faculty/<int:faculty_id>/reset-device/', ResetFacultyDeviceBindingAPIView.as_view(), name='api-faculty-reset-device-binding'),

    # Dashboard & Sections
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='api-dashboard-overview'),
    path('sections/', SectionListAPIView.as_view(), name='api-sections'),

    # Institutional Settings
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='api-settings-school'),
    path('school/settings/', SchoolSettingsAPIView.as_view(), name='api-school-settings-alias'),

    # Hardware Turnstiles & Gate Logs
    path('gate/scan/', GateScanAPIView.as_view(), name='api-gate-scan'),
    path('gate/logs/', GateLogsAPIView.as_view(), name='api-gate-logs'),
    path('faculty-gate-logs/', GateLogsAPIView.as_view(), name='api-faculty-gate-logs-alias'),

    # Classroom Mobile Ingestion & Teacher Rosters
    path('classroom/roster/', FacultyClassroomRosterAPIView.as_view(), name='api-classroom-roster'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='api-classroom-batch-scan'),

    # Hardware Terminal & Telemetry Heartbeats
    path('scanners/heartbeat/', KioskHeartbeatView.as_view(), name='api-kiosk-heartbeat'),
    path('telemetry/heartbeat/', TelemetryHeartbeatAPIView.as_view(), name='api-telemetry-heartbeat'),
    path('telemetry/async-heartbeat/', AsyncTelemetryHeartbeatView.as_view(), name='api-telemetry-async-heartbeat'),

    # Faculty Daily Time Records (Civil Service Form 48)
    path('dtr/', DTRListAPIView.as_view(), name='api-dtr'),
    path('dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='api-dtr-detail'),
    path('faculty/dtr/', DTRListAPIView.as_view(), name='api-faculty-dtr-alias'),
    path('reports/dtr/', DTRListAPIView.as_view(), name='api-reports-dtr-root'),
    path('reports/dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='api-reports-dtr'),

    # Campus Geofence Boundary
    path('geofence/', GeofenceAPIView.as_view(), name='api-geofence'),
    path('campus/geofence/', GeofenceAPIView.as_view(), name='api-campus-geofence-alias'),

    # DepEd Reports
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-sf1-report'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-sf2-report'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='api-sf4-report'),

    # Audit Logs
    path('reports/audit-logs/', ReportAuditLogAPIView.as_view(), name='api-report-audit-logs'),
]

# Register bulk status endpoint if available
if BulkSmsStatusAPIView:
    urlpatterns.insert(
        3,
        path('sms/bulk-status/', BulkSmsStatusAPIView.as_view(), name='api-sms-bulk-status'),
    )