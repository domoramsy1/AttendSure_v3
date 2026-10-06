from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.api.views import (
    ClassroomBatchScanAPIView,
    CurrentUserProfileView,
    DashboardOverviewAPIView,
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    DTRListAPIView,
    GateLogsAPIView,
    GatePassViewSet,
    GateScanAPIView,
    GeofenceAPIView,
    LoginAPIView,
    ReportAuditLogAPIView,
    ScannerViewSet,
    ScheduleViewSet,
    SchoolSettingsAPIView,
    SectionListAPIView,
    StudentViewSet,
    SubjectViewSet,
    TeacherViewSet,
    TelemetryHeartbeatAPIView,
    UserManagementViewSet,
    ResetFacultyDeviceBindingAPIView,
)

# 1. Register Core Entity ViewSets
router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'teachers', TeacherViewSet, basename='teacher')
router.register(r'scanners', ScannerViewSet, basename='scanner')
router.register(r'gate-passes', GatePassViewSet, basename='gatepass')
router.register(r'schedules', ScheduleViewSet, basename='schedule')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'users', UserManagementViewSet, basename='user')

# 2. Main API Route Configuration
urlpatterns = [
    # Router endpoints (CRUD for students, teachers, scanners, passes, etc.)
    path('', include(router.urls)),


    path('teachers/<int:faculty_id>/reset-device/', ResetFacultyDeviceBindingAPIView.as_view(), name='api-reset-device-binding'),
    # Authentication & User Profile Management
    path('auth/login/', LoginAPIView.as_view(), name='api-login'),
    path('me/', CurrentUserProfileView.as_view(), name='current-user-profile'),
    path('auth/me/', CurrentUserProfileView.as_view(), name='api-auth-me'),

    # Dashboard & Sections
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='api-dashboard-overview'),
    path('sections/', SectionListAPIView.as_view(), name='api-sections'),

    # Institutional Settings
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='api-settings-school'),
    path('school/settings/', SchoolSettingsAPIView.as_view(), name='api-school-settings-alias'),

    # Hardware Kiosk & Attendance Scanners
    path('gate/scan/', GateScanAPIView.as_view(), name='api-gate-scan'),
    path('gate/logs/', GateLogsAPIView.as_view(), name='api-gate-logs'),
    path('classroom/batch-scan/', ClassroomBatchScanAPIView.as_view(), name='api-classroom-batch-scan'),
    path('telemetry/heartbeat/', TelemetryHeartbeatAPIView.as_view(), name='api-telemetry-heartbeat'),

    # Faculty Daily Time Records (Work Attendance)
    path('dtr/', DTRListAPIView.as_view(), name='api-dtr'),
    path('faculty/dtr/', DTRListAPIView.as_view(), name='api-faculty-dtr-alias'),

    # Campus Geofence Boundary
    path('geofence/', GeofenceAPIView.as_view(), name='api-geofence'),
    path('campus/geofence/', GeofenceAPIView.as_view(), name='api-campus-geofence-alias'),

    # Official DepEd Attendance & Enrollment Reports
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-sf1-report'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-sf2-report'),
    path('reports/sf4/', DepEdSF4DataAPIView.as_view(), name='api-sf4-report'),
    path('reports/school-register/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-school-register-alias'),
    path('reports/daily-attendance/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-daily-attendance-alias'),
    path('reports/monthly-movement/', DepEdSF4DataAPIView.as_view(), name='api-monthly-movement-alias'),

    # Audit Logging & Transparency Records
    path('reports/audit-logs/', ReportAuditLogAPIView.as_view(), name='api-report-audit-logs'),
]