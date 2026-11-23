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


class AddressLocation(models.Model):
    """3NF Geographic Lookup: Barangay -> Municipality/City -> Province."""

    id = models.BigAutoField(primary_key=True)
    barangay = models.CharField(max_length=100, blank=True, default="")
    municipality_city = models.CharField(max_length=100, blank=True, default="")
    province = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "address_locations"
        constraints = [
            UniqueConstraint(
                fields=["barangay", "municipality_city", "province"],
                name="uq_barangay_city_province",
            )
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
    location = models.ForeignKey(
        AddressLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="students",
    )

    father_name = models.CharField(max_length=200, blank=True, default="")
    mother_maiden_name = models.CharField(max_length=200, blank=True, default="")
    guardian_name = models.CharField(max_length=200, blank=True, default="")
    guardian_relationship = models.CharField(max_length=50, blank=True, default="")
    parent_contact = models.CharField(max_length=50, db_index=True)
    parent_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )

    photo = models.ImageField(upload_to="students/", null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)

    qr_token = models.CharField(max_length=128, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_students",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_students",
    )

    class Meta:
        db_table = "students"
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["is_active", "last_name", "first_name"], name="idx_stu_active_name"),
        ]

    @property
    def barangay(self) -> str:
        return self.location.barangay if self.location_id and self.location else ""

    @property
    def municipality_city(self) -> str:
        return self.location.municipality_city if self.location_id and self.location else ""

    @property
    def province(self) -> str:
        return self.location.province if self.location_id and self.location else ""

    def set_address_location(self, barangay: str = "", municipality_city: str = "", province: str = "") -> None:
        b = str(barangay or "").strip()[:100]
        m = str(municipality_city or "").strip()[:100]
        p = str(province or "").strip()[:100]
        if b or m or p:
            loc, _ = AddressLocation.objects.get_or_create(
                barangay=b, municipality_city=m, province=p
            )
            self.location = loc
        else:
            self.location = None

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

    def __str__(self) -> str:
        return f"{self.full_name} ({self.lrn})"


class Enrollment(models.Model):
    """
    3NF Enrollment:
    - Removed transitive school_year column because Enrollment -> Section -> SchoolYear.
    - Accessed in zero extra queries via select_related('section__school_year').
    """

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="enrollments")
    section = models.ForeignKey("school.Section", on_delete=models.CASCADE, related_name="enrollments")
    enrollment_date = models.DateField(default=timezone.localdate)
    enrollment_type = models.CharField(max_length=20, choices=ENROLLMENT_TYPE_CHOICES, default="REGULAR")
    status = models.CharField(max_length=20, choices=ENROLLMENT_STATUS_CHOICES, default="ENROLLED", db_index=True)
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
            UniqueConstraint(fields=["student", "section"], name="uq_enrollment_student_section")
        ]
        indexes = [
            models.Index(fields=["section", "status"], name="idx_enr_section_status"),
            models.Index(fields=["student", "status"], name="idx_enr_student_status"),
        ]

    @property
    def school_year(self):
        return self.section.school_year if self.section_id and self.section else None

    def save(self, *args, **kwargs):
        if isinstance(self.enrollment_date, datetime):
            self.enrollment_date = (
                timezone.localtime(self.enrollment_date).date()
                if timezone.is_aware(self.enrollment_date)
                else self.enrollment_date.date()
            )
        super().save(*args, **kwargs)