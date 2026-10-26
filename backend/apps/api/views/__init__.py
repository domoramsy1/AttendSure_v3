"""
AttendSure - Unified API Views Module
File: backend/apps/api/views/__init__.py
"""

from .auth import (
    DatabaseLoginView,
    LoginAPIView,
    CurrentUserView,
    CurrentUserProfileView,
    LiveFieldValidationAPIView,
    RegisterPushTokenAPIView,
)
from .dashboard import DashboardOverviewAPIView
from .gate import GateLogsAPIView
from .classroom import (
    ClassListAPIView,
    MyAssignedClassesAPIView,
    FacultyClassroomListAPIView,
    FacultyClassroomRosterAPIView,
    ClassroomBatchScanAPIView,
    StudentListAPIView,
)
from .reports import (
    DepEdSF1DataAPIView,
    DepEdSF2DataAPIView,
    DepEdSF4DataAPIView,
    DTRListAPIView,
    UnifiedReportExportAPIView,
    UnifiedReportPrintAPIView,
    ReportAuditLogAPIView,
)
from .sms import (
    PendingSmsDispatchAPIView,
    BulkSmsStatusAPIView,
    MarkSmsStatusAPIView,
)
from .utils import (
    SchoolSettingsAPIView,
    CalendarExceptionAPIView,
    ping_scanners,
    test_sms_gateway,
    db_check,
    flush_cache,
)
from .geofence import (
    GeofenceStatusAPIView,
    GeofenceCheckInAPIView,
    FacultyDeviceResetAPIView,
)
from .viewsets import (
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

__all__ = [
    'DatabaseLoginView', 'LoginAPIView', 'CurrentUserView', 'CurrentUserProfileView',
    'LiveFieldValidationAPIView', 'RegisterPushTokenAPIView', 'DashboardOverviewAPIView',
    'GateLogsAPIView', 'ClassListAPIView', 'MyAssignedClassesAPIView',
    'FacultyClassroomListAPIView', 'FacultyClassroomRosterAPIView', 'ClassroomBatchScanAPIView',
    'StudentListAPIView', 'DepEdSF1DataAPIView', 'DepEdSF2DataAPIView', 'DepEdSF4DataAPIView',
    'DTRListAPIView', 'UnifiedReportExportAPIView', 'UnifiedReportPrintAPIView',
    'ReportAuditLogAPIView', 'PendingSmsDispatchAPIView', 'BulkSmsStatusAPIView',
    'MarkSmsStatusAPIView', 'SchoolSettingsAPIView', 'CalendarExceptionAPIView',
    'ping_scanners', 'test_sms_gateway', 'db_check', 'flush_cache',
    'GeofenceStatusAPIView', 'GeofenceCheckInAPIView', 'FacultyDeviceResetAPIView',
    'StudentViewSet', 'FacultyViewSet', 'SectionViewSet', 'ScheduleViewSet',
    'SubjectViewSet', 'RoomViewSet', 'GradeLevelViewSet', 'UserManagementViewSet',
    'ScannerViewSet', 'GatePassViewSet', 'SmsOutboxViewSet',
]