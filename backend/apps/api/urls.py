"""
AttendSure V3 - API Routing Architecture
File: backend/apps/api/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.scanners.views import KioskHeartbeatView
from apps.telemetry.views import AsyncTelemetryHeartbeatView

from .views import (
    BulkSmsStatusAPIView,
    CalendarExceptionAPIView,
    ClassroomBatchScanAPIView,
    CurrentUserProfileView,
    CurrentUserView,
    DashboardOverviewAPIView,
    DatabaseLoginView,
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
    ReportAuditLogAPIView,
    ResetFacultyDeviceBindingAPIView,
    RoomViewSet,
    ScannerViewSet,
    ScheduleViewSet,
    SchoolSettingsAPIView,
    SectionDetailAPIView,
    SectionListAPIView,
    SmsOutboxViewSet,
    StudentViewSet,
    SubjectViewSet,
    TelemetryHeartbeatAPIView,
    UnifiedReportExportAPIView,
    UnifiedReportPrintAPIView,
    UserManagementViewSet,
)

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
    path('sms/bulk-status/', BulkSmsStatusAPIView.as_view(), name='api-sms-bulk-status'),

    path('', include(router.urls)),

    path('auth/login/', DatabaseLoginView.as_view(), name='api-login'),
    path('me/', CurrentUserView.as_view(), name='api-me'),
    path('auth/me/', CurrentUserView.as_view(), name='api-auth-me'),

    path('sms/pending/', PendingSmsDispatchAPIView.as_view(), name='api-sms-pending'),
    path('sms/<int:pk>/status/', MarkSmsStatusAPIView.as_view(), name='api-sms-status'),

    path('facultys/<int:faculty_id>/reset-device/', ResetFacultyDeviceBindingAPIView.as_view(), name='api-reset-device-binding'),
    path('faculty/<int:faculty_id>/reset-device/', ResetFacultyDeviceBindingAPIView.as_view(), name='api-faculty-reset-device-binding'),

    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='api-dashboard-overview'),
    path('sections/', SectionListAPIView.as_view(), name='api-sections'),
    path('sections/<int:pk>/', SectionDetailAPIView.as_view(), name='api-section-detail'),

    path('settings/school/', SchoolSettingsAPIView.as_view(), name='api-settings-school'),
    path('school/settings/', SchoolSettingsAPIView.as_view(), name='api-school-settings-alias'),

    path('gate/scan/', GateScanAPIView.as_view(), name='api-gate-scan'),
    path('gate/logs/', GateLogsAPIView.as_view(), name='api-gate-logs'),
    path('faculty-gate-logs/', GateLogsAPIView.as_view(), name='api-faculty-gate-logs-alias'),

    path('classroom/roster/', FacultyClassroomRosterAPIView.as_view(), name='api-classroom-roster'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='api-classroom-batch-scan'),

    path('scanners/heartbeat/', KioskHeartbeatView.as_view(), name='api-kiosk-heartbeat'),
    path('telemetry/heartbeat/', TelemetryHeartbeatAPIView.as_view(), name='api-telemetry-heartbeat'),
    path('telemetry/async-heartbeat/', AsyncTelemetryHeartbeatView.as_view(), name='api-telemetry-async-heartbeat'),

    path('dtr/', DTRListAPIView.as_view(), name='api-dtr'),
    path('dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='api-dtr-detail'),
    path('faculty/dtr/', DTRListAPIView.as_view(), name='api-faculty-dtr-alias'),
    path('reports/dtr/', DTRListAPIView.as_view(), name='api-reports-dtr-root'),
    path('reports/dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='api-reports-dtr'),

    path('geofence/', GeofenceAPIView.as_view(), name='api-geofence'),
    path('campus/geofence/', GeofenceAPIView.as_view(), name='api-campus-geofence-alias'),

    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-sf1-report'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-sf2-report'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='api-sf4-report'),
    path('reports/export/', UnifiedReportExportAPIView.as_view(), name='api-unified-report-export'),
    path('reports/print/', UnifiedReportPrintAPIView.as_view(), name='api-unified-report-print'),

    path('reports/audit-log/', ReportAuditLogAPIView.as_view(), name='api-report-audit-log'),
    path('reports/audit-logs/', ReportAuditLogAPIView.as_view(), name='api-report-audit-logs'),

    path('calendar/exceptions/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-list'),
    path('calendar/exceptions/<str:pk>/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-detail'),
]