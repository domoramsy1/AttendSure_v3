"""
AttendSure - Academics Models Package Exports
File: backend/apps/academics/models/__init__.py
"""

from .base import (
    SUFFIX_CHOICES,
    SEX_CHOICES,
    SCAN_METHOD_CHOICES,
    ATTENDANCE_STATUS_CHOICES,
    ENROLLMENT_STATUS_CHOICES,
    ENROLLMENT_TYPE_CHOICES,
    USER_ROLE_CHOICES,
    GATE_PASS_STATUS_CHOICES,
    DAY_OF_WEEK_CHOICES,
)
from .institution import AcademicYear, SchoolProfile, ClassSchedule, GeofenceSetting
from .people import FacultyProfile, UserProfile, Student
from .structure import Room, GradeLevel, Section, Enrollment, Subject, Schedule, ScheduleDay
from .attendance import SubjectAttendanceLog, DailyAttendanceSummary
from .telemetry import (
    AppNotification,
    FacultyHeartbeat,
    LoafingIncident,
    GatePass,
    AuditLog,
    FacultyMonthlyDTR,
    ParentFacultyMessage,
)

__all__ = [
    'AppNotification',
    'ParentFacultyMessage',
    'Room',
    'AcademicYear',
    'SchoolProfile',
    'ClassSchedule',
    'GeofenceSetting',
    'FacultyProfile',
    'UserProfile',
    'Student',
    'GradeLevel',
    'Section',
    'Enrollment',
    'Subject',
    'Schedule',
    'ScheduleDay',
    'SubjectAttendanceLog',
    'DailyAttendanceSummary',
    'FacultyHeartbeat',
    'LoafingIncident',
    'GatePass',
    'AuditLog',
    'FacultyMonthlyDTR',
    'SUFFIX_CHOICES',
    'SEX_CHOICES',
    'SCAN_METHOD_CHOICES',
    'ATTENDANCE_STATUS_CHOICES',
    'ENROLLMENT_STATUS_CHOICES',
    'ENROLLMENT_TYPE_CHOICES',
    'USER_ROLE_CHOICES',
    'GATE_PASS_STATUS_CHOICES',
    'DAY_OF_WEEK_CHOICES',
]