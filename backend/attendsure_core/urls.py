"""
AttendSure V3 - Main Project Root URL Configuration
File: backend/attendsure_core/urls.py
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # Django Admin Portal
    path('admin/', admin.site.urls),

    # All AttendSure REST API endpoints
    path('api/', include('apps.api.urls')),
]

# Serve media uploads (student & faculty photos) during development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)