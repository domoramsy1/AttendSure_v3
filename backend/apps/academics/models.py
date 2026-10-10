from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.conf import settings

User = get_user_model()

# Universal choice lists
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
    ('IN', 'Entry'),
    ('OUT', 'Exit'),
]

ATTENDANCE_STATUS_CHOICES = [
    ('PRESENT', 'Present'),
    ('LATE', 'Late'),
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
    ('TEACHER', 'Teacher / Adviser'),
    ('GUARD', 'Security Guard'),
]

GATE_PASS_STATUS_CHOICES = [
    ('ACTIVE', 'Active'),
    ('USED', 'Used'),
    ('EXPIRED', 'Expired'),
    ('REVOKED', 'Revoked'),
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
# 1. SCHOOL PROFILE & SETTINGS
# ============================================================================

class AcademicYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
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
    school_id = models.CharField(max_length=50, unique=True)
    school_name = models.CharField(max_length=255)
    region = models.CharField(max_length=100, blank=True, default='')
    division = models.CharField(max_length=100, blank=True, default='')
    district = models.CharField(max_length=100, blank=True, default='')
    address = models.TextField(blank=True, default='')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(blank=True, default='')

    # Link directly to the Faculty directory
    principal_faculty = models.ForeignKey(
        'FacultyProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schools_as_principal',
        help_text="Faculty member serving as School Head / Principal"
    )

    # Official Printed Signature Names on Reports (SF1, SF2, SF4)
    principal_name = models.CharField(max_length=255, blank=True, default='')
    principal_title = models.CharField(max_length=150, blank=True, default='Secondary School Principal IV')

    # Institutional Logos
    school_logo = models.TextField(blank=True, null=True)
    left_logo = models.TextField(blank=True, null=True)
    right_logo = models.TextField(blank=True, null=True)

    # Campus Geofencing
    latitude = models.FloatField(default=8.4858)
    longitude = models.FloatField(default=124.6567)
    geofence_radius_meters = models.IntegerField(default=150)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'attendsure_school_profile'
        verbose_name = 'School Profile'
        verbose_name_plural = 'School Profile'

    def save(self, *args, **kwargs):
        # Automatically pull name and position title from the linked Faculty profile
        if self.principal_faculty:
            faculty = self.principal_faculty
            if not self.principal_name:
                mid = f" {faculty.middle_name[:1]}." if faculty.middle_name else ""
                suf = f" {faculty.suffix}" if faculty.suffix else ""
                self.principal_name = f"{faculty.first_name}{mid} {faculty.last_name}{suf}".strip()
            if not self.principal_title and faculty.position:
                self.principal_title = faculty.position
        super().save(*args, **kwargs)

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
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    radius_meters = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'geofence_settings'

    def __str__(self):
        return self.name


class IoTKiosk(models.Model):
    id = models.BigAutoField(primary_key=True)
    kiosk_code = models.CharField(max_length=50, unique=True)
    terminal_name = models.CharField(max_length=150)
    secret_hash = models.CharField(max_length=255)
    location = models.CharField(max_length=100, default='Main Gate')
    is_active = models.BooleanField(default=True)
    last_ping = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'iot_kiosks'

    def __str__(self):
        return f"{self.terminal_name} [{self.kiosk_code}]"


# ============================================================================
# 2. TEACHERS, STUDENTS, AND USERS
# ============================================================================

class FacultyProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    employee_id = models.CharField(max_length=50, unique=True)
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
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True)
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True)
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

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.employee_id})"


class UserProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    faculty = models.OneToOneField(FacultyProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='account')
    role = models.CharField(max_length=20, choices=USER_ROLE_CHOICES, default='TEACHER')
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return f"{self.user.username} [{self.role}]"


class Student(models.Model):
    id = models.BigAutoField(primary_key=True)
    lrn = models.CharField(max_length=20, unique=True)
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
    parent_contact = models.CharField(max_length=50)

    photo = models.ImageField(upload_to='students/', null=True, blank=True)
    photo_thumbnail = models.CharField(max_length=255, null=True, blank=True)
    photo_updated_at = models.DateTimeField(null=True, blank=True)
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True)
    qr_token = models.CharField(max_length=128, unique=True)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_students')
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_students')

    class Meta:
        db_table = 'students'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.lrn})"


