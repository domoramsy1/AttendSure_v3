# D:\AttendSure_V3\backend\apps\campus\services.py
from datetime import time as dt_time
from decimal import Decimal
import hmac
import math
import re
import time
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.html import strip_tags

from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import resolve_teacher_for_user
from apps.attendance.models import ExitPass
from apps.school.models import SchoolSettings
from common.audit import record_audit_log
from common.exceptions import AppError
from common.gps import calculate_distance_meters, verify_campus_gps
from .models import CampusBoundary, LoafingIncident, TeacherDailyAttendance, TeacherLocationPing
from .selectors import ACTIVE_BOUNDARY_CACHE_KEY, get_active_campus_boundary

MAX_PLAUSIBLE_SPEED_MPS = 55.0
BIOMETRIC_PROOF_HEX_RE = re.compile(r"^[0-9a-fA-F]{64}$")
BIOMETRIC_PROOF_MAX_DRIFT_MS = 120_000
BIOMETRIC_PROOF_REPLAY_TTL_SECONDS = 300


@transaction.atomic
def update_campus_boundary(
    *,
    request,
    campus_name: str = "Main Campus",
    center_latitude: float,
    center_longitude: float,
    radius_meters: int = 150,
    loafing_grace_minutes: int = 10,
    duty_start_time: dt_time | None = None,
    duty_end_time: dt_time | None = None,
    enforce_geofence_checkin: bool = True,
) -> CampusBoundary:
    if not (20 <= radius_meters <= 5000):
        raise AppError("INVALID_RADIUS", "Campus radius must be between 20 and 5000 meters.", 400)

    clean_name = strip_tags(str(campus_name or "Main Campus")).strip()[:150] or "Main Campus"
    boundary = (
        CampusBoundary.objects.filter(is_active=True).order_by("id").first()
        or CampusBoundary.objects.order_by("id").first()
    )
    if boundary:
        boundary.campus_name = clean_name
        boundary.center_latitude = Decimal(f"{float(center_latitude):.6f}")
        boundary.center_longitude = Decimal(f"{float(center_longitude):.6f}")
        boundary.radius_meters = int(radius_meters)
        boundary.loafing_grace_minutes = int(loafing_grace_minutes)
        if duty_start_time is not None:
            boundary.duty_start_time = duty_start_time
        if duty_end_time is not None:
            boundary.duty_end_time = duty_end_time
        boundary.enforce_geofence_checkin = bool(enforce_geofence_checkin)
        boundary.is_active = True
        boundary.save()
    else:
        boundary = CampusBoundary.objects.create(
            campus_name=clean_name,
            center_latitude=Decimal(f"{float(center_latitude):.6f}"),
            center_longitude=Decimal(f"{float(center_longitude):.6f}"),
            radius_meters=int(radius_meters),
            loafing_grace_minutes=int(loafing_grace_minutes),
            duty_start_time=duty_start_time or dt_time(7, 30),
            duty_end_time=duty_end_time or dt_time(17, 0),
            enforce_geofence_checkin=bool(enforce_geofence_checkin),
            is_active=True,
        )

    school = SchoolSettings.objects.first()
    if school and school.campus_boundary_id != boundary.id:
        school.campus_boundary = boundary
        school.save(update_fields=["campus_boundary", "updated_at"])

    cache.delete_many([ACTIVE_BOUNDARY_CACHE_KEY, "school:metadata:raw", "reports:system_status"])

    record_audit_log(
        request=request,
        table_name=CampusBoundary._meta.db_table,
        record_id=boundary.id,
        action="UPDATE",
        new_data={
            "campus_name": boundary.campus_name,
            "center_latitude": float(boundary.center_latitude),
            "center_longitude": float(boundary.center_longitude),
            "radius_meters": boundary.radius_meters,
        },
    )
    return boundary


