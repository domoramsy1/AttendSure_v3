"""
AttendSure V3 - Software License Verification Middleware
File: backend/apps/core/middleware.py
"""

import logging
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from apps.core.licensing import verify_system_license

logger = logging.getLogger(__name__)


class SoftwareLicenseMiddleware(MiddlewareMixin):
    """
    Validates institutional hardware fingerprint and licensing.
    Allows authentication, static assets, and health checks to bypass license checks.
    """
    EXEMPT_PATHS = [
        '/api/auth/',
        '/api/utils/db-check/',
        '/api/core/maintenance/db-check/',
        '/admin/',
        '/static/',
        '/media/',
    ]

    def process_request(self, request):
        path = request.path

        # Allow exempt system paths
        if any(path.startswith(exempt) for exempt in self.EXEMPT_PATHS):
            return None

        # Verify licensing status
        is_valid, message = verify_system_license()
        if not is_valid:
            logger.warning(f"Software license check rejected: {message}")
            return JsonResponse({
                'error': 'Institutional License Inactive',
                'detail': message,
                'status': 'LOCKED',
            }, status=403)

        return None