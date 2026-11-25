# AttendSure Backend - Root API URL Routes
# File: D:\AttendSure_V3\backend\config\urls.py

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from apps.accounts.views import OnboardingCompleteView, OnboardingResetView
from common.security import clear_system_cache_view, database_health_view


def serve_cached_media(request, path):
    response = serve(request, path, document_root=settings.MEDIA_ROOT)
    response["Cache-Control"] = "public, max-age=86400"
    origin = request.headers.get("Origin", "")
    if origin and origin in getattr(settings, "CORS_ALLOWED_ORIGINS", []):
        response["Access-Control-Allow-Origin"] = origin
    return response


v1_patterns = [
    path("health/db/", database_health_view, name="health-db"),
    path("cache/flush/", clear_system_cache_view, name="cache-flush"),
    path("auth/onboarding/complete/", OnboardingCompleteView.as_view(), name="v1-auth-onboarding-complete"),
    path("auth/onboarding/reset/", OnboardingResetView.as_view(), name="v1-auth-onboarding-reset"),
    path("accounts/", include("apps.accounts.urls")),
    path("school/", include("apps.school.urls")),
    path("students/", include("apps.students.urls")),
    path("attendance/", include("apps.attendance.urls")),
    path("campus/", include("apps.campus.urls")),
    path("reports/", include("apps.reports.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include((v1_patterns, "v1"))),
    re_path(r"^media/(?P<path>.*)$", serve_cached_media),
]

if getattr(settings, "ENABLE_LEGACY_API_ROUTES", False):
    urlpatterns.append(path("api/", include("config.legacy_urls")))

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