def _verify_and_bind_teacher_device(
    *,
    teacher,
    device_id: str,
    device_model: str = "",
    request=None,
    require_device: bool = False,
) -> str:
    clean_device_id = strip_tags(str(device_id or "")).strip()[:128]
    clean_model = strip_tags(str(device_model or "")).strip()[:100]
    if not clean_device_id:
        if require_device:
            raise AppError(
                "DEVICE_ID_REQUIRED",
                "Your phone ID is required to Time In or Time Out. Please restart the AttendSure app and try again.",
                400,
            )
        if teacher.bound_device_id:
            raise AppError(
                "DEVICE_ID_REQUIRED",
                "Your paired phone ID is required to verify your campus location.",
                403,
            )
        return ""

    if not teacher.bound_device_id:
        existing_owner = (
            TeacherProfile.objects.filter(bound_device_id=clean_device_id)
            .exclude(pk=teacher.pk)
            .only("id", "employee_id")
            .first()
        )
        if existing_owner:
            record_audit_log(
                request=request,
                table_name=teacher._meta.db_table,
                record_id=teacher.id,
                action="DEV_REJECT",
                new_data={
                    "employee_id": teacher.employee_id,
                    "existing_owner_id": existing_owner.id,
                },
            )
            raise AppError(
                "DEVICE_ALREADY_BOUND",
                "This phone is already paired with another teacher account. Ask your Principal or Admin to unlink it before pairing here.",
                403,
            )

        teacher.bound_device_id = clean_device_id
        if clean_model:
            teacher.device_model = clean_model
        teacher.device_bound_at = timezone.now()
        try:
            with transaction.atomic():
                teacher.save(
                    update_fields=[
                        "bound_device_id",
                        "device_model",
                        "device_bound_at",
                        "updated_at",
                    ]
                )
        except IntegrityError:
            raise AppError(
                "DEVICE_ALREADY_BOUND",
                "This phone is already paired with another teacher account. Ask your Principal or Admin to unlink it before pairing here.",
                403,
            )
    elif not hmac.compare_digest(str(teacher.bound_device_id), clean_device_id):
        raise AppError(
            "DEVICE_MISMATCH",
            "Your account is paired with your previous phone for attendance protection. If you changed phones, ask your Principal or Admin to clear the old link so you can pair this phone.",
            403,
        )
    return clean_device_id


def _check_existing_teacher_biometric_key(
    *,
    teacher,
    biometric_key_id: str | None,
    biometric_proof: str | None = None,
    biometric_timestamp_ms: int | None = None,
    now_override=None,
    request=None,
) -> str:
    """
    Validates an enrolled 1-to-1 phone security key plus proof format, timestamp freshness,
    and single-use replay protection outside any failing transaction so BIO_REJECT audit logs
    are always saved. Returns the cleaned incoming biometric_key_id.
    """
    clean_key_id = strip_tags(str(biometric_key_id or "")).strip()[:128]
    clean_proof = strip_tags(str(biometric_proof or "")).strip()
    stored_key_id = (teacher.biometric_key_id or "").strip()

    if stored_key_id:
        if not clean_key_id or not hmac.compare_digest(stored_key_id, clean_key_id):
            record_audit_log(
                request=request,
                table_name=teacher._meta.db_table,
                record_id=teacher.id,
                action="BIO_REJECT",
                new_data={
                    "employee_id": teacher.employee_id,
                    "missing_key": not bool(clean_key_id),
                },
            )
            raise AppError(
                "BIOMETRIC_MISMATCH",
                "Your phone's security check did not match the one linked to your account. If you switched phones or reset your screen lock, ask your Principal or Admin to refresh your phone link.",
                403,
            )

    biometric_active = bool(
        stored_key_id or clean_key_id or clean_proof or biometric_timestamp_ms is not None
    )
    if biometric_active:
        if not BIOMETRIC_PROOF_HEX_RE.fullmatch(clean_proof):
            raise AppError(
                "INVALID_BIOMETRIC_PROOF",
                "A valid phone unlock check is required to Time In or Time Out. Please confirm your phone lock and try again.",
                400,
            )

        if biometric_timestamp_ms is None or isinstance(biometric_timestamp_ms, bool):
            raise AppError(
                "BIOMETRIC_PROOF_EXPIRED",
                "Your phone unlock check is missing a timestamp. Please confirm your phone lock again.",
                400,
            )

        try:
            proof_ts_ms = int(biometric_timestamp_ms)
        except (TypeError, ValueError):
            raise AppError(
                "BIOMETRIC_PROOF_EXPIRED",
                "Your phone unlock check has an invalid timestamp. Please confirm your phone lock again.",
                400,
            )

        server_now_ms = (
            now_override.timestamp() * 1000.0 if now_override is not None else time.time() * 1000.0
        )
        if abs(server_now_ms - float(proof_ts_ms)) > BIOMETRIC_PROOF_MAX_DRIFT_MS:
            raise AppError(
                "BIOMETRIC_PROOF_EXPIRED",
                "Your phone unlock check expired (must be within 2 minutes). Please confirm your phone lock again.",
                400,
            )

        replay_key = f"bio_proof_used:{teacher.pk}:{clean_proof.lower()}"
        if not cache.add(replay_key, True, timeout=BIOMETRIC_PROOF_REPLAY_TTL_SECONDS):
            raise AppError(
                "BIOMETRIC_PROOF_REPLAYED",
                "This phone unlock check was already used. Please confirm your phone lock again to record a new Time In or Time Out.",
                400,
            )

    return clean_key_id


