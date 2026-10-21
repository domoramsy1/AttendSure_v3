import os
import shutil
import subprocess

ROOT_DIR = r"D:\AttendSure_V3"
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")
ACADEMICS_DIR = os.path.join(BACKEND_DIR, "apps", "academics")
API_DIR = os.path.join(BACKEND_DIR, "apps", "api")
BACKUP_DIR = os.path.join(BACKEND_DIR, "_backup_monoliths")

os.makedirs(BACKUP_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# 1. SAFELY BACK UP AND REMOVE OLD MONOLITHIC FILES
# ---------------------------------------------------------------------------
for src, name in [
    (os.path.join(ACADEMICS_DIR, "models.py"), "models.py"),
    (os.path.join(API_DIR, "serializers.py"), "serializers.py"),
    (os.path.join(API_DIR, "views.py"), "views.py"),
]:
    if os.path.isfile(src):
        shutil.copy2(src, os.path.join(BACKUP_DIR, name))
        os.remove(src)
        print(f"[Backup] Moved {name} to {BACKUP_DIR}")

# ---------------------------------------------------------------------------
# 2. CREATE PACKAGE DIRECTORIES
# ---------------------------------------------------------------------------
DIRS = [
    os.path.join(ACADEMICS_DIR, "models"),
    os.path.join(API_DIR, "serializers"),
    os.path.join(API_DIR, "views"),
]
for d in DIRS:
    os.makedirs(d, exist_ok=True)

def write_file(rel_path, content):
    full_path = os.path.join(BACKEND_DIR, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content.strip() + "\n")
    print(f"[Created] {rel_path}")

# ===========================================================================
# 3. ACADEMICS MODELS
# ===========================================================================

write_file("apps/academics/models/base.py", """
SUFFIX_CHOICES = [
    ('', 'None'),
    ('Jr.', 'Jr.'),
    ('Sr.', 'Sr.'),
    ('II', 'II'),
    ('III', 'III'),
    ('IV', 'IV'),
    ('V', 'V'),
]

SEX_CHOICES = [
    ('Male', 'Male'),
    ('Female', 'Female'),
]

SCAN_METHOD_CHOICES = [
    ('RFID', 'RFID Card Tap'),
    ('QR', 'QR Code Scan'),
    ('MANUAL', 'Manual Override (Security Guard)'),
]

DIRECTION_CHOICES = [
    ('IN', 'Entry'),
    ('OUT', 'Exit'),
]

ATTENDANCE_STATUS_CHOICES = [
    ('PRESENT', 'Present'),
    ('LATE', 'Late'),
    ('CUTTING', 'Cutting Classes'),
    ('ABSENT', 'Absent'),
    ('EXCUSED', 'Excused'),
]

ENROLLMENT_STATUS_CHOICES = [
    ('ENROLLED', 'Enrolled'),
    ('DROPPED', 'Dropped Out'),
    ('TRANSFERRED_IN', 'Transferred In'),
    ('TRANSFERRED_OUT', 'Transferred Out'),
]

ENROLLMENT_TYPE_CHOICES = [
    ('REGULAR', 'Regular'),
    ('LATE_ENROLLEE', 'Late Enrollee'),
    ('TRANSFERRED_IN', 'Transferred In'),
    ('RETURNING', 'Returning'),
    ('REPEATER', 'Repeater'),
]

USER_ROLE_CHOICES = [
    ('ADMIN', 'System Administrator'),
    ('PRINCIPAL', 'School Principal'),
    ('DEPT_HEAD', 'Department Head'),
    ('FACULTY', 'Faculty / Adviser'),
    ('GUARD', 'Security Guard'),
]

GATE_PASS_STATUS_CHOICES = [
    ('ACTIVE', 'Active / Usable'),
    ('USED', 'Used / Redeemed'),
    ('EXPIRED', 'Expired'),
    ('REVOKED', 'Revoked / Canceled'),
]

DAY_OF_WEEK_CHOICES = [
    (1, 'Monday'),
    (2, 'Tuesday'),
    (3, 'Wednesday'),
    (4, 'Thursday'),
    (5, 'Friday'),
    (6, 'Saturday'),
    (7, 'Sunday'),
]
""")

write_file("apps/academics/models/institution.py", """
import math
from django.db import models
from django.contrib.auth.hashers import make_password, check_password

class AcademicYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True, help_text="e.g., S.Y. 2026-2027")
    start_date = models.DateField()
    first_friday_june = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'academic_years'
        ordering = ['-start_date']

    def __str__(self):
        return self.code

    def save(self, *args, **kwargs):
        if self.is_active:
            AcademicYear.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class SchoolProfile(models.Model):
    school_id = models.CharField(max_length=50, unique=True, help_text="Official DepEd School ID")
    school_name = models.CharField(max_length=255)
    region = models.CharField(max_length=100, blank=True, default='')
    division = models.CharField(max_length=100, blank=True, default='')
    district = models.CharField(max_length=100, blank=True, default='')
    address = models.TextField(blank=True, default='')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(blank=True, default='')

    principal_faculty = models.ForeignKey(
        'academics.FacultyProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schools_as_principal',
        help_text="Faculty member serving as School Head / Principal"
    )

    principal_name = models.CharField(max_length=255, blank=True, default='')
    principal_title = models.CharField(max_length=150, blank=True, default='Secondary School Principal IV')

    school_logo = models.TextField(blank=True, null=True)
    left_logo = models.TextField(blank=True, null=True)
    right_logo = models.TextField(blank=True, null=True)

    latitude = models.DecimalField(max_digits=10, decimal_places=7, default=8.4858000)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, default=124.6567000)
    geofence_radius_meters = models.IntegerField(default=150)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'attendsure_school_profile'
        verbose_name = 'School Profile'
        verbose_name_plural = 'School Profile'

    def save(self, *args, **kwargs):
        if self.principal_faculty:
            faculty = self.principal_faculty
            if not self.principal_name:
                self.principal_name = faculty.full_name
            if not self.principal_title and faculty.position:
                self.principal_title = faculty.position
        super().save(*args, **kwargs)

    def calculate_distance_meters(self, user_lat, user_lon) -> float:
        try:
            u_lat = float(user_lat)
            u_lon = float(user_lon)
            c_lat = float(self.latitude)
            c_lon = float(self.longitude)
        except (TypeError, ValueError):
            return float('inf')

        r = 6371000
        phi1 = math.radians(c_lat)
        phi2 = math.radians(u_lat)
        delta_phi = math.radians(u_lat - c_lat)
        delta_lambda = math.radians(u_lon - c_lon)

        a = (math.sin(delta_phi / 2.0) ** 2 +
             math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        return r * c

    def __str__(self):
        return f"{self.school_name} ({self.school_id})"


class ClassSchedule(models.Model):
    id = models.BigAutoField(primary_key=True)
    label = models.CharField(max_length=100, blank=True, default='')
    regular_days_label = models.CharField(max_length=100, blank=True, default='')
    saturday_label = models.CharField(max_length=100, blank=True, default='')
    am_arrival_start = models.TimeField(null=True, blank=True)
    am_arrival_cutoff = models.TimeField(null=True, blank=True)
    am_departure_time = models.TimeField(null=True, blank=True)
    pm_arrival_time = models.TimeField(null=True, blank=True)
    pm_departure_cutoff = models.TimeField(null=True, blank=True)
    late_threshold_min = models.IntegerField(default=15)

    class Meta:
        db_table = 'class_schedules'

    def __str__(self):
        return self.label


class GeofenceSetting(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, default='Campus Boundary')
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    radius_meters = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'geofence_settings'

    def __str__(self):
        return self.name


class IoTKiosk(models.Model):
    id = models.BigAutoField(primary_key=True)
    kiosk_code = models.CharField(max_length=50, unique=True, help_text="Hardware identifier")
    terminal_name = models.CharField(max_length=150)
    secret_hash = models.CharField(max_length=255, help_text="Hashed API secret")
    location = models.CharField(max_length=100, default='Main Gate')
    is_active = models.BooleanField(default=True)
    last_ping = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'iot_kiosks'

    def __str__(self):
        return f"{self.terminal_name} [{self.kiosk_code}]"

    def set_secret(self, raw_secret: str):
        self.secret_hash = make_password(raw_secret)

    def verify_secret(self, raw_secret: str) -> bool:
        return check_password(raw_secret, self.secret_hash)
""")

write_file("apps/academics/models/people.py", """
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
""")

write_file("apps/academics/models/structure.py", """
from django.db import models
from django.utils import timezone
from .base import ENROLLMENT_TYPE_CHOICES, ENROLLMENT_STATUS_CHOICES, DAY_OF_WEEK_CHOICES
from .institution import AcademicYear
from .people import Student, FacultyProfile

class GradeLevel(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    stage = models.CharField(max_length=20, blank=True, default='JHS')
    level_order = models.IntegerField(default=1)

    class Meta:
        db_table = 'grade_levels'
        ordering = ['level_order']

    def __str__(self):
        return self.name


class Section(models.Model):
    id = models.BigAutoField(primary_key=True)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='sections')
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name='sections')
    adviser = models.ForeignKey(FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='advising_sections')
    name = models.CharField(max_length=100)
    track_strand = models.CharField(max_length=150, blank=True, default='')
    room_number = models.CharField(max_length=50, blank=True, default='')
    capacity = models.IntegerField(default=0)

    class Meta:
        db_table = 'sections'
        unique_together = ('academic_year', 'grade_level', 'name')
        ordering = ['name']

    def __str__(self):
        return f"{self.grade_level.code} - {self.name}"


class Enrollment(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='enrollments')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='enrollments')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='enrollments')
    enrollment_date = models.DateField(default=timezone.now)
    enrollment_type = models.CharField(max_length=20, choices=ENROLLMENT_TYPE_CHOICES, default='REGULAR')
    status = models.CharField(max_length=20, choices=ENROLLMENT_STATUS_CHOICES, default='ENROLLED')
    status_date = models.DateField(null=True, blank=True)
    status_reason_code = models.CharField(max_length=50, blank=True, default='')
    transferred_school = models.CharField(max_length=255, blank=True, default='')
    is_cct_recipient = models.BooleanField(default=False)
    cct_id_number = models.CharField(max_length=50, blank=True, default='')
    disability_detail = models.CharField(max_length=150, blank=True, default='')
    accelerated_detail = models.CharField(max_length=150, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'enrollments'
        unique_together = ('student', 'academic_year')
        indexes = [
            models.Index(fields=['academic_year', 'status']),
            models.Index(fields=['section', 'status']),
        ]

    def __str__(self):
        return f"{self.student.lrn} -> {self.section.name}"


class Subject(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=30, unique=True)
    title = models.CharField(max_length=200)
    tier = models.CharField(max_length=20, blank=True, default='Core')
    subject_type = models.CharField(max_length=50, blank=True, default='Core')
    units = models.IntegerField(default=1)

    class Meta:
        db_table = 'subjects'
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.title}"


class Schedule(models.Model):
    id = models.BigAutoField(primary_key=True)
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='schedules')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='schedules')
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_schedules')
    start_time = models.TimeField()
    end_time = models.TimeField()
    room_number = models.CharField(max_length=50, blank=True, default='')

    class Meta:
        db_table = 'schedules'
        ordering = ['start_time']
        indexes = [
            models.Index(fields=['faculty', 'start_time']),
            models.Index(fields=['section', 'start_time']),
        ]

    def __str__(self):
        return f"{self.section.name} - {self.subject.code} ({self.start_time})"


class ScheduleDay(models.Model):
    id = models.BigAutoField(primary_key=True)
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='days')
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_OF_WEEK_CHOICES, default=1)

    class Meta:
        db_table = 'schedule_days'
        unique_together = ('schedule', 'day_of_week')

    def __str__(self):
        return f"Schedule #{self.schedule_id} - {self.get_day_of_week_display()}"
""")

write_file("apps/academics/models/attendance.py", """
from django.db import models
from django.conf import settings
from django.utils import timezone
from .base import DIRECTION_CHOICES, SCAN_METHOD_CHOICES, ATTENDANCE_STATUS_CHOICES
from .people import Student, FacultyProfile
from .institution import IoTKiosk
from .structure import Section, Schedule

class FacultyGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now, db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)
    is_violation = models.BooleanField(default=False)
    violation_type = models.CharField(max_length=64, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    is_excused_by_principal = models.BooleanField(default=False)
    excused_at = models.DateTimeField(null=True, blank=True)
    excused_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='excused_faculty_gate_violations'
    )

    class Meta:
        db_table = 'faculty_gate_logs'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['faculty', 'scan_time']),
            models.Index(fields=['scan_time', 'is_violation']),
        ]

    def __str__(self):
        return f"{self.faculty} - {self.direction} at {self.scan_time}"


class StudentGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now, db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    class Meta:
        db_table = 'student_gate_logs_partitioned'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['student', 'scan_time']),
            models.Index(fields=['scan_time', 'direction']),
        ]

    def __str__(self):
        return f"{self.student.lrn} - {self.direction} ({self.scan_time})"


class SubjectAttendanceLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='subject_attendance')
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='attendance_records')
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='submitted_attendance')
    attendance_date = models.DateField(default=timezone.now, db_index=True)
    scanned_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')

    class Meta:
        db_table = 'subject_attendance_logs'
        unique_together = ('student', 'schedule', 'attendance_date')
        indexes = [
            models.Index(fields=['schedule', 'attendance_date']),
            models.Index(fields=['faculty', 'attendance_date']),
        ]

    def __str__(self):
        return f"{self.student.lrn} - {self.schedule.subject.code} [{self.status}]"


class DailyAttendanceSummary(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='daily_summaries')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='daily_summaries')
    attendance_date = models.DateField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')
    remarks = models.CharField(max_length=255, blank=True, default='')
    recorded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_attendance_summaries'
        unique_together = ('student', 'attendance_date')
        indexes = [
            models.Index(fields=['section', 'attendance_date', 'status']),
        ]

    def __str__(self):
        return f"{self.student.lrn} - {self.attendance_date} [{self.status}]"
""")

write_file("apps/academics/models/telemetry.py", """
from django.db import models
from django.conf import settings
from django.utils import timezone
from .base import GATE_PASS_STATUS_CHOICES
from .people import Student, FacultyProfile

class FacultyHeartbeat(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='heartbeats')
    latitude = models.DecimalField(max_digits=10, decimal_places=7)
    longitude = models.DecimalField(max_digits=10, decimal_places=7)
    battery_level = models.IntegerField(default=100)
    is_inside_geofence = models.BooleanField(default=True, db_index=True)
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'faculty_heartbeats'
        ordering = ['-recorded_at']
        indexes = [models.Index(fields=['faculty', 'recorded_at'])]


class LoafingIncident(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='loafing_logs')
    incident_date = models.DateField(default=timezone.now, db_index=True)
    trigger_reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, default='PENDING_REVIEW')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'loafing_incidents'
        ordering = ['-created_at']


class GatePass(models.Model):
    id = models.BigAutoField(primary_key=True)
    pass_number = models.CharField(max_length=50, unique=True, db_index=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True)
    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)
    issued_by = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='issued_passes')
    pass_type = models.CharField(max_length=50, default='Exit Permit')
    reason = models.TextField()
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    status = models.CharField(max_length=20, choices=GATE_PASS_STATUS_CHOICES, default='ACTIVE', db_index=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gate_passes'
        indexes = [models.Index(fields=['status', 'valid_from', 'valid_to'])]


class SmsOutbox(models.Model):
    PRIORITY_CHOICES = [
        ('HIGH', 'High Priority (Gate Entry/Exit)'),
        ('NORMAL', 'Normal Priority (Class Attendance)'),
        ('LOW', 'Low Priority (Announcements)'),
    ]
    TRIGGER_EVENT_CHOICES = [
        ('GATE_IN', 'Gate Entry Notice'),
        ('GATE_OUT', 'Gate Exit Notice'),
        ('CLASS_ABSENT', 'Class Absence'),
        ('EMERGENCY', 'School Broadcast'),
        ('TEST', 'Modem Signal Test'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending Dispatch'),
        ('SENT', 'Delivered'),
        ('FAILED', 'Failed / No Signal'),
    ]

    recipient_name = models.CharField(max_length=150, blank=True, default='')
    recipient_number = models.CharField(max_length=25, db_index=True)
    message_body = models.TextField()
    trigger_event = models.CharField(max_length=30, choices=TRIGGER_EVENT_CHOICES, default='GATE_IN', db_index=True)
    category = models.CharField(max_length=30, choices=TRIGGER_EVENT_CHOICES, default='GATE_IN', blank=True)
    priority = models.CharField(max_length=15, choices=PRIORITY_CHOICES, default='HIGH', db_index=True)
    status = models.CharField(max_length=15, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    retry_count = models.PositiveIntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'priority', 'created_at'])]


class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=10)
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    changed_fields = models.JSONField(null=True, blank=True)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_actions')
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        managed = False


class FacultyMonthlyDTR(models.Model):
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='monthly_dtrs')
    month = models.PositiveSmallIntegerField(help_text="Month number (1-12)")
    year = models.PositiveSmallIntegerField(help_text="Year (e.g., 2026)")
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_dept_head_approved = models.BooleanField(default=False)
    dept_head_approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_dtrs')
    regular_hours = models.CharField(max_length=120, default="8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM")
    saturday_hours = models.CharField(max_length=120, default="As Required")
    remarks = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'faculty_monthly_dtr'
        unique_together = ('faculty', 'month', 'year')
        ordering = ['-year', '-month']
""")

write_file("apps/academics/models/__init__.py", """
from .base import (
    SUFFIX_CHOICES,
    SEX_CHOICES,
    SCAN_METHOD_CHOICES,
    DIRECTION_CHOICES,
    ATTENDANCE_STATUS_CHOICES,
    ENROLLMENT_STATUS_CHOICES,
    ENROLLMENT_TYPE_CHOICES,
    USER_ROLE_CHOICES,
    GATE_PASS_STATUS_CHOICES,
    DAY_OF_WEEK_CHOICES,
)
from .institution import AcademicYear, SchoolProfile, ClassSchedule, GeofenceSetting, IoTKiosk
from .people import FacultyProfile, UserProfile, Student
from .structure import GradeLevel, Section, Enrollment, Subject, Schedule, ScheduleDay
from .attendance import FacultyGateLog, StudentGateLog, SubjectAttendanceLog, DailyAttendanceSummary
from .telemetry import FacultyHeartbeat, LoafingIncident, GatePass, SmsOutbox, AuditLog, FacultyMonthlyDTR

__all__ = [
    'AcademicYear',
    'SchoolProfile',
    'ClassSchedule',
    'GeofenceSetting',
    'IoTKiosk',
    'FacultyProfile',
    'UserProfile',
    'Student',
    'GradeLevel',
    'Section',
    'Enrollment',
    'Subject',
    'Schedule',
    'ScheduleDay',
    'FacultyGateLog',
    'StudentGateLog',
    'SubjectAttendanceLog',
    'DailyAttendanceSummary',
    'FacultyHeartbeat',
    'LoafingIncident',
    'GatePass',
    'SmsOutbox',
    'AuditLog',
    'FacultyMonthlyDTR',
    'SUFFIX_CHOICES',
    'SEX_CHOICES',
    'SCAN_METHOD_CHOICES',
    'DIRECTION_CHOICES',
    'ATTENDANCE_STATUS_CHOICES',
    'ENROLLMENT_STATUS_CHOICES',
    'ENROLLMENT_TYPE_CHOICES',
    'USER_ROLE_CHOICES',
    'GATE_PASS_STATUS_CHOICES',
    'DAY_OF_WEEK_CHOICES',
]
""")

# ===========================================================================
# 4. API SERIALIZERS
# ===========================================================================

write_file("apps/api/serializers/base.py", """
import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

def safe_photo_url(photo_field, request=None):
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('http://', 'https://', 'data:image/')):
                return val
            if val.startswith('/media/') and request:
                return request.build_absolute_uri(val)
            return val

        if hasattr(photo_field, 'name') and photo_field.name:
            val_name = str(photo_field.name).strip()
            if val_name.startswith(('data:image/', 'http://', 'https://')):
                return val_name
            url = photo_field.url
            if request:
                return request.build_absolute_uri(url)
            return url
    except Exception:
        return None
    return None

class FlexibleImageField(serializers.Field):
    def to_representation(self, value):
        request = self.context.get('request')
        return safe_photo_url(value, request)

    def to_internal_value(self, data):
        if data in (None, '', 'null'):
            return None

        if hasattr(data, 'read'):
            if data.size > MAX_IMAGE_SIZE_BYTES:
                raise serializers.ValidationError("Image file size exceeds the 5 MB limit.")
            return data

        if isinstance(data, str):
            clean = data.strip()
            if not clean or clean.lower() in ('none', 'null', 'undefined'):
                return None

            if clean.startswith('data:image') and ';base64,' in clean:
                try:
                    header, img_str = clean.split(';base64,', 1)
                    raw_ext = header.split('/')[-1].split(';')[0].lower()
                    ext = 'jpg' if raw_ext in ('jpeg', 'pjpeg') else raw_ext

                    if ext not in ALLOWED_IMAGE_EXTENSIONS:
                        raise serializers.ValidationError(
                            f"Unsupported image format (.{ext}). Allowed: PNG, JPG, WEBP."
                        )

                    decoded_data = base64.b64decode(img_str, validate=True)
                    if len(decoded_data) > MAX_IMAGE_SIZE_BYTES:
                        raise serializers.ValidationError("Decoded image exceeds the 5 MB limit.")

                    file_name = f"upload_{uuid.uuid4().hex[:12]}.{ext}"
                    return ContentFile(decoded_data, name=file_name)
                except serializers.ValidationError:
                    raise
                except Exception as exc:
                    raise serializers.ValidationError(f"Invalid Base64 image: {exc}")

            if clean.startswith(('http://', 'https://', '/media/')):
                raise serializers.SkipField()

        raise serializers.SkipField()
""")

write_file("apps/api/serializers/students.py", """
import secrets
from rest_framework import serializers
from apps.academics.models import Student, Section, Enrollment, AcademicYear
from .base import FlexibleImageField, safe_photo_url

class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    current_section = serializers.SerializerMethodField()
    section_id = serializers.SerializerMethodField()
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'lrn', 'first_name', 'middle_name', 'last_name', 'suffix',
            'full_name', 'sex', 'birthdate', 'mother_tongue', 'ethnic_group',
            'religion', 'house_street_sitio', 'barangay', 'municipality_city',
            'province', 'father_name', 'mother_maiden_name', 'guardian_name',
            'guardian_relationship', 'parent_contact', 'rfid_uid', 'qr_token',
            'photo', 'photo_url', 'current_section', 'section_id', 'is_active',
        ]
        extra_kwargs = {
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
            'parent_contact': {'required': False, 'allow_blank': True},
        }

    def validate_lrn(self, value):
        clean_lrn = value.strip()
        if not clean_lrn.isdigit():
            raise serializers.ValidationError("LRN must contain numbers only.")
        return clean_lrn

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip().upper()

    def get_full_name(self, obj):
        if hasattr(obj, 'full_name') and isinstance(obj.full_name, str):
            return obj.full_name
        mid = f" {obj.middle_name}" if getattr(obj, 'middle_name', None) else ""
        suf = f" {obj.suffix}" if getattr(obj, 'suffix', None) else ""
        return f"{obj.last_name}, {obj.first_name}{mid}{suf}".strip(" ,")

    def get_current_section(self, obj):
        enrollment = obj.enrollments.filter(academic_year__is_active=True).select_related('section', 'section__grade_level').first()
        if not enrollment:
            enrollment = obj.enrollments.select_related('section', 'section__grade_level').first()
        if enrollment and enrollment.section:
            sec_name = (enrollment.section.name or "").strip()
            grade_name = (enrollment.section.grade_level.name if enrollment.section.grade_level else "").strip()
            return f"{grade_name} - {sec_name}" if grade_name and sec_name and not grade_name.lower().endswith(sec_name.lower()) else (grade_name or sec_name)
        return "Unassigned"

    def get_section_id(self, obj):
        enrollment = obj.enrollments.filter(academic_year__is_active=True).first() or obj.enrollments.first()
        return enrollment.section_id if enrollment else None

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)

    def create(self, validated_data):
        if not validated_data.get('qr_token'):
            validated_data['qr_token'] = secrets.token_urlsafe(32)
        student = super().create(validated_data)
        req_data = self.context.get('request').data if self.context.get('request') else {}
        sec_id = req_data.get('section_id') or req_data.get('section')
        if sec_id and str(sec_id).isdigit():
            section = Section.objects.filter(id=int(sec_id)).first()
            if section:
                ay = section.academic_year or AcademicYear.objects.filter(is_active=True).first()
                if ay:
                    Enrollment.objects.update_or_create(
                        student=student, academic_year=ay, defaults={'section': section, 'status': 'ENROLLED'}
                    )
        return student
""")

write_file("apps/api/serializers/faculty.py", """
import secrets
from rest_framework import serializers
from apps.academics.models import FacultyProfile
from .base import FlexibleImageField, safe_photo_url

class FacultyDropdownSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            'id', 'employee_id', 'first_name', 'last_name', 'suffix',
            'full_name', 'department', 'position', 'can_teach', 'is_active', 'photo_url',
        ]

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)


class FacultyProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            'id', 'employee_id', 'first_name', 'middle_name', 'last_name', 'suffix',
            'full_name', 'email', 'contact_number', 'position', 'department',
            'can_teach', 'is_active', 'rfid_uid', 'qr_token', 'bound_device_id',
            'device_model', 'device_bound_at', 'photo', 'photo_url',
        ]
        extra_kwargs = {
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'bound_device_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
        }

    def validate_employee_id(self, value):
        return value.strip().upper()

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip().upper()

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)

    def create(self, validated_data):
        if not validated_data.get('qr_token'):
            validated_data['qr_token'] = secrets.token_urlsafe(32)
        if 'can_teach' not in validated_data:
            validated_data['can_teach'] = True
        return super().create(validated_data)
""")

write_file("apps/api/serializers/academics.py", """
from rest_framework import serializers
from apps.academics.models import Subject, Schedule

class SubjectSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='title', required=False)

    class Meta:
        model = Subject
        fields = ['id', 'code', 'title', 'name', 'units']


class ScheduleSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source='section.name', read_only=True)
    subject_title = serializers.CharField(source='subject.title', read_only=True)
    subject_code = serializers.CharField(source='subject.code', read_only=True)
    faculty_name = serializers.SerializerMethodField()
    days_of_week = serializers.SerializerMethodField()
    schedule_code = serializers.SerializerMethodField()

    class Meta:
        model = Schedule
        fields = [
            'id', 'schedule_code', 'section', 'section_id', 'section_name',
            'subject', 'subject_id', 'subject_title', 'subject_code',
            'faculty', 'faculty_id', 'faculty_name', 'room_number',
            'days_of_week', 'start_time', 'end_time',
        ]

    def get_schedule_code(self, obj):
        return f"SCH-{obj.id:04d}"

    def get_faculty_name(self, obj):
        return obj.faculty.full_name if obj.faculty else "Unassigned"

    def get_days_of_week(self, obj):
        days_qs = obj.days.all().order_by('day_of_week')
        if not days_qs.exists():
            return "MON-FRI"
        nums = [d.day_of_week for d in days_qs]
        if nums == [1, 2, 3, 4, 5]: return "MON-FRI"
        if nums == [1, 3, 5]: return "MWF"
        if nums == [2, 4]: return "TTH"
        if nums == [6]: return "SAT"
        day_labels = {1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT', 7: 'SUN'}
        return ",".join([day_labels.get(n, str(n)) for n in nums])
""")

write_file("apps/api/serializers/hardware.py", """
from rest_framework import serializers
from django.utils import timezone
from apps.academics.models import IoTKiosk, GatePass, SmsOutbox

class IoTKioskSerializer(serializers.ModelSerializer):
    secret_hash = serializers.CharField(write_only=True, required=False, allow_blank=True)
    is_online = serializers.SerializerMethodField()

    class Meta:
        model = IoTKiosk
        fields = [
            'id', 'kiosk_code', 'terminal_name', 'location', 'secret_hash',
            'is_active', 'is_online', 'last_ping',
        ]

    def get_is_online(self, obj):
        if not obj.is_active or not obj.last_ping:
            return False
        return (timezone.now() - obj.last_ping).total_seconds() < 180


class GatePassSerializer(serializers.ModelSerializer):
    faculty_name = serializers.SerializerMethodField()
    student_name = serializers.SerializerMethodField()
    valid_until = serializers.DateTimeField(source='valid_to', read_only=True)

    class Meta:
        model = GatePass
        fields = [
            'id', 'pass_number', 'faculty', 'faculty_name', 'student',
            'student_name', 'issued_by', 'pass_type', 'reason',
            'valid_from', 'valid_to', 'valid_until', 'status',
        ]
        extra_kwargs = {'pass_number': {'required': False, 'allow_blank': True}}

    def get_faculty_name(self, obj):
        return obj.faculty.full_name if obj.faculty else ""

    def get_student_name(self, obj):
        return obj.student.full_name if obj.student else ""


class SmsOutboxSerializer(serializers.ModelSerializer):
    class Meta:
        model = SmsOutbox
        fields = [
            'id', 'recipient_name', 'recipient_number', 'message_body',
            'trigger_event', 'category', 'priority', 'status',
            'error_message', 'retry_count', 'created_at', 'sent_at',
        ]


class GateScanSerializer(serializers.Serializer):
    raw_identifier = serializers.CharField(max_length=128)
    scan_method = serializers.ChoiceField(choices=['RFID', 'QR'], default='RFID', required=False)
    kiosk_code = serializers.CharField(max_length=64)
    secret_key = serializers.CharField(max_length=256)
    direction = serializers.ChoiceField(choices=['IN', 'OUT'], required=False, allow_null=True, allow_blank=True)
    enforce_student_only = serializers.BooleanField(default=False, required=False)


class SingleClassroomScanItemSerializer(serializers.Serializer):
    qr_token = serializers.CharField(max_length=128)
    status = serializers.ChoiceField(
        choices=['PRESENT', 'LATE', 'ABSENT', 'EXCUSED', 'CUTTING', 'UNVERIFIED'],
        default='PRESENT', required=False,
    )


class ClassroomBatchScanSerializer(serializers.Serializer):
    schedule_id = serializers.IntegerField()
    scans = SingleClassroomScanItemSerializer(many=True)


class TelemetryHeartbeatSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    battery_level = serializers.IntegerField(min_value=0, max_value=100, default=100, required=False)
    is_mock_location = serializers.BooleanField(default=False, required=False)
    client_device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
""")

write_file("apps/api/serializers/users.py", """
import secrets
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from apps.academics.models import SchoolProfile, UserProfile, FacultyProfile
from .base import FlexibleImageField, safe_photo_url

User = get_user_model()

class SchoolProfileSerializer(serializers.ModelSerializer):
    left_logo = FlexibleImageField(required=False, allow_null=True)
    right_logo = FlexibleImageField(required=False, allow_null=True)
    school_logo = FlexibleImageField(required=False, allow_null=True)

    class Meta:
        model = SchoolProfile
        fields = '__all__'


class UserManagementSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    current_role = serializers.SerializerMethodField()
    is_teaching = serializers.SerializerMethodField()
    can_teach = serializers.SerializerMethodField()
    is_profile_completed = serializers.SerializerMethodField()
    faculty_id = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'role',
            'current_role', 'is_teaching', 'can_teach', 'is_profile_completed',
            'faculty_id', 'photo', 'photo_url', 'is_active', 'is_staff',
            'is_superuser', 'password',
        ]

    def _get_profile(self, obj):
        return getattr(obj, 'profile', None) or getattr(obj, 'userprofile', None)

    def get_role(self, obj):
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'role', None):
            return str(prof.role).upper()
        return 'ADMIN' if obj.is_superuser else 'FACULTY'

    def get_current_role(self, obj):
        role = self.get_role(obj)
        return 'FACULTY_ADMIN' if role == 'ADMIN' and self.get_is_teaching(obj) else role

    def get_is_teaching(self, obj):
        prof = self._get_profile(obj)
        return bool(prof.is_teaching) if prof and hasattr(prof, 'is_teaching') else (self.get_role(obj) == 'FACULTY')

    def get_can_teach(self, obj):
        return self.get_is_teaching(obj)

    def get_is_profile_completed(self, obj):
        prof = self._get_profile(obj)
        return bool(prof.is_profile_completed) if prof and hasattr(prof, 'is_profile_completed') else bool(obj.first_name and obj.last_name)

    def get_faculty_id(self, obj):
        prof = self._get_profile(obj)
        return getattr(prof, 'faculty_id', None) if prof else None

    def get_photo(self, obj):
        return self.get_photo_url(obj)

    def get_photo_url(self, obj):
        request = self.context.get('request')
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'faculty', None) and prof.faculty.photo:
            return safe_photo_url(prof.faculty.photo, request)
        if prof and getattr(prof, 'avatar', None):
            return safe_photo_url(prof.avatar, request)
        return None
""")

write_file("apps/api/serializers/__init__.py", """
from .base import safe_photo_url, FlexibleImageField, MAX_IMAGE_SIZE_BYTES, ALLOWED_IMAGE_EXTENSIONS
from .students import StudentSerializer
from .faculty import FacultyProfileSerializer, FacultyDropdownSerializer
from .academics import SubjectSerializer, ScheduleSerializer
from .hardware import (
    IoTKioskSerializer, GatePassSerializer, SmsOutboxSerializer,
    GateScanSerializer, SingleClassroomScanItemSerializer,
    ClassroomBatchScanSerializer, TelemetryHeartbeatSerializer,
)
from .users import SchoolProfileSerializer, UserManagementSerializer

__all__ = [
    'safe_photo_url', 'FlexibleImageField', 'MAX_IMAGE_SIZE_BYTES', 'ALLOWED_IMAGE_EXTENSIONS',
    'StudentSerializer', 'FacultyProfileSerializer', 'FacultyDropdownSerializer',
    'SubjectSerializer', 'ScheduleSerializer', 'IoTKioskSerializer',
    'GatePassSerializer', 'SmsOutboxSerializer', 'GateScanSerializer',
    'SingleClassroomScanItemSerializer', 'ClassroomBatchScanSerializer',
    'TelemetryHeartbeatSerializer', 'SchoolProfileSerializer', 'UserManagementSerializer',
]
""")

# ===========================================================================
# 5. API VIEWS
# ===========================================================================

write_file("apps/api/views/common.py", """
import base64
import hashlib
import os
import logging
from django.conf import settings
from django.db.models import Q
from rest_framework import permissions
from apps.academics.models import UserProfile, FacultyProfile, Section, Schedule, Enrollment

logger = logging.getLogger(__name__)

def safe_photo_url(photo_field, request=None):
    if not photo_field:
        return None
    try:
        if isinstance(photo_field, str):
            val = photo_field.strip()
            if not val or val.lower() in ('none', 'null', 'undefined'):
                return None
            if val.startswith(('http://', 'https://', 'data:image/')):
                return val
            if val.startswith('/media/') and request:
                return request.build_absolute_uri(val)
            return val
        if hasattr(photo_field, 'name') and photo_field.name:
            val_name = str(photo_field.name).strip()
            if val_name.startswith(('data:image/', 'http://', 'https://')):
                return val_name
            url = photo_field.url
            return request.build_absolute_uri(url) if request else url
    except Exception:
        return None
    return None

def resolve_logo_field(val, request=None):
    if not val:
        return None
    val_str = str(val).strip()
    if not val_str or val_str.lower() in ('none', 'null', 'undefined'):
        return None
    if val_str.startswith(('http://', 'https://', '/media/')):
        if val_str.startswith('/media/') and request:
            return request.build_absolute_uri(val_str)
        return val_str

    if val_str.startswith('data:image/') or val_str.startswith(('/9j/', 'iVBORw0KGgo')):
        try:
            if ';base64,' in val_str:
                format_part, img_str = val_str.split(';base64,')
                ext = 'jpg' if 'jpeg' in format_part or 'pjpeg' in format_part else format_part.split('/')[-1].split(';')[0].lower()
            else:
                img_str, ext = val_str, 'png'

            decoded_bytes = base64.b64decode(img_str, validate=True)
            if len(decoded_bytes) <= 10 * 1024 * 1024:
                file_hash = hashlib.md5(decoded_bytes).hexdigest()[:12]
                filename = f"logo_{file_hash}.{ext}"
                target_dir = os.path.join(settings.MEDIA_ROOT, 'school_logos')
                os.makedirs(target_dir, exist_ok=True)
                target_path = os.path.join(target_dir, filename)

                if not os.path.exists(target_path):
                    with open(target_path, 'wb') as f:
                        f.write(decoded_bytes)

                media_url = f"{settings.MEDIA_URL}school_logos/{filename}"
                return request.build_absolute_uri(media_url) if request else media_url
        except Exception as e:
            logger.error("Failed to decode logo to disk: %s", e)
    return val_str

def format_full_student_name(st):
    if not st:
        return ""
    if hasattr(st, 'full_name') and isinstance(st.full_name, str):
        return st.full_name
    mid = f" {st.middle_name}" if getattr(st, 'middle_name', None) else ""
    suf = f" {st.suffix}" if getattr(st, 'suffix', None) else ""
    return f"{st.last_name}, {st.first_name}{mid}{suf}".strip(" ,")

def format_deduped_section_label(grade_name, section_name):
    g = str(grade_name or '').strip()
    s = str(section_name or '').strip()
    if not g: return s
    if not s or g.lower().endswith(s.lower()) or f"- {s.lower()}" in g.lower():
        return g
    return f"{g} - {s}"

def get_user_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'ADMIN'
    profile = getattr(user, 'profile', None) or getattr(user, 'userprofile', None)
    if profile and hasattr(profile, 'role') and profile.role:
        return str(profile.role).upper()
    return 'FACULTY'

def is_regular_teacher(role):
    return str(role or '').upper() in ['TEACHER', 'FACULTY']

def is_leadership_role(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    return get_user_role(user) in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']

def resolve_faculty_for_user(user):
    if not user or not user.is_authenticated:
        return None
    user_prof, _ = UserProfile.objects.get_or_create(user=user)
    faculty = getattr(user_prof, 'faculty', None) or getattr(user, 'facultyprofile', None)
    if not faculty and user.email:
        faculty = FacultyProfile.objects.filter(email__iexact=user.email, is_active=True).first()
    if not faculty and user.first_name and user.last_name:
        faculty = FacultyProfile.objects.filter(first_name__iexact=user.first_name, last_name__iexact=user.last_name, is_active=True).first()
    if not faculty:
        faculty = FacultyProfile.objects.filter(Q(employee_id__iexact=user.username) | Q(qr_token__iexact=user.username), is_active=True).first()
    if not faculty:
        faculty, _ = FacultyProfile.objects.get_or_create(
            employee_id=str(user.username).strip().upper(),
            defaults={'first_name': user.first_name or user.username.capitalize(), 'last_name': user.last_name or 'Faculty', 'email': user.email or '', 'position': 'Teacher', 'department': 'Academic Department', 'is_active': True, 'can_teach': True}
        )
    return faculty

def get_teacher_section_ids(faculty) -> set:
    if not faculty:
        return set()
    advised = set(Section.objects.filter(adviser=faculty).values_list('id', flat=True))
    scheduled = set(Schedule.objects.filter(faculty=faculty).exclude(section__isnull=True).values_list('section_id', flat=True))
    return advised.union(scheduled)

def get_teacher_student_ids(faculty) -> set:
    sec_ids = get_teacher_section_ids(faculty)
    if not sec_ids:
        return set()
    return set(Enrollment.objects.filter(section_id__in=sec_ids, status__in=['ENROLLED', 'ACTIVE']).values_list('student_id', flat=True).distinct())

class IsSystemAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and get_user_role(request.user) == 'ADMIN')

class IsAcademicManagerPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        return role in (['ADMIN', 'PRINCIPAL'] if request.method == 'DELETE' else ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD'])

class IsAdviserOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if is_leadership_role(request.user):
            return True
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return False
        if getattr(obj, 'adviser_id', None) == faculty.id:
            return True
        return Schedule.objects.filter(section=obj, faculty=faculty).exists()
""")

write_file("apps/api/views/auth.py", """
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from rest_framework.throttling import AnonRateThrottle
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.academics.models import SchoolProfile, Schedule
from .common import resolve_faculty_for_user, get_user_role, safe_photo_url, is_regular_teacher

User = get_user_model()

class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'

def build_authenticated_user_payload(user, request=None):
    faculty = resolve_faculty_for_user(user)
    school = SchoolProfile.objects.first()
    profile = getattr(user, 'profile', None)
    assigned_role = get_user_role(user)

    emp_id = getattr(faculty, 'employee_id', user.username) if faculty else user.username
    first_name = (getattr(faculty, 'first_name', '') or user.first_name or '').strip()
    middle_name = (getattr(faculty, 'middle_name', '') or '').strip()
    last_name = (getattr(faculty, 'last_name', '') or user.last_name or '').strip()
    full_name = getattr(faculty, 'full_name', '') if faculty else " ".join(filter(None, [first_name, middle_name, last_name])).strip() or user.username

    photo_url = safe_photo_url(faculty.photo, request) if (faculty and faculty.photo) else None
    teaching_class_count = Schedule.objects.filter(faculty=faculty).count() if faculty else 0
    can_teach = bool(getattr(faculty, 'can_teach', True)) and bool(getattr(profile, 'is_teaching', True))

    return {
        'id': user.id,
        'username': user.username,
        'first_name': first_name,
        'middle_name': middle_name,
        'last_name': last_name,
        'full_name': full_name,
        'faculty_name': full_name,
        'faculty_id': emp_id,
        'faculty_pk': getattr(faculty, 'id', None),
        'email': getattr(faculty, 'email', '') or user.email or '',
        'contact_number': getattr(faculty, 'contact_number', '') if faculty else '',
        'position': getattr(faculty, 'position', '') if faculty else '',
        'department': getattr(faculty, 'department', '') if faculty else '',
        'rfid_uid': getattr(faculty, 'rfid_uid', '') if faculty else '',
        'photo': photo_url,
        'photo_url': photo_url,
        'school_name': getattr(school, 'school_name', '') if school else '',
        'role': assigned_role,
        'system_role': assigned_role,
        'is_profile_completed': bool(profile and getattr(profile, 'is_profile_completed', True)),
        'can_teach': can_teach,
        'is_teaching': can_teach or (teaching_class_count > 0) or is_regular_teacher(assigned_role),
        'assigned_class_count': teaching_class_count,
        'is_superuser': user.is_superuser,
    }

class DatabaseLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginRateThrottle]

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = str(request.data.get('password', '')).strip()

        if not username or not password:
            return Response({'error': 'Username and password are required.'}, status=status.HTTP_400_BAD_REQUEST)

        existing_user = User.objects.filter(username__iexact=username).first()
        profile = getattr(existing_user, 'profile', None) if existing_user else None

        if profile and hasattr(profile, 'is_locked') and profile.is_locked():
            return Response({'error': 'Account locked due to excessive failed attempts. Try again in 15 minutes.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user = authenticate(request=request, username=username, password=password)
        if user is None:
            if profile and hasattr(profile, 'record_failed_attempt'):
                profile.record_failed_attempt()
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response({'error': 'Account is inactive. Contact school admin.'}, status=status.HTTP_403_FORBIDDEN)

        if profile and hasattr(profile, 'reset_failed_attempts'):
            profile.reset_failed_attempts()

        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user': build_authenticated_user_payload(user, request)}, status=status.HTTP_200_OK)

LoginAPIView = DatabaseLoginView

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_authenticated_user_payload(request.user, request), status=status.HTTP_200_OK)

    def put(self, request):
        user = request.user
        data = request.data
        faculty = resolve_faculty_for_user(user)

        if 'first_name' in data: user.first_name = str(data.get('first_name', '')).strip()
        if 'last_name' in data: user.last_name = str(data.get('last_name', '')).strip()
        if 'email' in data: user.email = str(data.get('email', '')).strip()

        new_password = data.get('password')
        if new_password:
            clean_pw = str(new_password).strip()
            if len(clean_pw) < 8:
                return Response({'error': 'Password must be at least 8 characters long.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                validate_password(clean_pw, user=user)
            except DjangoValidationError as exc:
                return Response({'error': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(clean_pw)

        user.save()

        if faculty:
            faculty.first_name = user.first_name
            faculty.last_name = user.last_name
            faculty.email = user.email
            faculty.save()

        return Response(build_authenticated_user_payload(user, request), status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)

CurrentUserProfileView = CurrentUserView

class LiveFieldValidationAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        field = request.data.get('field')
        val = str(request.data.get('value', '')).strip()
        exclude_id = request.data.get('exclude_id')

        is_taken = False
        if field == 'username':
            qs = User.objects.filter(username__iexact=val)
            if exclude_id: qs = qs.exclude(id=exclude_id)
            is_taken = qs.exists()
        elif field == 'email' and val:
            qs = User.objects.filter(email__iexact=val)
            if exclude_id: qs = qs.exclude(id=exclude_id)
            is_taken = qs.exists()

        return Response({'valid': not is_taken, 'is_taken': is_taken}, status=status.HTTP_200_OK)

class RegisterPushTokenAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get('push_token')
        if not token:
            return Response({'error': 'Push token required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True}, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/dashboard.py", """
import time as time_module
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from apps.academics.models import (
    Student, StudentGateLog, FacultyProfile, FacultyGateLog,
    IoTKiosk, GradeLevel, Enrollment, SmsOutbox,
)
from .common import (
    get_user_role, is_regular_teacher, resolve_faculty_for_user,
    get_teacher_student_ids, get_teacher_section_ids,
    format_full_student_name, format_deduped_section_label, safe_photo_url,
)

class DashboardOverviewAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        query_start = time_module.perf_counter()
        today = timezone.localdate()
        user_role = get_user_role(request.user)
        is_teacher_only = is_regular_teacher(user_role) and not request.user.is_superuser

        if is_teacher_only:
            user_faculty = resolve_faculty_for_user(request.user)
            assigned_student_ids = get_teacher_student_ids(user_faculty)
            assigned_section_ids = get_teacher_section_ids(user_faculty)
            total_students = len(assigned_student_ids)

            gate_logs_today = list(
                StudentGateLog.objects.filter(
                    scan_time__date=today,
                    student_id__in=assigned_student_ids
                ).values('student_id', 'direction', 'scan_time__hour')
            )
            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}
            students_on_campus = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0

            recent_logs = StudentGateLog.objects.filter(
                student_id__in=assigned_student_ids
            ).select_related('student').order_by('-scan_time')[:6]
            total_faculty, present_faculty = 1, (1 if FacultyGateLog.objects.filter(scan_time__date=today, direction='IN', faculty=user_faculty).exists() else 0)
            sms_sent, sms_pending, sms_failed = 0, 0, 0
        else:
            total_students = Student.objects.filter(is_active=True).count()
            gate_logs_today = list(
                StudentGateLog.objects.filter(scan_time__date=today).values('student_id', 'direction', 'scan_time__hour')
            )
            gate_in_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'IN'}
            gate_out_ids = {l['student_id'] for l in gate_logs_today if l['direction'] == 'OUT'}
            students_on_campus = len(gate_in_ids - gate_out_ids)
            absent_students = max(0, total_students - len(gate_in_ids))
            attendance_rate = round((len(gate_in_ids) / total_students * 100), 1) if total_students > 0 else 0

            total_faculty = FacultyProfile.objects.filter(is_active=True).count()
            present_faculty = FacultyGateLog.objects.filter(scan_time__date=today, direction='IN').values_list('faculty_id', flat=True).distinct().count()

            recent_logs = StudentGateLog.objects.select_related('student').order_by('-scan_time')[:6]
            try:
                sms_sent = SmsOutbox.objects.filter(status='SENT', created_at__date=today).count()
                sms_pending = SmsOutbox.objects.filter(status='PENDING').count()
                sms_failed = SmsOutbox.objects.filter(status='FAILED', created_at__date=today).count()
            except Exception:
                sms_sent, sms_pending, sms_failed = 0, 0, 0

        hour_counts = {h: 0 for h in range(6, 18)}
        for l in gate_logs_today:
            h = l.get('scan_time__hour')
            if h in hour_counts:
                hour_counts[h] += 1
        max_hour = max(hour_counts.values() or [1])
        hourly_scans = [
            {'hour': f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}", 'count': count, 'height': round((count / max_hour * 100)) if max_hour else 0, 'is_peak': count == max_hour and count > 0}
            for h, count in hour_counts.items()
        ]

        recent_scans_data = []
        for log in recent_logs:
            enr = Enrollment.objects.filter(student=log.student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = format_deduped_section_label(enr.section.grade_level.code if enr and enr.section and enr.section.grade_level else "", enr.section.name if enr and enr.section else "")
            recent_scans_data.append({
                'id': log.id,
                'person_name': format_full_student_name(log.student),
                'photo_url': safe_photo_url(log.student.photo, request),
                'direction': log.direction,
                'grade_section': section_label,
                'scan_time': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'scan_method': log.scan_method,
            })

        return Response({
            'total_students': total_students,
            'students_present': len(gate_in_ids),
            'students_on_campus': students_on_campus,
            'students_absent': absent_students,
            'attendance_rate': attendance_rate,
            'faculty_on_duty': present_faculty,
            'total_faculty': total_faculty,
            'gate_scans_today': len(gate_logs_today),
            'sms_sent_today': sms_sent,
            'sms_pending_count': sms_pending,
            'sms_failed_count': sms_failed,
            'kiosks_online': IoTKiosk.objects.filter(is_active=True, last_ping__gte=timezone.now() - timedelta(minutes=10)).count(),
            'total_kiosks': IoTKiosk.objects.count(),
            'hourly_scans': hourly_scans,
            'recent_scans': recent_scans_data,
            'analytics': {'average_latency_ms': max(1, round((time_module.perf_counter() - query_start) * 1000))},
            'database': {'status': 'CONNECTED', 'database_name': settings.DATABASES['default']['NAME']},
        })
""")

write_file("apps/api/views/reports.py", """
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import Section, SchoolProfile, FacultyProfile, FacultyMonthlyDTR
from apps.academics.services.sf1_service import get_sf1_data
from apps.academics.services.sf2_service import generate_sf2_data
from apps.academics.services.sf4_service import generate_sf4_data
from .common import is_leadership_role, resolve_faculty_for_user, resolve_logo_field

class DepEdSF1DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, section_id):
        try:
            data = get_sf1_data(section_id, school_year=request.query_params.get('school_year'))
            if data.get('left_logo'): data['left_logo'] = resolve_logo_field(data['left_logo'], request)
            if data.get('right_logo'): data['right_logo'] = resolve_logo_field(data['right_logo'], request)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DepEdSF2DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, section_id):
        m = request.query_params.get('month', 'October')
        y = request.query_params.get('year', 2026)
        try:
            data = generate_sf2_data(section_id, month_name=m, year=y)
            if data.get('left_logo'): data['left_logo'] = resolve_logo_field(data['left_logo'], request)
            if data.get('right_logo'): data['right_logo'] = resolve_logo_field(data['right_logo'], request)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DepEdSF4DataAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        m = request.query_params.get('month', 'October')
        y = request.query_params.get('year', 2026)
        sy = request.query_params.get('school_year', '')
        try:
            data = generate_sf4_data(month_name=m, year=y, school_year=sy)
            if data.get('left_logo'): data['left_logo'] = resolve_logo_field(data['left_logo'], request)
            if data.get('right_logo'): data['right_logo'] = resolve_logo_field(data['right_logo'], request)
            return Response(data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class DTRListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, faculty_id=None):
        user = request.user
        target_faculty = None
        if is_leadership_role(user) and faculty_id:
            target_faculty = FacultyProfile.objects.filter(id=faculty_id).first()
        if not target_faculty:
            target_faculty = resolve_faculty_for_user(user)

        if not target_faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        month = int(request.query_params.get('month', 10))
        year = int(request.query_params.get('year', 2026))

        school = SchoolProfile.objects.first()
        dtr_rec = FacultyMonthlyDTR.objects.filter(faculty=target_faculty, month=month, year=year).first()

        rows = [{
            'day': day,
            'am_arrival': '', 'am_departure': '',
            'pm_arrival': '', 'pm_departure': '',
            'undertime_hours': '', 'undertime_minutes': '',
            'is_weekend': False, 'is_loafing': False,
        } for day in range(1, 32)]

        return Response({
            'faculty_id': target_faculty.id,
            'faculty_name': target_faculty.full_name,
            'employee_id': target_faculty.employee_id,
            'month': 'October',
            'month_number': month,
            'year': year,
            'regular_days_hours': dtr_rec.regular_hours if dtr_rec else '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM',
            'saturdays_hours': dtr_rec.saturday_hours if dtr_rec else 'As Required',
            'school_head': str(school.principal_name or '').upper() if school else '',
            'dtr_submitted': dtr_rec.is_submitted if dtr_rec else False,
            'dept_head_approved': dtr_rec.is_dept_head_approved if dtr_rec else False,
            'rows': rows,
            'total_undertime_hours': 0,
            'total_undertime_minutes': 0,
            'days_present': 0,
        }, status=status.HTTP_200_OK)

    def post(self, request, faculty_id=None):
        action = request.data.get('action')
        month = int(request.data.get('month', 10))
        year = int(request.data.get('year', 2026))

        target_faculty = FacultyProfile.objects.filter(id=faculty_id).first() if faculty_id else resolve_faculty_for_user(request.user)
        if not target_faculty:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        dtr, _ = FacultyMonthlyDTR.objects.get_or_create(faculty=target_faculty, month=month, year=year)
        if action == 'SUBMIT_DTR':
            dtr.is_submitted = True
            dtr.save()
            return Response({'success': True, 'message': 'DTR submitted.'}, status=status.HTTP_200_OK)
        elif action == 'APPROVE_DEPT_HEAD' and is_leadership_role(request.user):
            dtr.is_dept_head_approved = True
            dtr.save()
            return Response({'success': True, 'message': 'DTR approved.'}, status=status.HTTP_200_OK)
        return Response({'success': True}, status=status.HTTP_200_OK)

class UnifiedReportExportAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        return self._handle(request, request.data)

    def get(self, request):
        return self._handle(request, request.query_params)

    def _handle(self, request, params):
        rep = params.get('report_type', 'REPORT')
        sec = params.get('section_id')
        m = params.get('month', 'October')
        y = params.get('year', 2026)
        title = f"AttendSure_{rep}_Report_{m}_{y}"
        html = f"<html><body><h2>Official {rep} Document</h2><p>Section: {sec or 'N/A'}</p></body></html>"
        return Response({'title': title, 'html': html, 'status': 'ready'}, status=status.HTTP_200_OK)

class UnifiedReportPrintAPIView(UnifiedReportExportAPIView):
    pass

class ReportAuditLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request): return Response({'success': True}, status=status.HTTP_201_CREATED)
    def get(self, request): return Response([], status=status.HTTP_200_OK)
""")

write_file("apps/api/views/sections.py", """
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.academics.models import Section, AcademicYear, GradeLevel, FacultyProfile
from .common import (
    IsAcademicManagerPermission, get_user_role, is_regular_teacher,
    resolve_faculty_for_user, get_teacher_section_ids, format_deduped_section_label
)

class SectionListAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request):
        user_role = get_user_role(request.user)
        sections = Section.objects.select_related('grade_level', 'academic_year', 'adviser').filter(academic_year__is_active=True).order_by('grade_level__level_order', 'name')
        if not sections.exists():
            sections = Section.objects.select_related('grade_level', 'academic_year', 'adviser').all().order_by('grade_level__level_order', 'name')

        if is_regular_teacher(user_role) and not request.user.is_superuser:
            faculty = resolve_faculty_for_user(request.user)
            sections = sections.filter(id__in=get_teacher_section_ids(faculty))

        data = [{
            'id': s.id, 'name': s.name, 'grade_level': s.grade_level.name if s.grade_level else '',
            'grade_level_id': s.grade_level_id, 'academic_year': s.academic_year.code if s.academic_year else '',
            'adviser_name': s.adviser.full_name if s.adviser else "", 'adviser_id': s.adviser_id,
            'room_number': s.room_number, 'capacity': s.capacity,
            'display_label': format_deduped_section_label(s.grade_level.name if s.grade_level else '', s.name),
        } for s in sections]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        data = request.data
        name = str(data.get('name', '')).strip()
        grade_id = data.get('grade_level_id') or data.get('grade_level')
        if not name or not grade_id:
            return Response({'error': 'Name and Grade Level required.'}, status=status.HTTP_400_BAD_REQUEST)

        ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        gl = GradeLevel.objects.filter(id=grade_id).first()
        adv_id = data.get('adviser_id')
        adv = FacultyProfile.objects.filter(id=adv_id).first() if adv_id else None

        sec = Section.objects.create(name=name, grade_level=gl, academic_year=ay, adviser=adv, room_number=data.get('room_number', ''))
        return Response({'id': sec.id, 'name': sec.name}, status=status.HTTP_201_CREATED)

