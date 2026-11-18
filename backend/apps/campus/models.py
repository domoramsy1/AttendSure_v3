from django.conf import settings
from django.db import models
from django.db.models import UniqueConstraint
from django.utils import timezone


class CampusBoundary(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, default="Campus Boundary")
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    radius_meters = models.PositiveIntegerField(default=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "geofence_settings"


class TeacherLocationLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="location_logs",
    )
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    battery_level = models.IntegerField(default=100)
    is_inside_geofence = models.BooleanField(default=True, db_index=True)
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "faculty_heartbeats"
        ordering = ["-recorded_at"]


class BoundaryAlert(models.Model):
    id = models.BigAutoField(primary_key=True)
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="boundary_alerts",
    )
    incident_date = models.DateField(default=timezone.now, db_index=True)
    trigger_reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, default="PENDING_REVIEW")
    remarks = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "loafing_incidents"
        ordering = ["-created_at"]


class MonthlyTimeRecord(models.Model):
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="monthly_time_records",
    )
    month = models.PositiveSmallIntegerField()
    year = models.PositiveSmallIntegerField()
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_dept_head_approved = models.BooleanField(default=False)
    dept_head_approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="approved_time_records"
    )
    regular_hours = models.CharField(max_length=120, default="8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM")
    saturday_hours = models.CharField(max_length=120, default="As Required")
    remarks = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "faculty_monthly_dtr"
        ordering = ["-year", "-month"]
        constraints = [
            UniqueConstraint(fields=["teacher", "month", "year"], name="uq_teacher_monthly_dtr")
        ]