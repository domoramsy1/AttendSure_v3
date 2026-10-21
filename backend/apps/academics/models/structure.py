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
