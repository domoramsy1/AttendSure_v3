"""
AttendSure - Mobile Push Notifications, GPS Heartbeats, Exit Passes & Audit Logs
File: backend/apps/academics/models/telemetry.py
"""

from django.db import models
from django.conf import settings
from django.utils import timezone
from .base import GATE_PASS_STATUS_CHOICES
from .people import Student, FacultyProfile


class AppNotification(models.Model):
    """Stores mobile push and in-app alerts sent to Parent and Faculty apps."""
    CATEGORY_CHOICES = [
        ('ATTENDANCE', 'Classroom Attendance'),
        ('CUTTING_ALERT', 'Cutting Class Alert'),
        ('GATE_PASS', 'Exit Pass Update'),
        ('GEOFENCE', 'Campus Boundary Alert'),
        ('ANNOUNCEMENT', 'School Announcement'),
    ]

    id = models.BigAutoField(primary_key=True)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='app_notifications',
        db_index=True,
    )
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='parent_notifications',
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    category = models.CharField(max_length=25, choices=CATEGORY_CHOICES, default='ATTENDANCE', db_index=True)
    is_read = models.BooleanField(default=False, db_index=True)
    is_pushed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'app_notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read', 'created_at']),
        ]

    def __str__(self):
        return f"[{self.category}] {self.title} -> {self.recipient.username}"


class FacultyHeartbeat(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='heartbeats')
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    battery_level = models.IntegerField(default=100)
    is_inside_geofence = models.BooleanField(default=True, db_index=True)
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'faculty_heartbeats'
        ordering = ['-recorded_at']
        indexes = [models.Index(fields=['faculty', 'recorded_at'])]


class LoafingIncident(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='loafing_logs')
    incident_date = models.DateField(default=timezone.now, db_index=True)
    trigger_reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, default='PENDING_REVIEW')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'loafing_incidents'
        ordering = ['-created_at']


class GatePass(models.Model):
    id = models.BigAutoField(primary_key=True)
    pass_number = models.CharField(max_length=50, unique=True, db_index=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True)
    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)
    issued_by = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='issued_passes')
    pass_type = models.CharField(max_length=50, default='Exit Permit')
    reason = models.TextField()
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    status = models.CharField(max_length=20, choices=GATE_PASS_STATUS_CHOICES, default='ACTIVE', db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gate_passes'
        indexes = [models.Index(fields=['status', 'valid_from', 'valid_to'])]

    def __str__(self):
        return f"Pass #{self.pass_number} [{self.status}]"


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=10)
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    changed_fields = models.JSONField(null=True, blank=True)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_actions')
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        managed = True


class FacultyMonthlyDTR(models.Model):
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='monthly_dtrs')
    month = models.PositiveSmallIntegerField()
    year = models.PositiveSmallIntegerField()
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_dept_head_approved = models.BooleanField(default=False)
    dept_head_approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_dtrs')
    regular_hours = models.CharField(max_length=120, default="8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM")
    saturday_hours = models.CharField(max_length=120, default="As Required")
    remarks = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'faculty_monthly_dtr'
        unique_together = ('faculty', 'month', 'year')
        ordering = ['-year', '-month']

    def __str__(self):
        return f"{self.faculty} - DTR {self.month}/{self.year}"


class ParentFacultyMessage(models.Model):
    """Stores direct chat messages between parents and faculty about a student."""
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name='chat_messages',
        db_index=True,
    )
    faculty = models.ForeignKey(
        FacultyProfile,
        on_delete=models.CASCADE,
        related_name='chat_messages',
        db_index=True,
    )
    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='parent_chat_messages',
        db_index=True,
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='sent_chat_messages',
    )
    body = models.TextField()
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'parent_faculty_messages'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['student', 'faculty', 'created_at']),
            models.Index(fields=['parent', 'is_read']),
        ]

    def __str__(self):
        return f"Chat ({self.student.lrn}) - {self.sender.username}: {self.body[:30]}"