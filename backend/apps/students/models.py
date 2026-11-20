# D:\AttendSure_V3\backend\apps\students\models.py

from datetime import datetime
import secrets
from django.conf import settings
from django.db import models
from django.db.models import UniqueConstraint
from django.utils import timezone
from common.phone import normalize_ph_phone

SEX_CHOICES = [("Male", "Male"), ("Female", "Female")]
ENROLLMENT_STATUS_CHOICES = [
    ("ENROLLED", "Enrolled"),
    ("DROPPED", "Dropped Out"),
    ("TRANSFERRED_IN", "Transferred In"),
    ("TRANSFERRED_OUT", "Transferred Out"),
]
ENROLLMENT_TYPE_CHOICES = [
    ("REGULAR", "Regular"),
    ("LATE_ENROLLEE", "Late Enrollee"),
    ("TRANSFERRED_IN", "Transferred In"),
    ("RETURNING", "Returning"),
    ("REPEATER", "Repeater"),
]


class Student(models.Model):
    id = models.BigAutoField(primary_key=True)
    lrn = models.CharField(max_length=20, unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default="")
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, blank=True, default="")
    sex = models.CharField(max_length=10, choices=SEX_CHOICES)
    birthdate = models.DateField()

    mother_tongue = models.CharField(max_length=100, blank=True, default="")
    ethnic_group = models.CharField(max_length=100, blank=True, default="")
    religion = models.CharField(max_length=100, blank=True, default="")

    house_street_sitio = models.CharField(max_length=255, blank=True, default="")
    barangay = models.CharField(max_length=100, blank=True, default="")
    municipality_city = models.CharField(max_length=100, blank=True, default="")
    province = models.CharField(max_length=100, blank=True, default="")

    father_name = models.CharField(max_length=200, blank=True, default="")
    mother_maiden_name = models.CharField(max_length=200, blank=True, default="")
    guardian_name = models.CharField(max_length=200, blank=True, default="")
    guardian_relationship = models.CharField(max_length=50, blank=True, default="")
    parent_contact = models.CharField(max_length=50, db_index=True)
    parent_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="children"
    )

    photo = models.ImageField(upload_to="students/", null=True, blank=True)
    photo_thumbnail = models.CharField(max_length=255, null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)

    qr_token = models.CharField(max_length=128, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_students"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="updated_students"
    )

    class Meta:
        db_table = "students"
        ordering = ["last_name", "first_name"]

    @property
    def full_name(self) -> str:
        mid = f" {self.middle_name[:1]}." if self.middle_name else ""
        suf = f" {self.suffix}" if self.suffix else ""
        return f"{self.last_name}, {self.first_name}{mid}{suf}".strip()

    def save(self, *args, **kwargs):
        if self.parent_contact:
            self.parent_contact = normalize_ph_phone(self.parent_contact)[:50]
        if not self.qr_token:
            self.qr_token = secrets.token_urlsafe(24)
        if not self.parent_user_id and self.parent_contact:
            from apps.accounts.models import UserProfile

            matched = (
                UserProfile.objects.filter(role="PARENT", phone_number=self.parent_contact)
                .select_related("user")
                .first()
            )
            if matched:
                self.parent_user = matched.user
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.lrn})"


class Enrollment(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="enrollments")
    section = models.ForeignKey("school.Section", on_delete=models.CASCADE, related_name="enrollments")
    school_year = models.ForeignKey(
        "school.SchoolYear", on_delete=models.CASCADE, db_column="academic_year_id", related_name="enrollments"
    )
    # Uses timezone.localdate so DRF DateField never fails AssertionError on datetime instances
    enrollment_date = models.DateField(default=timezone.localdate)
    enrollment_type = models.CharField(max_length=20, choices=ENROLLMENT_TYPE_CHOICES, default="REGULAR")
    status = models.CharField(max_length=20, choices=ENROLLMENT_STATUS_CHOICES, default="ENROLLED")
    status_date = models.DateField(null=True, blank=True)
    status_reason_code = models.CharField(max_length=50, blank=True, default="")
    transferred_school = models.CharField(max_length=255, blank=True, default="")
    is_cct_recipient = models.BooleanField(default=False)
    cct_id_number = models.CharField(max_length=50, blank=True, default="")
    disability_detail = models.CharField(max_length=150, blank=True, default="")
    accelerated_detail = models.CharField(max_length=150, blank=True, default="")
    remarks = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "enrollments"
        constraints = [
            UniqueConstraint(fields=["student", "school_year"], name="uq_student_school_year")
        ]

    def save(self, *args, **kwargs):
        if isinstance(self.enrollment_date, datetime):
            self.enrollment_date = (
                timezone.localtime(self.enrollment_date).date()
                if timezone.is_aware(self.enrollment_date)
                else self.enrollment_date.date()
            )
        super().save(*args, **kwargs)