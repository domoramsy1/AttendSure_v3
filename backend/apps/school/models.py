from django.db import models, transaction
from django.db.models import UniqueConstraint
from django.utils import timezone

DAY_OF_WEEK_CHOICES = [
    (1, "Monday"), (2, "Tuesday"), (3, "Wednesday"),
    (4, "Thursday"), (5, "Friday"), (6, "Saturday"), (7, "Sunday"),
]


class SchoolYear(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    start_date = models.DateField()
    baseline_cutoff_date = models.DateField(db_column="first_friday_june")
    end_date = models.DateField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "academic_years"
        ordering = ["-start_date"]

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.is_active:
                SchoolYear.objects.filter(is_active=True).exclude(pk=self.pk).update(is_active=False)
            super().save(*args, **kwargs)

    def __str__(self):
        return self.code


class SchoolSettings(models.Model):
    school_id = models.CharField(max_length=50, unique=True)
    school_name = models.CharField(max_length=255)
    region = models.CharField(max_length=100, blank=True, default="")
    division = models.CharField(max_length=100, blank=True, default="")
    district = models.CharField(max_length=100, blank=True, default="")
    academic_year = models.CharField(max_length=20, blank=True, default="2026-2027")

    address = models.TextField(blank=True, default="")
    contact_number = models.CharField(max_length=50, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.URLField(max_length=200, blank=True, default="")

    principal_teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="principal_faculty_id",
        related_name="headed_schools",
    )
    principal_name = models.CharField(max_length=255, blank=True, default="")
    principal_title = models.CharField(max_length=150, blank=True, default="Secondary School Principal IV")
    superintendent_name = models.CharField(max_length=255, blank=True, default="")

    school_logo = models.TextField(blank=True, null=True)
    left_logo = models.TextField(blank=True, null=True)
    right_logo = models.TextField(blank=True, null=True)

    latitude = models.DecimalField(max_digits=10, decimal_places=7, default=8.4858000)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, default=124.6567000)
    geofence_radius_meters = models.IntegerField(default=150)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "attendsure_school_profile"


class SchoolHoliday(models.Model):
    id = models.BigAutoField(primary_key=True)
    holiday_date = models.DateField(unique=True, db_index=True)
    title = models.CharField(max_length=150)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "school_holidays"
        ordering = ["holiday_date"]


class StaffShift(models.Model):
    id = models.BigAutoField(primary_key=True)
    label = models.CharField(max_length=100, blank=True, default="")
    regular_days_label = models.CharField(max_length=100, blank=True, default="")
    saturday_label = models.CharField(max_length=100, blank=True, default="")
    am_arrival_start = models.TimeField(null=True, blank=True)
    am_arrival_cutoff = models.TimeField(null=True, blank=True)
    am_departure_time = models.TimeField(null=True, blank=True)
    pm_arrival_time = models.TimeField(null=True, blank=True)
    pm_departure_cutoff = models.TimeField(null=True, blank=True)
    late_threshold_min = models.IntegerField(default=15)

    class Meta:
        db_table = "class_schedules"


class Room(models.Model):
    id = models.BigAutoField(primary_key=True)
    name = models.CharField(max_length=100, unique=True)
    building = models.CharField(max_length=100, blank=True, default="")
    capacity = models.PositiveIntegerField(default=45)
    room_type = models.CharField(max_length=50, default="LECTURE")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "rooms"
        ordering = ["name"]


class GradeLevel(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    stage = models.CharField(max_length=20, blank=True, default="JHS")
    level_order = models.IntegerField(default=1)

    class Meta:
        db_table = "grade_levels"
        ordering = ["level_order"]


class Section(models.Model):
    id = models.BigAutoField(primary_key=True)
    school_year = models.ForeignKey(
        SchoolYear, on_delete=models.CASCADE, db_column="academic_year_id", related_name="sections"
    )
    grade_level = models.ForeignKey(GradeLevel, on_delete=models.CASCADE, related_name="sections")
    adviser = models.ForeignKey(
        "accounts.TeacherProfile", on_delete=models.SET_NULL, null=True, blank=True, related_name="advising_sections"
    )
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="sections")
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, blank=True, default="")
    track_strand = models.CharField(max_length=150, blank=True, default="")
    room_number = models.CharField(max_length=50, blank=True, default="")
    capacity = models.IntegerField(default=45)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "sections"
        ordering = ["name"]
        constraints = [
            UniqueConstraint(fields=["school_year", "grade_level", "name"], name="uq_section_year_grade_name")
        ]


class Subject(models.Model):
    id = models.BigAutoField(primary_key=True)
    grade_level = models.ForeignKey(
        GradeLevel, on_delete=models.CASCADE, null=True, blank=True, related_name="uniform_subjects"
    )
    code = models.CharField(max_length=30, unique=True)
    title = models.CharField(max_length=200)
    tier = models.CharField(max_length=20, blank=True, default="Core")
    subject_type = models.CharField(max_length=50, blank=True, default="Core")
    units = models.IntegerField(default=1)

    class Meta:
        db_table = "subjects"
        ordering = ["code"]


class ClassPeriod(models.Model):
    id = models.BigAutoField(primary_key=True)
    code = models.CharField(max_length=64, blank=True, default="")
    schedule_code = models.CharField(max_length=64, blank=True, default="")
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name="schedules")
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name="schedules")
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        db_column="faculty_id",
        related_name="assigned_periods",
    )
    room = models.ForeignKey(Room, on_delete=models.SET_NULL, null=True, blank=True, related_name="schedules")
    start_time = models.TimeField()
    end_time = models.TimeField()
    days_of_week = models.CharField(max_length=50, default="MON-FRI")
    room_number = models.CharField(max_length=50, blank=True, default="")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        db_table = "schedules"
        ordering = ["start_time"]


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