def _enroll_teacher_biometric_key_if_needed(
    *,
    teacher,
    clean_key_id: str,
    request=None,
) -> bool:
    """
    Enrolls the public SHA-256 key identifier on first verified check-in when empty.
    Stores ONLY the public key digest in TeacherProfile.biometric_key_id (never biometric data).
    """
    if not (teacher.biometric_key_id or "").strip() and clean_key_id:
        teacher.biometric_key_id = clean_key_id
        teacher.save(update_fields=["biometric_key_id", "updated_at"])
        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="BIO_ENROLL",
            new_data={"employee_id": teacher.employee_id},
        )
        return True
    return False


def _check_anti_spoof_gps_telemetry(*, teacher, validated_data: dict, now) -> None:
    speed = validated_data.get("speed_mps")
    if speed is not None and math.isfinite(float(speed)) and float(speed) > MAX_PLAUSIBLE_SPEED_MPS:
        raise AppError(
            "SPOOFED_GPS_SPEED",
            "Your phone reported an unusual location jump. Please turn off any mock location app and try again.",
            400,
        )

    gps_ts_ms = validated_data.get("gps_timestamp_ms")
    if gps_ts_ms:
        age_seconds = abs((now.timestamp() * 1000.0 - float(gps_ts_ms)) / 1000.0)
        if age_seconds > 120:
            raise AppError(
                "STALE_GPS_FIX",
                "Your phone's GPS reading is older than 2 minutes. Step near a window or outdoors for a fresh signal.",
                400,
            )

    prev_ping = (
        TeacherLocationPing.objects.filter(teacher=teacher)
        .order_by("-recorded_at")
        .only("latitude", "longitude", "recorded_at")
        .first()
    )
    if prev_ping:
        elapsed = (now - prev_ping.recorded_at).total_seconds()
        if 1.0 <= elapsed <= 60.0:
            jump_meters = calculate_distance_meters(
                validated_data["latitude"],
                validated_data["longitude"],
                prev_ping.latitude,
                prev_ping.longitude,
            )
            if (
                math.isfinite(jump_meters)
                and jump_meters > 500
                and (jump_meters / elapsed) > MAX_PLAUSIBLE_SPEED_MPS
            ):
                raise AppError(
                    "GPS_TELEPORT_DETECTED",
                    "Your phone reported a sudden location jump. Please turn off any mock location app and try again.",
                    400,
                )


