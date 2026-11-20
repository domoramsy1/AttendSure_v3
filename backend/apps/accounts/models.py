import secrets
from django.conf import settings
from django.db import models
from django.db.models import F
from django.utils import timezone
from common.fields import SafeJsonField
from common.phone import normalize_ph_phone

SUFFIX_CHOICES = [("", "None"), ("Jr.", "Jr."), ("Sr.", "Sr."), ("II", "II"), ("III", "III"), ("IV", "IV")]
USER_ROLE_CHOICES = [
    ("ADMIN", "System Administrator"),
    ("PRINCIPAL", "School Principal"),
    ("DEPT_HEAD", "Department Head"),
    ("FACULTY", "Teacher / Adviser"),
    ("PARENT", "Parent / Guardian"),
]


class TeacherProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    employee_id = models.CharField(max_length=50, unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default="")
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default="")
    position = models.CharField(max_length=100, blank=True, default="")
    department = models.CharField(max_length=100, blank=True, default="")
    contact_number = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(max_length=150, blank=True, default="")

    photo = models.ImageField(upload_to="faculty/", null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)
    can_teach = models.BooleanField(default=True, db_index=True)
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)

    bound_device_id = models.CharField(max_length=128, blank=True, null=True, unique=True)
    device_model = models.CharField(max_length=100, blank=True, null=True)
    device_bound_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_teachers"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="updated_teachers"
    )

    class Meta:
        db_table = "faculty_profiles"
        ordering = ["last_name", "first_name"]

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

    def __str__(self):
        return f"{self.full_name} ({self.employee_id})"


class UserProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    teacher = models.OneToOneField(
        TeacherProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="faculty_id",
        related_name="account",
    )
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default="FACULTY")
    phone_number = models.CharField(max_length=30, blank=True, default="", db_index=True)
    avatar = models.ImageField(upload_to="avatars/", null=True, blank=True)
    push_token = models.CharField(max_length=255, blank=True, null=True)
    is_teaching = models.BooleanField(default=True)
    is_profile_completed = models.BooleanField(default=False)
    failed_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_profiles"

    def is_locked(self) -> bool:
        return bool(self.locked_until and timezone.now() < self.locked_until)

    def record_failed_attempt(self):
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

    def reset_failed_attempts(self):
        if self.failed_attempts > 0 or self.locked_until is not None:
            UserProfile.objects.filter(pk=self.pk).update(failed_attempts=0, locked_until=None)

    def save(self, *args, **kwargs):
        if self.phone_number:
            self.phone_number = normalize_ph_phone(self.phone_number)
        if self.role == "PARENT":
            self.is_teaching = False
        super().save(*args, **kwargs)


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=10)
    old_data = SafeJsonField(null=True, blank=True)
    new_data = SafeJsonField(null=True, blank=True)
    changed_fields = SafeJsonField(null=True, blank=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_actions"
    )
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "audit_logs"
        ordering = ["-created_at"]