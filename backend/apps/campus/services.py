# AttendSure Backend - Campus Business Logic Services
# File: D:\AttendSure_V3\backend\apps\campus\services.py

from datetime import datetime, time as dt_time, timedelta, timezone as dt_timezone
from decimal import Decimal
import hashlib
import hmac
import math
import re
import time

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import OuterRef, Subquery
from django.utils import timezone
from django.utils.html import strip_tags

from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import resolve_teacher_for_user
from apps.attendance.models import ExitPass
from apps.campus.gps_jump_guard import check_ping_against_last_record
from apps.school.models import SchoolHoliday, SchoolSettings
from common.audit import record_audit_log
from common.device_crypto import (
    build_checkin_signing_message,
    compute_public_key_id,
    consume_checkin_challenge_nonce,
    load_teacher_public_key,
    verify_teacher_checkin_signature,
)
from common.exceptions import AppError
from common.gps import verify_campus_gps
from common.time_utils import format_time_12h, local_day_bounds
from .models import CampusBoundary, LoafingIncident, TeacherDailyAttendance, TeacherLocationPing
from .selectors import ACTIVE_BOUNDARY_CACHE_KEY, get_active_campus_boundary

MAX_NORMAL_SPEED_MPS = 55.0
BIOMETRIC_PROOF_HEX_RE = re.compile(r"^[0-9a-fA-F]{64}$")
BIOMETRIC_PROOF_MAX_DRIFT_MS = 120_000
BIOMETRIC_PROOF_REPLAY_TTL_SECONDS = 300

MAX_FOREGROUND_GPS_AGE_SECONDS = 120
MAX_BACKGROUND_GPS_AGE_SECONDS = 600
MAX_OFFLINE_GPS_AGE_SECONDS = 86_400
MAX_FUTURE_GPS_DRIFT_SECONDS = 120

VALID_NETWORK_TYPES = {"WIFI", "CELLULAR", "NONE", "UNKNOWN"}
VALID_APP_STATES = {"ACTIVE", "BACKGROUND", "UNKNOWN"}
VALID_PING_SOURCES = {"FOREGROUND", "BACKGROUND_TASK", "OFFLINE_QUEUE"}


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
    try:
        lat_val = float(center_latitude)
        lon_val = float(center_longitude)
        rad_val = int(radius_meters)
        grace_val = int(loafing_grace_minutes)
    except (TypeError, ValueError):
        raise AppError("INVALID_BOUNDARY", "Campus map settings must be valid numbers.", 400)

    if not (math.isfinite(lat_val) and -90.0 <= lat_val <= 90.0):
        raise AppError("INVALID_COORDINATES", "Campus latitude must be between -90 and 90.", 400)
    if not (math.isfinite(lon_val) and -180.0 <= lon_val <= 180.0):
        raise AppError("INVALID_COORDINATES", "Campus longitude must be between -180 and 180.", 400)
    if not (20 <= rad_val <= 5000):
        raise AppError("INVALID_RADIUS", "Campus radius must be between 20 and 5000 meters.", 400)
    if not (0 <= grace_val <= 180):
        raise AppError(
            "INVALID_GRACE_PERIOD",
            "Outside-campus grace time must be between 0 and 180 minutes.",
            400,
        )

    clean_name = strip_tags(str(campus_name or "Main Campus")).strip()[:150] or "Main Campus"
    boundary = (
        CampusBoundary.objects.filter(is_active=True).order_by("id").first()
        or CampusBoundary.objects.order_by("id").first()
    )
    boundary_existed = boundary is not None
    if boundary:
        boundary.campus_name = clean_name
        boundary.center_latitude = Decimal(f"{lat_val:.6f}")
        boundary.center_longitude = Decimal(f"{lon_val:.6f}")
        boundary.radius_meters = rad_val
        boundary.loafing_grace_minutes = grace_val
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
            center_latitude=Decimal(f"{lat_val:.6f}"),
            center_longitude=Decimal(f"{lon_val:.6f}"),
            radius_meters=rad_val,
            loafing_grace_minutes=grace_val,
            duty_start_time=duty_start_time or dt_time(7, 30),
            duty_end_time=duty_end_time or dt_time(17, 0),
            enforce_geofence_checkin=bool(enforce_geofence_checkin),
            is_active=True,
        )

    school = SchoolSettings.objects.only("id", "campus_boundary_id").first()
    if school and school.campus_boundary_id != boundary.id:
        school.campus_boundary = boundary
        school.save(update_fields=["campus_boundary", "updated_at"])

    cache.delete_many([ACTIVE_BOUNDARY_CACHE_KEY, "school:metadata:raw", "reports:system_status"])

    record_audit_log(
        request=request,
        table_name=CampusBoundary._meta.db_table,
        record_id=boundary.id,
        action="UPDATE" if boundary_existed else "CREATE",
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
                "Your linked phone ID is required to verify your campus location.",
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
                "This phone is already linked to another teacher account. Ask your Principal or Admin to unlink it first.",
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
                "This phone is already linked to another teacher account. Ask your Principal or Admin to unlink it first.",
                403,
            )
    elif not hmac.compare_digest(str(teacher.bound_device_id), clean_device_id):
        raise AppError(
            "DEVICE_MISMATCH",
            "Your account is linked to a different phone. If you changed phones, ask your Principal or Admin to reset your phone link.",
            403,
        )
    elif clean_model and not (teacher.device_model or "").strip():
        teacher.device_model = clean_model
        teacher.save(update_fields=["device_model", "updated_at"])

    return clean_device_id


