# D:\AttendSure_V3\backend\apps\accounts\models.py
import re
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
    ("TEACHER", "Teacher / Class Adviser"),
]


class Department(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=32, unique=True, db_index=True)
    name = models.CharField(max_length=100, unique=True, db_index=True)

    class Meta:
        db_table = "departments"
        ordering = ["name"]

    def save(self, *args, **kwargs):
        if not self.code and self.name:
            base = re.sub(r"[^A-Z0-9]+", "_", self.name.upper()).strip("_")[:24] or "DEPT"
            candidate = base
            counter = 1
            while Department.objects.filter(code=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base[:20]}_{counter}"
                counter += 1
            self.code = candidate
        super().save(*args, **kwargs)

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


class TeacherProfile(models.Model):
    """
    Strict 3NF TeacherProfile:
    - Name (first_name, last_name), email, and is_active live strictly in auth.User.
    - Stores only teacher-specific atomic attributes + normalized FKs to Department & PositionTitle.
    - biometric_key_id stores ONLY the public SHA-256 identifier of the phone's SecureStore key (never biometric data).
    """

    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_profile",
    )
    employee_id = models.CharField(max_length=50, unique=True, db_index=True)
    middle_name = models.CharField(max_length=100, blank=True, default="")
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default="")
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teachers",
    )
    position = models.ForeignKey(
        PositionTitle,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="teachers",
    )
    contact_number = models.CharField(max_length=50, blank=True, default="")
    photo = models.ImageField(upload_to="teachers/", null=True, blank=True)
    can_handle_classes = models.BooleanField(default=True, db_index=True)
    qr_token = models.CharField(max_length=128, unique=True, db_index=True)
    bound_device_id = models.CharField(max_length=128, blank=True, null=True, unique=True)
    device_model = models.CharField(max_length=100, blank=True, null=True)
    device_bound_at = models.DateTimeField(blank=True, null=True)
    biometric_key_id = models.CharField(max_length=128, blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "teacher_profiles"
        ordering = ["user__last_name", "user__first_name"]
        indexes = [
            models.Index(fields=["can_handle_classes"], name="idx_teacher_can_handle"),
        ]

    @property
    def first_name(self) -> str:
        return self.user.first_name if self.user_id else ""

    @property
    def last_name(self) -> str:
        return self.user.last_name if self.user_id else ""

    @property
    def email(self) -> str:
        return self.user.email if self.user_id else ""

    @property
    def is_active(self) -> bool:
        return bool(self.user.is_active) if self.user_id else False

    @property
    def department_name(self) -> str:
        return self.department.name if (self.department_id and self.department) else ""

    @property
    def position_title(self) -> str:
        return self.position.title if (self.position_id and self.position) else ""

    @property
    def full_name(self) -> str:
        first = (self.user.first_name if self.user_id else "").strip()
        last = (self.user.last_name if self.user_id else "").strip()
        mid = f" {self.middle_name[:1]}." if self.middle_name else ""
        suf = f" {self.suffix}" if self.suffix else ""
        computed = f"{first}{mid} {last}{suf}".strip()
        return computed or (self.user.username if self.user_id else self.employee_id)

    def save(self, *args, **kwargs):
        if self.contact_number:
            self.contact_number = normalize_ph_phone(self.contact_number)[:50]
        if not self.qr_token:
            self.qr_token = secrets.token_urlsafe(24)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.full_name} ({self.employee_id})"


class UserProfile(models.Model):
    """
    Strict 3NF UserProfile:
    - Stores ONLY account security and role attributes.
    - No duplicated name, phone, avatar, or teacher FK (user.teacher_profile is already 1-to-1).
    """

    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default="TEACHER", db_index=True)
    failed_login_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_profiles"

    @property
    def is_profile_completed(self) -> bool:
        return bool(self.user_id and self.user.first_name and self.user.last_name)

    def is_locked(self) -> bool:
        return bool(self.locked_until and timezone.now() < self.locked_until)

    def record_failed_attempt(self) -> bool:
        """Increments failed_login_attempts atomically. Returns True if this attempt locked the account."""
        now = timezone.now()
        if self.locked_until and now >= self.locked_until:
            UserProfile.objects.filter(pk=self.pk).update(failed_login_attempts=1, locked_until=None)
            self.failed_login_attempts = 1
            self.locked_until = None
            return False

        UserProfile.objects.filter(pk=self.pk).update(failed_login_attempts=F("failed_login_attempts") + 1)
        self.refresh_from_db(fields=["failed_login_attempts"])
        if self.failed_login_attempts >= 5:
            self.locked_until = now + timezone.timedelta(minutes=15)
            self.save(update_fields=["locked_until", "updated_at"])
            return True
        return False

    def reset_failed_attempts(self) -> None:
        if self.failed_login_attempts > 0 or self.locked_until is not None:
            UserProfile.objects.filter(pk=self.pk).update(failed_login_attempts=0, locked_until=None)
            self.failed_login_attempts = 0
            self.locked_until = None

    def __str__(self) -> str:
        return f"{self.user.username} ({self.role})"


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64, db_index=True)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=16, db_index=True)
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
        indexes = [
            models.Index(fields=["table_name", "-created_at"], name="idx_audit_table_created"),
        ]