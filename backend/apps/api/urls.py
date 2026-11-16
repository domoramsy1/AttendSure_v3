"""
AttendSure V3 - Enterprise API URL Routing (USB QR Scanner on PC/Laptop & Mobile Facial Recognition)
File: backend/apps/api/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.api.views import (
    AdviserSectionMatrixAPIView,
    AppNotificationViewSet,
    CalendarExceptionAPIView,
    ChatMessagesAPIView,
    ChatThreadsAPIView,
    ClassListAPIView,
    ClassroomBatchScanAPIView,
    ClassroomStudentScanAPIView,
    CurrentUserView,
    DTRListAPIView,
    DashboardOverviewAPIView,
    DatabaseLoginView,
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    EdFiOpenStandardExportAPIView,
    EmergencyCampusRollCallAPIView,
    EnterpriseSDGImpactAPIView,
    FacultyClassroomListAPIView,
    FacultyDeviceResetAPIView,
    FacultyProfileViewSet,
    GatePassViewSet,
    GeofenceAuditAPIView,
    GeofenceCheckInAPIView,
    GeofenceManagementAPIView,
    GeofenceStatusAPIView,
    GradeLevelViewSet,
    LiveFieldValidationAPIView,
    LoafingMonitoringAPIView,
    MarkNotificationsReadAPIView,
    OfflineQRBatchSyncAPIView,
    ParentPortalAPIView,
    RegisterPushTokenAPIView,
    ReportAuditLogAPIView,
    RoomViewSet,
    SARDOEarlyWarningAPIView,
    ScheduleViewSet,
    SchoolSettingsAPIView,
    SectionDetailAPIView,
    SectionListAPIView,
    SectionViewSet,
    SignedStudentQRCardAPIView,
    StudentQRCardAPIView,
    StudentViewSet,
    SubjectViewSet,
    UnifiedReportExportAPIView,
    UnifiedReportPrintAPIView,
    UserActivityLogsAPIView,
    UserManagementViewSet,
    db_check,
    flush_cache,
)

router = DefaultRouter()
router.register(r'rooms', RoomViewSet, basename='rooms')
router.register(r'grade-levels', GradeLevelViewSet, basename='grade-levels')
router.register(r'subjects', SubjectViewSet, basename='subjects')
router.register(r'sections', SectionViewSet, basename='sections')
router.register(r'schedules', ScheduleViewSet, basename='schedules')
router.register(r'students', StudentViewSet, basename='students')
router.register(r'faculty', FacultyProfileViewSet, basename='faculty')
router.register(r'facultys', FacultyProfileViewSet, basename='facultys')
router.register(r'users', UserManagementViewSet, basename='users')
router.register(r'gate-passes', GatePassViewSet, basename='gate-passes')
router.register(r'notifications', AppNotificationViewSet, basename='notifications')

urlpatterns = [
    # Authentication & Profile CRUD
    path('auth/login/', DatabaseLoginView.as_view(), name='auth-login'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('me/', CurrentUserView.as_view(), name='me-alias'),
    path('auth/validate/', LiveFieldValidationAPIView.as_view(), name='auth-validate'),
    path('auth/push-token/', RegisterPushTokenAPIView.as_view(), name='auth-push-token'),

    # Dashboard & System Settings
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='dashboard-overview'),
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='school-settings'),
    path('settings/activity-logs/', UserActivityLogsAPIView.as_view(), name='activity-logs'),
    path('activity-logs/', UserActivityLogsAPIView.as_view(), name='activity-logs-alias'),
    path('calendar/today/', CalendarExceptionAPIView.as_view(), name='calendar-today'),
    path('calendar/exceptions/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions-alias'),
    path('health/db/', db_check, name='db-check'),
    path('core/maintenance/db-check/', db_check, name='core-db-check'),
    path('cache/flush/', flush_cache, name='flush-cache'),
    path('core/maintenance/flush-cache/', flush_cache, name='core-flush-cache'),

    # Student Attendance: USB QR Code Scanner on Faculty PC/Laptop
    path('classroom/scan/', ClassroomStudentScanAPIView.as_view(), name='classroom-scan'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='classroom-batch-scan'),
    path('classroom/offline-sync/', OfflineQRBatchSyncAPIView.as_view(), name='classroom-offline-sync'),
    path('classroom/signed-qr-cards/', SignedStudentQRCardAPIView.as_view(), name='classroom-signed-qr-cards'),
    path('classroom/classes/', ClassListAPIView.as_view(), name='classroom-classes'),
    path('classroom/class_list/', ClassListAPIView.as_view(), name='classroom-class-list'),
    path('classroom/students/', FacultyClassroomListAPIView.as_view(), name='classroom-students'),
    path('classroom/student_list/', FacultyClassroomListAPIView.as_view(), name='classroom-student-list'),
    path('classroom/qr-cards/', StudentQRCardAPIView.as_view(), name='classroom-qr-cards'),
    path('classroom/adviser-matrix/', AdviserSectionMatrixAPIView.as_view(), name='adviser-matrix'),
    path('monitoring/loafing/', LoafingMonitoringAPIView.as_view(), name='monitoring-loafing'),

    # Faculty Attendance: Mobile App Facial Recognition + Campus GPS Verification
    path('geofence/', GeofenceManagementAPIView.as_view(), name='geofence-root'),
    path('geofence/status/', GeofenceStatusAPIView.as_view(), name='geofence-status'),
    path('geofence/audit/', GeofenceAuditAPIView.as_view(), name='geofence-audit'),
    path('geofence/check-in/', GeofenceCheckInAPIView.as_view(), name='geofence-check-in'),
    path('geofence/checkin/', GeofenceCheckInAPIView.as_view(), name='geofence-checkin-alias'),
    path('faculty/face-check-in/', GeofenceCheckInAPIView.as_view(), name='faculty-face-check-in'),
    path('faculty/<int:pk>/reset-device/', FacultyDeviceResetAPIView.as_view(), name='faculty-reset-device'),

    # Enterprise UN SDG Impact & SARDO Early-Warning Analytics
    path('enterprise/sdg-impact/', EnterpriseSDGImpactAPIView.as_view(), name='enterprise-sdg-impact'),
    path('enterprise/sardo-early-warning/', SARDOEarlyWarningAPIView.as_view(), name='enterprise-sardo-warning'),
    path('enterprise/emergency-rollcall/', EmergencyCampusRollCallAPIView.as_view(), name='enterprise-emergency-rollcall'),
    path('enterprise/edfi-export/', EdFiOpenStandardExportAPIView.as_view(), name='enterprise-edfi-export'),

    # Section Shortcuts
    path('section-list/', SectionListAPIView.as_view(), name='section-list'),
    path('section-list/<int:pk>/', SectionDetailAPIView.as_view(), name='section-detail'),

    # Parent Mobile App Portal
    path('parent/overview/', ParentPortalAPIView.as_view(), name='parent-overview'),
    path('chat/threads/', ChatThreadsAPIView.as_view(), name='chat-threads'),
    path('chat/messages/', ChatMessagesAPIView.as_view(), name='chat-messages'),
    path('parent/notifications/read/', MarkNotificationsReadAPIView.as_view(), name='parent-notifications-read'),

    # Official DepEd Reports & Faculty DTR
    path('reports/sf1/', DepEdSF1DataAPIView.as_view(), name='report-sf1'),
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='report-sf1-detail'),
    path('reports/sf2/', DepEdSF2DataAPIView.as_view(), name='report-sf2'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='report-sf2-detail'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='report-sf4'),
    path('reports/dtr/', DTRListAPIView.as_view(), name='report-dtr'),
    path('reports/dtr/<int:faculty_id>/', DTRListAPIView.as_view(), name='report-dtr-detail'),
    path('reports/export/', UnifiedReportExportAPIView.as_view(), name='report-export'),
    path('reports/print/', UnifiedReportPrintAPIView.as_view(), name='report-print'),
    path('reports/audit-logs/', ReportAuditLogAPIView.as_view(), name='report-audit-logs'),

    # Explicit Dropdown & Metrics Endpoints
    path('students/metrics/', StudentViewSet.as_view({'get': 'metrics'}), name='students-metrics'),
    path('students/dropdown/', StudentViewSet.as_view({'get': 'dropdown'}), name='students-dropdown'),
    path('faculty/dropdown/', FacultyProfileViewSet.as_view({'get': 'dropdown'}), name='faculty-dropdown'),
    path('facultys/dropdown/', FacultyProfileViewSet.as_view({'get': 'dropdown'}), name='facultys-dropdown'),

    # Standard CRUD Routes
    path('', include(router.urls)),
]