"""
AttendSure V3 - Software License Enforcement Middleware
File: backend/apps/core/middleware.py
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
        # 1. Bypass static, media, and health check routes
        if request.path.startswith('/static/') or request.path.startswith('/media/'):
            return self.get_response(request)

        if request.path in ('/api/health/', '/health/'):
            return self.get_response(request)

        # 2. Development Mode Bypass
        is_dev = getattr(settings, 'DEBUG', False) or os.getenv('ATTENDSURE_DEV_MODE', '').lower() in ('true', '1')
        if is_dev:
            return self.get_response(request)

        # 3. Production Verification (Matches verify_license in licensing.py)
        school = SchoolProfile.objects.first()
        active_school_id = school.school_id if school else ""

        try:
            LicenseManager.verify_license(active_school_id=active_school_id)
        except (PermissionError, ValueError) as exc:
            return JsonResponse({
                "status": "UNLICENSED_INSTANCE",
                "error": "Access Denied: Unlicensed Software Deployment",
                "detail": str(exc),
                "resolution": "Contact the authorized software vendor to acquire a valid license for this institution.",
                "vendor": "AttendSure Engineering",
            }, status=403)

        return self.get_response(request)