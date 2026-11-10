"""
AttendSure V3 - Unified API Routing
File: backend/apps/api/urls.py
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter

from apps.api.views.auth import (
    DatabaseLoginView,
    CurrentUserView,
    LiveFieldValidationAPIView,
    RegisterPushTokenAPIView,
)
from apps.api.views.classroom import (
    ClassListAPIView,
    FacultyClassroomListAPIView,
    ClassroomBatchScanAPIView,
    ClassroomStudentScanAPIView,
    UserDeviceRegisterAPIView,
    AdviserSectionMatrixAPIView,
)
from apps.api.views.dashboard import DashboardOverviewAPIView
from apps.api.views.gate import (
    GateLogsAPIView,
    KioskScanAPIView,
    GatePassViewSet,
)
from apps.api.views.geofence import (
    GeofenceStatusAPIView,
    GeofenceCheckInAPIView,
    GeofenceAuditHistoryAPIView,
    FacultyDeviceResetAPIView,
)
from apps.api.views.reports import (
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    DTRListAPIView,
    UnifiedReportExportAPIView,
    ReportAuditLogAPIView,
)
from apps.api.views.sections import SectionListAPIView, SectionDetailAPIView
from apps.api.views.sms import (
    PendingSmsDispatchAPIView,
    BulkSmsStatusAPIView,
    MarkSmsStatusAPIView,
)
from apps.api.views.utils import (
    SchoolSettingsAPIView,
    CalendarExceptionAPIView,
    ping_scanners,
    test_sms_gateway,
    db_check,
    flush_cache,
)
from apps.api.views.viewsets import (
    RoomViewSet,
    GradeLevelViewSet,
    SubjectViewSet,
    SectionViewSet,
    ScheduleViewSet,
    StudentViewSet,
    FacultyProfileViewSet,
    IoTKioskViewSet,
    SmsOutboxViewSet,
    UserManagementViewSet,
    AcademicYearViewSet,
    EnrollmentViewSet,
)
from apps.api.views.monitoring import (
    LoafingMonitoringAPIView,
    DTRLockCheckAPIView,
    LoafingReconciliationAPIView,
)
from apps.api.views.activity import UserActivityLogsAPIView

router = DefaultRouter()
router.register(r'rooms', RoomViewSet, basename='room')
router.register(r'grade-levels', GradeLevelViewSet, basename='grade-level')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'sections', SectionViewSet, basename='section')
router.register(r'schedules', ScheduleViewSet, basename='schedule')
router.register(r'students', StudentViewSet, basename='student')
router.register(r'faculty', FacultyProfileViewSet, basename='faculty')
router.register(r'facultys', FacultyProfileViewSet, basename='facultys')
router.register(r'kiosks', IoTKioskViewSet, basename='kiosk')
router.register(r'scanners', IoTKioskViewSet, basename='scanner')
router.register(r'gate-passes', GatePassViewSet, basename='gate-pass')
router.register(r'sms-outbox', SmsOutboxViewSet, basename='sms-outbox')
router.register(r'users', UserManagementViewSet, basename='user')
router.register(r'academic-years', AcademicYearViewSet, basename='academic-year')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollment')

urlpatterns = [
    # Direct fallbacks for SMS actions to ensure instant resolution
    path(
        'sms-outbox/clear-pending/',
        SmsOutboxViewSet.as_view({'delete': 'clear_pending', 'post': 'clear_pending'}),
        name='sms-outbox-clear-pending'
    ),
    path(
        'sms-outbox/delete-delivered/',
        SmsOutboxViewSet.as_view({'delete': 'delete_delivered', 'post': 'delete_delivered'}),
        name='sms-outbox-delete-delivered'
    ),
    path(
        'sms-outbox/retry-all-failed/',
        SmsOutboxViewSet.as_view({'post': 'retry_all_failed'}),
        name='sms-outbox-retry-all'
    ),
    path(
        'sms-outbox/metrics/',
        SmsOutboxViewSet.as_view({'get': 'metrics'}),
        name='sms-outbox-metrics'
    ),
    path(
        'sms-outbox/broadcast/',
        SmsOutboxViewSet.as_view({'post': 'broadcast_announcement'}),
        name='sms-outbox-broadcast'
    ),

    # Router endpoints
    path('', include(router.urls)),

    # Authentication & User Profile
    path('auth/login/', DatabaseLoginView.as_view(), name='auth-login'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-current-user'),
    path('me/', CurrentUserView.as_view(), name='current-user-alias'),
    path('auth/validate-field/', LiveFieldValidationAPIView.as_view(), name='auth-validate-field'),
    path('auth/push-token/', RegisterPushTokenAPIView.as_view(), name='auth-push-token'),

    # Classroom Attendance & Scanner (Web Laptop / Mobile OTG Barcode Gun & Camera)
    path('classroom/class_list/', ClassListAPIView.as_view(), name='classroom-class-list'),
    path('classroom/my-classes/', ClassListAPIView.as_view(), name='classroom-my-classes'),
    path('classroom/student_list/', FacultyClassroomListAPIView.as_view(), name='classroom-student-list'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='classroom-batch-scan'),
    path('classroom/scan/', ClassroomStudentScanAPIView.as_view(), name='classroom-single-scan'),
    path('academics/classroom-scan/', ClassroomStudentScanAPIView.as_view(), name='academics-classroom-scan'),
    path('classroom/adviser-matrix/', AdviserSectionMatrixAPIView.as_view(), name='adviser-section-matrix'),

    # Hardware & Mobile Device Registration (For Geofencing Compliance)
    path('devices/register/', UserDeviceRegisterAPIView.as_view(), name='devices-register'),
    path('hardware/register-device/', UserDeviceRegisterAPIView.as_view(), name='hardware-register-device'),

    # Dashboard Overview
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='dashboard-overview'),

    # Gate & Scanners
    path('gate/logs/', GateLogsAPIView.as_view(), name='gate-logs'),
    path('gate/scan/', KioskScanAPIView.as_view(), name='gate-scan'),
    path('kiosk/scan/', KioskScanAPIView.as_view(), name='kiosk-scan'),

    # Geofence, Hardware Telemetry & Device Protection
    path('geofence/', GeofenceStatusAPIView.as_view(), name='geofence-status'),
    path('geofence/checkin/', GeofenceCheckInAPIView.as_view(), name='geofence-checkin'),
    path('geofence/audit/', GeofenceAuditHistoryAPIView.as_view(), name='geofence-audit-history'),
    path('geofence/reset-device/<int:pk>/', FacultyDeviceResetAPIView.as_view(), name='geofence-reset-device'),
    path('faculty/<int:pk>/reset-device/', FacultyDeviceResetAPIView.as_view(), name='faculty-reset-device-alias'),
    path('telemetry/heartbeat/', GeofenceCheckInAPIView.as_view(), name='telemetry-heartbeat'),

    # DepEd Reports & Civil Service Form 48 (DTR)
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='reports-sf1'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='reports-sf2'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='reports-sf4'),
    path('reports/export/', UnifiedReportExportAPIView.as_view(), name='reports-export'),
    path('reports/audit/', ReportAuditLogAPIView.as_view(), name='reports-audit'),
    path('dtr/', DTRListAPIView.as_view(), name='dtr-list'),
    path('dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='dtr-faculty'),
    path('reports/dtr/', DTRListAPIView.as_view(), name='reports-dtr-list'),
    path('reports/dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='reports-dtr-detail'),

    # Loafing Monitoring, DTR Print/Download Lock & Defense Reconciliation
    path('monitoring/loafing/', LoafingMonitoringAPIView.as_view(), name='monitoring-loafing'),
    path('monitoring/dtr-lock-check/', DTRLockCheckAPIView.as_view(), name='monitoring-dtr-lock-check'),
    path('dtr/lock-check/', DTRLockCheckAPIView.as_view(), name='dtr-lock-check'),
    path('monitoring/reconciliation/', LoafingReconciliationAPIView.as_view(), name='monitoring-reconciliation'),
    path('monitoring/loafing/reconcile/', LoafingReconciliationAPIView.as_view(), name='monitoring-loafing-reconcile'),

    # Hardware SMS Daemon
    path('sms/pending/', PendingSmsDispatchAPIView.as_view(), name='sms-pending'),
    path('sms/bulk-status/', BulkSmsStatusAPIView.as_view(), name='sms-bulk-status'),
    path('sms/mark-status/<int:pk>/', MarkSmsStatusAPIView.as_view(), name='sms-mark-status'),
    path('sms/test-gateway/', test_sms_gateway, name='sms-test-gateway'),

    # Telemetry Scanners
    path('telemetry/ping-scanners/', ping_scanners, name='telemetry-ping-scanners'),

    # Core Maintenance
    path('core/maintenance/db-check/', db_check, name='core-maintenance-db-check'),
    path('core/maintenance/flush-cache/', flush_cache, name='core-maintenance-flush-cache'),

    # Settings & Audit Trails
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='settings-school'),
    path('calendar/exceptions/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions'),
    path('activity-logs/', UserActivityLogsAPIView.as_view(), name='user-activity-logs'),
]