# ============================================================================
# 3. SECTIONS, SUBJECTS, AND SCHEDULES
# ============================================================================

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
# 4. LOGS, PASSES, AND SMS
# ============================================================================

class FacultyGateLog(models.Model):
    """
    Main gate scan record for teachers and staff.
    Includes anti-cheating, loafing violation flags, and Principal pardon fields.
    """
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    # DTR, Loafing & Anti-Cheating Violation Flags
    is_violation = models.BooleanField(
        default=False,
        help_text="Flagged when unauthorized gate exit occurs during official work hours without Gate Pass"
    )
    violation_type = models.CharField(
        max_length=64,
        blank=True,
        default='',
        help_text="e.g. LOAFING, PREMATURE_EXIT, CUTTING"
    )
    remarks = models.TextField(blank=True, default='')

    # Principal Exemption / Consideration
    is_excused_by_principal = models.BooleanField(
        default=False,
        help_text="Only the School Principal can excuse a loafing violation to prevent salary deduction"
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

    def __str__(self):
        return f"{self.faculty} - {self.direction} at {self.scan_time}"


class StudentGateLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    class Meta:
        db_table = 'student_gate_logs_partitioned'
        ordering = ['-scan_time']


class SubjectAttendanceLog(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='subject_attendance')
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='attendance_records')
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='submitted_attendance')
    attendance_date = models.DateField(default=timezone.now)
    scanned_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')

    class Meta:
        db_table = 'subject_attendance_logs'
        unique_together = ('student', 'schedule', 'attendance_date')


class DailyAttendanceSummary(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='daily_summaries')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='daily_summaries')
    attendance_date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=10, choices=ATTENDANCE_STATUS_CHOICES, default='PRESENT')
    remarks = models.CharField(max_length=255, blank=True, default='')

    recorded_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'daily_attendance_summaries'
        unique_together = ('student', 'attendance_date')


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


class LoafingIncident(models.Model):
    id = models.BigAutoField(primary_key=True)
    faculty = models.ForeignKey(FacultyProfile, on_delete=models.CASCADE, related_name='loafing_logs')
    incident_date = models.DateField(default=timezone.now)
    trigger_reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, default='PENDING_REVIEW')
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
    pass_type = models.CharField(max_length=50, default='Exit Permit')
    reason = models.TextField()
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    status = models.CharField(max_length=20, choices=GATE_PASS_STATUS_CHOICES, default='ACTIVE')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'gate_passes'


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

    def save(self, *args, **kwargs):
        # Keep trigger_event and category synchronized
        if self.category and not self.trigger_event:
            self.trigger_event = self.category
        elif self.trigger_event and not self.category:
            self.category = self.trigger_event
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.status}] [{self.priority}] To: {self.recipient_number} ({self.created_at.strftime('%Y-%m-%d %H:%M')})"

# ============================================================================
# AUDIT LOG (MANAGED BY DATABASE)
# ============================================================================

class AuditLog(models.Model):
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


# ============================================================================
# 5. DTR MONTHLY GOVERNANCE
# ============================================================================

class FacultyMonthlyDTR(models.Model):
    """
    Tracks monthly DTR submission, Department Head approval,
    and governance status for Civil Service Form 48.
    """
    faculty = models.ForeignKey(
        FacultyProfile,
        on_delete=models.CASCADE,
        related_name='monthly_dtrs'
    )
    month = models.PositiveSmallIntegerField(help_text="Month number (1-12)")
    year = models.PositiveSmallIntegerField(help_text="Year (e.g., 2026)")

    # Submission Workflow
    is_submitted = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)

    # Department Head Approval Workflow
    is_dept_head_approved = models.BooleanField(default=False)
    dept_head_approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_dtrs'
    )

    # Prescribed Work Schedule
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