def _check_existing_teacher_biometric_key(
    *,
    teacher,
    user_id: int,
    device_id: str,
    action_name: str,
    biometric_key_id: str | None,
    biometric_public_key: str | None = None,
    biometric_key_algorithm: str | None = None,
    biometric_signature: str | None = None,
    biometric_nonce: str | None = None,
    biometric_proof: str | None = None,
    biometric_timestamp_ms: int | None = None,
    now_override=None,
    request=None,
) -> dict:
    """
    Verifies the teacher's signed phone-unlock proof bound 1-to-1 to their phone.
    Checks a 2-minute freshness window and blocks replayed proofs.
    Runs outside the write transaction so rejected attempts are always logged.
    """
    clean_key_id = strip_tags(str(biometric_key_id or "")).strip()[:128]
    clean_pub_key = str(biometric_public_key or "").strip()
    clean_alg = str(biometric_key_algorithm or "").strip().upper()
    clean_sig = str(biometric_signature or "").strip()
    clean_nonce = strip_tags(str(biometric_nonce or "")).strip()[:128]
    stored_pub_key = (teacher.biometric_public_key or "").strip()
    stored_key_id = (teacher.biometric_key_id or "").strip()
    stored_alg = (teacher.biometric_key_algorithm or "").strip().upper()

    if not clean_sig:
        raise AppError(
            "INVALID_BIOMETRIC_PROOF",
            "A signed phone unlock proof is required to Time In or Time Out. Please update AttendSure and confirm your phone lock again.",
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
            "Your phone unlock check expired after 2 minutes. Please confirm your phone lock again.",
            400,
        )

    if stored_pub_key:
        try:
            _, resolved_alg, stored_canonical = load_teacher_public_key(
                stored_pub_key, stored_alg or None
            )
            expected_key_id = stored_key_id or compute_public_key_id(stored_canonical)
        except ValueError:
            raise AppError(
                "BIOMETRIC_MISMATCH",
                "Your saved phone security key needs to be refreshed. Ask your Principal or Admin to reset your phone link.",
                403,
            )

        if clean_key_id and not hmac.compare_digest(expected_key_id.lower(), clean_key_id.lower()):
            record_audit_log(
                request=request,
                table_name=teacher._meta.db_table,
                record_id=teacher.id,
                action="BIO_REJECT",
                new_data={
                    "employee_id": teacher.employee_id,
                    "reason": "key_id_mismatch",
                },
            )
            raise AppError(
                "BIOMETRIC_MISMATCH",
                "Your phone security key did not match the one linked to your account. If you changed phones or reinstalled the app, ask your Principal or Admin to reset your phone link.",
                403,
            )

        if clean_pub_key:
            try:
                _, _, incoming_canonical = load_teacher_public_key(
                    clean_pub_key, clean_alg or None
                )
                incoming_key_id = compute_public_key_id(incoming_canonical)
            except ValueError:
                raise AppError(
                    "INVALID_BIOMETRIC_PROOF",
                    "Your phone sent an invalid security key. Please restart AttendSure and try again.",
                    400,
                )
            if not hmac.compare_digest(expected_key_id.lower(), incoming_key_id.lower()):
                record_audit_log(
                    request=request,
                    table_name=teacher._meta.db_table,
                    record_id=teacher.id,
                    action="BIO_REJECT",
                    new_data={
                        "employee_id": teacher.employee_id,
                        "reason": "public_key_mismatch",
                    },
                )
                raise AppError(
                    "BIOMETRIC_MISMATCH",
                    "Your phone security key did not match the one linked to your account. If you changed phones or reinstalled the app, ask your Principal or Admin to reset your phone link.",
                    403,
                )

        verify_pub_key = stored_pub_key
        verify_alg = resolved_alg
        final_key_id = expected_key_id
        needs_enroll = False
        upgraded_from_legacy = False
    else:
        if not clean_pub_key:
            raise AppError(
                "INVALID_BIOMETRIC_PROOF",
                "Your phone security key is required to set up Time In protection. Please update AttendSure and try again.",
                400,
            )
        try:
            _, resolved_alg, incoming_canonical = load_teacher_public_key(
                clean_pub_key, clean_alg or None
            )
        except ValueError:
            raise AppError(
                "INVALID_BIOMETRIC_PROOF",
                "Your phone sent an unsupported security key format. Please restart AttendSure and try again.",
                400,
            )
        derived_key_id = compute_public_key_id(incoming_canonical)
        if clean_key_id and not hmac.compare_digest(derived_key_id.lower(), clean_key_id.lower()):
            raise AppError(
                "INVALID_BIOMETRIC_PROOF",
                "Your phone security key ID did not match. Please confirm your phone lock again.",
                400,
            )
        verify_pub_key = clean_pub_key
        verify_alg = resolved_alg
        final_key_id = derived_key_id
        needs_enroll = True
        upgraded_from_legacy = bool(stored_key_id)

    if clean_nonce:
        if not consume_checkin_challenge_nonce(teacher.id, clean_nonce):
            raise AppError(
                "BIOMETRIC_PROOF_REPLAYED",
                "Your check-in code expired or was already used. Please confirm your phone lock again.",
                400,
            )

    signed_message = build_checkin_signing_message(
        user_id=user_id,
        device_id=device_id,
        timestamp_ms=proof_ts_ms,
        action=action_name,
        nonce=clean_nonce or None,
    )
    try:
        sig_ok, verified_alg, verified_key_id, sig_bytes = verify_teacher_checkin_signature(
            public_key_str=verify_pub_key,
            signature_str=clean_sig,
            message=signed_message,
            algorithm=verify_alg,
        )
    except ValueError:
        raise AppError(
            "INVALID_BIOMETRIC_PROOF",
            "Your phone unlock signature format is invalid. Please confirm your phone lock again.",
            400,
        )

    if not sig_ok:
        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="BIO_REJECT",
            new_data={
                "employee_id": teacher.employee_id,
                "reason": "invalid_signature",
            },
        )
        raise AppError(
            "BIOMETRIC_SIGNATURE_INVALID",
            "Your phone security signature could not be verified. Please confirm your phone lock and try again.",
            403,
        )

    sig_digest = hashlib.sha256(sig_bytes).hexdigest()
    replay_key = f"bio_proof_used:{teacher.pk}:{sig_digest}"
    if not cache.add(replay_key, True, timeout=BIOMETRIC_PROOF_REPLAY_TTL_SECONDS):
        raise AppError(
            "BIOMETRIC_PROOF_REPLAYED",
            "This phone unlock check was already used. Please confirm your phone lock again.",
            400,
        )

    return {
        "key_id": verified_key_id or final_key_id,
        "public_key": verify_pub_key,
        "algorithm": verified_alg,
        "needs_enroll": needs_enroll,
        "upgraded_from_legacy": upgraded_from_legacy,
    }


