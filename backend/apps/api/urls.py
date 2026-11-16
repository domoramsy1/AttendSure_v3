"""
AttendSure V3 - Unified API URL Router (Pure Software Architecture)
File: backend/apps/api/urls.py
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.api.views import (
    ActivityLogAPIView,
    ActivityLogViewSet,
    AdviserMatrixAPIView,
    AdviserSectionMatrixAPIView,
    AppNotificationViewSet,
    CalendarExceptionAPIView,
    ChatMessagesAPIView,
    ChatThreadsAPIView,
    ClassListAPIView,
    ClassroomAttendanceCRUDAPIView,
    ClassroomBatchScanAPIView,
    ClassroomScanAPIView,
    ClassroomStudentScanAPIView,
    CurrentUserProfileView,
    CurrentUserView,
    DashboardOverviewAPIView,
    DatabaseLoginView,
    DepEdSF4DataAPIView,
    EdFiOpenStandardExportAPIView,
    EmergencyCampusRollCallAPIView,
    EnrollmentViewSet,
    EnterpriseSDGImpactAPIView,
    FacultyClassroomClassListAPIView,
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
    LoginAPIView,
    MarkNotificationsReadAPIView,
    MyAssignedClassesAPIView,
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
    StudentListAPIView,
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
from apps.api.views.utils import (
    FlexibleDTRReportAPIView,
    FlexibleSF1ReportAPIView,
    FlexibleSF2ReportAPIView,
    SystemStatusAPIView,
    UnifiedGeofenceRootAPIView,
)

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='students')
router.register(r'faculty', FacultyProfileViewSet, basename='faculty')
router.register(r'facultys', FacultyProfileViewSet, basename='facultys')
router.register(r'users', UserManagementViewSet, basename='users')
router.register(r'sections', SectionViewSet, basename='sections')
router.register(r'grade-levels', GradeLevelViewSet, basename='grade-levels')
router.register(r'rooms', RoomViewSet, basename='rooms')
router.register(r'subjects', SubjectViewSet, basename='subjects')
router.register(r'schedules', ScheduleViewSet, basename='schedules')
router.register(r'enrollments', EnrollmentViewSet, basename='enrollments')
router.register(r'gate-passes', GatePassViewSet, basename='gate-passes')
router.register(r'exit-passes', GatePassViewSet, basename='exit-passes')
router.register(r'notifications', AppNotificationViewSet, basename='notifications')
router.register(r'activity-logs', ActivityLogViewSet, basename='activity-logs')

urlpatterns = [
    # Authentication & Personal Profile CRUD
    path('auth/login/', DatabaseLoginView.as_view(), name='auth-login'),
    path('login/', LoginAPIView.as_view(), name='login-alias'),
    path('auth/me/', CurrentUserView.as_view(), name='auth-me'),
    path('me/', CurrentUserProfileView.as_view(), name='me-alias'),
    path('profile/', CurrentUserView.as_view(), name='profile-alias'),
    path('auth/validate-field/', LiveFieldValidationAPIView.as_view(), name='validate-field'),
    path('validate-field/', LiveFieldValidationAPIView.as_view(), name='validate-field-alias'),
    path('auth/register-push-token/', RegisterPushTokenAPIView.as_view(), name='register-push-token'),
    path('register-push-token/', RegisterPushTokenAPIView.as_view(), name='register-push-token-alias'),

    # Dashboard & System Health
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='dashboard-overview'),
    path('dashboard/', DashboardOverviewAPIView.as_view(), name='dashboard-alias'),
    path('system/status/', SystemStatusAPIView.as_view(), name='system-status'),
    path('health/db/', db_check, name='db-check'),
    path('core/maintenance/db-check/', db_check, name='core-maintenance-db-check'),
    path('cache/flush/', flush_cache, name='flush-cache'),
    path('core/maintenance/flush-cache/', flush_cache, name='core-maintenance-flush-cache'),

    # Classroom USB QR Scanning, Offline Queue Sync & Attendance CRUD
    path('classroom/scan/', ClassroomStudentScanAPIView.as_view(), name='classroom-scan'),
    path('classroom/student-scan/', ClassroomScanAPIView.as_view(), name='classroom-student-scan'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='classroom-batch-scan'),
    path('classroom/offline-sync/', OfflineQRBatchSyncAPIView.as_view(), name='classroom-offline-sync'),
    path('classroom/sync-offline/', OfflineQRBatchSyncAPIView.as_view(), name='classroom-sync-offline'),
    path('classroom/attendance/', ClassroomAttendanceCRUDAPIView.as_view(), name='classroom-attendance-crud'),
    path('attendance-logs/', ClassroomAttendanceCRUDAPIView.as_view(), name='attendance-logs-crud'),
    path('classroom/qr-cards/', StudentQRCardAPIView.as_view(), name='classroom-qr-cards'),
    path('classroom/signed-qr-cards/', SignedStudentQRCardAPIView.as_view(), name='classroom-signed-qr-cards'),
    path('classroom/classes/', ClassListAPIView.as_view(), name='classroom-classes'),
    path('classroom/class-list/', ClassListAPIView.as_view(), name='classroom-class-list'),
    path('classroom/class_list/', ClassListAPIView.as_view(), name='classroom-class-list-underscore'),
    path('my-classes/', MyAssignedClassesAPIView.as_view(), name='my-classes'),
    path('classroom/students/', FacultyClassroomListAPIView.as_view(), name='classroom-students'),
    path('classroom/student-list/', FacultyClassroomListAPIView.as_view(), name='classroom-student-list'),
    path('classroom/student_list/', FacultyClassroomListAPIView.as_view(), name='classroom-student-list-underscore'),
    path('student-list/', StudentListAPIView.as_view(), name='student-list-alias'),
    path('classroom/adviser-matrix/', AdviserSectionMatrixAPIView.as_view(), name='adviser-section-matrix'),
    path('adviser-matrix/', AdviserMatrixAPIView.as_view(), name='adviser-matrix-alias'),

    # Faculty Mobile Facial Recognition & Campus GPS Boundary
    path('geofence/', UnifiedGeofenceRootAPIView.as_view(), name='geofence-root'),
    path('geofence/check-in/', GeofenceCheckInAPIView.as_view(), name='geofence-check-in'),
    path('telemetry/heartbeat/', GeofenceCheckInAPIView.as_view(), name='telemetry-heartbeat-alias'),
    path('geofence/status/', GeofenceStatusAPIView.as_view(), name='geofence-status'),
    path('geofence/manage/', GeofenceManagementAPIView.as_view(), name='geofence-manage'),
    path('geofence/audit/', GeofenceAuditAPIView.as_view(), name='geofence-audit'),
    path('geofence/reset-device/', FacultyDeviceResetAPIView.as_view(), name='geofence-reset-device'),
    path('monitoring/loafing/', LoafingMonitoringAPIView.as_view(), name='loafing-monitoring'),

    # Parent Portal & Direct Parent-Faculty Chat CRUD
    path('parent/portal/', ParentPortalAPIView.as_view(), name='parent-portal'),
    path('parent/children/', ParentPortalAPIView.as_view(), name='parent-children'),
    path('parent/notifications/read/', MarkNotificationsReadAPIView.as_view(), name='parent-notifications-read'),
    path('notifications/mark-read/', MarkNotificationsReadAPIView.as_view(), name='notifications-mark-read'),
    path('chat/threads/', ChatThreadsAPIView.as_view(), name='chat-threads'),
    path('chat/messages/', ChatMessagesAPIView.as_view(), name='chat-messages'),

    # Institutional Settings & Sections
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='school-settings'),
    path('settings/calendar-exceptions/', CalendarExceptionAPIView.as_view(), name='calendar-exceptions'),
    path('user-activity-logs/', UserActivityLogsAPIView.as_view(), name='user-activity-logs'),
    path('audit-logs/', ActivityLogAPIView.as_view(), name='audit-logs-alias'),
    path('sections-list/', SectionListAPIView.as_view(), name='sections-list'),
    path('sections-detail/<int:pk>/', SectionDetailAPIView.as_view(), name='sections-detail'),

    # Official Forms & Reports (Supports both query params and path IDs)
    path('reports/dtr/', FlexibleDTRReportAPIView.as_view(), name='reports-dtr'),
    path('reports/dtr/<int:pk>/', FlexibleDTRReportAPIView.as_view(), name='reports-dtr-detail'),
    path('reports/sf1/', FlexibleSF1ReportAPIView.as_view(), name='reports-sf1'),
    path('reports/sf1/<int:pk>/', FlexibleSF1ReportAPIView.as_view(), name='reports-sf1-detail'),
    path('reports/sf2/', FlexibleSF2ReportAPIView.as_view(), name='reports-sf2'),
    path('reports/sf2/<int:pk>/', FlexibleSF2ReportAPIView.as_view(), name='reports-sf2-detail'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='reports-sf4'),
    path('reports/audit-log/', ReportAuditLogAPIView.as_view(), name='reports-audit-log'),
    path('reports/export/', UnifiedReportExportAPIView.as_view(), name='reports-export'),
    path('reports/print/', UnifiedReportPrintAPIView.as_view(), name='reports-print'),

    # Enterprise Analytics & SARDO Early Warning
    path('enterprise/sardo-early-warning/', SARDOEarlyWarningAPIView.as_view(), name='sardo-early-warning'),
    path('enterprise/emergency-roll-call/', EmergencyCampusRollCallAPIView.as_view(), name='emergency-roll-call'),
    path('enterprise/edfi-export/', EdFiOpenStandardExportAPIView.as_view(), name='edfi-export'),
    path('enterprise/sdg-impact/', EnterpriseSDGImpactAPIView.as_view(), name='sdg-impact'),

    # ViewSet CRUD Routes
    path('', include(router.urls)),
]