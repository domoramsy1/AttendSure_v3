# AttendSure Backend - Campus App Configuration
# File: D:\AttendSure_V3\backend\apps\campus\apps.py

from django.apps import AppConfig


class CampusConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.campus"
    label = "campus"
    verbose_name = "Campus GPS & Time Records"
