from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.api.views import (
    ClassroomBatchScanAPIView,
    DashboardOverviewAPIView,
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DTRListAPIView,
    GateLogsAPIView,
    GatePassViewSet,
    GateScanAPIView,
    GeofenceAPIView,
    LoginAPIView,
    ScannerViewSet,
    ScheduleViewSet,
    SchoolSettingsAPIView,
    SectionListAPIView,
    StudentViewSet,
    SubjectViewSet,
    TeacherViewSet,
    TelemetryHeartbeatAPIView,
    UserManagementViewSet,
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

    # Authentication & Dashboard
    path('auth/login/', LoginAPIView.as_view(), name='api-login'),
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

    # Staff Daily Time Records (Work Attendance)
    path('dtr/', DTRListAPIView.as_view(), name='api-dtr'),
    path('staff/dtr/', DTRListAPIView.as_view(), name='api-staff-dtr-alias'),

    # Campus Geofence Boundary
    path('geofence/', GeofenceAPIView.as_view(), name='api-geofence'),
    path('campus/geofence/', GeofenceAPIView.as_view(), name='api-campus-geofence-alias'),

    # Official Attendance & Enrollment Reports
    # Standard & DepEd Forms 1 & 2
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-sf1-report'),
    path('reports/sf2/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-sf2-report'),
    path('reports/school-register/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='api-school-register-alias'),
    path('reports/daily-attendance/<int:section_id>/', DepEdSF2DataAPIView.as_view(), name='api-daily-attendance-alias'),
]