from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

# ============================================================================
# STANDARDIZED DROPDOWN VALUE SETS (DepEd, CSC & Regional Standards)
# ============================================================================

REGION_CHOICES = [
    ('Region X', 'Region X - Northern Mindanao'),
    ('Region XIII', 'Region XIII - Caraga'),
    ('Region IX', 'Region IX - Zamboanga Peninsula'),
    ('Region XI', 'Region XI - Davao Region'),
    ('Region XII', 'Region XII - SOCCSKSARGEN'),
    ('BARMM', 'Bangsamoro Autonomous Region in Muslim Mindanao'),
    ('NCR', 'National Capital Region'),
]

DIVISION_CHOICES = [
    ('Cagayan de Oro City', 'Division of Cagayan de Oro City'),
    ('Misamis Oriental', 'Division of Misamis Oriental'),
    ('Bukidnon', 'Division of Bukidnon'),
    ('Iligan City', 'Division of Iligan City'),
    ('Gingoog City', 'Division of Gingoog City'),
    ('El Salvador City', 'Division of El Salvador City'),
]

DISTRICT_CHOICES = [
    ('District I', 'District I (North/West CDO)'),
    ('District II', 'District II (East CDO - Lapasan / Gusa / Cugman)'),
    ('District III', 'District III'),
    ('District IV', 'District IV'),
    ('District V', 'District V'),
    ('District VI', 'District VI'),
]

SUFFIX_CHOICES = [
    ('', 'None'),
    ('Jr.', 'Jr.'),
    ('Sr.', 'Sr.'),
    ('II', 'II'),
    ('III', 'III'),
    ('IV', 'IV'),
    ('V', 'V'),
]

POSITION_CHOICES = [
    ('Teacher I', 'Teacher I'),
    ('Teacher II', 'Teacher II'),
    ('Teacher III', 'Teacher III'),
    ('Master Teacher I', 'Master Teacher I'),
    ('Master Teacher II', 'Master Teacher II'),
    ('Head Teacher I', 'Head Teacher I'),
    ('Head Teacher II', 'Head Teacher II'),
    ('Head Teacher III', 'Head Teacher III'),
    ('Secondary School Principal I', 'Secondary School Principal I'),
    ('Secondary School Principal II', 'Secondary School Principal II'),
    ('Secondary School Principal III', 'Secondary School Principal III'),
    ('Secondary School Principal IV', 'Secondary School Principal IV'),
    ('Administrative Officer II', 'Administrative Officer II'),
    ('Administrative Assistant II', 'Administrative Assistant II'),
    ('Registrar I', 'Registrar I'),
]

DEPARTMENT_CHOICES = [
    ('Junior High School', 'Junior High School Faculty'),
    ('Senior High School', 'Senior High School Faculty'),
    ('Alternative Learning System (ALS)', 'ALS Department'),
    ('Science Department', 'Science Department'),
    ('Mathematics Department', 'Mathematics Department'),
    ('English Department', 'English Department'),
    ('Filipino Department', 'Filipino Department'),
    ('Social Studies (AP) Department', 'Araling Panlipunan Department'),
    ('MAPEH Department', 'MAPEH Department'),
    ('TLE / TVL Department', 'TLE / TVL Department'),
    ('Values Education (EsP) Department', 'Edukasyon sa Pagpapakatao Department'),
    ('Administration & Registrar', 'Administrative & Registrar Office'),
]

MOTHER_TONGUE_CHOICES = [
    ('Cebuano', 'Cebuano / Bisaya'),
    ('Tagalog', 'Tagalog / Filipino'),
    ('Maranao', 'Maranao'),
    ('Hiligaynon', 'Hiligaynon / Ilonggo'),
    ('Binukid', 'Binukid'),
    ('Subanen', 'Subanen'),
    ('Waray', 'Waray'),
    ('Ilocano', 'Ilocano'),
    ('English', 'English'),
    ('Other', 'Other Indigenous Language'),
]

