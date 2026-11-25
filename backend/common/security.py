# AttendSure Backend - Common Security
# File: D:\AttendSure_V3\backend\common\security.py

# D:\AttendSure_V3\backend\common\security.py

import time
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from common.audit import record_audit_log
from common.permissions import IsSchoolLeader


class ApiSecurityMiddleware:
    """
    Applies OWASP security headers and prevents Django debug HTML pages
    from leaking internal URL patterns when an /api/ path returns 404.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        if request.path.startswith("/api/") and response.status_code == 404:
            content_type = response.get("Content-Type", "")
            if "text/html" in content_type:
                msg = f"API route not found: {request.path}"
                response = JsonResponse(
                    {
                        "ok": False,
                        "error_code": "ENDPOINT_NOT_FOUND",
                        "message": msg,
                        "detail": msg,
                        "error": msg,
                    },
                    status=404,
                )

        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Referrer-Policy"] = "same-origin"
        response["Permissions-Policy"] = "camera=(self), geolocation=(self), microphone=()"

        if request.path.startswith(("/api/auth/", "/api/v1/accounts/login", "/api/me", "/api/v1/accounts/me")):
            response["Cache-Control"] = "no-store, no-cache, must-revalidate, private"

        return response


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def database_health_view(request):
    """Checks live PostgreSQL connectivity without exposing database credentials or hosts."""
    started = time.perf_counter()
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1;")
        cursor.fetchone()
    latency_ms = max(1, round((time.perf_counter() - started) * 1000))
    return Response(
        {
            "ok": True,
            "status": "CONNECTED",
            "database": "CONNECTED",
            "latency_ms": latency_ms,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated, IsSchoolLeader])
def clear_system_cache_view(request):
    """Clears server cache for school leaders (Principals & Admins) and logs the action."""
    cache.clear()
    record_audit_log(
        request=request,
        table_name="system_cache",
        record_id=0,
        action="FLUSH",
    )
    return Response(
        {"ok": True, "success": True, "message": "System cache cleared."},
        status=status.HTTP_200_OK,
    )
