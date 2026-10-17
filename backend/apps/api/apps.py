"""
AttendSure - API & IoT Gateway Application Configuration
App: apps.api
File: backend/apps/api/apps.py
"""

import sys
import logging
from django.apps import AppConfig

logger = logging.getLogger('apps.api')


class ApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.api'
    verbose_name = 'AttendSure API & IoT Gateway Services'

    def ready(self):
        """
        Runs when the Django server boots up.
        
        Cybersecurity Safeguards Applied:
        1. Availability Defense: Catches import errors gracefully to prevent turnstile shutdowns.
        2. Migration Shield: Blocks event triggers while running database migrations or tests.
        3. Audit Tracking: Logs initialization states directly to security loggers.
        """
        # Step 1: Skip event hooks during database maintenance commands
        management_commands = {'makemigrations', 'migrate', 'test', 'collectstatic'}
        if any(cmd in sys.argv for cmd in management_commands):
            return

        # Step 2: Safely load API signals (tokens, auth events, hardware listeners)
        try:
            import apps.api.signals  # noqa: F401
            logger.info("API gateway security signals loaded successfully.")
        except ImportError:
            # Safe pass if apps/api/signals.py is not yet used or needed
            pass
        except Exception as exc:
            # Prevents the entire backend from crashing during morning gate rushes
            logger.critical(
                f"SECURITY ALERT: Unexpected error during API app initialization: {exc}",
                exc_info=True
            )