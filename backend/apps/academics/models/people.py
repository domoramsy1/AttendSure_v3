import secrets
from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from .base import SUFFIX_CHOICES, SEX_CHOICES, USER_ROLE_CHOICES

User = get_user_model()

class FacultyProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    employee_id = models.CharField(max_length=50, unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default='')
    position = models.CharField(max_length=100, blank=True, default='')
    department = models.CharField(max_length=100, blank=True, default='')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(max_length=150, blank=True, default='')

    photo = models.ImageField(upload_to='faculty/', null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)
    can_teach = models.BooleanField(default=True, db_index=True)

    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)

    bound_device_id = models.CharField(max_length=128, blank=True, null=True, unique=True)
    device_model = models.CharField(max_length=100, blank=True, null=True)
    device_bound_at = models.DateTimeField(blank=True, null=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_faculty')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_faculty')

    class Meta:
        db_table = 'faculty_profiles'
        ordering = ['last_name', 'first_name']

    @property
    def full_name(self) -> str:
        mid = f" {self.middle_name[:1]}." if self.middle_name else ""
        suf = f" {self.suffix}" if self.suffix else ""
        name = f"{self.first_name}{mid} {self.last_name}{suf}".strip()
        return name or f"{self.last_name}, {self.first_name}".strip()

    def clean(self):
        if self.rfid_uid:
            self.rfid_uid = self.rfid_uid.strip().upper()
        if not self.rfid_uid:
            self.rfid_uid = None
        if self.bound_device_id:
            self.bound_device_id = self.bound_device_id.strip()
        if not self.bound_device_id:
            self.bound_device_id = None
        if self.qr_token:
            self.qr_token = self.qr_token.strip()
        if not self.qr_token:
            self.qr_token = None

    def save(self, *args, **kwargs):
        self.clean()
        if not self.qr_token:
            self.qr_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.employee_id})"


class UserProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    faculty = models.OneToOneField(
        FacultyProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='account'
    )
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default='FACULTY')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    is_teaching = models.BooleanField(default=True)
    is_profile_completed = models.BooleanField(default=False)
    failed_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_profiles'

    def is_locked(self) -> bool:
        return bool(self.locked_until and timezone.now() < self.locked_until)

    def record_failed_attempt(self):
        self.failed_attempts += 1
        if self.failed_attempts >= 5:
            self.locked_until = timezone.now() + timezone.timedelta(minutes=15)
        self.save(update_fields=['failed_attempts', 'locked_until'])

    def reset_failed_attempts(self):
        if self.failed_attempts > 0 or self.locked_until is not None:
            self.failed_attempts = 0
            self.locked_until = None
            self.save(update_fields=['failed_attempts', 'locked_until'])

    def __str__(self):
        return f"{self.user.username} [{self.role}]"


class Student(models.Model):
    id = models.BigAutoField(primary_key=True)
    lrn = models.CharField(max_length=20, unique=True, db_index=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default='')
    sex = models.CharField(max_length=10, choices=SEX_CHOICES)
    birthdate = models.DateField()

    mother_tongue = models.CharField(max_length=100, blank=True, default='')
    ethnic_group = models.CharField(max_length=100, blank=True, default='')
    religion = models.CharField(max_length=100, blank=True, default='')

    house_street_sitio = models.CharField(max_length=255, blank=True, default='')
    barangay = models.CharField(max_length=100, blank=True, default='')
    municipality_city = models.CharField(max_length=100, blank=True, default='')
    province = models.CharField(max_length=100, blank=True, default='')

    father_name = models.CharField(max_length=200, blank=True, default='')
    mother_maiden_name = models.CharField(max_length=200, blank=True, default='')
    guardian_name = models.CharField(max_length=200, blank=True, default='')
    guardian_relationship = models.CharField(max_length=50, blank=True, default='')
    parent_contact = models.CharField(max_length=50, db_index=True)

    photo = models.ImageField(upload_to='students/', null=True, blank=True)
    photo_thumbnail = models.CharField(max_length=255, null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)

    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    qr_token = models.CharField(max_length=128, unique=True, db_index=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_students')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_students')

    class Meta:
        db_table = 'students'
        ordering = ['last_name', 'first_name']

    @property
    def full_name(self) -> str:
        mid = f" {self.middle_name[:1]}." if self.middle_name else ""
        suf = f" {self.suffix}" if self.suffix else ""
        return f"{self.last_name}, {self.first_name}{mid}{suf}".strip()

    def clean(self):
        if self.rfid_uid:
            self.rfid_uid = self.rfid_uid.strip().upper()
        if not self.rfid_uid:
            self.rfid_uid = None

    def save(self, *args, **kwargs):
        self.clean()
        if not self.qr_token:
            self.qr_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.full_name} ({self.lrn})"
