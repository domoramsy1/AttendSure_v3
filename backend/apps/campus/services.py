from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from common.audit import record_audit_log
from common.exceptions import AppError
from common.gps import verify_campus_gps
from apps.accounts.selectors import resolve_teacher_for_user
from apps.school.models import ClassPeriod, SchoolSettings
from .models import BoundaryAlert, CampusBoundary, TeacherLocationLog
from .selectors import get_active_campus_coords


@transaction.atomic
def update_campus_boundary(*, request, name: str, latitude: float, longitude: float, radius_meters: int) -> CampusBoundary:
    if not (20 <= radius_meters <= 5000):
        raise AppError("INVALID_RADIUS", "Campus radius must be between 20 and 5000 meters.", 400)

    boundary, _ = CampusBoundary.objects.update_or_create(
        id=1,
        defaults={
            "name": name.strip() or "Campus Boundary",
            "latitude": latitude,
            "longitude": longitude,
            "radius_meters": radius_meters,
            "is_active": True,
        },
    )

    school = SchoolSettings.objects.first()
    if school:
        school.latitude = latitude
        school.longitude = longitude
        school.geofence_radius_meters = radius_meters
        school.save(update_fields=["latitude", "longitude", "geofence_radius_meters", "updated_at"])

    record_audit_log(
        request=request,
        table_name="geofence_settings",
        record_id=boundary.id,
        action="UPDATE",
        new_data={"latitude": latitude, "longitude": longitude, "radius_meters": radius_meters},
    )
    return boundary


@transaction.atomic
def record_teacher_check_in(*, user, validated_data: dict, header_device_id: str = "") -> dict:
    teacher = resolve_teacher_for_user(user)
    if not teacher:
        raise AppError("NO_TEACHER_PROFILE", "No teacher profile is linked to this account.", 403)

    if validated_data.get("face_verified") is False or validated_data.get("liveness_passed") is False:
        raise AppError("FACE_CHECK_FAILED", "Mobile face or liveness verification failed.", 403)

    device_id = str(validated_data.get("client_device_id") or header_device_id or "").strip()
    if device_id:
        if not teacher.bound_device_id:
            teacher.bound_device_id = device_id
            teacher.device_bound_at = timezone.now()
            teacher.save(update_fields=["bound_device_id", "device_bound_at"])
        elif teacher.bound_device_id != device_id:
            raise AppError(
                "DEVICE_MISMATCH",
                "Account is bound to another phone. Request a device reset from an administrator.",
                403,
            )

    campus_lat, campus_lon, radius, _ = get_active_campus_coords()
    gps = verify_campus_gps(
        latitude=validated_data["latitude"],
        longitude=validated_data["longitude"],
        campus_lat=campus_lat,
        campus_lon=campus_lon,
        radius_meters=radius,
        accuracy_meters=validated_data.get("accuracy"),
        is_mock_location=validated_data.get("is_mock_location", False),
    )
    if not gps["is_valid"]:
        raise AppError("INVALID_GPS", gps["reason"], 400)

    now = timezone.now()
    log = TeacherLocationLog.objects.create(
        teacher=teacher,
        latitude=validated_data["latitude"],
        longitude=validated_data["longitude"],
        battery_level=validated_data.get("battery_level", 100),
        is_inside_geofence=gps["is_inside"],
        recorded_at=now,
    )

    if gps["is_inside"]:
        local_now = timezone.localtime(now)
        cutoff = (local_now - timedelta(minutes=15)).time()
        unlogged_period = (
            ClassPeriod.objects.filter(
                teacher=teacher,
                is_active=True,
                start_time__lte=cutoff,
                end_time__gte=local_now.time(),
            )
            .exclude(attendance_records__attendance_date=local_now.date())
            .select_related("subject")
            .first()
        )
        if unlogged_period:
            BoundaryAlert.objects.get_or_create(
                teacher=teacher,
                incident_date=local_now.date(),
                trigger_reason=f"On campus via mobile check-in, but no QR scans recorded for {unlogged_period.subject.code}.",
            )

    return {
        "ok": True,
        "success": True,
        "heartbeat_id": log.id,
        "is_inside_geofence": gps["is_inside"],
        "distance_meters": gps["distance_meters"],
        "allowed_radius": gps["allowed_radius"],
        "message": gps["reason"],
    }