def _enroll_teacher_biometric_key_if_needed(
    *,
    teacher,
    verified_key: dict,
    request=None,
) -> bool:
    """
    Saves only the teacher's public security key and key ID on first verified check-in.
    No private keys, face photos, or fingerprint data are ever stored on the server.
    """
    if verified_key and verified_key.get("needs_enroll"):
        teacher.biometric_key_id = verified_key["key_id"]
        teacher.biometric_public_key = verified_key["public_key"]
        teacher.biometric_key_algorithm = verified_key["algorithm"]
        teacher.save(
            update_fields=[
                "biometric_key_id",
                "biometric_public_key",
                "biometric_key_algorithm",
                "updated_at",
            ]
        )
        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="BIO_ENROLL",
            new_data={
                "employee_id": teacher.employee_id,
                "algorithm": verified_key["algorithm"],
                "upgraded_asymmetric_key": bool(verified_key.get("upgraded_from_legacy")),
            },
        )
        return True
    return False


def _extract_phone_telemetry(validated_data: dict) -> dict:
    clean_model = strip_tags(str(validated_data.get("device_model") or "")).strip()[:100]

    raw_battery = validated_data.get("battery_percent")
    battery_percent: int | None = None
    if raw_battery is not None and not isinstance(raw_battery, bool):
        try:
            battery_percent = max(0, min(100, int(raw_battery)))
        except (TypeError, ValueError):
            battery_percent = None

    raw_charging = validated_data.get("is_charging")
    is_charging = raw_charging if isinstance(raw_charging, bool) else None

    raw_low_power = validated_data.get("is_low_power_mode")
    is_low_power_mode = raw_low_power if isinstance(raw_low_power, bool) else None

    raw_network = str(validated_data.get("network_type") or "UNKNOWN").strip().upper()
    network_type = raw_network if raw_network in VALID_NETWORK_TYPES else "UNKNOWN"

    raw_gps_enabled = validated_data.get("is_gps_enabled")
    is_gps_enabled = True if raw_gps_enabled is None else bool(raw_gps_enabled)

    raw_app_state = str(validated_data.get("app_state") or "UNKNOWN").strip().upper()
    app_state = raw_app_state if raw_app_state in VALID_APP_STATES else "UNKNOWN"

    raw_ping_source = str(validated_data.get("ping_source") or "FOREGROUND").strip().upper()
    ping_source = raw_ping_source if raw_ping_source in VALID_PING_SOURCES else "FOREGROUND"

    return {
        "device_model": clean_model,
        "battery_percent": battery_percent,
        "is_charging": is_charging,
        "is_low_power_mode": is_low_power_mode,
        "network_type": network_type,
        "is_gps_enabled": is_gps_enabled,
        "app_state": app_state,
        "ping_source": ping_source,
    }


