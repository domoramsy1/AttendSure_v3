import secrets
from django.conf import settings
from django.db import models
from django.db.models import F
from django.utils import timezone
from common.fields import SafeJsonField
from common.phone import normalize_ph_phone

SUFFIX_CHOICES = [
    ("", "None"),
    ("Jr.", "Jr."),
    ("Sr.", "Sr."),
    ("II", "II"),
    ("III", "III"),
    ("IV", "IV"),
]

USER_ROLE_CHOICES = [
    ("ADMIN", "System Administrator"),
    ("PRINCIPAL", "School Principal"),
    ("DEPT_HEAD", "Department Head"),
    ("FACULTY", "Classroom Faculty / Adviser"),
    ("PARENT", "Parent / Guardian"),
]


class Department(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True, db_index=True)

    class Meta:
        db_table = "departments"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PositionTitle(models.Model):
    id = models.BigAutoField(primary_key=True)
    title = models.CharField(max_length=100, unique=True, db_index=True)

    class Meta:
        db_table = "position_titles"
        ordering = ["title"]

    def __str__(self) -> str:
        return self.title


class FacultyProfile(models.Model):
    """
    3NF Faculty entity:
    - Name, email, and active login state live in auth.User (via UserProfile) when linked,
      with standalone first_name/last_name fallback for directory-only faculty records.
    - Department and Position reference normalized lookup tables (Department, PositionTitle).
    """

    id = models.BigAutoField(primary_key=True)
    employee_id = models.CharField(max_length=50, unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default="")
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default="")

    department_ref = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="faculty_members",
    )
    position_ref = models.ForeignKey(
        PositionTitle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="faculty_members",
    )

    contact_number = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(max_length=150, blank=True, default="")
    photo = models.ImageField(upload_to="faculty/", null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)

    can_handle_classes = models.BooleanField(default=True, db_column="can_teach", db_index=True)
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)

    bound_device_id = models.CharField(max_length=128, blank=True, null=True, unique=True)
    device_model = models.CharField(max_length=100, blank=True, null=True)
    device_bound_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_faculty_profiles",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_faculty_profiles",
    )

    class Meta:
        db_table = "faculty_profiles"
        ordering = ["last_name", "first_name"]
        indexes = [
            models.Index(fields=["is_active", "last_name", "first_name"], name="idx_fac_active_name"),
        ]

    @property
    def department(self) -> str:
        return self.department_ref.name if self.department_ref_id and self.department_ref else ""

    @department.setter
    def department(self, value: str) -> None:
        clean = str(value or "").strip()[:100]
        if clean:
            dept_obj, _ = Department.objects.get_or_create(name=clean)
            self.department_ref = dept_obj
        else:
            self.department_ref = None

    @property
    def position(self) -> str:
        return self.position_ref.title if self.position_ref_id and self.position_ref else ""

    @position.setter
    def position(self, value: str) -> None:
        clean = str(value or "").strip()[:100]
        if clean:
            pos_obj, _ = PositionTitle.objects.get_or_create(title=clean)
            self.position_ref = pos_obj
        else:
            self.position_ref = None

    @property
    def full_name(self) -> str:
        mid = f" {self.middle_name[:1]}." if self.middle_name else ""
        suf = f" {self.suffix}" if self.suffix else ""
        return f"{self.first_name}{mid} {self.last_name}{suf}".strip()

    def save(self, *args, **kwargs):
        if self.contact_number:
            self.contact_number = normalize_ph_phone(self.contact_number)
        if not self.qr_token:
            self.qr_token = secrets.token_urlsafe(24)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.full_name} ({self.employee_id})"


class UserProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile"
    )
    faculty = models.OneToOneField(
        FacultyProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="faculty_id",
        related_name="account",
    )
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default="FACULTY", db_index=True)
    phone_number = models.CharField(max_length=30, blank=True, default="", db_index=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    push_token = models.CharField(max_length=255, blank=True, null=True)
    is_profile_completed = models.BooleanField(default=False)
    failed_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_profiles"

    @property
    def handles_classes(self) -> bool:
        if self.role == "PARENT":
            return False
        if self.faculty_id and self.faculty:
            return bool(self.faculty.can_handle_classes)
        return True

    def is_locked(self) -> bool:
        return bool(self.locked_until and timezone.now() < self.locked_until)

    def record_failed_attempt(self) -> None:
        now = timezone.now()
        if self.locked_until and now >= self.locked_until:
            UserProfile.objects.filter(pk=self.pk).update(failed_attempts=1, locked_until=None)
            self.failed_attempts = 1
            self.locked_until = None
            return
        UserProfile.objects.filter(pk=self.pk).update(failed_attempts=F("failed_attempts") + 1)
        self.refresh_from_db(fields=["failed_attempts"])
        if self.failed_attempts >= 5:
            self.locked_until = now + timezone.timedelta(minutes=15)
            self.save(update_fields=["locked_until"])

    def reset_failed_attempts(self) -> None:
        if self.failed_attempts > 0 or self.locked_until is not None:
            UserProfile.objects.filter(pk=self.pk).update(failed_attempts=0, locked_until=None)

    def save(self, *args, **kwargs):
        if self.phone_number:
            self.phone_number = normalize_ph_phone(self.phone_number)
        super().save(*args, **kwargs)


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64, db_index=True)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=10, db_index=True)
    old_data = SafeJsonField(null=True, blank=True)
    new_data = SafeJsonField(null=True, blank=True)
    changed_fields = SafeJsonField(null=True, blank=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_actions",
    )
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]