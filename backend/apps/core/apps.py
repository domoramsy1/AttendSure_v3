"""
AttendSure V3 - Core Security & Licensing App Configuration
File: backend/apps/core/apps.py
"""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'
    label = 'core'
    verbose_name = 'AttendSure Core Engine'