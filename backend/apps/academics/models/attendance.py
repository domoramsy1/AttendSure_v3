from django.db import models
from django.conf import settings
from django.utils import timezone
from .base import DIRECTION_CHOICES, SCAN_METHOD_CHOICES, ATTENDANCE_STATUS_CHOICES
from .people import Student, FacultyProfile
from .institution import IoTKiosk
from .structure import Section, Schedule

class FacultyGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now, db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)
    is_violation = models.BooleanField(default=False)
    violation_type = models.CharField(max_length=64, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    is_excused_by_principal = models.BooleanField(default=False)
    excused_at = models.DateTimeField(null=True, blank=True)
    excused_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='excused_faculty_gate_violations'
    )

    class Meta:
        db_table = 'faculty_gate_logs'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['faculty', 'scan_time']),
            models.Index(fields=['scan_time', 'is_violation']),
        ]

    def __str__(self):
        return f"{self.faculty} - {self.direction} at {self.scan_time}"


class StudentGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now, db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    class Meta:
        db_table = 'student_gate_logs_partitioned'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['student', 'scan_time']),
            models.Index(fields=['scan_time', 'direction']),
        ]

    def __str__(self):
        return f"{self.student.lrn} - {self.direction} ({self.scan_time})"


class SubjectAttendanceLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='subject_attendance')
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='attendance_records')
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='submitted_attendance')
    attendance_date = models.DateField(default=timezone.now, db_index=True)
    scanned_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')

    class Meta:
        db_table = 'subject_attendance_logs'
        unique_together = ('student', 'schedule', 'attendance_date')
        indexes = [
            models.Index(fields=['schedule', 'attendance_date']),
            models.Index(fields=['faculty', 'attendance_date']),
        ]

    def __str__(self):
        return f"{self.student.lrn} - {self.schedule.subject.code} [{self.status}]"


class DailyAttendanceSummary(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='daily_summaries')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='daily_summaries')
    attendance_date = models.DateField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')
    remarks = models.CharField(max_length=255, blank=True, default='')
    recorded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_attendance_summaries'
        unique_together = ('student', 'attendance_date')
        indexes = [
            models.Index(fields=['section', 'attendance_date', 'status']),
        ]

    def __str__(self):
        return f"{self.student.lrn} - {self.attendance_date} [{self.status}]"
