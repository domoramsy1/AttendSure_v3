"""
AttendSure - Academic Management Application Configuration
App: apps.academics
File: apps/academics/apps.py
"""

import sys
import logging
from django.apps import AppConfig

logger = logging.getLogger('apps.academics')


class AcademicsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.academics'
    verbose_name = 'Academic Affairs & Campus Governance'

    def ready(self):
        """
        Connect signals safely when Django boots.
        Applies cybersecurity safeguards:
        1. Prevents duplicate signal triggers on gate Gate Scanners.
        2. Logs failed imports instead of crashing campus hardware.
        3. Skips signal execution during database migrations.
        """
        # Cybersecurity safeguard: Do not fire event listeners during schema migrations or tests
        is_management_command = any(
            cmd in sys.argv for cmd in ['makemigrations', 'migrate', 'test', 'collectstatic']
        )
        if is_management_command:
            return

        try:
            # Register automated listeners (RFID logging, gate alerts, SMS dispatch)
            import apps.academics.signals  # noqa: F401
            logger.info("Academics security signals connected successfully.")
        except ImportError as exc:
            # Prevent whole server shutdown if signals file is missing or has an import error
            logger.error(
                f"SECURITY WARNING: Academics signals failed to load: {exc}",
                exc_info=True
            )
        except Exception as exc:
            logger.critical(
                f"CRITICAL: Unexpected error while binding Academics signals: {exc}",
                exc_info=True
            )