RELIGION_CHOICES = [
    ('Roman Catholic', 'Roman Catholic'),
    ('Islam', 'Islam'),
    ('Seventh-day Adventist', 'Seventh-day Adventist'),
    ('Iglesia ni Cristo', 'Iglesia ni Cristo'),
    ('Evangelical Christian', 'Evangelical Christian'),
    ('Baptist', 'Baptist'),
    ('Born Again Christian', 'Born Again Christian'),
    ('Jehovah\'s Witnesses', 'Jehovah\'s Witnesses'),
    ('UCCP', 'United Church of Christ in the Philippines (UCCP)'),
    ('IFI / Aglipayan', 'Iglesia Filipina Independiente (IFI)'),
    ('Other', 'Other Religious Affiliation'),
]

CDO_BARANGAY_CHOICES = [
    ('Lapasan', 'Lapasan'),
    ('Gusa', 'Gusa'),
    ('Cugman', 'Cugman'),
    ('Tablon', 'Tablon'),
    ('Puerto', 'Puerto'),
    ('Bugo', 'Bugo'),
    ('Macabalan', 'Macabalan'),
    ('Puntod', 'Puntod'),
    ('Consolacion', 'Consolacion'),
    ('Camaman-an', 'Camaman-an'),
    ('Nazareth', 'Nazareth'),
    ('Carmen', 'Carmen'),
    ('Kauswagan', 'Kauswagan'),
    ('Bulua', 'Bulua'),
    ('Patag', 'Patag'),
    ('Iponan', 'Iponan'),
    ('Lumbia', 'Lumbia'),
    ('Balulang', 'Balulang'),
    ('Canitoan', 'Canitoan'),
    ('Barangay 1', 'Poblacion - Barangay 1'),
    ('Barangay 2', 'Poblacion - Barangay 2'),
    ('Barangay 10', 'Poblacion - Barangay 10'),
    ('Other', 'Other Barangay (Outside CDO)'),
]

MUNICIPALITY_CITY_CHOICES = [
    ('Cagayan de Oro City', 'Cagayan de Oro City'),
    ('Tagoloan', 'Tagoloan'),
    ('Villanueva', 'Villanueva'),
    ('Jasaan', 'Jasaan'),
    ('Opol', 'Opol'),
    ('El Salvador City', 'El Salvador City'),
    ('Claveria', 'Claveria'),
    ('Other', 'Other Municipality/City'),
]

PROVINCE_CHOICES = [
    ('Misamis Oriental', 'Misamis Oriental'),
    ('Bukidnon', 'Bukidnon'),
    ('Lanao del Norte', 'Lanao del Norte'),
    ('Misamis Occidental', 'Misamis Occidental'),
    ('Camiguin', 'Camiguin'),
    ('Other', 'Other Province'),
]

RELATIONSHIP_CHOICES = [
    ('Father', 'Father'),
    ('Mother', 'Mother'),
    ('Grandmother', 'Grandmother'),
    ('Grandfather', 'Grandfather'),
    ('Aunt', 'Aunt'),
    ('Uncle', 'Uncle'),
    ('Elder Sister', 'Elder Sister'),
    ('Elder Brother', 'Elder Brother'),
    ('Legal Guardian', 'Court-Appointed Legal Guardian'),
    ('Other', 'Other Custodian'),
]

TRACK_STRAND_CHOICES = [
    ('', 'N/A (Junior High School)'),
    ('STEM', 'STEM - Science, Technology, Engineering and Mathematics'),
    ('ABM', 'ABM - Accountancy, Business and Management'),
    ('HUMSS', 'HUMSS - Humanities and Social Sciences'),
    ('GAS', 'GAS - General Academic Strand'),
    ('TVL-ICT', 'TVL - Information & Communications Technology'),
    ('TVL-HE', 'TVL - Home Economics'),
    ('TVL-IA', 'TVL - Industrial Arts'),
    ('TVL-AFA', 'TVL - Agri-Fishery Arts'),
    ('Sports', 'Sports Track'),
    ('Arts & Design', 'Arts & Design Track'),
]

