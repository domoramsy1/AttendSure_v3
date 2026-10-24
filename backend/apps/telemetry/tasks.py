import json
from celery import shared_task
from django_redis import get_redis_connection
from django.core.cache import cache
from apps.academics.models import FacultyProfile, FacultyHeartbeat, SchoolProfile
from apps.api.views.common import calculate_distance_meters


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
                "name": school.school_name,
            }
            cache.set(cache_key, data, timeout=86400)
    return data


@shared_task
def process_telemetry_batch(telemetry_event):
    redis_conn = get_redis_connection("default")
    redis_conn.rpush("queue:telemetry_heartbeats", json.dumps(telemetry_event))
    return f"Event {telemetry_event.get('request_id')} queued."


@shared_task
def flush_telemetry_queue_batch(batch_size=500):
    redis_conn = get_redis_connection("default")
    events = []

    for _ in range(batch_size):
        item = redis_conn.lpop("queue:telemetry_heartbeats")
        if not item:
            break
        events.append(json.loads(item))

    if not events:
        return "No pending heartbeats to flush."

    user_ids = {e['user_id'] for e in events if 'user_id' in e}
    profiles = {
        fp.account.user_id: fp
        for fp in FacultyProfile.objects.select_related('account').filter(account__user_id__in=user_ids)
    }

    school_data = get_cached_school_geofence()
    records_to_create = []

    for event in events:
        faculty = profiles.get(event.get('user_id'))
        if not faculty:
            continue

        is_inside = True
        if school_data:
            distance = calculate_distance_meters(
                event['latitude'],
                event['longitude'],
                school_data['latitude'],
                school_data['longitude'],
            )
            is_inside = distance <= school_data['radius']

        records_to_create.append(
            FacultyHeartbeat(
                faculty=faculty,
                latitude=event['latitude'],
                longitude=event['longitude'],
                battery_level=event.get('battery_level', 100),
                is_inside_geofence=is_inside,
            )
        )

    if records_to_create:
        FacultyHeartbeat.objects.bulk_create(records_to_create, batch_size=500)

    return f"Processed {len(records_to_create)} heartbeats."
