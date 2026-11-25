from datetime import time as dt_time
from decimal import Decimal
from django.conf import settings
from django.db import models
from django.db.models import UniqueConstraint
from django.utils import timezone

from common.gps import calculate_distance_meters

TEACHER_ATTENDANCE_STATUS_CHOICES = [
    ("ON_TIME", "On Time"),
    ("LATE", "Late"),
    ("ABSENT", "Absent"),
    ("ON_OFFICIAL_PASS", "On Official Pass"),
]

ZONE_STATUS_CHOICES = [
    ("INSIDE", "Inside Campus"),
    ("AUTHORIZED_OUTSIDE", "Authorized Outside"),
    ("LOAFING_ALERT", "Loafing Alert"),
    ("OFF_DUTY", "Off Duty"),
]

LOAFING_INCIDENT_TYPE_CHOICES = [
    ("TEACHER_OUTSIDE_GEOFENCE", "Teacher Outside Campus Boundary"),
    ("STUDENT_CUTTING_CLASS", "Student Cutting Class"),
    ("EXPIRED_EXIT_PASS", "Expired Exit Pass"),
]

LOAFING_STATUS_CHOICES = [
    ("OPEN", "Open Alert"),
    ("RETURNED", "Returned Inside Campus"),
    ("EXCUSED", "Excused / Official Business"),
    ("CONFIRMED_LOAFING", "Confirmed Loafing"),
]


class CampusBoundary(models.Model):
    id = models.BigAutoField(primary_key=True)
    campus_name = models.CharField(max_length=150, unique=True, default="Main Campus")
    center_latitude = models.DecimalField(max_digits=9, decimal_places=6, default=Decimal("8.485800"))
    center_longitude = models.DecimalField(max_digits=9, decimal_places=6, default=Decimal("124.656700"))
    radius_meters = models.PositiveIntegerField(default=150)
    loafing_grace_minutes = models.PositiveSmallIntegerField(default=10)
    duty_start_time = models.TimeField(default=dt_time(7, 30))
    duty_end_time = models.TimeField(default=dt_time(17, 0))
    enforce_geofence_checkin = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "campus_boundaries"

    def __str__(self) -> str:
        return f"{self.campus_name} ({self.radius_meters}m)"


class TeacherDailyAttendance(models.Model):
    id = models.BigAutoField(primary_key=True)
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        related_name="daily_attendances",
    )
    boundary = models.ForeignKey(
        CampusBoundary,
        on_delete=models.PROTECT,
        related_name="teacher_daily_attendances",
    )
    attendance_date = models.DateField(default=timezone.localdate, db_index=True)
    time_in = models.DateTimeField(null=True, blank=True)
    time_out = models.DateTimeField(null=True, blank=True)
    checkin_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    checkin_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    checkout_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    checkout_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    device_id = models.CharField(max_length=128, blank=True, default="")
    face_verified_on_device = models.BooleanField(default=False)
    status = models.CharField(
        max_length=20,
        choices=TEACHER_ATTENDANCE_STATUS_CHOICES,
        default="ON_TIME",
        db_index=True,
    )

    class Meta:
        db_table = "teacher_daily_attendance"
        ordering = ["-attendance_date", "-time_in"]
        constraints = [
            UniqueConstraint(fields=["teacher", "attendance_date"], name="uq_teacher_daily_att_date")
        ]
        indexes = [
            models.Index(fields=["attendance_date", "status"], name="idx_tda_date_status"),
            models.Index(fields=["teacher", "attendance_date"], name="idx_tda_teacher_date"),
        ]


class TeacherLocationPing(models.Model):
    """
    Strict 3NF TeacherLocationPing:
    - Never stores distance_meters or is_inside as columns!
    - Both are computed dynamically from (latitude, longitude) and boundary coordinates.
    """

    id = models.BigAutoField(primary_key=True)
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        related_name="location_pings",
    )
    boundary = models.ForeignKey(
        CampusBoundary,
        on_delete=models.PROTECT,
        related_name="location_pings",
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy_meters = models.FloatField(default=0.0)
    zone_status = models.CharField(
        max_length=24, choices=ZONE_STATUS_CHOICES, default="INSIDE", db_index=True
    )
    device_id = models.CharField(max_length=128, blank=True, default="")
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "teacher_location_pings"
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["teacher", "-recorded_at"], name="idx_ping_teacher_rec"),
            models.Index(fields=["zone_status", "-recorded_at"], name="idx_ping_zone_rec"),
        ]

    @property
    def distance_meters(self) -> float:
        if not self.boundary_id or not self.boundary:
            return 0.0
        dist = calculate_distance_meters(
            self.latitude,
            self.longitude,
            self.boundary.center_latitude,
            self.boundary.center_longitude,
        )
        return dist if dist != float("inf") else 0.0

    @property
    def is_inside(self) -> bool:
        if self.zone_status == "INSIDE":
            return True
        if self.boundary_id and self.boundary:
            drift = min(max(float(self.accuracy_meters or 0.0), 0.0), 35.0)
            return self.distance_meters <= (self.boundary.radius_meters + drift)
        return False


class LoafingIncident(models.Model):
    """
    Strict 3NF LoafingIncident:
    - Never stores person_name, person_code, section_name, class_period_label, incident_date, or distance_meters.
    - All display attributes are derived via joined 3NF relations.
    """

    id = models.BigAutoField(primary_key=True)
    incident_type = models.CharField(
        max_length=30, choices=LOAFING_INCIDENT_TYPE_CHOICES, db_index=True
    )
    status = models.CharField(
        max_length=24, choices=LOAFING_STATUS_CHOICES, default="OPEN", db_index=True
    )
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="loafing_incidents",
    )
    enrollment = models.ForeignKey(
        "students.Enrollment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="loafing_incidents",
    )
    class_period = models.ForeignKey(
        "school.ClassPeriod",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loafing_incidents",
    )
    exit_pass = models.ForeignKey(
        "attendance.ExitPass",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="loafing_incidents",
    )
    trigger_ping = models.ForeignKey(
        TeacherLocationPing,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="triggered_incidents",
    )
    detected_at = models.DateTimeField(default=timezone.now, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    remarks = models.TextField(blank=True, default="")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_loafing_incidents",
    )

    class Meta:
        db_table = "loafing_incidents"
        ordering = ["-detected_at"]
        indexes = [
            models.Index(fields=["status", "-detected_at"], name="idx_loaf_status_det"),
            models.Index(fields=["incident_type", "-detected_at"], name="idx_loaf_type_det"),
        ]

    @property
    def incident_date(self):
        return timezone.localtime(self.detected_at).date()

    @property
    def distance_meters(self) -> float | None:
        if self.trigger_ping_id and self.trigger_ping:
            return self.trigger_ping.distance_meters
        return None


class MonthlyTimeRecord(models.Model):
    id = models.BigAutoField(primary_key=True)
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
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
            UniqueConstraint(fields=["teacher", "month", "year"], name="uq_dtr_teacher_month_year")
        ]
