"""
AttendSure - Academic Data Models & IoT Hardware Security Architecture
App: apps.academics
File: apps/academics/models.py
"""

import math
import secrets
from django.db import models
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password
from django.utils import timezone
from django.conf import settings
from django.core.exceptions import ValidationError

User = get_user_model()

# ==============================================================================
# UNIVERSAL CONSTANTS & SELECTION LISTS
# ==============================================================================

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


# ==============================================================================
# 1. SCHOOL PROFILE & ACADEMIC SETTINGS
# ==============================================================================

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
        # Cybersecurity / Data Rule: Only one academic year can be ACTIVE at any time
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
        'FacultyProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schools_as_principal',
        help_text="Faculty member serving as School Head / Principal"
    )

    principal_name = models.CharField(max_length=255, blank=True, default='')
    principal_title = models.CharField(max_length=150, blank=True, default='Secondary School Principal IV')

    # Base64 or URL Institutional Logos
    school_logo = models.TextField(blank=True, null=True)
    left_logo = models.TextField(blank=True, null=True)
    right_logo = models.TextField(blank=True, null=True)

    # Campus Geofencing Center Coordinates (Used for GPS Boundary Check)
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
                mid = f" {faculty.middle_name[:1]}." if faculty.middle_name else ""
                suf = f" {faculty.suffix}" if faculty.suffix else ""
                self.principal_name = f"{faculty.first_name}{mid} {faculty.last_name}{suf}".strip()
            if not self.principal_title and faculty.position:
                self.principal_title = faculty.position
        super().save(*args, **kwargs)

    def calculate_distance_meters(self, user_lat: float, user_lon: float) -> float:
        """
        Anti-Spoofing / Haversine Formula:
        Calculates exact physical distance between device GPS and campus center in meters.
        """
        r = 6371000  # Radius of earth in meters
        phi1 = math.radians(float(self.latitude))
        phi2 = math.radians(user_lat)
        delta_phi = math.radians(user_lat - float(self.latitude))
        delta_lambda = math.radians(user_lon - float(self.longitude))

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
    kiosk_code = models.CharField(max_length=50, unique=True, help_text="Hardware identifier e.g., KIOSK-GATE-01")
    terminal_name = models.CharField(max_length=150)
    secret_hash = models.CharField(max_length=255, help_text="Cryptographically hashed API secret key")
    location = models.CharField(max_length=100, default='Main Gate')
    is_active = models.BooleanField(default=True)
    last_ping = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'iot_kiosks'

    def __str__(self):
        return f"{self.terminal_name} [{self.kiosk_code}]"

    def set_secret(self, raw_secret: str):
        """Hashes raw secret before writing to the database (Anti-Credential Theft)."""
        self.secret_hash = make_password(raw_secret)

    def verify_secret(self, raw_secret: str) -> bool:
        """Verifies the incoming kiosk request token against the PBKDF2/Argon2 hash."""
        return check_password(raw_secret, self.secret_hash)


# ==============================================================================
# 2. TEACHERS, STUDENTS, AND ACCOUNTS (ZERO TRUST)
# ==============================================================================

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

    # Hardware Tokens
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, db_index=True)
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True)

    # Zero-Trust Mobile Device Binding (Prevents proxy attendance from friend's phone)
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

    def clean(self):
        # Normalize RFID to prevent case-sensitivity scan mismatches
        if self.rfid_uid:
            self.rfid_uid = self.rfid_uid.strip().upper()
        if self.contact_number:
            self.contact_number = self.contact_number.strip().replace(' ', '').replace('-', '')

    def save(self, *args, **kwargs):
        self.clean()
        if not self.qr_token:
            # Auto-generate secure 32-byte cryptographic token
            self.qr_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.employee_id})"


class UserProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    faculty = models.OneToOneField(
        'FacultyProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='account'
    )
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default='FACULTY')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)

    # Hybrid Teaching & Profile Flags
    is_teaching = models.BooleanField(
        default=True,
        help_text="Enables teaching duties and the 'My Assigned Classes' tab for this user."
    )
    is_profile_completed = models.BooleanField(
        default=False,
        help_text="Flagged True once the user completes their name, contact, and profile info."
    )

    # Anti-Brute-Force Attack Defense
    failed_attempts = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_profiles'

    def is_locked(self) -> bool:
        if self.locked_until and timezone.now() < self.locked_until:
            return True
        return False

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
    lrn = models.CharField(max_length=20, unique=True, db_index=True, help_text="Learner Reference Number")
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

    # Identifiers
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

    def clean(self):
        if self.rfid_uid:
            self.rfid_uid = self.rfid_uid.strip().upper()
        if self.parent_contact:
            # Clean spaces and formatting to protect SMS pipeline
            self.parent_contact = self.parent_contact.strip().replace(' ', '').replace('-', '')

    def save(self, *args, **kwargs):
        self.clean()
        if not self.qr_token:
            # Auto-generate unique cryptographic token if blank
            self.qr_token = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.lrn})"


