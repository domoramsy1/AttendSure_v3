from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

# ============================================================================
# UNIVERSAL VALUE SETS (GLOBAL EDUCATIONAL STANDARDS)
# ============================================================================

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
]

DIRECTION_CHOICES = [
    ('IN', 'Entry / Arrival'),
    ('OUT', 'Exit / Departure'),
]

ATTENDANCE_STATUS_CHOICES = [
    ('PRESENT', 'Present'),
    ('LATE', 'Late / Tardy'),
    ('CUTTING', 'Cutting Classes'),
    ('ABSENT', 'Absent'),
]

ENROLLMENT_STATUS_CHOICES = [
    ('ENROLLED', 'Enrolled'),
    ('DROPPED', 'Dropped Out'),
    ('TRANSFERRED_IN', 'Transferred In'),
    ('TRANSFERRED_OUT', 'Transferred Out'),
]

ENROLLMENT_TYPE_CHOICES = [
    ('REGULAR', 'Regular Student'),
    ('LATE_ENROLLEE', 'Late Enrollee'),
    ('TRANSFERRED_IN', 'Transferred In'),
    ('RETURNING', 'Returning Student'),
    ('REPEATER', 'Repeater / Retained'),
]

USER_ROLE_CHOICES = [
    ('ADMIN', 'System Administrator'),
    ('TEACHER', 'Teacher / Faculty Adviser'),
]

GATE_PASS_STATUS_CHOICES = [
    ('ACTIVE', 'Active / Valid'),
    ('USED', 'Used / Checked at Gate'),
    ('EXPIRED', 'Expired'),
    ('REVOKED', 'Revoked / Cancelled'),
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


# ============================================================================
# 1. INSTITUTION & SCHEDULE RULES
# ============================================================================

class AcademicYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True, help_text="e.g., 2026-2027")
    start_date = models.DateField()
    first_friday_june = models.DateField(help_text="Official cut-off date for baseline enrollment statistics")
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
    school_id = models.CharField(max_length=50, blank=True, default='')
    school_name = models.CharField(max_length=255, blank=True, default='')
    region = models.CharField(max_length=100, blank=True, default='')
    division = models.CharField(max_length=100, blank=True, default='')
    district = models.CharField(max_length=100, blank=True, default='')
    
    # Contact & Location Details (DepEd DO 31, s. 2019)
    address = models.TextField(blank=True, default='', help_text="Official School Physical Address")
    contact_number = models.CharField(max_length=100, blank=True, default='', help_text="Telephone / Mobile Contact")
    email = models.EmailField(blank=True, default='', help_text="Official DepEd School Email")

    # Administration / Head
    principal_name = models.CharField(max_length=150, blank=True, default='')
    principal_title = models.CharField(max_length=100, blank=True, default='Principal / School Head')

    # Official DepEd & School Logos (stored as base64 string or image URI)
    kagawaran_logo = models.TextField(
        blank=True, null=True, 
        help_text="National Seal / Kagawaran ng Edukasyon Logo"
    )
    deped_logo = models.TextField(
        blank=True, null=True, 
        help_text="Official Department of Education Ribbon Emblem"
    )
    school_logo = models.TextField(
        blank=True, null=True, 
        help_text="Official School Institutional Crest / Seal"
    )

    # Legacy Report Aliases (kept in sync automatically)
    left_logo = models.TextField(blank=True, null=True)
    right_logo = models.TextField(blank=True, null=True)

    # Campus Geofence
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    geofence_radius_meters = models.PositiveIntegerField(null=True, blank=True, default=250)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'school_profile'
        verbose_name = 'School Profile'
        verbose_name_plural = 'School Profiles'

    def save(self, *args, **kwargs):
        # Auto-sync legacy aliases so existing SF1/SF2/SF4 services never break
        if self.kagawaran_logo and not self.left_logo:
            self.left_logo = self.kagawaran_logo
        if self.deped_logo and not self.right_logo:
            self.right_logo = self.deped_logo
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.school_id} - {self.school_name}" if self.school_id else (self.school_name or "School Profile")


class ClassSchedule(models.Model):
    id = models.BigAutoField(primary_key=True)
    label = models.CharField(max_length=100, default='Regular Faculty Shift')
    regular_days_label = models.CharField(max_length=100, default='8:00 AM - 12:00 PM and 1:00 PM - 5:00 PM')
    saturday_label = models.CharField(max_length=100, blank=True, default='')
    am_arrival_start = models.TimeField(default='06:30:00')
    am_arrival_cutoff = models.TimeField(default='07:45:00', help_text="Arrival past this is marked Late")
    am_departure_time = models.TimeField(default='12:00:00')
    pm_arrival_time = models.TimeField(default='13:00:00')
    pm_departure_cutoff = models.TimeField(default='17:00:00', help_text="Departure before this is Undertime")
    late_threshold_min = models.IntegerField(default=15, help_text="Grace period in minutes")

    class Meta:
        db_table = 'class_schedules'

    def __str__(self):
        return self.label