STATUS_REASON_CHOICES = [
    ('', 'None / Not Applicable'),
    ('a.1', 'a.1 Academic: Difficulty in School Work'),
    ('a.2', 'a.2 Academic: Lack of Personal Interest'),
    ('b.1', 'b.1 Individual: Severe Illness / Disability'),
    ('b.2', 'b.2 Individual: Teenage Pregnancy / Early Marriage'),
    ('b.3', 'b.3 Individual: Substance / Behavioral Issue'),
    ('c.1', 'c.1 Family: Poverty / Financial Constraints'),
    ('c.2', 'c.2 Family: Need to Work / Assist Family Livelihood'),
    ('c.3', 'c.3 Family: Domestic Problems / Family Relocation'),
    ('d.1', 'd.1 Community: Extreme Distance / No Transport'),
    ('d.2', 'd.2 Community: Armed Conflict / Calamity'),
    ('e.1', 'e.1 Other Unclassified Factor'),
]

SHIFT_LABEL_CHOICES = [
    ('Regular Faculty Shift', 'Regular Faculty Shift (7:45 AM - 5:00 PM)'),
    ('Senior High Shift', 'Senior High School Shift (7:30 AM - 4:30 PM)'),
    ('Night High School Shift', 'Night High School Shift (1:00 PM - 9:00 PM)'),
    ('ALS Field Shift', 'ALS Field Coordinator Shift (Flexible 8 Hours)'),
]

REGULAR_DAYS_TEXT_CHOICES = [
    ('8:00 to 12:00 and 1:00 to 5:00', '8:00 to 12:00 and 1:00 to 5:00 (DepEd CSC 48 Standard)'),
    ('7:30 to 11:30 and 12:30 to 4:30', '7:30 to 11:30 and 12:30 to 4:30'),
    ('6:00 to 12:00 and 12:30 to 2:30', '6:00 to 12:00 (Double Shift - AM)'),
    ('12:00 to 6:00 (Afternoon Shift)', '12:00 to 6:00 (Double Shift - PM)'),
]

