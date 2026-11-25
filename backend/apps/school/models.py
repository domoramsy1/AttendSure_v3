from django.db import models, transaction
from django.db.models import UniqueConstraint
from django.utils import timezone

DAY_OF_WEEK_CHOICES = [
    ("ALL_WEEKDAYS", "Monday to Friday"),
    ("MWF", "Monday, Wednesday, Friday"),
    ("TTH", "Tuesday, Thursday"),
    ("1", "Monday"),
    ("2", "Tuesday"),
    ("3", "Wednesday"),
    ("4", "Thursday"),
    ("5", "Friday"),
    ("6", "Saturday"),
    ("7", "Sunday"),
]

_NAMED_WEEKDAYS = {
    "MON": 1,
    "MONDAY": 1,
    "TUE": 2,
    "TUESDAY": 2,
    "WED": 3,
    "WEDNESDAY": 3,
    "THU": 4,
    "THURSDAY": 4,
    "FRI": 5,
    "FRIDAY": 5,
    "SAT": 6,
    "SATURDAY": 6,
    "SUN": 7,
    "SUNDAY": 7,
}


def expand_schedule_days(day_of_week: str | int | None) -> set[int]:
    """Return the ISO weekday numbers (1=Mon through 7=Sun) for a class period schedule."""
    clean = str(day_of_week or "ALL_WEEKDAYS").strip().upper()
    if clean in {"ALL_WEEKDAYS", "ALL", "WEEKDAYS", "MON-FRI", "MON_FRI"}:
        return {1, 2, 3, 4, 5}
    if clean == "MWF":
        return {1, 3, 5}
    if clean == "TTH":
        return {2, 4}
    if clean in _NAMED_WEEKDAYS:
        return {_NAMED_WEEKDAYS[clean]}
    if clean.isdigit():
        val = int(clean)
        if 1 <= val <= 7:
            return {val}

    days: set[int] = set()
    for token in clean.replace("/", ",").split(","):
        part = token.strip()
        if part in _NAMED_WEEKDAYS:
            days.add(_NAMED_WEEKDAYS[part])
        elif part.isdigit() and 1 <= int(part) <= 7:
            days.add(int(part))
    return days or {1, 2, 3, 4, 5}


def period_runs_on_weekday(day_of_week: str | int | None, iso_weekday: int) -> bool:
    """Return True when a class period's day_of_week includes the given ISO weekday (1=Mon..7=Sun)."""
    return iso_weekday in expand_schedule_days(day_of_week)

HOLIDAY_TYPE_CHOICES = [
    ("HOLIDAY", "Holiday"),
    ("SUSPENSION", "Class Suspension"),
    ("EVENT", "School Event"),
]


class SchoolYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=20, unique=True, db_index=True)
    start_date = models.DateField()
    baseline_cutoff_date = models.DateField(null=True, blank=True)
    end_date = models.DateField()
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "school_years"
        ordering = ["-start_date"]

    @property
    def code(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.is_active:
                SchoolYear.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)
            super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class AdministrativeDivision(models.Model):
    """3NF Geographic Hierarchy Lookup: Region / Division / District."""

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
    3NF School Settings:
    - Links to SchoolYear, TeacherProfile (Principal), AdministrativeDivision, and CampusBoundary.
    - Zero duplicated text for school year, principal name, or GPS boundary fields.
    """

    id = models.BigAutoField(primary_key=True)
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
    principal_teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="headed_schools",
    )
    superintendent_name = models.CharField(max_length=255, blank=True, default="")
    school_logo = models.CharField(max_length=255, blank=True, null=True)
    left_logo = models.CharField(max_length=255, blank=True, null=True)
    right_logo = models.CharField(max_length=255, blank=True, null=True)
    weekend_rest_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "school_settings"


class SchoolHoliday(models.Model):
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

    def __str__(self) -> str:
        return self.name


class Room(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    building = models.ForeignKey(
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
    def building_name(self) -> str:
        return self.building.name if (self.building_id and self.building) else ""

    def __str__(self) -> str:
        return self.name


class GradeLevel(models.Model):
    id = models.BigAutoField(primary_key=True)
    level_number = models.PositiveSmallIntegerField(unique=True, db_index=True)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100, unique=True)
    stage = models.CharField(max_length=20, blank=True, default="JHS")

    class Meta:
        db_table = "grade_levels"
        ordering = ["level_number"]

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = f"G{self.level_number}"
        if not self.stage:
            self.stage = "SHS" if self.level_number >= 11 else "JHS"
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.name


class Subject(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=30, unique=True, db_index=True)
    title = models.CharField(max_length=200)
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.CASCADE, null=True, blank=True, related_name="subjects"
    )
    subject_category = models.CharField(max_length=50, blank=True, default="Core")
    units = models.PositiveSmallIntegerField(default=1)

    class Meta:
        db_table = "subjects"
        ordering = ["code"]

    def __str__(self) -> str:
        return f"{self.code} - {self.title}"


class Section(models.Model):
    """
    Strict 3NF Section:
    - Uniquely constrained by (school_year, grade_level, name).
    - Adviser references TeacherProfile directly.
    """

    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True, default="")
    school_year = models.ForeignKey(SchoolYear, on_delete=models.CASCADE, related_name="sections")
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="sections")
    adviser = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="advising_sections",
    )
    room_name = models.CharField(max_length=100, blank=True, default="")
    track_strand = models.CharField(max_length=150, blank=True, default="")
    capacity = models.PositiveIntegerField(default=45)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "sections"
        ordering = ["grade_level__level_number", "name"]
        constraints = [
            UniqueConstraint(fields=["school_year", "grade_level", "name"], name="uq_section_year_grade_name")
        ]

    @property
    def room_number(self) -> str:
        return self.room_name

    def __str__(self) -> str:
        return f"{self.grade_level.name} - {self.name}" if self.grade_level_id else self.name


class ClassPeriod(models.Model):
    """
    Strict 3NF ClassPeriod:
    - Never stores school_year or grade_level (determined via ClassPeriod -> Section).
    - Atomic day_of_week choice (1..7, ALL_WEEKDAYS, MWF, TTH).
    """

    id = models.BigAutoField(primary_key=True)
    schedule_code = models.CharField(max_length=64, blank=True, default="", db_index=True)
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="class_periods")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="class_periods")
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_periods",
    )
    day_of_week = models.CharField(
        max_length=16, choices=DAY_OF_WEEK_CHOICES, default="ALL_WEEKDAYS", db_index=True
    )
    start_time = models.TimeField(db_index=True)
    end_time = models.TimeField()
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "class_periods"
        ordering = ["start_time"]
        indexes = [
            models.Index(fields=["teacher", "is_active"], name="idx_period_teacher_active"),
            models.Index(fields=["section", "is_active"], name="idx_period_section_active"),
        ]

    @property
    def room_name(self) -> str:
        return self.section.room_name if (self.section_id and self.section) else ""

    def runs_on_weekday(self, iso_weekday: int) -> bool:
        return period_runs_on_weekday(self.day_of_week, iso_weekday)

    def __str__(self) -> str:
        subj = self.subject.code if self.subject_id else "CLASS"
        sec = self.section.name if self.section_id else ""
        return f"{sec} {subj} ({self.start_time}-{self.end_time})"
