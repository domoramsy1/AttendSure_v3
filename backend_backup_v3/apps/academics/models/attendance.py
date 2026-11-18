"""
AttendSure - Classroom QR Attendance Models
File: backend/apps/academics/models/attendance.py
"""

from django.db import models
from django.utils import timezone
from .base import SCAN_METHOD_CHOICES, ATTENDANCE_STATUS_CHOICES
from .people import Student, FacultyProfile
from .structure import Section, Schedule


class SubjectAttendanceLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='subject_attendance')
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='attendance_records')
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='submitted_attendance')
    attendance_date = models.DateField(default=timezone.now, db_index=True)
    scanned_at = models.DateTimeField(default=timezone.now)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='QR')
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