KIOSK_LOCATION_CHOICES = [
    ('Main Entrance Gate', 'Main Campus Entrance Gate (Terminal 1)'),
    ('Main Exit Gate', 'Main Campus Exit Gate (Terminal 2)'),
    ('Back Gate', 'Back Secondary Gate'),
    ('Senior High School Gate', 'Senior High School Building Gate'),
    ('Faculty Center Entrance', 'Faculty Administration Lobby'),
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
# 1. INSTITUTION & SCHEDULE RULES (Headers for SF1, SF2, SF4, CSC 48)
# ============================================================================

class AcademicYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True, help_text="e.g. 2026-2027")
    start_date = models.DateField()
    first_friday_june = models.DateField(help_text="DepEd cut-off date for baseline enrollment")
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
    # Pure dynamic: No default school names, IDs, or locations
    school_id = models.CharField(max_length=50, blank=True, default='')
    school_name = models.CharField(max_length=255, blank=True, default='')
    region = models.CharField(max_length=100, blank=True, default='')
    division = models.CharField(max_length=150, blank=True, default='')
    district = models.CharField(max_length=150, blank=True, default='')
    principal_name = models.CharField(max_length=200, blank=True, default='')
    principal_title = models.CharField(max_length=150, blank=True, default='')

    # Custom report logos (base64 Data URL or remote URL)
    left_logo = models.TextField(blank=True, null=True)
    right_logo = models.TextField(blank=True, null=True)

    # Pure dynamic geofence
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    geofence_radius_meters = models.IntegerField(null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'school_profile'
        verbose_name = 'School Profile & Settings'
        verbose_name_plural = 'School Profiles & Settings'

    def __str__(self):
        return self.school_name or "Unconfigured School"

class ClassSchedule(models.Model):
    id = models.BigAutoField(primary_key=True)
    label = models.CharField(max_length=100, choices=SHIFT_LABEL_CHOICES, default='Regular Faculty Shift')
    regular_days_label = models.CharField(max_length=100, choices=REGULAR_DAYS_TEXT_CHOICES, default='8:00 to 12:00 and 1:00 to 5:00')
    saturday_label = models.CharField(max_length=100, blank=True, default='')
    am_arrival_start = models.TimeField(default='06:30:00')
    am_arrival_cutoff = models.TimeField(default='07:45:00', help_text="Arrival past this is marked Late")
    am_departure_time = models.TimeField(default='12:00:00')
    pm_arrival_time = models.TimeField(default='13:00:00')
    pm_departure_cutoff = models.TimeField(default='17:00:00', help_text="Departure before this is Undertime")
    late_threshold_min = models.IntegerField(default=15, help_text="Grace period for classroom scans")

    class Meta:
        db_table = 'class_schedules'

    def __str__(self):
        return self.label


class GeofenceSetting(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, default='Campus Boundary')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, default=8.486200)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, default=124.661800)
    radius_meters = models.PositiveIntegerField(default=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'geofence_settings'

    def __str__(self):
        return f"{self.name} ({self.radius_meters}m)"


class IoTKiosk(models.Model):
    id = models.BigAutoField(primary_key=True)
    kiosk_code = models.CharField(max_length=50, unique=True, help_text="e.g. KIOSK-MAIN-GATE")
    terminal_name = models.CharField(max_length=150)
    secret_hash = models.CharField(max_length=255, help_text="Hardware authentication key")
    location = models.CharField(max_length=100, choices=KIOSK_LOCATION_CHOICES, default='Main Entrance Gate')
    is_active = models.BooleanField(default=True)
    last_ping = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'iot_kiosks'

    def __str__(self):
        return f"{self.terminal_name} [{self.kiosk_code}]"


# ============================================================================
# 2. PEOPLE & AUTHENTICATION (ADMIN, REGISTRAR, TEACHER)
# ============================================================================

class StaffProfile(models.Model):
    id = models.BigAutoField(primary_key=True)
    employee_id = models.CharField(max_length=50, unique=True)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default='')
    position = models.CharField(max_length=100, choices=POSITION_CHOICES, default='Teacher I')
    department = models.CharField(max_length=100, choices=DEPARTMENT_CHOICES, default='Junior High School')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(max_length=150, blank=True, default='')
    photo = models.ImageField(upload_to='staff/', default='staff/default_avatar.png', blank=True)
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, help_text="Unique RFID card serial number")
    qr_token = models.CharField(max_length=128, unique=True, null=True, blank=True, help_text="Backup QR code printed on PVC card")
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'staff_profiles'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f"{self.last_name}, {self.first_name} ({self.employee_id})"


class UserProfile(models.Model):
    ROLE_CHOICES = [
        ('ADMIN', 'Admin'),
        ('REGISTRAR', 'Registrar'),
        ('TEACHER', 'Teacher'),
    ]

    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    staff = models.OneToOneField(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='account'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='TEACHER')
    avatar = models.ImageField(upload_to='avatars/', default='avatars/default_user.png', blank=True)
    failed_attempts = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'user_profiles'

    def __str__(self):
        return f"{self.user.username} [{self.role}]"


