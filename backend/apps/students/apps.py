# AttendSure Backend - Students App Configuration
# File: D:\AttendSure_V3\backend\apps\students\apps.py

from django.apps import AppConfig


class StudentsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.students"
    label = "students"
    verbose_name = "Students & Enrollments"
