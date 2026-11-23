from django.db import models, transaction
from django.db.models import UniqueConstraint
from django.utils import timezone

DAY_OF_WEEK_CHOICES = [
    (1, "Monday"),
    (2, "Tuesday"),
    (3, "Wednesday"),
    (4, "Thursday"),
    (5, "Friday"),
    (6, "Saturday"),
    (7, "Sunday"),
]

HOLIDAY_TYPE_CHOICES = [
    ("HOLIDAY", "Holiday"),
    ("SUSPENSION", "Class Suspension"),
    ("EVENT", "School Event"),
]


class SchoolYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    start_date = models.DateField()
    baseline_cutoff_date = models.DateField(db_column="first_friday_june")
    end_date = models.DateField()
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "academic_years"
        ordering = ["-start_date"]

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.is_active:
                SchoolYear.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)
            super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class AdministrativeDivision(models.Model):
    """3NF Lookup: District -> Division -> Region hierarchy."""

    id = models.BigAutoField(primary_key=True)
    region = models.CharField(max_length=100, blank=True, default="")
    division = models.CharField(max_length=100, blank=True, default="")
    district = models.CharField(max_length=100, blank=True, default="")

    class Meta:
        db_table = "school_divisions"
        constraints = [
            UniqueConstraint(fields=["region", "division", "district"], name="uq_region_div_dist")
        ]


class SchoolSettings(models.Model):
    """
    3NF School Profile:
    - Links to SchoolYear instead of duplicating academic_year text.
    - Links to FacultyProfile for Principal details (derives name & title via JOIN).
    - Links to CampusBoundary instead of duplicating latitude/longitude/radius.
    """

    school_id = models.CharField(max_length=50, unique=True)
    school_name = models.CharField(max_length=255)
    division_ref = models.ForeignKey(
        AdministrativeDivision,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="schools",
    )
    active_school_year = models.ForeignKey(
        SchoolYear,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="configured_schools",
    )
    campus_boundary = models.OneToOneField(
        "campus.CampusBoundary",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="school_profile",
    )

    address = models.TextField(blank=True, default="")
    contact_number = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(max_length=200, blank=True, default="")

    principal_faculty = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="principal_faculty_id",
        related_name="headed_schools",
    )
    superintendent_name = models.CharField(max_length=255, blank=True, default="")

    school_logo = models.CharField(max_length=255, blank=True, null=True)
    left_logo = models.CharField(max_length=255, blank=True, null=True)
    right_logo = models.CharField(max_length=255, blank=True, null=True)
    weekend_rest_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "attendsure_school_profile"


class SchoolHoliday(models.Model):
    """1NF & 3NF Compliant: Stores holiday_type atomically instead of '[TYPE] reason' strings."""

    id = models.BigAutoField(primary_key=True)
    holiday_date = models.DateField(unique=True, db_index=True)
    holiday_type = models.CharField(max_length=20, choices=HOLIDAY_TYPE_CHOICES, default="HOLIDAY", db_index=True)
    title = models.CharField(max_length=150)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "school_holidays"
        ordering = ["holiday_date"]


class Building(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        db_table = "buildings"
        ordering = ["name"]


class Room(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    building_ref = models.ForeignKey(
        Building, on_delete=models.SET_NULL, null=True, blank=True, related_name="rooms"
    )
    capacity = models.PositiveIntegerField(default=45)
    room_type = models.CharField(max_length=50, default="LECTURE")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "rooms"
        ordering = ["name"]

    @property
    def building(self) -> str:
        return self.building_ref.name if self.building_ref_id and self.building_ref else ""


class GradeLevel(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    stage = models.CharField(max_length=20, blank=True, default="JHS")
    level_order = models.IntegerField(default=1, db_index=True)

    class Meta:
        db_table = "grade_levels"
        ordering = ["level_order"]


class Section(models.Model):
    """3NF Section: Room name comes strictly from Room FK (no duplicate room_number text column)."""

    id = models.BigAutoField(primary_key=True)
    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.CASCADE, db_column="academic_year_id", related_name="sections"
    )
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="sections")
    adviser = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advising_sections",
    )
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="sections")
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True, default="")
    track_strand = models.CharField(max_length=150, blank=True, default="")
    capacity = models.IntegerField(default=45)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "sections"
        ordering = ["name"]
        constraints = [
            UniqueConstraint(fields=["school_year", "grade_level", "name"], name="uq_section_year_grade_name")
        ]

    @property
    def room_number(self) -> str:
        return self.room.name if self.room_id and self.room else ""


class Subject(models.Model):
    id = models.BigAutoField(primary_key=True)
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.CASCADE, null=True, blank=True, related_name="uniform_subjects"
    )
    code = models.CharField(max_length=30, unique=True)
    title = models.CharField(max_length=200)
    subject_category = models.CharField(max_length=50, blank=True, default="Core")
    units = models.IntegerField(default=1)

    class Meta:
        db_table = "subjects"
        ordering = ["code"]


class ClassPeriod(models.Model):
    """
    1NF & 3NF Schedule:
    - Single schedule_code (removed duplicate code).
    - Room resolved via Room FK (removed duplicate room_number).
    - Days stored atomically in ClassPeriodDay (removed multi-valued days_of_week text).
    """

    id = models.BigAutoField(primary_key=True)
    schedule_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="schedules")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="schedules")
    faculty = models.ForeignKey(
        "accounts.FacultyProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="faculty_id",
        related_name="assigned_periods",
    )
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="schedules")
    start_time = models.TimeField(db_index=True)
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "schedules"
        ordering = ["start_time"]
        indexes = [
            models.Index(fields=["section", "is_active", "start_time"], name="idx_sched_sec_active_time"),
            models.Index(fields=["faculty", "is_active"], name="idx_sched_fac_active"),
        ]

    @property
    def room_number(self) -> str:
        if self.room_id and self.room:
            return self.room.name
        if self.section_id and self.section and self.section.room_id and self.section.room:
            return self.section.room.name
        return ""

    @property
    def days_of_week(self) -> str:
        day_nums = sorted(d.day_of_week for d in self.days.all())
        if day_nums == [1, 2, 3, 4, 5] or not day_nums:
            return "MON-FRI"
        if day_nums == [1, 3, 5]:
            return "MWF"
        if day_nums == [2, 4]:
            return "TTH"
        names = {1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT", 7: "SUN"}
        return ",".join(names[n] for n in day_nums if n in names)


class ClassPeriodDay(models.Model):
    id = models.BigAutoField(primary_key=True)
    class_period = models.ForeignKey(
        ClassPeriod, on_delete=models.CASCADE, db_column="schedule_id", related_name="days"
    )
    day_of_week = models.PositiveSmallIntegerField(choices=DAY_OF_WEEK_CHOICES, default=1)

    class Meta:
        db_table = "schedule_days"
        constraints = [
            UniqueConstraint(fields=["class_period", "day_of_week"], name="uq_period_day_of_week")
        ]