class Student(models.Model):
    Sex_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
    ]

    id = models.BigAutoField(primary_key=True)
    lrn = models.CharField(max_length=12, unique=True, help_text="12-digit DepEd LRN")
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True, default='')
    last_name = models.CharField(max_length=100)
    suffix = models.CharField(max_length=20, choices=SUFFIX_CHOICES, blank=True, default='')
    sex = models.CharField(max_length=10, choices=Sex_CHOICES)
    birthdate = models.DateField(help_text="Calculates Age on October 31 for SF1")
    mother_tongue = models.CharField(max_length=100, choices=MOTHER_TONGUE_CHOICES, default='Cebuano')
    ethnic_group = models.CharField(max_length=100, blank=True, default='')
    religion = models.CharField(max_length=100, choices=RELIGION_CHOICES, default='Roman Catholic')
    house_street_sitio = models.CharField(max_length=255, blank=True, default='')
    barangay = models.CharField(max_length=100, choices=CDO_BARANGAY_CHOICES, default='Lapasan')
    municipality_city = models.CharField(max_length=100, choices=MUNICIPALITY_CITY_CHOICES, default='Cagayan de Oro City')
    province = models.CharField(max_length=100, choices=PROVINCE_CHOICES, default='Misamis Oriental')
    father_name = models.CharField(max_length=200, blank=True, default='')
    mother_maiden_name = models.CharField(max_length=200, blank=True, default='')
    guardian_name = models.CharField(max_length=200, blank=True, default='')
    guardian_relationship = models.CharField(max_length=50, choices=RELATIONSHIP_CHOICES, blank=True, default='')
    parent_contact = models.CharField(max_length=50, help_text="Parent mobile phone for SMS")
    photo = models.ImageField(upload_to='students/', default='students/default_avatar.png', blank=True)
    rfid_uid = models.CharField(max_length=64, unique=True, null=True, blank=True, help_text="Primary RFID card serial number")
    qr_token = models.CharField(max_length=128, unique=True, help_text="Backup QR token printed on card")
    is_active = models.BooleanField(default=True)

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
    TIER_CHOICES = [
        ('JHS', 'Junior High School'),
        ('SHS', 'Senior High School'),
        ('ALS', 'Alternative Learning System'),
    ]

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True, help_text="e.g. G7, G11")
    name = models.CharField(max_length=100)
    tier = models.CharField(max_length=10, choices=TIER_CHOICES, default='JHS')
    level_order = models.IntegerField(default=7)

    class Meta:
        db_table = 'grade_levels'
        ordering = ['level_order']

    def __str__(self):
        return self.name


class Section(models.Model):
    ROOM_CHOICES = [
        ('Room 101', 'Room 101 - Ground Floor'),
        ('Room 102', 'Room 102 - Ground Floor'),
        ('Room 201', 'Room 201 - Second Floor'),
        ('Room 202', 'Room 202 - Second Floor'),
        ('Room 301', 'Room 301 - Third Floor'),
        ('Room 302', 'Room 302 - Third Floor'),
        ('Science Lab', 'Science Laboratory'),
        ('Computer Lab', 'Computer Laboratory'),
        ('Gymnasium', 'School Gymnasium'),
    ]

    id = models.BigAutoField(primary_key=True)
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='sections')
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name='sections')
    adviser = models.ForeignKey(
        StaffProfile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='advising_sections'
    )
    name = models.CharField(max_length=100, help_text="e.g. Diamond, Emerald")
    track_strand = models.CharField(max_length=150, choices=TRACK_STRAND_CHOICES, blank=True, default='')
    room_number = models.CharField(max_length=50, choices=ROOM_CHOICES, default='Room 101')
    capacity = models.IntegerField(default=40)

    class Meta:
        db_table = 'sections'
        unique_together = ('academic_year', 'grade_level', 'name')
        ordering = ['name']

    def __str__(self):
        return f"{self.grade_level.code} - {self.name}"


class Enrollment(models.Model):
    ENROLLMENT_TYPE_CHOICES = [
        ('REGULAR', 'Regular Enrollee'),
        ('LATE_ENROLLEE', 'Late Enrollee (After First Friday of June)'),
        ('TRANSFERRED_IN', 'Transferred In from Other School'),
        ('BALIK_ARAL', 'Balik-Aral (Returning Learner)'),
        ('REPEATER', 'Repeater / Retained'),
    ]

    STATUS_CHOICES = [
        ('ENROLLED', 'Enrolled'),
        ('DROPPED', 'Dropped Out'),
        ('TRANSFERRED_IN', 'Transferred In'),
        ('TRANSFERRED_OUT', 'Transferred Out'),
    ]

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='enrollments')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='enrollments')
    academic_year = models.ForeignKey(AcademicYear, on_delete=models.CASCADE, related_name='enrollments')
    enrollment_date = models.DateField(default=timezone.now)
    enrollment_type = models.CharField(max_length=20, choices=ENROLLMENT_TYPE_CHOICES, default='REGULAR')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ENROLLED')
    status_date = models.DateField(null=True, blank=True)
    status_reason_code = models.CharField(max_length=20, choices=STATUS_REASON_CHOICES, blank=True, default='')
    transferred_school = models.CharField(max_length=255, blank=True, default='')
    is_cct_recipient = models.BooleanField(default=False, help_text="4Ps / CCT recipient flag")
    cct_id_number = models.CharField(max_length=50, blank=True, default='')
    disability_detail = models.CharField(max_length=150, blank=True, default='')
    accelerated_detail = models.CharField(max_length=150, blank=True, default='')
    remarks = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'enrollments'
        unique_together = ('student', 'academic_year')
        indexes = [
            models.Index(fields=['academic_year', 'section', 'status'], name='idx_enroll_summary'),
        ]

    def __str__(self):
        return f"{self.student.lrn} -> {self.section.name} [{self.status}]"


