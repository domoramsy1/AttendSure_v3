from django.db import models
from django.conf import settings
from django.utils import timezone
from .base import GATE_PASS_STATUS_CHOICES
from .people import Student, FacultyProfile

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


class SmsOutbox(models.Model):
    PRIORITY_CHOICES = [
        ('HIGH', 'High Priority (Gate Entry/Exit)'),
        ('NORMAL', 'Normal Priority (Class Attendance)'),
        ('LOW', 'Low Priority (Announcements)'),
    ]
    TRIGGER_EVENT_CHOICES = [
        ('GATE_IN', 'Gate Entry Notice'),
        ('GATE_OUT', 'Gate Exit Notice'),
        ('CLASS_ABSENT', 'Class Absence'),
        ('EMERGENCY', 'School Broadcast'),
        ('TEST', 'Modem Signal Test'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending Dispatch'),
        ('SENT', 'Delivered'),
        ('FAILED', 'Failed / No Signal'),
    ]

    recipient_name = models.CharField(max_length=150, blank=True, default='')
    recipient_number = models.CharField(max_length=25, db_index=True)
    message_body = models.TextField()
    trigger_event = models.CharField(max_length=30, choices=TRIGGER_EVENT_CHOICES, default='GATE_IN', db_index=True)
    category = models.CharField(max_length=30, choices=TRIGGER_EVENT_CHOICES, default='GATE_IN', blank=True)
    priority = models.CharField(max_length=15, choices=PRIORITY_CHOICES, default='HIGH', db_index=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    retry_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'priority', 'created_at'])]


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
        managed = False


class FacultyMonthlyDTR(models.Model):
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='monthly_dtrs')
    month = models.PositiveSmallIntegerField(help_text="Month number (1-12)")
    year = models.PositiveSmallIntegerField(help_text="Year (e.g., 2026)")
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
