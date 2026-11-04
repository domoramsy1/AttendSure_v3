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
from .hardware import (
    IoTKioskSerializer,
    GatePassSerializer,
    SmsOutboxSerializer,
    GateScanSerializer,
    SingleClassroomScanItemSerializer,
    ClassroomBatchScanSerializer,
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
    'IoTKioskSerializer',
    'GatePassSerializer',
    'SmsOutboxSerializer',
    'GateScanSerializer',
    'SingleClassroomScanItemSerializer',
    'ClassroomBatchScanSerializer',
    'TelemetryHeartbeatSerializer',
    'SchoolProfileSerializer',
    'UserManagementSerializer',
]