def record_teacher_gps_ping(
    *,
    user,
    validated_data: dict,
    header_device_id: str = "",
    is_checkin: bool = False,
    is_checkout: bool = False,
    now_override=None,
    request=None,
) -> dict:
    teacher = resolve_teacher_for_user(user)
    if not teacher:
        raise AppError("NO_TEACHER_PROFILE", "No active teacher profile is linked to this account.", 403)
    teacher.refresh_from_db(
        fields=["bound_device_id", "device_model", "device_bound_at", "biometric_key_id"]
    )

    action_str = str(validated_data.get("action") or "").upper()
    do_checkout = is_checkout or action_str in ("TIME_OUT", "TIME_OUT_PM", "CHECK_OUT")
    do_checkin = is_checkin or action_str in ("TIME_IN", "TIME_IN_AM", "TIME_IN_PM", "CHECK_IN")

    if (do_checkin or do_checkout) and (
        validated_data.get("biometric_verified_on_device") is False
        or validated_data.get("face_verified_on_device") is False
        or validated_data.get("face_verified") is False
    ):
        raise AppError(
            "BIOMETRIC_CHECK_FAILED",
            "Phone unlock verification was cancelled or did not finish. Please confirm with your phone lock to continue.",
            403,
        )

    raw_device_id = (
        validated_data.get("device_id")
        or validated_data.get("client_device_id")
        or header_device_id
        or ""
    )
    device_id = _verify_and_bind_teacher_device(
        teacher=teacher,
        device_id=str(raw_device_id),
        device_model=str(validated_data.get("device_model") or ""),
        request=request,
        require_device=(do_checkin or do_checkout),
    )

    clean_biometric_key_id = ""
    if do_checkin or do_checkout:
        clean_biometric_key_id = _check_existing_teacher_biometric_key(
            teacher=teacher,
            biometric_key_id=validated_data.get("biometric_key_id"),
            biometric_proof=validated_data.get("biometric_proof"),
            biometric_timestamp_ms=validated_data.get("biometric_timestamp_ms"),
            now_override=now_override,
            request=request,
        )

    boundary = get_active_campus_boundary()
    raw_acc = (
        validated_data.get("accuracy_meters")
        if validated_data.get("accuracy_meters") is not None
        else validated_data.get("accuracy")
    )
    is_mock = bool(validated_data.get("is_mock_location") or validated_data.get("mocked"))

    gps = verify_campus_gps(
        latitude=validated_data["latitude"],
        longitude=validated_data["longitude"],
        campus_lat=float(boundary.center_latitude),
        campus_lon=float(boundary.center_longitude),
        radius_meters=int(boundary.radius_meters),
        accuracy_meters=raw_acc,
        is_mock_location=is_mock,
    )
    if not gps["is_valid"]:
        raise AppError("INVALID_GPS", gps["reason"], 400)

    now = now_override or timezone.now()
    _check_anti_spoof_gps_telemetry(teacher=teacher, validated_data=validated_data, now=now)

    local_now = timezone.localtime(now)
    today = local_now.date()
    local_time = local_now.time()

    with transaction.atomic():
        has_active_pass = ExitPass.objects.filter(
            pass_scope="TEACHER",
            teacher=teacher,
            is_cancelled=False,
            returned_at__isnull=True,
            issued_at__lte=now,
            valid_until__gte=now,
        ).exists()

        daily_att = TeacherDailyAttendance.objects.filter(teacher=teacher, attendance_date=today).first()
        is_clocked_in = bool(daily_att and daily_att.time_in and not daily_att.time_out)

        if gps["is_inside"]:
            zone_status = "INSIDE"
        elif has_active_pass:
            zone_status = "AUTHORIZED_OUTSIDE"
        elif is_clocked_in:
            zone_status = "LOAFING_ALERT"
        else:
            zone_status = "OFF_DUTY"

        lat_dec = Decimal(f"{float(validated_data['latitude']):.6f}")
        lng_dec = Decimal(f"{float(validated_data['longitude']):.6f}")

        ping = TeacherLocationPing.objects.create(
            teacher=teacher,
            boundary=boundary,
            latitude=lat_dec,
            longitude=lng_dec,
            accuracy_meters=float(raw_acc) if raw_acc is not None else 0.0,
            zone_status=zone_status,
            device_id=device_id,
            recorded_at=now,
        )

        incident_id = None
        if zone_status == "LOAFING_ALERT":
            existing_open = LoafingIncident.objects.filter(
                incident_type="TEACHER_OUTSIDE_GEOFENCE",
                teacher=teacher,
                status="OPEN",
                detected_at__date=today,
            ).first()
            if existing_open:
                existing_open.trigger_ping = ping
                existing_open.save(update_fields=["trigger_ping"])
                incident_id = existing_open.id
            else:
                inc = LoafingIncident.objects.create(
                    incident_type="TEACHER_OUTSIDE_GEOFENCE",
                    status="OPEN",
                    teacher=teacher,
                    trigger_ping=ping,
                    detected_at=now,
                    remarks=f"Location recorded {round(gps['distance_meters'] or 0)}m outside {boundary.campus_name} while timed in on duty without an official exit pass.",
                )
                incident_id = inc.id
        elif zone_status == "INSIDE":
            LoafingIncident.objects.filter(
                incident_type="TEACHER_OUTSIDE_GEOFENCE",
                teacher=teacher,
                status="OPEN",
                detected_at__date=today,
            ).update(status="RETURNED", resolved_at=now)

        if do_checkin and not do_checkout:
            if boundary.enforce_geofence_checkin and not gps["is_inside"] and not has_active_pass:
                raise AppError(
                    "OUTSIDE_CAMPUS",
                    f"Move inside {boundary.campus_name} to Time In (currently {round(gps['distance_meters'] or 0)}m from campus center), or request an Official Locator Slip if on school business.",
                    403,
                )
            grace_dt = timezone.make_aware(
                timezone.datetime.combine(today, boundary.duty_start_time),
                timezone.get_current_timezone(),
            ) + timezone.timedelta(minutes=boundary.loafing_grace_minutes)
            if has_active_pass and not gps["is_inside"]:
                att_status = "ON_OFFICIAL_PASS"
            elif now > grace_dt:
                att_status = "LATE"
            else:
                att_status = "ON_TIME"

            if daily_att:
                if not daily_att.time_in:
                    daily_att.time_in = now
                    daily_att.checkin_latitude = lat_dec
                    daily_att.checkin_longitude = lng_dec
                daily_att.device_id = device_id
                daily_att.face_verified_on_device = True
                daily_att.status = att_status
                daily_att.save()
            else:
                TeacherDailyAttendance.objects.create(
                    teacher=teacher,
                    boundary=boundary,
                    attendance_date=today,
                    time_in=now,
                    checkin_latitude=lat_dec,
                    checkin_longitude=lng_dec,
                    device_id=device_id,
                    face_verified_on_device=True,
                    status=att_status,
                )
        elif do_checkout:
            if boundary.enforce_geofence_checkin and not gps["is_inside"] and not has_active_pass:
                raise AppError(
                    "OUTSIDE_CAMPUS",
                    f"Step inside {boundary.campus_name} to Time Out (currently {round(gps['distance_meters'] or 0)}m from campus center), or request an Official Locator Slip if off campus.",
                    403,
                )
            if daily_att:
                daily_att.time_out = now
                daily_att.checkout_latitude = lat_dec
                daily_att.checkout_longitude = lng_dec
                daily_att.device_id = device_id
                daily_att.save(
                    update_fields=["time_out", "checkout_latitude", "checkout_longitude", "device_id"]
                )

        just_enrolled_biometric = False
        if do_checkin or do_checkout:
            just_enrolled_biometric = _enroll_teacher_biometric_key_if_needed(
                teacher=teacher,
                clean_key_id=clean_biometric_key_id,
                request=request,
            )

    cache.delete_many(["dashboard:leader", f"dashboard:teacher:{user.id}", "reports:system_status"])

    reply_message = gps["reason"]
    if do_checkin and not do_checkout:
        enroll_note = (
            " Your phone is now paired for private, one-tap Time In — zero photos or fingerprint data are stored on the server."
            if just_enrolled_biometric
            else " Verified safely on your phone inside the school boundary."
        )
        reply_message = f"Timed In at {local_now.strftime('%I:%M:%S %p')}.{enroll_note}"
    elif do_checkout:
        reply_message = (
            f"Timed Out at {local_now.strftime('%I:%M:%S %p')}. Duty check is now off — have a safe trip home."
        )

    return {
        "ok": True,
        "success": True,
        "ping_id": ping.id,
        "zone_status": zone_status,
        "is_inside": bool(gps["is_inside"]),
        "is_inside_geofence": bool(gps["is_inside"]),
        "distance_meters": ping.distance_meters,
        "allowed_radius": gps["allowed_radius"],
        "loafing_incident_id": incident_id,
        "biometric_enrolled": bool(teacher.biometric_key_id),
        "just_enrolled_biometric": just_enrolled_biometric,
        "recorded_at": local_now.strftime("%I:%M:%S %p"),
        "message": reply_message,
    }