def _resolve_ping_recorded_at(
    *,
    validated_data: dict,
    now,
    ping_source: str,
    is_auth_action: bool,
):
    if is_auth_action or ping_source != "OFFLINE_QUEUE":
        return now

    candidate = None
    raw_recorded_at = validated_data.get("recorded_at")
    if isinstance(raw_recorded_at, datetime):
        candidate = (
            raw_recorded_at
            if timezone.is_aware(raw_recorded_at)
            else timezone.make_aware(raw_recorded_at, dt_timezone.utc)
        )
    else:
        gps_ts_ms = validated_data.get("gps_timestamp_ms")
        if gps_ts_ms is not None and not isinstance(gps_ts_ms, bool):
            try:
                candidate = datetime.fromtimestamp(float(gps_ts_ms) / 1000.0, tz=dt_timezone.utc)
            except (TypeError, ValueError, OSError, OverflowError):
                candidate = None

    if candidate is None:
        return now
    return min(candidate, now)


def _check_gps_speed_and_freshness(
    *,
    validated_data: dict,
    now,
    ping_source: str = "FOREGROUND",
    is_auth_action: bool = False,
) -> None:
    speed = validated_data.get("speed_mps")
    if speed is not None and not isinstance(speed, bool):
        try:
            speed_val = float(speed)
        except (TypeError, ValueError):
            speed_val = 0.0
        if math.isfinite(speed_val) and speed_val > MAX_NORMAL_SPEED_MPS:
            raise AppError(
                "SPOOFED_GPS_SPEED",
                "Your phone reported an unusual speed jump. Please turn off any mock location app and try again.",
                400,
            )

    gps_ts_ms = validated_data.get("gps_timestamp_ms")
    candidate_ts_ms: float | None = None
    if gps_ts_ms is not None and not isinstance(gps_ts_ms, bool):
        try:
            candidate_ts_ms = float(gps_ts_ms)
        except (TypeError, ValueError):
            candidate_ts_ms = None
    elif ping_source == "OFFLINE_QUEUE" and isinstance(validated_data.get("recorded_at"), datetime):
        raw_dt = validated_data["recorded_at"]
        aware_dt = raw_dt if timezone.is_aware(raw_dt) else timezone.make_aware(raw_dt, dt_timezone.utc)
        candidate_ts_ms = aware_dt.timestamp() * 1000.0

    if candidate_ts_ms is not None and math.isfinite(candidate_ts_ms):
        age_seconds = (now.timestamp() * 1000.0 - candidate_ts_ms) / 1000.0
        if age_seconds < -MAX_FUTURE_GPS_DRIFT_SECONDS:
            raise AppError(
                "STALE_GPS_FIX",
                "Your phone clock is ahead of the school server time. Turn on automatic date and time and try again.",
                400,
            )

        if is_auth_action or ping_source == "FOREGROUND":
            max_age_seconds = MAX_FOREGROUND_GPS_AGE_SECONDS
            stale_message = (
                "Your phone GPS reading is older than 2 minutes. Move near a window or outdoors for a fresh signal."
            )
        elif ping_source == "BACKGROUND_TASK":
            max_age_seconds = MAX_BACKGROUND_GPS_AGE_SECONDS
            stale_message = (
                "Your background GPS reading is older than 10 minutes and could not be used."
            )
        else:
            max_age_seconds = MAX_OFFLINE_GPS_AGE_SECONDS
            stale_message = (
                "Your saved offline GPS reading is older than 24 hours and can no longer be uploaded."
            )

        if age_seconds > max_age_seconds:
            raise AppError("STALE_GPS_FIX", stale_message, 400)


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
        fields=[
            "bound_device_id",
            "device_model",
            "device_bound_at",
            "biometric_key_id",
            "biometric_public_key",
            "biometric_key_algorithm",
        ]
    )

    action_str = str(validated_data.get("action") or "").upper()
    do_checkout = is_checkout or action_str in ("TIME_OUT", "TIME_OUT_AM", "TIME_OUT_PM", "CHECK_OUT")
    do_checkin = is_checkin or action_str in ("TIME_IN", "TIME_IN_AM", "TIME_IN_PM", "CHECK_IN")
    is_auth_action = bool(do_checkin or do_checkout)

    telemetry = _extract_phone_telemetry(validated_data)

    if is_auth_action and (
        validated_data.get("biometric_verified_on_device") is False
        or validated_data.get("face_verified_on_device") is False
        or validated_data.get("face_verified") is False
    ):
        raise AppError(
            "BIOMETRIC_CHECK_FAILED",
            "Phone unlock verification was cancelled or did not finish. Please confirm your phone lock to continue.",
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
        device_model=telemetry["device_model"],
        request=request,
        require_device=is_auth_action,
    )

    verified_biometric_key: dict | None = None
    if is_auth_action:
        signed_action = action_str or ("TIME_OUT" if do_checkout else "TIME_IN")
        verified_biometric_key = _check_existing_teacher_biometric_key(
            teacher=teacher,
            user_id=user.id,
            device_id=device_id,
            action_name=signed_action,
            biometric_key_id=validated_data.get("biometric_key_id"),
            biometric_public_key=validated_data.get("biometric_public_key"),
            biometric_key_algorithm=validated_data.get("biometric_key_algorithm"),
            biometric_signature=validated_data.get("biometric_signature"),
            biometric_nonce=validated_data.get("biometric_nonce"),
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
    ping_recorded_at = _resolve_ping_recorded_at(
        validated_data=validated_data,
        now=now,
        ping_source=telemetry["ping_source"],
        is_auth_action=is_auth_action,
    )
    _check_gps_speed_and_freshness(
        validated_data=validated_data,
        now=now,
        ping_source=telemetry["ping_source"],
        is_auth_action=is_auth_action,
    )

    local_now = timezone.localtime(now)
    today = local_now.date()
    today_start, today_end = local_day_bounds(today)
    ping_local_dt = timezone.localtime(ping_recorded_at)
    is_same_day_ping = ping_local_dt.date() == today

    # Fetch the teacher's latest saved ping once to catch sudden indoor GPS jumps
    last_ping = (
        TeacherLocationPing.objects.filter(teacher=teacher, recorded_at__lt=ping_recorded_at)
        .order_by("-recorded_at", "-id")
        .only("id", "latitude", "longitude", "recorded_at", "zone_status")
        .first()
    )
    jump_check = check_ping_against_last_record(
        teacher_id=teacher.id,
        device_id=device_id,
        new_latitude=validated_data["latitude"],
        new_longitude=validated_data["longitude"],
        last_ping=last_ping,
        now=ping_recorded_at,
    )
    if not jump_check.should_save:
        if is_auth_action:
            raise AppError(
                "GPS_TELEPORT_DETECTED",
                "Your phone reported a sudden GPS jump. Wait a few seconds for a steady signal and try again.",
                400,
            )

        att_state = (
            TeacherDailyAttendance.objects.filter(teacher=teacher, attendance_date=today)
            .only("time_in", "time_out")
            .first()
        )
        currently_clocked_in = bool(att_state and att_state.time_in and not att_state.time_out)
        return {
            "ok": True,
            "success": True,
            "saved": False,
            "ignored": True,
            "status": jump_check.status,
            "zone_status": "THROTTLED",
            "is_inside": bool(last_ping and last_ping.zone_status == "INSIDE"),
            "is_inside_geofence": bool(last_ping and last_ping.zone_status == "INSIDE"),
            "is_clocked_in": currently_clocked_in,
            "in_grace_period": False,
            "grace_remaining_minutes": None,
            "moved_meters": jump_check.moved_meters,
            "speed_meters_per_second": jump_check.speed_meters_per_second,
            "recorded_at": format_time_12h(ping_local_dt, include_seconds=True),
            "message": jump_check.message,
        }

    with transaction.atomic():
        has_active_pass = ExitPass.objects.filter(
            pass_scope="TEACHER",
            teacher=teacher,
            is_approved=True,
            is_cancelled=False,
            returned_at__isnull=True,
            issued_at__lte=ping_recorded_at,
            valid_until__gte=ping_recorded_at,
        ).exists()

        daily_att = (
            TeacherDailyAttendance.objects.select_for_update()
            .filter(teacher=teacher, attendance_date=today)
            .first()
        )
        is_clocked_in = bool(daily_att and daily_att.time_in and not daily_att.time_out)

        # Verify inside-campus and Time In / Time Out rules before saving any row
        if do_checkin and not do_checkout:
            if boundary.enforce_geofence_checkin and not gps["is_inside"] and not has_active_pass:
                raise AppError(
                    "OUTSIDE_CAMPUS",
                    f"Move inside {boundary.campus_name} to Time In (currently {round(gps['distance_meters'] or 0)}m from campus center), or request an Official Locator Slip if on school business.",
                    403,
                )
        elif do_checkout:
            if boundary.enforce_geofence_checkin and not gps["is_inside"] and not has_active_pass:
                raise AppError(
                    "OUTSIDE_CAMPUS",
                    f"Step inside {boundary.campus_name} to Time Out (currently {round(gps['distance_meters'] or 0)}m from campus center), or request an Official Locator Slip if off campus.",
                    403,
                )
            if not daily_att or not daily_att.time_in:
                raise AppError(
                    "NOT_CHECKED_IN",
                    "You have not Timed In today yet. Please record Time In first before Timing Out.",
                    400,
                )

        existing_open = None
        grace_minutes = max(0, int(boundary.loafing_grace_minutes or 0))
        grace_remaining_minutes: int | None = None

        if do_checkout:
            zone_status = "OFF_DUTY"
        elif gps["is_inside"]:
            zone_status = "INSIDE"
        elif has_active_pass:
            zone_status = "AUTHORIZED_OUTSIDE"
        elif is_clocked_in and is_same_day_ping:
            existing_open = (
                LoafingIncident.objects.filter(
                    incident_type="TEACHER_OUTSIDE_GEOFENCE",
                    teacher=teacher,
                    status="OPEN",
                    detected_at__gte=today_start,
                    detected_at__lt=today_end,
                )
                .only("id", "trigger_ping_id")
                .first()
            )
            if existing_open or grace_minutes <= 0:
                zone_status = "LOAFING_ALERT"
            else:
                last_safe_at = (
                    TeacherLocationPing.objects.filter(
                        teacher=teacher,
                        recorded_at__gte=today_start,
                        recorded_at__lte=ping_recorded_at,
                        zone_status__in=["INSIDE", "AUTHORIZED_OUTSIDE"],
                    )
                    .order_by("-recorded_at")
                    .values_list("recorded_at", flat=True)
                    .first()
                )
                streak_cutoff = max(
                    dt
                    for dt in (today_start, daily_att.time_in, last_safe_at)
                    if dt is not None
                )
                first_outside_at = (
                    TeacherLocationPing.objects.filter(
                        teacher=teacher,
                        recorded_at__gt=streak_cutoff,
                        recorded_at__lte=ping_recorded_at,
                    )
                    .exclude(zone_status__in=["INSIDE", "AUTHORIZED_OUTSIDE"])
                    .order_by("recorded_at")
                    .values_list("recorded_at", flat=True)
                    .first()
                )
                elapsed_seconds = (
                    (ping_recorded_at - first_outside_at).total_seconds()
                    if first_outside_at is not None
                    else 0.0
                )
                if elapsed_seconds >= grace_minutes * 60:
                    zone_status = "LOAFING_ALERT"
                else:
                    zone_status = "OFF_DUTY"
                    grace_remaining_minutes = max(
                        1, math.ceil((grace_minutes * 60 - elapsed_seconds) / 60.0)
                    )
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
            device_model=telemetry["device_model"],
            battery_percent=telemetry["battery_percent"],
            is_charging=telemetry["is_charging"],
            is_low_power_mode=telemetry["is_low_power_mode"],
            network_type=telemetry["network_type"],
            is_gps_enabled=telemetry["is_gps_enabled"],
            app_state=telemetry["app_state"],
            ping_source=telemetry["ping_source"],
            recorded_at=ping_recorded_at,
        )

        # Any valid ping reaching the server confirms phone connection is back
        LoafingIncident.objects.filter(
            incident_type="TEACHER_SIGNAL_LOST",
            teacher=teacher,
            status="OPEN",
            detected_at__gte=today_start,
            detected_at__lt=today_end,
        ).update(status="RETURNED", resolved_at=now)

        incident_id = None
        if is_same_day_ping and zone_status == "LOAFING_ALERT":
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
                    detected_at=ping_recorded_at,
                    remarks=f"Location recorded {round(gps['distance_meters'] or 0)}m outside {boundary.campus_name} while timed in on duty without an official exit pass.",
                )
                incident_id = inc.id
        elif is_same_day_ping and (zone_status == "INSIDE" or (do_checkout and gps["is_inside"])):
            LoafingIncident.objects.filter(
                incident_type="TEACHER_OUTSIDE_GEOFENCE",
                teacher=teacher,
                status="OPEN",
                detected_at__gte=today_start,
                detected_at__lt=today_end,
            ).update(status="RETURNED", resolved_at=now)

        if do_checkin and not do_checkout:
            grace_dt = timezone.make_aware(
                timezone.datetime.combine(today, boundary.duty_start_time),
                timezone.get_current_timezone(),
            ) + timedelta(minutes=boundary.loafing_grace_minutes)
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
                    daily_att.status = att_status
                elif daily_att.status != "ON_TIME" and att_status == "ON_TIME":
                    daily_att.status = "ON_TIME"
                daily_att.device_id = device_id
                daily_att.face_verified_on_device = True
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
            daily_att.time_out = now
            daily_att.checkout_latitude = lat_dec
            daily_att.checkout_longitude = lng_dec
            daily_att.device_id = device_id
            daily_att.save(
                update_fields=["time_out", "checkout_latitude", "checkout_longitude", "device_id"]
            )

        just_enrolled_biometric = False
        if is_auth_action and verified_biometric_key:
            just_enrolled_biometric = _enroll_teacher_biometric_key_if_needed(
                teacher=teacher,
                verified_key=verified_biometric_key,
                request=request,
            )

    cache.delete_many(["dashboard:leader", f"dashboard:teacher:{user.id}", "reports:system_status"])

    effective_clocked_in = False if do_checkout else (True if do_checkin else is_clocked_in)
    recorded_time_12h = format_time_12h(ping_local_dt, include_seconds=True)
    reply_message = gps["reason"]
    if do_checkin and not do_checkout:
        enroll_note = (
            " Your phone is now linked for private, one-tap Time In. No photos or fingerprint data are stored on the server."
            if just_enrolled_biometric
            else " Verified safely on your phone inside the school boundary."
        )
        reply_message = f"Timed In at {recorded_time_12h}.{enroll_note}"
    elif do_checkout:
        reply_message = (
            f"Timed Out at {recorded_time_12h}. Duty tracking is now off — have a safe trip home."
        )
    elif grace_remaining_minutes is not None:
        reply_message = (
            f"Outside {boundary.campus_name} ({round(gps['distance_meters'] or 0)}m). "
            f"Return within {grace_remaining_minutes} min(s) or request an Official Locator Slip."
        )

    return {
        "ok": True,
        "success": True,
        "saved": True,
        "ignored": False,
        "ping_id": ping.id,
        "zone_status": zone_status,
        "is_inside": bool(gps["is_inside"]),
        "is_inside_geofence": bool(gps["is_inside"]),
        "is_clocked_in": effective_clocked_in,
        "in_grace_period": grace_remaining_minutes is not None,
        "grace_remaining_minutes": grace_remaining_minutes,
        "distance_meters": ping.distance_meters,
        "allowed_radius": gps["allowed_radius"],
        "loafing_incident_id": incident_id,
        "biometric_enrolled": bool(teacher.biometric_key_id),
        "just_enrolled_biometric": just_enrolled_biometric,
        "recorded_at": recorded_time_12h,
        "message": reply_message,
    }