# ==============================================================================
# 3. SECTIONS, SUBJECTS, AND SCHEDULES
# ==============================================================================

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


# ==============================================================================
# 4. HARDWARE LOGS, PASSES, AND HIGH-FREQUENCY TELEMETRY
# ==============================================================================

class FacultyGateLog(models.Model):
    """Turnstile tap record for faculty with tamper protection."""
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now, db_index=True)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    # DTR, Loafing & Anti-Cheating Flags
    is_violation = models.BooleanField(
        default=False,
        help_text="Flagged when unauthorized gate exit occurs during official work hours without Gate Pass"
    )
    violation_type = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text="e.g., LOAFING, PREMATURE_EXIT, CUTTING"
    )
    remarks = models.TextField(blank=True, default='')

    # Principal Exemption / Governance Consideration
    is_excused_by_principal = models.BooleanField(
        default=False,
        help_text="Only the School Principal can excuse a loafing violation"
    )
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
    """High-frequency student gate taps indexed for fast turnstile queries."""
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


class FacultyHeartbeat(models.Model):
    """High-frequency GPS pings from mobile phones during teaching hours."""
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
        indexes = [
            models.Index(fields=['faculty', 'recorded_at']),
        ]

    def __str__(self):
        status = "INSIDE" if self.is_inside_geofence else "OUTSIDE"
        return f"{self.faculty} - {status} at {self.recorded_at}"


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

    def __str__(self):
        return f"{self.faculty} - {self.trigger_reason} ({self.incident_date})"


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
        indexes = [
            models.Index(fields=['status', 'valid_from', 'valid_to']),
        ]

    def is_currently_valid(self) -> bool:
        """
        Anti-Replay / Expiration Defense:
        Verifies pass is marked ACTIVE AND current timestamp is within the authorized window.
        """
        now = timezone.now()
        if self.status != 'ACTIVE':
            return False
        if not (self.valid_from <= now <= self.valid_to):
            # Auto-mark expired if checked after deadline
            if now > self.valid_to and self.status == 'ACTIVE':
                self.status = 'EXPIRED'
                self.save(update_fields=['status'])
            return False
        return True

    def __str__(self):
        return f"Pass #{self.pass_number} [{self.status}]"


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
        indexes = [
            models.Index(fields=['status', 'priority', 'created_at']),
        ]

    def clean(self):
        if self.recipient_number:
            # Strip spaces and invalid characters to protect physical GSM modem AT command pipeline
            clean_num = self.recipient_number.strip().replace(' ', '').replace('-', '')
            if clean_num.startswith('09') and len(clean_num) == 11:
                clean_num = '+63' + clean_num[1:]
            self.recipient_number = clean_num

    def save(self, *args, **kwargs):
        self.clean()
        if self.category and not self.trigger_event:
            self.trigger_event = self.category
        elif self.trigger_event and not self.category:
            self.category = self.trigger_event
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.status}] [{self.priority}] To: {self.recipient_number}"


# ==============================================================================
# 5. AUDIT LOG & DTR GOVERNANCE
# ==============================================================================

class AuditLog(models.Model):
    """Immutable table managed by PostgreSQL system triggers."""
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=10)
    old_data = models.JSONField(null=True, blank=True)
    new_data = models.JSONField(null=True, blank=True)
    changed_fields = models.JSONField(null=True, blank=True)
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_actions'
    )
    client_ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        managed = False

    def __str__(self):
        return f"[{self.action}] {self.table_name} #{self.record_id}"


class FacultyMonthlyDTR(models.Model):
    """Tracks monthly DTR approval and governance for Civil Service Form 48."""
    faculty = models.ForeignKey(
        FacultyProfile,
        on_delete=models.CASCADE,
        related_name='monthly_dtrs'
    )
    month = models.PositiveSmallIntegerField(help_text="Month number (1-12)")
    year = models.PositiveSmallIntegerField(help_text="Year (e.g., 2026)")

    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)

    is_dept_head_approved = models.BooleanField(default=False)
    dept_head_approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_dtrs'
    )

    regular_hours = models.CharField(
        max_length=120,
        default="8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM"
    )
    saturday_hours = models.CharField(
        max_length=120,
        default="As Required"
    )

    remarks = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'faculty_monthly_dtr'
        unique_together = ('faculty', 'month', 'year')
        ordering = ['-year', '-month']

    def __str__(self):
        status = "Approved" if self.is_dept_head_approved else ("Submitted" if self.is_submitted else "Draft")
        return f"{self.faculty} - {self.month}/{self.year} ({status})"