@transaction.atomic
def resolve_loafing_incident(
    *, request, incident: LoafingIncident, next_status: str, remarks: str = ""
) -> LoafingIncident:
    clean_status = str(next_status or "").strip().upper()
    if clean_status not in {"CONFIRMED_LOAFING", "RETURNED", "EXCUSED"}:
        raise AppError(
            "INVALID_STATUS",
            "Resolution status must be CONFIRMED_LOAFING, RETURNED, or EXCUSED.",
            400,
        )

    incident.status = clean_status
    incident.resolved_at = timezone.now()
    incident.reviewed_by = request.user
    clean_remarks = strip_tags(str(remarks or "")).strip()[:500]
    if clean_remarks:
        incident.remarks = clean_remarks
    incident.save(update_fields=["status", "resolved_at", "reviewed_by", "remarks"])

    cache_keys = ["dashboard:leader", "reports:system_status"]
    if incident.teacher_id and incident.teacher and incident.teacher.user_id:
        cache_keys.append(f"dashboard:teacher:{incident.teacher.user_id}")
    cache.delete_many(cache_keys)

    record_audit_log(
        request=request,
        table_name=incident._meta.db_table,
        record_id=incident.id,
        action="RESOLVE",
        new_data={"status": clean_status, "remarks": clean_remarks},
    )
    return incident
