from django.conf import settings
from django.db import models
from django.db.models import UniqueConstraint
from django.utils import timezone


class CampusBoundary(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=120, default="Main Campus")
    center_lat = models.FloatField(default=8.4856)
    center_lng = models.FloatField(default=124.6565)
    radius_meters = models.PositiveIntegerField(default=150)
    grace_minutes = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "geofence_settings"

    def __str__(self) -> str:
        return f"{self.name} ({self.radius_meters}m)"


class FacultyAttendanceLog(models.Model):
    ACTION_CHOICES = [
        ("TIME_IN_AM", "Morning Time In"),
        ("TIME_OUT_AM", "Morning Time Out"),
        ("TIME_IN_PM", "Afternoon Time In"),
        ("TIME_OUT_PM", "Afternoon Time Out"),
    ]

    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="campus_logs",
    )
    log_date = models.DateField(default=timezone.localdate, db_index=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES, db_index=True)
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    distance_meters = models.FloatField(default=0.0)
    is_within_boundary = models.BooleanField(default=True)
    face_verified = models.BooleanField(default=True)
    device_id = models.CharField(max_length=128, blank=True, default="")
    remarks = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "faculty_attendance_logs"
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["faculty", "log_date"], name="idx_faclog_fac_date"),
            models.Index(fields=["log_date", "action"], name="idx_faclog_date_act"),
        ]


class BoundaryAlert(models.Model):
    STATUS_CHOICES = [
        ("OPEN", "Open Alert"),
        ("RESOLVED", "Returned Inside Campus"),
        ("EXCUSED", "Official Business / Excused"),
    ]

    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="boundary_alerts",
    )
    incident_date = models.DateField(default=timezone.localdate, db_index=True)
    left_at = models.DateTimeField(default=timezone.now)
    returned_at = models.DateTimeField(null=True, blank=True)
    outside_minutes = models.PositiveIntegerField(default=0)
    last_lat = models.FloatField(null=True, blank=True)
    last_lng = models.FloatField(null=True, blank=True)
    distance_meters = models.FloatField(default=0.0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="OPEN", db_index=True)
    remarks = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        db_table = "geofence_loafing_alerts"
        ordering = ["-left_at"]
        indexes = [
            models.Index(fields=["faculty", "incident_date"], name="idx_bndry_fac_date"),
            models.Index(fields=["incident_date", "status"], name="idx_bndry_date_stat"),
        ]


class MonthlyTimeRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="monthly_dtrs",
    )
    month = models.PositiveSmallIntegerField(db_index=True)
    year = models.PositiveSmallIntegerField(db_index=True)
    regular_hours = models.CharField(max_length=100, default="8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM")
    saturday_hours = models.CharField(max_length=100, default="As Required")
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_dept_head_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_monthly_dtrs",
    )
    dept_head_approved_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "monthly_time_records"
        constraints = [
            UniqueConstraint(fields=["faculty", "month", "year"], name="uq_dtr_faculty_month_year")
        ]