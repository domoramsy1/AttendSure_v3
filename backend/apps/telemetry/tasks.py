"""
AttendSure V3 - Asynchronous Ingestion & Batch Tasks
File: backend/apps/telemetry/tasks.py
"""

import json
import math
from celery import shared_task
from django_redis import get_redis_connection
from django.core.cache import cache
from apps.academics.models import FacultyProfile, FacultyHeartbeat, SchoolProfile

def calculate_haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * \
        math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def get_cached_school_geofence():
    cache_key = "cache:school_geofence:active"
    data = cache.get(cache_key)
    if not data:
        school = SchoolProfile.objects.first()
        if school and school.latitude is not None and school.longitude is not None:
            data = {
                "latitude": float(school.latitude),
                "longitude": float(school.longitude),
                "radius": float(school.geofence_radius_meters or 150),
                "name": school.school_name
            }
            cache.set(cache_key, data, timeout=86400)
    return data

@shared_task
def process_telemetry_batch(telemetry_event):
    """Processes a single asynchronous heartbeat dispatched from the API."""
    redis_conn = get_redis_connection("default")
    redis_conn.rpush("queue:telemetry_heartbeats", json.dumps(telemetry_event))
    return f"Event {telemetry_event.get('request_id')} queued successfully."

@shared_task
def flush_telemetry_queue_batch(batch_size=500):
    """Periodic task: Flushes queued Redis telemetry into PostgreSQL in bulk."""
    redis_conn = get_redis_connection("default")
    events = []

    for _ in range(batch_size):
        item = redis_conn.lpop("queue:telemetry_heartbeats")
        if not item:
            break
        events.append(json.loads(item))

    if not events:
        return "No pending heartbeats to flush."

    user_ids = {e['user_id'] for e in events}
    profiles = {
        fp.user_id: fp
        for fp in FacultyProfile.objects.filter(user_id__in=user_ids)
    }

    school_data = get_cached_school_geofence()
    records_to_create = []

    for event in events:
        faculty = profiles.get(event['user_id'])
        if not faculty:
            continue

        is_inside = True
        distance = 0.0

        if school_data:
            distance = calculate_haversine(
                event['latitude'],
                event['longitude'],
                school_data['latitude'],
                school_data['longitude']
            )
            is_inside = distance <= school_data['radius']

        records_to_create.append(
            FacultyHeartbeat(
                faculty=faculty,
                latitude=event['latitude'],
                longitude=event['longitude'],
                battery_level=event.get('battery_level', 100),
                is_inside_geofence=is_inside
            )
        )

    if records_to_create:
        FacultyHeartbeat.objects.bulk_create(records_to_create, batch_size=500)

    return f"Processed {len(records_to_create)} heartbeats."