@transaction.atomic
def detect_silent_on_duty_teachers(
    *,
    now_override=None,
    silence_threshold_minutes: int | None = None,
) -> dict:
    """
    Checks for on-duty teachers whose phones stopped sending updates
    (powered off, dead battery, airplane mode, GPS turned off, or app closed).
    Saves their last known battery, network, and GPS health in the alert note.
    """
    now = now_override or timezone.now()
    local_now = timezone.localtime(now)
    today = local_now.date()
    today_start, today_end = local_day_bounds(today)

    if SchoolHoliday.objects.filter(holiday_date=today).exists():
        return {"ok": True, "created_signal_lost_incidents": 0, "checked_teachers": 0}

    boundary = get_active_campus_boundary()
    local_time = local_now.time()
    if boundary.duty_start_time and boundary.duty_end_time:
        if not (boundary.duty_start_time <= local_time <= boundary.duty_end_time):
            return {"ok": True, "created_signal_lost_incidents": 0, "checked_teachers": 0}

    threshold_mins = (
        int(silence_threshold_minutes)
        if silence_threshold_minutes is not None
        else max(15, int(boundary.loafing_grace_minutes or 10) + 5)
    )
    cutoff_dt = now - timedelta(minutes=threshold_mins)

    on_duty_rows = list(
        TeacherDailyAttendance.objects.filter(
            attendance_date=today,
            time_in__isnull=False,
            time_out__isnull=True,
            time_in__lte=cutoff_dt,
            teacher__user__is_active=True,
        )
        .select_related("teacher")
        .only("id", "teacher_id", "time_in", "teacher__id", "teacher__user_id")
    )
    if not on_duty_rows:
        return {"ok": True, "created_signal_lost_incidents": 0, "checked_teachers": 0}

    teacher_ids = [row.teacher_id for row in on_duty_rows]

    active_pass_teacher_ids = set(
        ExitPass.objects.filter(
            pass_scope="TEACHER",
            teacher_id__in=teacher_ids,
            is_approved=True,
            is_cancelled=False,
            returned_at__isnull=True,
            issued_at__lte=now,
            valid_until__gte=now,
        ).values_list("teacher_id", flat=True)
    )

    existing_open_ids = set(
        LoafingIncident.objects.filter(
            incident_type="TEACHER_SIGNAL_LOST",
            teacher_id__in=teacher_ids,
            status="OPEN",
            detected_at__gte=today_start,
            detected_at__lt=today_end,
        ).values_list("teacher_id", flat=True)
    )

    # Fetch only the single newest ping ID per teacher instead of all pings for the day
    latest_ping_ids = [
        pid
        for pid in TeacherProfile.objects.filter(id__in=teacher_ids)
        .annotate(
            latest_ping_id=Subquery(
                TeacherLocationPing.objects.filter(
                    teacher_id=OuterRef("pk"),
                    recorded_at__gte=today_start,
                    recorded_at__lte=now,
                )
                .order_by("-recorded_at", "-id")
                .values("id")[:1]
            )
        )
        .values_list("latest_ping_id", flat=True)
        if pid is not None
    ]

    latest_ping_by_teacher: dict[int, TeacherLocationPing] = {}
    if latest_ping_ids:
        for ping in TeacherLocationPing.objects.filter(id__in=latest_ping_ids).only(
            "id",
            "teacher_id",
            "recorded_at",
            "battery_percent",
            "is_charging",
            "is_low_power_mode",
            "network_type",
            "is_gps_enabled",
            "app_state",
        ):
            latest_ping_by_teacher[ping.teacher_id] = ping

    new_incidents: list[LoafingIncident] = []
    affected_user_ids: set[int] = set()
    for att in on_duty_rows:
        tid = att.teacher_id
        if tid in active_pass_teacher_ids or tid in existing_open_ids:
            continue

        last_ping = latest_ping_by_teacher.get(tid)
        last_seen_dt = last_ping.recorded_at if last_ping else att.time_in
        if last_seen_dt and last_seen_dt > cutoff_dt:
            continue

        silent_mins = (
            max(threshold_mins, int((now - last_seen_dt).total_seconds() // 60))
            if last_seen_dt
            else threshold_mins
        )
        telemetry_parts: list[str] = []
        if last_ping:
            if last_ping.battery_percent is not None:
                charge_note = " (charging)" if last_ping.is_charging else ""
                low_note = " [Low Power]" if last_ping.is_low_power_mode else ""
                telemetry_parts.append(
                    f"Battery {last_ping.battery_percent}%{charge_note}{low_note}"
                )
            if last_ping.network_type and last_ping.network_type != "UNKNOWN":
                telemetry_parts.append(f"Network: {last_ping.network_type}")
            if last_ping.is_gps_enabled is False:
                telemetry_parts.append("GPS: OFF")
            if last_ping.app_state and last_ping.app_state != "UNKNOWN":
                telemetry_parts.append(f"App: {last_ping.app_state}")

        telemetry_summary = (
            f" Last phone status: {', '.join(telemetry_parts)}."
            if telemetry_parts
            else ""
        )
        remarks = (
            f"No GPS signal received for {silent_mins} min(s) while timed in on duty "
            f"(phone may be powered off, out of battery, offline, or GPS turned off).{telemetry_summary}"
        )

        new_incidents.append(
            LoafingIncident(
                incident_type="TEACHER_SIGNAL_LOST",
                status="OPEN",
                teacher=att.teacher,
                trigger_ping=last_ping,
                detected_at=now,
                remarks=remarks[:500],
            )
        )
        if att.teacher.user_id:
            affected_user_ids.add(att.teacher.user_id)

    if new_incidents:
        LoafingIncident.objects.bulk_create(new_incidents)
        cache_keys = ["dashboard:leader", "reports:system_status"]
        cache_keys.extend(f"dashboard:teacher:{uid}" for uid in affected_user_ids)
        cache.delete_many(cache_keys)

    return {
        "ok": True,
        "checked_teachers": len(on_duty_rows),
        "created_signal_lost_incidents": len(new_incidents),
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