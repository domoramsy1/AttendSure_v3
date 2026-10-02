from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ClassroomBatchScanAPIView,
    DashboardOverviewAPIView,
    DepEdSF1DataAPIView,
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

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'teachers', TeacherViewSet, basename='teacher')
router.register(r'scanners', ScannerViewSet, basename='scanner')
router.register(r'gate-passes', GatePassViewSet, basename='gatepass')
router.register(r'schedules', ScheduleViewSet, basename='schedule')
router.register(r'subjects', SubjectViewSet, basename='subject')
router.register(r'users', UserManagementViewSet, basename='user')

urlpatterns = [
    # Authentication & Dashboard
    path('auth/login/', LoginAPIView.as_view(), name='auth-login'),
    path('dashboard/overview/', DashboardOverviewAPIView.as_view(), name='dashboard-overview'),
    path('sections/', SectionListAPIView.as_view(), name='section-list'),

    # Hardware & Scanning Telemetry
    path('gate/scan/', GateScanAPIView.as_view(), name='gate-scan'),
    path('gate/logs/', GateLogsAPIView.as_view(), name='gate-logs'),
    path('attendance/classroom-batch/', ClassroomBatchScanAPIView.as_view(), name='classroom-batch-scan'),
    path('telemetry/heartbeat/', TelemetryHeartbeatAPIView.as_view(), name='telemetry-heartbeat'),

    # Institutional Settings
    path('settings/school/', SchoolSettingsAPIView.as_view(), name='school-settings'),

    # DepEd Reports, DTR & Geofence
    path('reports/sf1/<int:section_id>/', DepEdSF1DataAPIView.as_view(), name='sf1-report-data'),
    path('dtr/', DTRListAPIView.as_view(), name='dtr-list'),
    path('geofence/', GeofenceAPIView.as_view(), name='geofence-map'),

    # ViewSet CRUD Router
    path('', include(router.urls)),
]