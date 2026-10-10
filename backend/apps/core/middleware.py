"""
AttendSure V3 - Software License Enforcement Middleware
Protects the platform against unauthorized hardware cloning while permitting local development.
"""

import os
from django.conf import settings
from django.http import JsonResponse
from apps.academics.models import SchoolProfile
from .licensing import LicenseManager

class SoftwareLicenseMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # 1. Always allow static files, media, and system health checks
        if request.path.startswith('/static/') or request.path.startswith('/media/'):
            return self.get_response(request)

        if request.path in ('/api/health/', '/health/'):
            return self.get_response(request)

        # 2. Development Mode Bypass:
        # Allows full testing when DEBUG=True in settings or when ATTENDSURE_DEV_MODE is set
        is_dev = getattr(settings, 'DEBUG', False) or os.getenv('ATTENDSURE_DEV_MODE', '').lower() in ('true', '1')
        if is_dev:
            return self.get_response(request)

        # 3. Production Enforcement:
        # Strictly verify cryptographic signature, DepEd school ID, and physical motherboard UUID
        school = SchoolProfile.objects.first()
        active_school_id = school.school_id if school else ""

        try:
            LicenseManager.verify_system_license(active_school_id=active_school_id)
        except (PermissionError, ValueError) as exc:
            return JsonResponse({
                "status": "UNLICENSED_INSTANCE",
                "error": "Access Denied: Unlicensed Software Deployment",
                "detail": str(exc),
                "resolution": "Contact the authorized software vendor to acquire a valid license for this institution.",
                "vendor": "TechBlazer Systems",
            }, status=403)

        return self.get_response(request)