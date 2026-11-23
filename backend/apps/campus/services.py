# backend/apps/campus/services.py
from datetime import timedelta
from django.db import transaction
from django.utils import timezone

from common.audit import record_audit_log
from common.exceptions import AppError
from common.gps import verify_campus_gps
from apps.accounts.selectors import resolve_faculty_for_user
from apps.school.models import ClassPeriod, SchoolSettings
from .models import BoundaryAlert, CampusBoundary, FacultyAttendanceLog
from .selectors import get_active_campus_coords


def _infer_attendance_action(local_dt) -> str:
    hr = local_dt.hour
    if hr < 11:
        return "TIME_IN_AM"
    if hr == 11 or (hr == 12 and local_dt.minute < 30):
        return "TIME_OUT_AM"
    if hr < 16:
        return "TIME_IN_PM"
    return "TIME_OUT_PM"


@transaction.atomic
def update_campus_boundary(
    *,
    request,
    name: str,
    latitude: float,
    longitude: float,
    radius_meters: int,
    grace_minutes: int = 10,
) -> CampusBoundary:
    if not (20 <= radius_meters <= 5000):
        raise AppError("INVALID_RADIUS", "Campus radius must be between 20 and 5000 meters.", 400)

    boundary, _ = CampusBoundary.objects.update_or_create(
        id=1,
        defaults={
            "name": name.strip() or "Main Campus",
            "center_lat": latitude,
            "center_lng": longitude,
            "radius_meters": radius_meters,
            "grace_minutes": grace_minutes,
            "is_active": True,
        },
    )

    school = SchoolSettings.objects.first()
    if school and school.campus_boundary_id != boundary.id:
        school.campus_boundary = boundary
        school.save(update_fields=["campus_boundary", "updated_at"])

    record_audit_log(
        request=request,
        table_name=CampusBoundary._meta.db_table,
        record_id=boundary.id,
        action="UPDATE",
        new_data={"latitude": latitude, "longitude": longitude, "radius_meters": radius_meters},
    )
    return boundary


@transaction.atomic
def record_faculty_check_in(*, user, validated_data: dict, header_device_id: str = "") -> dict:
    faculty = resolve_faculty_for_user(user)
    if not faculty:
        raise AppError("NO_FACULTY_PROFILE", "No faculty profile is linked to this account.", 403)

    if validated_data.get("face_verified") is False or validated_data.get("liveness_passed") is False:
        raise AppError("FACE_CHECK_FAILED", "Mobile on-device face check failed.", 403)

    device_id = str(validated_data.get("client_device_id") or header_device_id or "").strip()
    device_model = str(validated_data.get("device_model") or "").strip()[:100]
    if device_id:
        if not faculty.bound_device_id:
            faculty.bound_device_id = device_id
            if device_model:
                faculty.device_model = device_model
            faculty.device_bound_at = timezone.now()
            faculty.save(update_fields=["bound_device_id", "device_model", "device_bound_at"])
        elif faculty.bound_device_id != device_id:
            raise AppError(
                "DEVICE_MISMATCH",
                "This account is bound to another phone. Ask an administrator to reset your phone lock.",
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
    local_now = timezone.localtime(now)
    action_code = validated_data.get("action") or _infer_attendance_action(local_now)

    log = FacultyAttendanceLog.objects.create(
        faculty=faculty,
        log_date=local_now.date(),
        action=action_code,
        recorded_at=now,
        latitude=validated_data["latitude"],
        longitude=validated_data["longitude"],
        distance_meters=float(gps["distance_meters"] or 0.0),
        is_within_boundary=bool(gps["is_inside"]),
        face_verified=True,
        device_id=device_id,
        remarks=gps["reason"][:255],
    )

    if not gps["is_inside"]:
        BoundaryAlert.objects.get_or_create(
            faculty=faculty,
            incident_date=local_now.date(),
            status="OPEN",
            defaults={
                "left_at": now,
                "last_lat": validated_data["latitude"],
                "last_lng": validated_data["longitude"],
                "distance_meters": float(gps["distance_meters"] or 0.0),
                "remarks": gps["reason"][:255],
            },
        )
    else:
        BoundaryAlert.objects.filter(
            faculty=faculty, incident_date=local_now.date(), status="OPEN"
        ).update(status="RESOLVED", returned_at=now)

        cutoff = (local_now - timedelta(minutes=15)).time()
        unlogged_period = (
            ClassPeriod.objects.filter(
                faculty=faculty,
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
                faculty=faculty,
                incident_date=local_now.date(),
                remarks=f"On campus via mobile check-in, but no QR scans recorded for {unlogged_period.subject.code}.",
                defaults={"left_at": now, "status": "OPEN"},
            )

    return {
        "ok": True,
        "success": True,
        "heartbeat_id": log.id,
        "action": log.action,
        "is_inside_geofence": gps["is_inside"],
        "distance_meters": gps["distance_meters"],
        "allowed_radius": gps["allowed_radius"],
        "message": gps["reason"],
    }