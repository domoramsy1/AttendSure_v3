# backend/apps/attendance/models.py
from django.db import models
from django.db.models import CheckConstraint, Q, UniqueConstraint
from django.utils import timezone

ATTENDANCE_STATUS_CHOICES = [
    ("PRESENT", "Present"),
    ("LATE", "Late"),
    ("CUTTING", "Cutting Classes"),
    ("ABSENT", "Absent"),
    ("EXCUSED", "Excused"),
]

SCAN_METHOD_CHOICES = [
    ("QR", "Printed QR ID Scan"),
    ("MANUAL", "Manual Class List Entry"),
]

EXIT_PASS_STATUS_CHOICES = [
    ("PENDING", "Pending Approval"),
    ("ACTIVE", "Active"),
    ("USED", "Used"),
    ("EXPIRED", "Expired"),
    ("REVOKED", "Revoked"),
]


class ClassAttendance(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="class_attendances")
    class_period = models.ForeignKey(
        "school.ClassPeriod", on_delete=models.CASCADE, db_column="schedule_id", related_name="attendance_records"
    )
    recorded_by = models.ForeignKey(
        "accounts.FacultyProfile", on_delete=models.CASCADE, db_column="faculty_id", related_name="recorded_scans"
    )
    attendance_date = models.DateField(default=timezone.localdate, db_index=True)
    scanned_at = models.DateTimeField(default=timezone.now, db_index=True)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default="QR")
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default="PRESENT")

    class Meta:
        db_table = "subject_attendance_logs"
        constraints = [
            UniqueConstraint(
                fields=["student", "class_period", "attendance_date"],
                name="uq_class_attendance_daily",
            )
        ]
        indexes = [
            models.Index(fields=["attendance_date", "student"], name="idx_clsatt_date_stu"),
            models.Index(fields=["class_period", "attendance_date"], name="idx_clsatt_per_date"),
        ]


class DailyAttendance(models.Model):
    """
    3NF Daily Summary:
    - Keyed strictly by (student, attendance_date).
    - Section is resolved through Enrollment without storing redundant section_id.
    """

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="daily_attendances")
    attendance_date = models.DateField(default=timezone.localdate, db_index=True)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default="PRESENT", db_index=True)
    remarks = models.CharField(max_length=255, blank=True, default="")
    recorded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "daily_attendance_summaries"
        constraints = [
            UniqueConstraint(fields=["student", "attendance_date"], name="uq_daily_attendance_student_date")
        ]
        indexes = [
            models.Index(fields=["attendance_date", "status"], name="idx_dailyatt_date_status"),
        ]


class ExitPass(models.Model):
    id = models.BigAutoField(primary_key=True)
    pass_number = models.CharField(max_length=50, unique=True, db_index=True)
    faculty = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="faculty_id",
        related_name="exit_passes",
    )
    student = models.ForeignKey(
        "students.Student", on_delete=models.SET_NULL, null=True, blank=True, related_name="exit_passes"
    )
    issued_by = models.ForeignKey(
        "accounts.FacultyProfile", on_delete=models.CASCADE, related_name="issued_exit_passes"
    )
    pass_type = models.CharField(max_length=50, default="Exit Permit")
    reason = models.TextField()
    attachment = models.FileField(upload_to="exit_passes/", null=True, blank=True)
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField(db_column="valid_to")
    status = models.CharField(max_length=20, choices=EXIT_PASS_STATUS_CHOICES, default="ACTIVE", db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gate_passes"
        constraints = [
            CheckConstraint(
                condition=(
                    (Q(student__isnull=False) & Q(faculty__isnull=True))
                    | (Q(student__isnull=True) & Q(faculty__isnull=False))
                ),
                name="ck_exitpass_single_bearer",
            )
        ]
        indexes = [
            models.Index(fields=["status", "-created_at"], name="idx_exitpass_status_created"),
        ]