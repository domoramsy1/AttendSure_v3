"""
AttendSure V3 - School Profile, Academic Year & Campus GPS Boundary Models
File: backend/apps/academics/models/institution.py
"""

import math
from django.db import models, transaction


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
        with transaction.atomic():
            if self.is_active:
                qs = AcademicYear.objects.filter(is_active=True)
                if self.pk:
                    qs = qs.exclude(pk=self.pk)
                qs.update(is_active=False)
            super().save(*args, **kwargs)


class SchoolProfile(models.Model):
    school_id = models.CharField(max_length=50, unique=True)
    school_name = models.CharField(max_length=255)
    region = models.CharField(max_length=100, blank=True, default='')
    division = models.CharField(max_length=100, blank=True, default='')
    district = models.CharField(max_length=100, blank=True, default='')
    academic_year = models.CharField(max_length=20, blank=True, default='2026-2027')

    address = models.TextField(blank=True, default='')
    contact_number = models.CharField(max_length=50, blank=True, default='')
    email = models.EmailField(blank=True, default='')
    website = models.URLField(max_length=200, blank=True, default='')

    principal_faculty = models.ForeignKey(
        'FacultyProfile',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='schools_as_principal',
    )
    principal_name = models.CharField(max_length=255, blank=True, default='')
    principal_title = models.CharField(max_length=150, blank=True, default='Secondary School Principal IV')
    superintendent_name = models.CharField(max_length=255, blank=True, default='')

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

        earth_radius = 6371000.0
        phi1 = math.radians(c_lat)
        phi2 = math.radians(u_lat)
        delta_phi = math.radians(u_lat - c_lat)
        delta_lambda = math.radians(u_lon - c_lon)

        a = (math.sin(delta_phi / 2.0) ** 2 +
             math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lambda / 2.0) ** 2))
        return earth_radius * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)))

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
    radius_meters = models.PositiveIntegerField(default=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'geofence_settings'

    def __str__(self):
        return self.name