class Subject(models.Model):
    TIER_CHOICES = [
        ('JHS', 'Junior High School'),
        ('SHS', 'Senior High School'),
        ('ALS', 'Alternative Learning System'),
    ]

    SUBJECT_TYPE_CHOICES = [
        ('CORE', 'Core Curriculum Subject'),
        ('APPLIED', 'Applied Track Subject'),
        ('SPECIALIZED', 'Specialized Strand Subject'),
        ('ALS_MODULE', 'ALS Learning Strand Module'),
    ]

    UNIT_CHOICES = [
        (1, '1 Unit'),
        (2, '2 Units'),
        (3, '3 Units'),
        (4, '4 Units (Standard Subject)'),
        (5, '5 Units'),
    ]

    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=30, unique=True, help_text="e.g. MATH7, ENG10")
    title = models.CharField(max_length=200)
    tier = models.CharField(max_length=10, choices=TIER_CHOICES, default='JHS')
    subject_type = models.CharField(max_length=20, choices=SUBJECT_TYPE_CHOICES, default='CORE')
    units = models.IntegerField(choices=UNIT_CHOICES, default=4)

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
        StaffProfile,
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
# 4. OPERATIONAL LOGS, SCANS, TELEMETRY & GATE CONTROL
# ============================================================================
SCAN_METHOD_CHOICES = [
    ('RFID', 'RFID Tap (Primary)'),
    ('QR', 'QR Code Scan (Backup)'),
]

class StaffGateLog(models.Model):
    DIRECTION_CHOICES = [
        ('IN', 'Time In (Arrival)'),
        ('OUT', 'Time Out (Departure)'),
    ]

    id = models.BigAutoField(primary_key=True)
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    class Meta:
        db_table = 'staff_gate_logs'
        ordering = ['-scan_time']


class StudentGateLog(models.Model):
    DIRECTION_CHOICES = [
        ('IN', 'Entry (Arrival)'),
        ('OUT', 'Exit (Departure)'),
    ]

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='gate_logs')
    kiosk = models.ForeignKey(IoTKiosk, on_delete=models.SET_NULL, null=True, blank=True)
    scan_time = models.DateTimeField(default=timezone.now)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    scan_method = models.CharField(max_length=10, choices=SCAN_METHOD_CHOICES, default='RFID')
    raw_identifier = models.CharField(max_length=128)

    class Meta:
        db_table = 'student_gate_logs'
        ordering = ['-scan_time']
        indexes = [
            models.Index(fields=['student', 'scan_time'], name='idx_stu_gate_time'),
        ]

    def __str__(self):
        return f"{self.student.lrn} {self.direction} ({self.scan_method}) @ {self.scan_time}"

class SubjectAttendanceLog(models.Model):
    STATUS_CHOICES = [
        ('PRESENT', 'Present'),
        ('LATE', 'Late / Tardy'),
        ('CUTTING', 'Cutting Classes'),
        ('ABSENT', 'Absent'),
    ]

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='subject_attendance')
    schedule = models.ForeignKey(Schedule, on_delete=models.CASCADE, related_name='attendance_records')
    teacher = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='submitted_attendance')
    attendance_date = models.DateField(default=timezone.now)
    scanned_at = models.DateTimeField(default=timezone.now)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PRESENT')

    class Meta:
        db_table = 'subject_attendance_logs'
        unique_together = ('student', 'schedule', 'attendance_date')
        indexes = [
            models.Index(fields=['attendance_date', 'schedule', 'status'], name='idx_sub_att_lookup'),
        ]

    def __str__(self):
        return f"{self.student.lrn} -> {self.status} on {self.attendance_date}"


