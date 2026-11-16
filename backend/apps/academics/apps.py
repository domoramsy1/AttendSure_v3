"""
AttendSure V3 - Academic Application Configuration (Mobile Phone & Laptop/PC Only)
File: backend/apps/academics/apps.py
"""

import logging
import sys
from django.apps import AppConfig

logger = logging.getLogger('apps.academics')


class AcademicsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.academics'
    verbose_name = 'Academic Affairs & Mobile Attendance'

    def ready(self):
        """
        Connects database signals for user roles and uniform grade-level subjects.
        Skips signal execution during schema migrations and test runs.
        """
        is_management_command = any(
            cmd in sys.argv for cmd in ['makemigrations', 'migrate', 'test', 'collectstatic']
        )
        if is_management_command:
            return

        try:
            import apps.academics.signals  # noqa: F401
            logger.info("Academics security signals connected successfully.")
        except Exception as exc:
            logger.error("Failed to load academics signals: %s", exc, exc_info=True)
