"""
AttendSure V3 - Live Geofence Proxy Router
File: backend/apps/api/geofence_views.py

Re-exports the primary database-backed views from apps.api.views.geofence to ensure
seamless routing regardless of which import path is used in urls.py.
"""

from apps.api.views.geofence import (
    GeofenceStatusAPIView,
    GeofenceCheckInAPIView,
    GeofenceAuditHistoryAPIView,
    FacultyDeviceResetAPIView,
    calculate_haversine_distance,
    get_real_school_config,
    resolve_faculty_from_user,
    format_online_offline_status,
)

__all__ = [
    'GeofenceStatusAPIView',
    'GeofenceCheckInAPIView',
    'GeofenceAuditHistoryAPIView',
    'FacultyDeviceResetAPIView',
    'calculate_haversine_distance',
    'get_real_school_config',
    'resolve_faculty_from_user',
    'format_online_offline_status',
]