class DailyAttendanceSummary(models.Model):
    STATUS_CHOICES = [
        ('PRESENT', 'Present'),
        ('LATE', 'Late / Tardy'),
        ('CUTTING', 'Cutting Classes'),
        ('ABSENT', 'Absent'),
    ]

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='daily_summaries')
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='daily_summaries')
    attendance_date = models.DateField(default=timezone.now)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PRESENT')
    remarks = models.CharField(max_length=255, blank=True, default='')

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
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='heartbeats')
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    battery_level = models.IntegerField(default=100)
    is_inside_geofence = models.BooleanField(default=True)
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'faculty_heartbeats'
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['staff', 'recorded_at'], name='idx_heartbeat_time'),
        ]


class LoafingIncident(models.Model):
    STATUS_CHOICES = [
        ('PENDING_REVIEW', 'Pending Review'),
        ('EXCUSED', 'Excused'),
        ('CONFIRMED', 'Confirmed Violation'),
    ]

    id = models.BigAutoField(primary_key=True)
    staff = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='loafing_logs')
    incident_date = models.DateField(default=timezone.now)
    trigger_reason = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING_REVIEW')
    remarks = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'loafing_incidents'
        ordering = ['-created_at']


class GatePass(models.Model):
    PASS_TYPE_CHOICES = [
        ('OFFICIAL_BUSINESS', 'Official Business (OB)'),
        ('MEDICAL_EMERGENCY', 'Medical Emergency / Clinic Referral'),
        ('EARLY_DISMISSAL', 'Authorized Early Dismissal'),
        ('PERSONAL_MATTER', 'Approved Personal Urgent Matter'),
    ]

    PASS_STATUS_CHOICES = [
        ('ACTIVE', 'Active / Ready to Use'),
        ('USED', 'Used / Checked at Gate'),
        ('EXPIRED', 'Expired Validity'),
        ('REVOKED', 'Revoked / Cancelled'),
    ]

    id = models.BigAutoField(primary_key=True)
    pass_number = models.CharField(max_length=50, unique=True)
    staff = models.ForeignKey(StaffProfile, on_delete=models.SET_NULL, null=True, blank=True)
    student = models.ForeignKey(Student, on_delete=models.SET_NULL, null=True, blank=True)
    issued_by = models.ForeignKey(StaffProfile, on_delete=models.CASCADE, related_name='issued_passes')
    pass_type = models.CharField(max_length=50, choices=PASS_TYPE_CHOICES, default='OFFICIAL_BUSINESS')
    reason = models.TextField()
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField()
    status = models.CharField(max_length=20, choices=PASS_STATUS_CHOICES, default='ACTIVE')

    class Meta:
        db_table = 'gate_passes'

    def __str__(self):
        return f"{self.pass_number} ({self.status})"


class SmsOutbox(models.Model):
    TRIGGER_EVENT_CHOICES = [
        ('CLASS_TAP', 'Classroom Attendance Tap'),
        ('GATE_TAP', 'Gate Kiosk RFID Tap'),
        ('GATE_PASS', 'Gate Pass Issuance'),
        ('LOAFING_ALERT', 'Campus Perimeter Breach Alert'),
        ('SARDO_WARNING', 'SARDO (5-Day Consecutive Absence) Alert'),
        ('MANUAL_ANNOUNCEMENT', 'Institutional School Broadcast'),
    ]

    PRIORITY_CHOICES = [
        (1, 'Priority 1 - Urgent (Absence, Cutting, Gate Violation)'),
        (2, 'Priority 2 - Standard (Regular Present Tap)'),
    ]

    STATUS_CHOICES = [
        ('PENDING', 'Pending Transmission'),
        ('PROCESSING', 'Processing by Serial Modem'),
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