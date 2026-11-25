import uuid
from django.conf import settings
from django.db import models
from django.db.models import CheckConstraint, Q, UniqueConstraint
from django.utils import timezone

ATTENDANCE_STATUS_CHOICES = [
    ("PRESENT", "Present"),
    ("LATE", "Late"),
    ("ABSENT", "Absent"),
    ("EXCUSED", "Excused"),
]

SCAN_METHOD_CHOICES = [
    ("QR", "Built-In Camera QR Scan"),
    ("MANUAL", "Manual Class List Entry"),
]

PASS_SCOPE_CHOICES = [
    ("STUDENT", "Student"),
    ("TEACHER", "Teacher"),
]


class DailyAttendance(models.Model):
    """
    Strict 3NF DailyAttendance:
    - Links to Enrollment (which determines Student, Section, GradeLevel, and SchoolYear).
    - Zero redundant student, section, or school_year columns.
    """

    id = models.BigAutoField(primary_key=True)
    enrollment = models.ForeignKey(
        "students.Enrollment",
        on_delete=models.CASCADE,
        related_name="daily_attendances",
    )
    attendance_date = models.DateField(default=timezone.localdate, db_index=True)
    time_in = models.TimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=ATTENDANCE_STATUS_CHOICES, default="PRESENT", db_index=True)
    recorded_by = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_daily_attendances",
    )
    remarks = models.CharField(max_length=255, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "daily_attendance"
        constraints = [
            UniqueConstraint(fields=["enrollment", "attendance_date"], name="uq_daily_att_enrollment_date")
        ]
        indexes = [
            models.Index(fields=["attendance_date", "status"], name="idx_dailyatt_date_status"),
        ]


class ClassAttendance(models.Model):
    """
    Strict 3NF ClassAttendance:
    - Links strictly to Enrollment + ClassPeriod + attendance_date.
    - Zero redundant student, section, or subject columns.
    """

    id = models.BigAutoField(primary_key=True)
    enrollment = models.ForeignKey(
        "students.Enrollment",
        on_delete=models.CASCADE,
        related_name="class_attendances",
    )
    class_period = models.ForeignKey(
        "school.ClassPeriod",
        on_delete=models.CASCADE,
        related_name="attendance_records",
    )
    attendance_date = models.DateField(default=timezone.localdate, db_index=True)
    scanned_at = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=12, choices=ATTENDANCE_STATUS_CHOICES, default="PRESENT")
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default="QR")
    recorded_by = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="recorded_class_scans",
    )
    client_scan_uuid = models.UUIDField(unique=True, null=True, blank=True)

    class Meta:
        db_table = "class_attendance"
        constraints = [
            UniqueConstraint(
                fields=["enrollment", "class_period", "attendance_date"],
                name="uq_class_att_enrollment_period_date",
            )
        ]
        indexes = [
            models.Index(fields=["class_period", "attendance_date"], name="idx_clsatt_period_date"),
            models.Index(fields=["attendance_date", "status"], name="idx_clsatt_date_status"),
        ]


class ExitPass(models.Model):
    """
    Strict 3NF ExitPass:
    - CheckConstraint guarantees exactly one bearer: either enrollment (STUDENT) or teacher (TEACHER).
    - No stored time-dependent status column; pass_status is computed dynamically from
      is_cancelled, returned_at, and valid_until vs current time.
    """

    id = models.BigAutoField(primary_key=True)
    pass_number = models.CharField(max_length=50, unique=True, db_index=True)
    pass_scope = models.CharField(max_length=12, choices=PASS_SCOPE_CHOICES, db_index=True)
    enrollment = models.ForeignKey(
        "students.Enrollment",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="exit_passes",
    )
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="exit_passes",
    )
    pass_type = models.CharField(max_length=60, default="Exit Permit")
    reason = models.TextField()
    destination = models.CharField(max_length=200, blank=True, default="")
    attachment = models.FileField(upload_to="exit_passes/", null=True, blank=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="issued_exit_passes",
    )
    issued_at = models.DateTimeField(default=timezone.now)
    valid_until = models.DateTimeField()
    returned_at = models.DateTimeField(null=True, blank=True)
    is_cancelled = models.BooleanField(default=False)

    class Meta:
        db_table = "exit_passes"
        ordering = ["-issued_at"]
        constraints = [
            CheckConstraint(
                condition=(
                    (Q(pass_scope="STUDENT", enrollment__isnull=False, teacher__isnull=True))
                    | (Q(pass_scope="TEACHER", teacher__isnull=False, enrollment__isnull=True))
                ),
                name="ck_exitpass_xor_bearer",
            )
        ]
        indexes = [
            models.Index(
                fields=["is_cancelled", "returned_at", "valid_until"],
                name="idx_exitpass_state_window",
            ),
        ]

    @property
    def pass_status(self) -> str:
        if self.is_cancelled:
            return "CANCELLED"
        if self.returned_at is not None:
            return "RETURNED"
        if self.valid_until and timezone.now() > self.valid_until:
            return "OVERDUE"
        return "ACTIVE"

    @property
    def is_currently_valid(self) -> bool:
        now = timezone.now()
        return (
            not self.is_cancelled
            and self.returned_at is None
            and self.issued_at <= now <= self.valid_until
        )

    def save(self, *args, **kwargs):
        if not self.pass_number:
            self.pass_number = f"EP-{timezone.localdate().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        if not self.pass_scope:
            self.pass_scope = "STUDENT" if self.enrollment_id else "TEACHER"
        super().save(*args, **kwargs)
