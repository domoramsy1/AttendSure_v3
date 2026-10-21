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