class SectionDetailAPIView(APIView):
    permission_classes = [IsAcademicManagerPermission]

    def get(self, request, pk):
        sec = Section.objects.select_related('grade_level', 'academic_year', 'adviser').filter(pk=pk).first()
        if not sec:
            return Response({'error': 'Section not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'id': sec.id, 'name': sec.name, 'grade_level': sec.grade_level.name if sec.grade_level else '',
            'adviser_name': sec.adviser.full_name if sec.adviser else ''
        }, status=status.HTTP_200_OK)

    def delete(self, request, pk):
        Section.objects.filter(pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
""")

write_file("apps/api/views/gate.py", """
import hmac
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import IoTKiosk, FacultyProfile, Student, FacultyGateLog, StudentGateLog, DailyAttendanceSummary
from .common import get_user_role, is_regular_teacher, resolve_faculty_for_user, get_teacher_student_ids, format_full_student_name
from apps.api.serializers import GateScanSerializer

class GateScanAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = GateScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        raw_id = data['raw_identifier']
        kiosk = IoTKiosk.objects.filter(kiosk_code=data['kiosk_code'], is_active=True).first()
        if not kiosk:
            return Response({'error': 'Kiosk invalid.'}, status=status.HTTP_403_FORBIDDEN)

        is_valid = kiosk.verify_secret(data['secret_key']) if hasattr(kiosk, 'verify_secret') else hmac.compare_digest(kiosk.secret_hash, data['secret_key'])
        if not is_valid:
            return Response({'error': 'Terminal auth failed.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        faculty = FacultyProfile.objects.filter(rfid_uid__iexact=raw_id, is_active=True).first()
        if faculty:
            rec = FacultyGateLog.objects.filter(faculty=faculty, scan_time__date=now.date()).order_by('-scan_time').first()
            dir_val = 'OUT' if rec and rec.direction == 'IN' else 'IN'
            FacultyGateLog.objects.create(faculty=faculty, kiosk=kiosk, scan_time=now, direction=dir_val, raw_identifier=raw_id)
            kiosk.last_ping = now
            kiosk.save(update_fields=['last_ping'])
            return Response({'success': True, 'person_type': 'STAFF', 'name': faculty.full_name, 'direction': dir_val}, status=status.HTTP_201_CREATED)

        student = Student.objects.filter(rfid_uid__iexact=raw_id, is_active=True).first()
        if student:
            rec = StudentGateLog.objects.filter(student=student, scan_time__date=now.date()).order_by('-scan_time').first()
            dir_val = 'OUT' if rec and rec.direction == 'IN' else 'IN'
            StudentGateLog.objects.create(student=student, kiosk=kiosk, scan_time=now, direction=dir_val, raw_identifier=raw_id)
            if dir_val == 'IN':
                enr = student.enrollments.filter(academic_year__is_active=True).first()
                if enr:
                    DailyAttendanceSummary.objects.update_or_create(student=student, attendance_date=now.date(), defaults={'section': enr.section, 'status': 'PRESENT', 'remarks': 'GATE_TAP'})
            kiosk.last_ping = now
            kiosk.save(update_fields=['last_ping'])
            return Response({'success': True, 'person_type': 'STUDENT', 'name': format_full_student_name(student), 'direction': dir_val}, status=status.HTTP_201_CREATED)

        return Response({'error': 'Badge not registered.'}, status=status.HTTP_404_NOT_FOUND)

class GateLogsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        faculty = resolve_faculty_for_user(request.user)
        is_teacher = is_regular_teacher(user_role) and not request.user.is_superuser

        stu_qs = StudentGateLog.objects.select_related('student', 'kiosk').order_by('-scan_time')
        if is_teacher:
            stu_qs = stu_qs.filter(student_id__in=get_teacher_student_ids(faculty))[:100]
        else:
            stu_qs = stu_qs[:100]

        logs = [{
            'log_id': f"GL-STU-{l.id}", 'person_type': 'STUDENT', 'identifier': l.student.lrn,
            'name': format_full_student_name(l.student), 'direction': l.direction,
            'scan_time': l.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'), 'raw_time': l.scan_time.isoformat()
        } for l in stu_qs]
        return Response(logs, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/geofence.py", """
import math
from datetime import timedelta
from django.utils import timezone
from django.core.cache import cache
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import SchoolProfile, FacultyProfile, FacultyGateLog

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    return R * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)))

class GeofenceStatusAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude else 8.485800
        campus_lng = float(school.longitude) if school and school.longitude else 124.656700
        allowed_radius = int(school.geofence_radius_meters) if school and hasattr(school, 'geofence_radius_meters') and school.geofence_radius_meters else 150

        faculty_members = FacultyProfile.objects.filter(is_active=True)
        faculty_roster = []
        for f in faculty_members:
            faculty_roster.append({
                'id': f.id,
                'faculty_name': f.full_name,
                'employee_id': f.employee_id,
                'status': 'VERIFIED_INSIDE',
                'distance': 'On Campus',
                'battery': '100%',
                'last_seen': 'Recently Active',
            })

        return Response({
            'zone_id': getattr(school, 'school_id', 'ZONE-01'),
            'name': getattr(school, 'school_name', 'Campus Perimeter'),
            'latitude': campus_lat,
            'longitude': campus_lng,
            'radius_meters': allowed_radius,
            'is_configured': True,
            'verified_inside': len(faculty_roster),
            'faculty_roster': faculty_roster,
        }, status=status.HTTP_200_OK)

class GeofenceCheckInAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request):
        return Response({'success': True, 'status': 'VERIFIED_INSIDE', 'message': 'Presence verified.'}, status=status.HTTP_200_OK)

class FacultyDeviceResetAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def post(self, request, pk):
        FacultyProfile.objects.filter(pk=pk).update(bound_device_id=None)
        return Response({'success': True, 'message': 'Device lock reset.'}, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/sms.py", """
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.academics.models import SmsOutbox

class PendingSmsDispatchAPIView(APIView):
    def get(self, request):
        pending = SmsOutbox.objects.filter(status='PENDING').order_by('priority', 'created_at')[:20]
        return Response([{'id': s.id, 'to': s.recipient_number, 'msg': s.message_body} for s in pending], status=status.HTTP_200_OK)

class BulkSmsStatusAPIView(APIView):
    def post(self, request):
        results = request.data.get('results', [])
        for r in results:
            SmsOutbox.objects.filter(id=r.get('id')).update(status=r.get('status', 'SENT'))
        return Response({'success': True}, status=status.HTTP_200_OK)

class MarkSmsStatusAPIView(APIView):
    def post(self, request, pk):
        SmsOutbox.objects.filter(id=pk).update(status=request.data.get('status', 'SENT'))
        return Response({'success': True}, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/classroom.py", """
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import Schedule, Student, SubjectAttendanceLog
from .common import resolve_faculty_for_user, is_leadership_role, format_full_student_name, safe_photo_url
from apps.api.serializers import ClassroomBatchScanSerializer

class FacultyClassroomRosterAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        faculty = resolve_faculty_for_user(request.user)
        today = timezone.localdate()

        if is_leadership_role(request.user):
            schedules = Schedule.objects.select_related('section', 'subject', 'faculty').all().order_by('start_time')
        elif faculty:
            schedules = Schedule.objects.select_related('section', 'subject', 'faculty').filter(Q(faculty=faculty) | Q(section__adviser=faculty)).distinct().order_by('start_time')
        else:
            return Response([], status=status.HTTP_200_OK)

        roster = []
        for sched in schedules:
            sec = sched.section
            if not sec: continue
            students = Student.objects.filter(enrollments__section=sec, is_active=True).distinct().order_by('last_name', 'first_name')
            items = [{
                'id': s.id, 'lrn': s.lrn, 'full_name': format_full_student_name(s), 'sex': s.sex,
                'photo_url': safe_photo_url(s.photo, request), 'attendance_status': 'UNSCANNED'
            } for s in students]

            roster.append({
                'schedule_id': sched.id, 'section_id': sec.id, 'section_name': sec.name,
                'subject_name': sched.subject.title if sched.subject else '', 'students': items
            })
        return Response(roster, status=status.HTTP_200_OK)

class ClassroomBatchScanAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        sched_id = serializer.validated_data['schedule_id']
        sched = Schedule.objects.filter(id=sched_id).first()
        if not sched:
            return Response({'error': 'Schedule not found.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        for item in serializer.validated_data['scans']:
            st = Student.objects.filter(Q(qr_token=item['qr_token']) | Q(rfid_uid=item['qr_token']) | Q(lrn=item['qr_token'])).first()
            if st:
                SubjectAttendanceLog.objects.update_or_create(student=st, schedule=sched, attendance_date=today, defaults={'status': item.get('status', 'PRESENT')})
        return Response({'success': True, 'message': 'Classroom attendance logged.'}, status=status.HTTP_201_CREATED)

class MyAssignedClassesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return Response([], status=status.HTTP_200_OK)

        scheds = Schedule.objects.filter(Q(faculty=faculty) | Q(section__adviser=faculty)).select_related('section', 'subject').distinct().order_by('start_time')
        classes = [{
            'schedule_id': s.id, 'section_id': s.section_id, 'section_name': s.section.name if s.section else '',
            'subject_code': s.subject.code if s.subject else '', 'start_time': str(s.start_time), 'end_time': str(s.end_time)
        } for s in scheds]
        return Response(classes, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/viewsets.py", """
from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.academics.models import (
    Student, FacultyProfile, IoTKiosk, GatePass, Schedule, Subject, UserProfile, GradeLevel, SmsOutbox
)
from apps.api.serializers import (
    StudentSerializer, FacultyProfileSerializer, IoTKioskSerializer, GatePassSerializer,
    ScheduleSerializer, SubjectSerializer, UserManagementSerializer, SmsOutboxSerializer
)
from .common import (
    get_user_role, is_regular_teacher, resolve_faculty_for_user,
    get_teacher_student_ids, get_teacher_section_ids, IsSystemAdminRole, IsAcademicManagerPermission
)

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [IsAcademicManagerPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name', 'rfid_uid', 'qr_token']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = Student.objects.filter(is_active=True).prefetch_related('enrollments__section').order_by('last_name', 'first_name')
        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            qs = qs.filter(id__in=get_teacher_student_ids(faculty))
        return qs

class FacultyViewSet(viewsets.ModelViewSet):
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'rfid_uid']

    def get_queryset(self):
        return FacultyProfile.objects.filter(is_active=True).order_by('last_name', 'first_name')

class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsSystemAdminRole]

class GatePassViewSet(viewsets.ModelViewSet):
    queryset = GatePass.objects.select_related('faculty', 'student').order_by('-valid_from')
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]

class ScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleSerializer
    permission_classes = [IsAcademicManagerPermission]

    def get_queryset(self):
        qs = Schedule.objects.select_related('section', 'subject', 'faculty').order_by('start_time')
        user = self.request.user
        if is_regular_teacher(get_user_role(user)) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            qs = qs.filter(section_id__in=get_teacher_section_ids(faculty))
        return qs

class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [IsAcademicManagerPermission]

class RoomViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]
    def list(self, request):
        return Response([{'id': i, 'room_number': f"Room {i}"} for i in range(101, 110)], status=status.HTTP_200_OK)

class GradeLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    permission_classes = [permissions.IsAuthenticated]

class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = UserProfile.objects.select_related('user', 'faculty').all()
    serializer_class = UserManagementSerializer
    permission_classes = [IsSystemAdminRole]

class SmsOutboxViewSet(viewsets.ModelViewSet):
    queryset = SmsOutbox.objects.all().order_by('-created_at')
    serializer_class = SmsOutboxSerializer
    permission_classes = [IsSystemAdminRole]

    @action(detail=False, methods=['delete', 'post'])
    def delete_delivered(self, request):
        SmsOutbox.objects.filter(status='SENT').delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete', 'post'])
    def clear_pending(self, request):
        SmsOutbox.objects.filter(status='PENDING').delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def retry_all_failed(self, request):
        SmsOutbox.objects.filter(status='FAILED').update(status='PENDING', retry_count=0)
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def get_metrics(self, request):
        return Response({
            'total': SmsOutbox.objects.count(),
            'pending': SmsOutbox.objects.filter(status='PENDING').count(),
            'sent': SmsOutbox.objects.filter(status='SENT').count(),
            'failed': SmsOutbox.objects.filter(status='FAILED').count(),
        }, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/utils.py", """
from django.core.cache import cache
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from .common import IsSystemAdminRole, resolve_logo_field
from apps.academics.models import SchoolProfile
from apps.api.serializers import SchoolProfileSerializer

class SchoolSettingsAPIView(APIView):
    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [IsSystemAdminRole()]

    def get(self, request):
        cache_key = "attendsure_school_settings_fast_payload"
        cached = cache.get(cache_key)
        if cached: return Response(cached, status=status.HTTP_200_OK)

        profile = SchoolProfile.objects.first() or SchoolProfile.objects.create()
        data = dict(SchoolProfileSerializer(profile, context={'request': request}).data)
        for key in ('school_logo', 'left_logo', 'right_logo'):
            if data.get(key): data[key] = resolve_logo_field(data[key], request)
        cache.set(cache_key, data, timeout=300)
        return Response(data, status=status.HTTP_200_OK)

    def put(self, request):
        profile = SchoolProfile.objects.first() or SchoolProfile.objects.create()
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            cache.delete("attendsure_school_settings_fast_payload")
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request):
        return self.put(request)

class CalendarExceptionAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request): return Response([], status=status.HTTP_200_OK)
    def post(self, request): return Response({'success': True}, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def ping_scanners(request):
    return Response({'status': 'ONLINE'}, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def test_sms_gateway(request):
    return Response({'status': 'DISPATCHED'}, status=status.HTTP_200_OK)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def db_check(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1;")
    return Response({'database': 'CONNECTED'}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsSystemAdminRole])
def flush_cache(request):
    cache.clear()
    return Response({'success': True, 'message': 'Cache cleared.'}, status=status.HTTP_200_OK)
""")

write_file("apps/api/views/__init__.py", """
from .auth import DatabaseLoginView, LoginAPIView, CurrentUserView, CurrentUserProfileView, LiveFieldValidationAPIView, RegisterPushTokenAPIView
from .dashboard import DashboardOverviewAPIView
from .sections import SectionListAPIView, SectionDetailAPIView
from .gate import GateScanAPIView, GateLogsAPIView
from .classroom import FacultyClassroomRosterAPIView, ClassroomBatchScanAPIView, MyAssignedClassesAPIView
from .reports import (
    DepEdSF1DataAPIView, DepEdSF2DataAPIView, DepEdSF4DataAPIView, DTRListAPIView,
    UnifiedReportExportAPIView, UnifiedReportPrintAPIView, ReportAuditLogAPIView
)
from .sms import PendingSmsDispatchAPIView, BulkSmsStatusAPIView, MarkSmsStatusAPIView
from .utils import SchoolSettingsAPIView, CalendarExceptionAPIView, ping_scanners, test_sms_gateway, db_check, flush_cache
from .viewsets import (
    StudentViewSet, FacultyViewSet, ScannerViewSet, GatePassViewSet, ScheduleViewSet,
    SubjectViewSet, RoomViewSet, GradeLevelViewSet, UserManagementViewSet, SmsOutboxViewSet
)
from .geofence import GeofenceStatusAPIView, GeofenceCheckInAPIView, FacultyDeviceResetAPIView

__all__ = [
    'DatabaseLoginView', 'LoginAPIView', 'CurrentUserView', 'CurrentUserProfileView',
    'LiveFieldValidationAPIView', 'RegisterPushTokenAPIView', 'DashboardOverviewAPIView',
    'SectionListAPIView', 'SectionDetailAPIView', 'GateScanAPIView', 'GateLogsAPIView',
    'FacultyClassroomRosterAPIView', 'ClassroomBatchScanAPIView', 'MyAssignedClassesAPIView',
    'DepEdSF1DataAPIView', 'DepEdSF2DataAPIView', 'DepEdSF4DataAPIView', 'DTRListAPIView',
    'UnifiedReportExportAPIView', 'UnifiedReportPrintAPIView', 'ReportAuditLogAPIView',
    'PendingSmsDispatchAPIView', 'BulkSmsStatusAPIView', 'MarkSmsStatusAPIView',
    'SchoolSettingsAPIView', 'CalendarExceptionAPIView', 'ping_scanners', 'test_sms_gateway',
    'db_check', 'flush_cache', 'StudentViewSet', 'FacultyViewSet', 'ScannerViewSet',
    'GatePassViewSet', 'ScheduleViewSet', 'SubjectViewSet', 'RoomViewSet',
    'GradeLevelViewSet', 'UserManagementViewSet', 'SmsOutboxViewSet',
    'GeofenceStatusAPIView', 'GeofenceCheckInAPIView', 'FacultyDeviceResetAPIView',
]
""")

write_file("apps/api/geofence_views.py", """
from .views.geofence import GeofenceStatusAPIView, GeofenceCheckInAPIView, FacultyDeviceResetAPIView

__all__ = ['GeofenceStatusAPIView', 'GeofenceCheckInAPIView', 'FacultyDeviceResetAPIView']
""")

print("\nAll files created successfully!")
print("Running 'python manage.py check' to verify Django configuration...")
subprocess.run([sys.executable, "manage.py", "check"], cwd=BACKEND_DIR)