class GeofenceSetting(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, default='Campus Perimeter')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    radius_meters = models.PositiveIntegerField(default=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'geofence_settings'

    def __str__(self):
        return f"{self.name} ({self.radius_meters}m)"


class IoTKiosk(models.Model):
    id = models.BigAutoField(primary_key=True)
    kiosk_code = models.CharField(max_length=50, unique=True, help_text="Unique hardware terminal identifier")
    terminal_name = models.CharField(max_length=150)
    secret_hash = models.CharField(max_length=255, help_text="Constant-time hardware authentication secret")
    location = models.CharField(max_length=100, default='Main Gate', help_text="Turnstile or gate position")
    is_active = models.BooleanField(default=True)
    last_ping = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'iot_kiosks'

    def __str__(self):
        return f"{self.terminal_name} [{self.kiosk_code}]"


# ============================================================================
# 2. PEOPLE & AUTHENTICATION (Faculty, STUDENTS, USER PROFILES)
# ============================================================================

class FacultyProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    employee_id = models.CharField(max_length=50, unique=True, help_text="Unique Employee Number")
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default='')
    position = models.CharField(max_length=100, blank=True, default='Teacher')
    department = models.CharField(max_length=100, blank=True, default='Faculty')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(max_length=150, blank=True, default='')
    
    # Visual Identification & Physical Scanner Tokens
    photo = models.ImageField(upload_to='faculty/', default='faculty/default_avatar.png', blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, help_text="RFID card UID")
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True, help_text="Cryptographic QR token")
    is_active = models.BooleanField(default=True)

    bound_device_id = models.CharField(
        max_length=128,
        blank=True,
        null=True,
        unique=True,
        help_text="Unique hardware UUID of the faculty phone."
    )
    device_model = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        help_text="Phone model name."
    )
    device_bound_at = models.DateTimeField(
        blank=True,
        null=True,
        help_text="Timestamp when paired."
    )
    # Forensic Audit & Modification Tracking
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_faculty_profiles'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_faculty_profiles'
    )

    class Meta:
        db_table = 'faculty_profiles'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.employee_id})"


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
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default='TEACHER')
    avatar = models.ImageField(upload_to='avatars/', default='avatars/default_user.png', blank=True)
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return f"{self.user.username} [{self.role}]"


class Student(models.Model):
    id = models.BigAutoField(primary_key=True)
    lrn = models.CharField(max_length=20, unique=True, help_text="Unique Student ID or National Learner Reference Number")
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default='')
    sex = models.CharField(max_length=10, choices=SEX_CHOICES)
    birthdate = models.DateField(help_text="Official Date of Birth")
    
    # Demographic Data (Open dynamic fields)
    mother_tongue = models.CharField(max_length=100, blank=True, default='', help_text="Primary spoken language")
    ethnic_group = models.CharField(max_length=100, blank=True, default='')
    religion = models.CharField(max_length=100, blank=True, default='')
    
    # Address Details (Universal structure adaptable to any country)
    house_street_sitio = models.CharField(max_length=255, blank=True, default='', help_text="Street address / House number")
    barangay = models.CharField(max_length=100, blank=True, default='', help_text="Neighborhood, Suburb, or Village")
    municipality_city = models.CharField(max_length=100, blank=True, default='', help_text="City or Town")
    province = models.CharField(max_length=100, blank=True, default='', help_text="Province, State, or County")
    
    # Family & Guardian Contact Info
    father_name = models.CharField(max_length=200, blank=True, default='')
    mother_maiden_name = models.CharField(max_length=200, blank=True, default='')
    guardian_name = models.CharField(max_length=200, blank=True, default='')
    guardian_relationship = models.CharField(max_length=50, blank=True, default='', help_text="e.g., Father, Mother, Guardian")
    parent_contact = models.CharField(max_length=50, help_text="Primary parent/guardian mobile number for notifications")
    
    # Visual Identification & Security Tokens
    photo = models.ImageField(upload_to='students/', default='students/default_avatar.png', blank=True)
    photo_thumbnail = models.CharField(max_length=255, null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, help_text="Primary RFID card serial number")
    qr_token = models.CharField(max_length=128, unique=True, help_text="Salted QR code token generated by database trigger")
    is_active = models.BooleanField(default=True)

    # Forensic Audit & Timestamp Tracking
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_students'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_students'
    )

    class Meta:
        db_table = 'students'
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['lrn'], name='idx_student_lrn'),
            models.Index(fields=['rfid_uid'], name='idx_student_rfid'),
            models.Index(fields=['qr_token'], name='idx_student_qr'),
        ]

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.lrn})"


