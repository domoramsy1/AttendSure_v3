"""
AttendSure V3 - API Serializers Package Initializer
File: backend/apps/api/serializers/__init__.py
"""

from .base import safe_photo_url, FlexibleImageField, MAX_IMAGE_SIZE_BYTES, ALLOWED_IMAGE_EXTENSIONS
from .students import StudentSerializer
from .faculty import FacultyProfileSerializer, FacultyDropdownSerializer
from .academics import (
    RoomSerializer,
    GradeLevelSerializer,
    AcademicYearSerializer,
    SubjectSerializer,
    SectionSerializer,
    ScheduleSerializer,
    EnrollmentSerializer,
)
from .operations import (
    GatePassSerializer,
    AppNotificationSerializer,
    SingleClassroomScanItemSerializer,
    ClassroomBatchScanSerializer,
    FacultyMobileCheckInSerializer,
    TelemetryHeartbeatSerializer,
)
from .users import SchoolProfileSerializer, UserManagementSerializer

__all__ = [
    'safe_photo_url',
    'FlexibleImageField',
    'MAX_IMAGE_SIZE_BYTES',
    'ALLOWED_IMAGE_EXTENSIONS',
    'RoomSerializer',
    'GradeLevelSerializer',
    'AcademicYearSerializer',
    'StudentSerializer',
    'FacultyProfileSerializer',
    'FacultyDropdownSerializer',
    'SubjectSerializer',
    'SectionSerializer',
    'ScheduleSerializer',
    'EnrollmentSerializer',
    'GatePassSerializer',
    'AppNotificationSerializer',
    'SingleClassroomScanItemSerializer',
    'ClassroomBatchScanSerializer',
    'FacultyMobileCheckInSerializer',
    'TelemetryHeartbeatSerializer',
    'SchoolProfileSerializer',
    'UserManagementSerializer',
]