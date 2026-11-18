from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

from common.security import clear_system_cache_view, database_health_view

v1_patterns = [
    path("health/db/", database_health_view, name="health-db"),
    path("cache/flush/", clear_system_cache_view, name="cache-flush"),
    path("accounts/", include("apps.accounts.urls")),
    path("school/", include("apps.school.urls")),
    path("students/", include("apps.students.urls")),
    path("attendance/", include("apps.attendance.urls")),
    path("campus/", include("apps.campus.urls")),
    path("messaging/", include("apps.messaging.urls")),
    path("reports/", include("apps.reports.urls")),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include((v1_patterns, "v1"))),
    path("api/", include("config.legacy_urls")),
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)