# ============================================================================
# 3. CURRICULUM, SECTIONS & ENROLLMENTS
# ============================================================================

class GradeLevel(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True, help_text="e.g., G7, G10, Grade 1")
    name = models.CharField(max_length=100)
    tier = models.CharField(max_length=20, blank=True, default='Primary', help_text="e.g., Primary, Secondary, High School")
    level_order = models.IntegerField(default=1, help_text="Chronological sort order")

    class Meta:
        db_table = 'grade_levels'
        ordering = ['level_order']

    def __str__(self):
        return self.name


class Section(models.Model):
    id = models.BigAutoField(primary_key=True)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='sections')
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name='sections')
    adviser = models.ForeignKey(
        FacultyProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='advising_sections'
    )
    name = models.CharField(max_length=100, help_text="e.g., Section A, Diamond, Blue")
    track_strand = models.CharField(max_length=150, blank=True, default='', help_text="Optional academic track or program")
    room_number = models.CharField(max_length=50, blank=True, default='Room 101')
    capacity = models.IntegerField(default=40)

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
    enrollment_date = models.DateField(default=timezone.now, help_text="Date the student officially enrolled")
    enrollment_type = models.CharField(max_length=20, choices=ENROLLMENT_TYPE_CHOICES, default='REGULAR')
    status = models.CharField(max_length=20, choices=ENROLLMENT_STATUS_CHOICES, default='ENROLLED')
    status_date = models.DateField(null=True, blank=True, help_text="Date status changed (e.g., drop date)")
    status_reason_code = models.CharField(max_length=50, blank=True, default='')
    transferred_school = models.CharField(max_length=255, blank=True, default='', help_text="Previous or destination school")
    
    # Social Aid & Special Education Flags
    is_cct_recipient = models.BooleanField(default=False, help_text="Social aid / Welfare beneficiary")
    cct_id_number = models.CharField(max_length=50, blank=True, default='')
    disability_detail = models.CharField(max_length=150, blank=True, default='', help_text="Accommodations / Special needs")
    accelerated_detail = models.CharField(max_length=150, blank=True, default='')
    remarks = models.TextField(blank=True, default='')

    # Forensic Audit & Timestamp Tracking
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_enrollments'
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_enrollments'
    )

    class Meta:
        db_table = 'enrollments'
        unique_together = ('student', 'academic_year')
        indexes = [
            models.Index(fields=['academic_year', 'section', 'status'], name='idx_enroll_summary'),
        ]

    def __str__(self):
        return f"{self.student.lrn} -> {self.section.name} [{self.status}]"


class Subject(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=30, unique=True, help_text="e.g., MATH101, ENG10")
    title = models.CharField(max_length=200)
    tier = models.CharField(max_length=20, blank=True, default='Core')
    subject_type = models.CharField(max_length=50, blank=True, default='Core Curriculum')
    units = models.IntegerField(default=1, help_text="Credits or academic units")

    class Meta:
        db_table = 'subjects'
        ordering = ['code']

    def __str__(self):
        return f"{self.code} - {self.title}"


class Schedule(models.Model):
    id = models.BigAutoField(primary_key=True)
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='schedules')
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='schedules')
    teacher = models.ForeignKey(
        FacultyProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_schedules'
    )
    start_time = models.TimeField()
    end_time = models.TimeField()
    room_number = models.CharField(max_length=50, default='Room 101')

    class Meta:
        db_table = 'schedules'
        ordering = ['start_time']

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


# ============================================================================
# 4. HIGH-THROUGHPUT LOGS, GATE TELEMETRY & ATTENDANCE
# ============================================================================

class FacultyGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    class Meta:
        db_table = 'faculty_gate_logs'
        ordering = ['-scan_time']


class StudentGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)
    recorded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_student_gate_logs'
    )

    class Meta:
        db_table = 'student_gate_logs_partitioned'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['student', 'scan_time'], name='idx_stu_gate_time'),
        ]

    def __str__(self):
        return f"{self.student.lrn} {self.direction} ({self.scan_method}) @ {self.scan_time}"


class SubjectAttendanceLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='subject_attendance')
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='attendance_records')
    teacher = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='submitted_attendance')
    attendance_date = models.DateField(default=timezone.now)
    scanned_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')

    class Meta:
        db_table = 'subject_attendance_logs'
        unique_together = ('student', 'schedule', 'attendance_date')
        indexes = [
            models.Index(fields=['attendance_date', 'schedule', 'status'], name='idx_sub_att_lookup'),
        ]

    def __str__(self):
        return f"{self.student.lrn} -> {self.status} on {self.attendance_date}"


class DailyAttendanceSummary(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='daily_summaries')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='daily_summaries')
    attendance_date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')
    remarks = models.CharField(max_length=255, blank=True, default='')

    # Forensic Audit & Timestamp Tracking
    recorded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_daily_summaries'
    )

    class Meta:
        db_table = 'daily_attendance_summaries'
        unique_together = ('student', 'attendance_date')
        indexes = [
            models.Index(fields=['section', 'attendance_date'], name='idx_daily_sec_date'),
        ]

    def __str__(self):
        return f"{self.student.lrn} ({self.attendance_date}) -> {self.status}"


class FacultyHeartbeat(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='heartbeats')
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    battery_level = models.IntegerField(default=100)
    is_inside_geofence = models.BooleanField(default=True)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'faculty_heartbeats'
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['faculty', 'recorded_at'], name='idx_heartbeat_time'),
        ]


class LoafingIncident(models.Model):
    STATUS_CHOICES = [
        ('PENDING_REVIEW', 'Pending Review'),
        ('EXCUSED', 'Excused'),
        ('CONFIRMED', 'Confirmed Violation'),
    ]

    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='loafing_logs')
    incident_date = models.DateField(default=timezone.now)
    trigger_reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING_REVIEW')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'loafing_incidents'
        ordering = ['-created_at']


class GatePass(models.Model):
    id = models.BigAutoField(primary_key=True)
    pass_number = models.CharField(max_length=50, unique=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True)
    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)
    issued_by = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='issued_passes')
    pass_type = models.CharField(max_length=50, default='Official Exit Permit')
    reason = models.TextField()
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    status = models.CharField(max_length=20, choices=GATE_PASS_STATUS_CHOICES, default='ACTIVE')

    # Forensic Audit & Modification Tracking
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='updated_gate_passes'
    )

    class Meta:
        db_table = 'gate_passes'

    def __str__(self):
        return f"{self.pass_number} ({self.status})"


class SmsOutbox(models.Model):
    TRIGGER_EVENT_CHOICES = [
        ('CLASS_TAP', 'Classroom Attendance Tap'),
        ('GATE_TAP', 'Gate Kiosk Tap'),
        ('GATE_PASS', 'Gate Pass Issuance'),
        ('LOAFING_ALERT', 'Geofence Perimeter Alert'),
        ('ABSENCE_WARNING', 'Consecutive Absence Alert'),
        ('BROADCAST', 'School Announcement'),
    ]

    PRIORITY_CHOICES = [
        (1, 'Priority 1 - High (Absence / Emergency)'),
        (2, 'Priority 2 - Standard (Arrival / Departure)'),
    ]

    STATUS_CHOICES = [
        ('PENDING', 'Pending Transmission'),
        ('PROCESSING', 'Processing by Gateway'),
        ('SENT', 'Sent / Delivered'),
        ('FAILED', 'Failed / Exhausted Retries'),
    ]

    id = models.BigAutoField(primary_key=True)
    recipient_number = models.CharField(max_length=20)
    message_body = models.TextField()
    trigger_event = models.CharField(max_length=50, choices=TRIGGER_EVENT_CHOICES, default='CLASS_TAP')
    priority = models.SmallIntegerField(choices=PRIORITY_CHOICES, default=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    retry_count = models.IntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'sms_outbox'
        ordering = ['priority', 'created_at']
        indexes = [
            models.Index(fields=['status', 'priority', 'created_at'], name='idx_sms_queue_fetch'),
        ]

    def __str__(self):
        return f"SMS to {self.recipient_number} [{self.status}]"


# ============================================================================
# 5. FORENSIC AUDIT TRAIL (SECURITY BY DESIGN)
# ============================================================================

class AuditLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    table_name = models.CharField(max_length=64)
    record_id = models.BigIntegerField()
    action = models.CharField(max_length=10)  # 'INSERT', 'UPDATE', 'DELETE'
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
        managed = False  # Maintained directly by PostgreSQL security triggers

    def __str__(self):
        return f"[{self.action}] {self.table_name} #{self.record_id} by {self.performed_by}"