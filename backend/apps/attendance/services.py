# AttendSure Backend - Attendance Business Logic Services
# File: D:\AttendSure_V3\backend\apps\attendance\services.py

# D:\AttendSure_V3\backend\apps\attendance\services.py
from datetime import datetime, time as dt_time, timedelta
import uuid as uuid_lib
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.accounts.models import TeacherProfile
from apps.accounts.selectors import (
    get_teacher_section_ids,
    get_teacher_student_ids,
    resolve_teacher_for_user,
)
from apps.campus.selectors import get_active_campus_coords
from apps.school.models import ClassPeriod, SchoolHoliday, Subject, period_runs_on_weekday
from apps.school.selectors import format_section_label
from apps.students.models import ACTIVE_ENROLLMENT_STATUSES, Enrollment, Student
from common.exceptions import AppError
from common.gps import verify_campus_gps
from common.media import build_media_url
from common.permissions import is_school_leader
from common.qr_signer import verify_student_qr
from common.time_utils import format_time_12h, local_day_bounds
from .models import ClassAttendance, DailyAttendance, ExitPass


def _invalidate_live_attendance_caches(user_id: int | None = None, adviser_user_id: int | None = None) -> None:
    keys = ["dashboard:leader", "reports:system_status"]
    if user_id:
        keys.append(f"dashboard:teacher:{user_id}")
    if adviser_user_id:
        keys.append(f"dashboard:teacher:{adviser_user_id}")
    cache.delete_many(keys)


def determine_arrival_status(period: ClassPeriod | None, scanned_at, grace_minutes: int = 15) -> str:
    if not period or not period.start_time:
        return "PRESENT"
    local_dt = timezone.localtime(scanned_at)
    cutoff = timezone.make_aware(
        datetime.combine(local_dt.date(), period.start_time),
        timezone.get_current_timezone(),
    ) + timedelta(minutes=grace_minutes)
    return "LATE" if local_dt > cutoff else "PRESENT"


def _parse_uuid(raw_val) -> uuid_lib.UUID | None:
    if not raw_val:
        return None
    try:
        return uuid_lib.UUID(str(raw_val).strip())
    except (ValueError, TypeError):
        return None


def recompute_daily_attendance(
    *,
    enrollment_id: int,
    attendance_date,
    recorder=None,
    remarks: str | None = None,
) -> DailyAttendance | None:
    """
    Recomputes DailyAttendance safely from all ClassAttendance records for the given
    (enrollment_id, attendance_date), so later period scans or manual edits never
    overwrite an earlier valid arrival time_in or daily status.
    """
    class_records = list(
        ClassAttendance.objects.filter(
            enrollment_id=enrollment_id,
            attendance_date=attendance_date,
        )
        .select_related("class_period")
        .order_by("scanned_at", "class_period__start_time", "id")
    )
    existing = DailyAttendance.objects.filter(
        enrollment_id=enrollment_id,
        attendance_date=attendance_date,
    ).first()

    if not class_records:
        if existing:
            existing.delete()
        return None

    present_or_late = [r for r in class_records if r.status in ("PRESENT", "LATE")]
    if present_or_late:
        present_or_late.sort(
            key=lambda r: (
                timezone.localtime(r.scanned_at) if r.scanned_at else timezone.now(),
                (
                    r.class_period.start_time
                    if (r.class_period_id and r.class_period and r.class_period.start_time)
                    else dt_time.max
                ),
                r.id,
            )
        )
        earliest = present_or_late[0]
        computed_status = earliest.status
        computed_time_in = timezone.localtime(earliest.scanned_at).time() if earliest.scanned_at else None
        computed_recorder = earliest.recorded_by or recorder
    elif any(r.status == "EXCUSED" for r in class_records):
        computed_status = "EXCUSED"
        computed_time_in = None
        computed_recorder = class_records[0].recorded_by or recorder
    else:
        computed_status = "ABSENT"
        computed_time_in = None
        computed_recorder = class_records[0].recorded_by or recorder

    if existing:
        update_fields = []
        if existing.status != computed_status:
            existing.status = computed_status
            update_fields.append("status")
        if existing.time_in != computed_time_in:
            existing.time_in = computed_time_in
            update_fields.append("time_in")
        if computed_recorder and not existing.recorded_by_id:
            existing.recorded_by = computed_recorder
            update_fields.append("recorded_by")
        if remarks and not existing.remarks:
            existing.remarks = remarks[:255]
            update_fields.append("remarks")
        if update_fields:
            update_fields.append("updated_at")
            existing.save(update_fields=update_fields)
        return existing

    return DailyAttendance.objects.create(
        enrollment_id=enrollment_id,
        attendance_date=attendance_date,
        time_in=computed_time_in,
        status=computed_status,
        recorded_by=computed_recorder,
        remarks=(remarks or "Attendance log")[:255],
    )


@transaction.atomic
def record_student_qr_scan(
    *,
    user,
    raw_qr: str,
    period_id: int | None = None,
    client_scan_uuid=None,
    latitude=None,
    longitude=None,
    accuracy=None,
    is_mock_location: bool = False,
    request=None,
) -> dict:
    teacher = resolve_teacher_for_user(user)
    leader = is_school_leader(user)
    if not leader and (not teacher or not teacher.can_handle_classes):
        raise AppError(
            "FORBIDDEN",
            "Only assigned classroom teachers and school leaders can scan student QR cards.",
            403,
        )

    if is_mock_location:
        raise AppError(
            "INVALID_GPS",
            "A mock location setting appears to be turned on. Please disable mock locations in your phone settings and try again.",
            400,
        )

    if latitude is not None and longitude is not None and not leader:
        c_lat, c_lon, radius, _ = get_active_campus_coords()
        gps = verify_campus_gps(
            latitude=latitude,
            longitude=longitude,
            campus_lat=c_lat,
            campus_lon=c_lon,
            radius_meters=radius,
            accuracy_meters=accuracy,
            is_mock_location=is_mock_location,
        )
        if not gps["is_valid"]:
            raise AppError("INVALID_GPS", gps["reason"], 400)
        if not gps["is_inside"]:
            raise AppError("OUTSIDE_CAMPUS", gps["reason"], 403)

    clean_raw = str(raw_qr or "").strip()
    if clean_raw.upper().startswith("ATTENDSURE:TEACHER:") or "ATTENDSURE_TEACHER_PASS" in clean_raw.upper():
        raise AppError(
            "TEACHER_QR_SCANNED",
            "That is a Teacher ID Pass. Please scan a Student QR card.",
            400,
        )

    qr_data = verify_student_qr(clean_raw)
    if not qr_data:
        raise AppError(
            "INVALID_QR",
            "We could not verify this QR card. Please ask the student to present their official AttendSure QR ID.",
            400,
        )

    student = Student.objects.filter(
        qr_token=qr_data.qr_token,
        lrn__iexact=qr_data.lrn,
        is_active=True,
    ).first()
    if not student:
        raise AppError(
            "STUDENT_NOT_FOUND",
            "This QR card is not linked to an active student yet. Please check with the class adviser or school admin.",
            404,
        )

    enrollment = (
        Enrollment.objects.filter(student=student, status__in=ACTIVE_ENROLLMENT_STATUSES)
        .select_related("section", "section__grade_level", "section__adviser")
        .order_by("-section__school_year__is_active", "-id")
        .first()
    )
    if not enrollment or not enrollment.section:
        raise AppError(
            "NOT_ENROLLED",
            f"{student.full_name} is not enrolled in an active section yet. Assign a section under Students first.",
            400,
        )

    section = enrollment.section
    section_label = format_section_label(
        section.grade_level.name if section.grade_level else "", section.name
    )

    period_qs = ClassPeriod.objects.filter(section=section, is_active=True).select_related(
        "subject", "teacher"
    )
    active_period = None
    if period_id:
        active_period = period_qs.filter(id=period_id).first()
    if not active_period and teacher:
        active_period = period_qs.filter(teacher=teacher).first()

    is_adviser = bool(teacher and section.adviser_id == teacher.id)
    if not (
        leader
        or is_adviser
        or (active_period and teacher and active_period.teacher_id == teacher.id)
    ):
        raise AppError(
            "FORBIDDEN_SECTION",
            f"You are not listed as a teacher or adviser for {section_label}. Switch to one of your assigned classes to scan.",
            403,
        )

    target_period = active_period or period_qs.order_by("start_time").first()
    if not target_period:
        homeroom_subj, _ = Subject.objects.get_or_create(
            code="HOMEROOM",
            defaults={
                "title": "Advisory Homeroom",
                "grade_level": section.grade_level,
                "units": 1,
            },
        )
        target_period = ClassPeriod.objects.create(
            schedule_code=f"HR-{section.id}",
            section=section,
            subject=homeroom_subj,
            teacher=section.adviser or teacher,
            day_of_week="ALL_WEEKDAYS",
            start_time=dt_time(7, 30),
            end_time=dt_time(8, 30),
            is_active=True,
        )

    now = timezone.now()
    local_now = timezone.localtime(now)
    today = local_now.date()
    today_weekday = today.isoweekday()

    earlier_period_ids = [
        p.id
        for p in ClassPeriod.objects.filter(
            section=section, is_active=True, start_time__lt=target_period.start_time
        ).only("id", "day_of_week")
        if period_runs_on_weekday(p.day_of_week, today_weekday)
    ]
    if earlier_period_ids:
        attended_earlier_ids = set(
            ClassAttendance.objects.filter(
                enrollment=enrollment,
                attendance_date=today,
                class_period_id__in=earlier_period_ids,
                status__in=["PRESENT", "LATE", "EXCUSED"],
            ).values_list("class_period_id", flat=True)
        )
        missed_count = sum(1 for pid in earlier_period_ids if pid not in attended_earlier_ids)
    else:
        missed_count = 0
    note = (
        f"Cutting class check: missed {missed_count} earlier class period(s) today."
        if missed_count > 0
        else ""
    )

    arrival_status = determine_arrival_status(target_period, now)
    recorder = teacher or target_period.teacher
    parsed_uuid = _parse_uuid(client_scan_uuid)

    record, created = ClassAttendance.objects.get_or_create(
        enrollment=enrollment,
        class_period=target_period,
        attendance_date=today,
        defaults={
            "recorded_by": recorder,
            "scanned_at": now,
            "scan_method": "QR",
            "status": arrival_status,
            "client_scan_uuid": parsed_uuid,
        },
    )

    if created:
        recompute_daily_attendance(
            enrollment_id=enrollment.id,
            attendance_date=today,
            recorder=recorder,
            remarks=(note or "QR attendance")[:255],
        )

    adviser_uid = section.adviser.user_id if (section.adviser_id and section.adviser) else None
    _invalidate_live_attendance_caches(user_id=user.id, adviser_user_id=adviser_uid)

    local_scan_dt = timezone.localtime(record.scanned_at)
    return {
        "ok": True,
        "success": True,
        "is_duplicate": not created,
        "student_id": student.id,
        "enrollment_id": enrollment.id,
        "period_id": target_period.id,
        "student_name": student.full_name,
        "lrn": student.lrn,
        "section": section_label,
        "status": record.status,
        "scanned_at": format_time_12h(local_scan_dt, include_seconds=True),
        "scanned_at_iso": local_scan_dt.isoformat(),
        "attendance_note": note,
        "photo_url": build_media_url(student.photo, request),
    }


@transaction.atomic
def sync_offline_qr_scans(*, user, raw_scans: list[dict]) -> dict:
    """
    High-speed O(1) SQL batch processor for offline camera QR queues.
    Pre-fetches all lookup dictionaries and inserts new rows with bulk_create(ignore_conflicts=True).
    """
    teacher = resolve_teacher_for_user(user)
    leader = is_school_leader(user)
    if not leader and (not teacher or not teacher.can_handle_classes):
        raise AppError(
            "FORBIDDEN",
            "Only assigned classroom teachers and school leaders can sync offline scans.",
            403,
        )

    allowed_section_ids = None if leader else get_teacher_section_ids(teacher)

    parsed_entries = []
    tokens = set()
    lrns = set()
    client_uuids = set()

    batch = raw_scans[:500]
    for item in batch:
        if not isinstance(item, dict):
            continue
        qr_data = verify_student_qr(item.get("qr_token") or item.get("qr_text") or item.get("code") or "")
        if not qr_data:
            continue
        scan_dt = parse_datetime(str(item.get("scanned_at") or "")) or timezone.now()
        if timezone.is_naive(scan_dt):
            scan_dt = timezone.make_aware(scan_dt, timezone.get_current_timezone())
        scan_uuid = _parse_uuid(item.get("client_scan_uuid"))
        if scan_uuid:
            client_uuids.add(scan_uuid)

        raw_pid = item.get("schedule_id") or item.get("period_id")
        pid = int(raw_pid) if (raw_pid and str(raw_pid).isdigit()) else None

        tokens.add(qr_data.qr_token)
        lrns.add(qr_data.lrn)
        parsed_entries.append(
            {
                "qr": qr_data,
                "period_id": pid,
                "scanned_at": scan_dt,
                "scan_date": timezone.localtime(scan_dt).date(),
                "client_scan_uuid": scan_uuid,
            }
        )

    rejected = len(batch) - len(parsed_entries)
    if not parsed_entries:
        return {
            "ok": True,
            "success": True,
            "synced_count": 0,
            "duplicate_count": 0,
            "rejected_count": rejected,
        }

    student_by_pair: dict[tuple[str, str], Student] = {
        (st.lrn.lower(), st.qr_token): st
        for st in Student.objects.filter(qr_token__in=tokens, lrn__in=lrns, is_active=True)
    }
    student_ids = [st.id for st in student_by_pair.values()]

    enrollment_by_student: dict[int, Enrollment] = {}
    for enr in (
        Enrollment.objects.filter(student_id__in=student_ids, status__in=ACTIVE_ENROLLMENT_STATUSES)
        .select_related("section", "section__adviser")
        .order_by("-section__school_year__is_active", "-id")
    ):
        enrollment_by_student.setdefault(enr.student_id, enr)

    section_ids = {enr.section_id for enr in enrollment_by_student.values()}

    period_by_id: dict[int, ClassPeriod] = {}
    first_period_by_sec: dict[int, ClassPeriod] = {}
    for cp in (
        ClassPeriod.objects.filter(section_id__in=section_ids, is_active=True)
        .order_by("section_id", "start_time", "id")
    ):
        period_by_id[cp.id] = cp
        first_period_by_sec.setdefault(cp.section_id, cp)

    enr_ids = [enr.id for enr in enrollment_by_student.values()]
    scan_dates = {e["scan_date"] for e in parsed_entries}

    existing_class_keys = set(
        ClassAttendance.objects.filter(
            enrollment_id__in=enr_ids,
            attendance_date__in=scan_dates,
        ).values_list("enrollment_id", "class_period_id", "attendance_date")
    )
    existing_uuids = (
        set(
            ClassAttendance.objects.filter(client_scan_uuid__in=client_uuids).values_list(
                "client_scan_uuid", flat=True
            )
        )
        if client_uuids
        else set()
    )

    existing_daily_map: dict[tuple[int, object], DailyAttendance] = {
        (da.enrollment_id, da.attendance_date): da
        for da in DailyAttendance.objects.filter(
            enrollment_id__in=enr_ids,
            attendance_date__in=scan_dates,
        )
    }

    parsed_entries.sort(key=lambda e: e["scanned_at"])

    new_class_rows: list[ClassAttendance] = []
    new_daily_rows: list[DailyAttendance] = []
    updated_daily_map: dict[tuple[int, object], DailyAttendance] = {}
    seen_batch_class_keys = set(existing_class_keys)
    seen_batch_daily_keys = set(existing_daily_map.keys())
    seen_batch_uuids = set(existing_uuids)
    duplicates = 0

    for entry in parsed_entries:
        st = student_by_pair.get((entry["qr"].lrn.lower(), entry["qr"].qr_token))
        if not st:
            rejected += 1
            continue

        enr = enrollment_by_student.get(st.id)
        if not enr:
            rejected += 1
            continue

        if allowed_section_ids is not None and enr.section_id not in allowed_section_ids:
            rejected += 1
            continue

        pid = entry["period_id"]
        period = (
            period_by_id.get(pid)
            if (pid and period_by_id.get(pid) and period_by_id[pid].section_id == enr.section_id)
            else first_period_by_sec.get(enr.section_id)
        )
        if not period:
            rejected += 1
            continue

        scan_uuid = entry["client_scan_uuid"]
        class_key = (enr.id, period.id, entry["scan_date"])
        if class_key in seen_batch_class_keys or (scan_uuid and scan_uuid in seen_batch_uuids):
            duplicates += 1
            continue

        status_val = determine_arrival_status(period, entry["scanned_at"])
        recorder_id = teacher.id if teacher else period.teacher_id
        local_scan_time = timezone.localtime(entry["scanned_at"]).time()

        new_class_rows.append(
            ClassAttendance(
                enrollment_id=enr.id,
                class_period_id=period.id,
                attendance_date=entry["scan_date"],
                scanned_at=entry["scanned_at"],
                scan_method="QR",
                status=status_val,
                recorded_by_id=recorder_id,
                client_scan_uuid=scan_uuid,
            )
        )
        seen_batch_class_keys.add(class_key)
        if scan_uuid:
            seen_batch_uuids.add(scan_uuid)

        daily_key = (enr.id, entry["scan_date"])
        if daily_key not in seen_batch_daily_keys:
            new_daily_rows.append(
                DailyAttendance(
                    enrollment_id=enr.id,
                    attendance_date=entry["scan_date"],
                    time_in=local_scan_time,
                    status=status_val,
                    recorded_by_id=recorder_id,
                    remarks="Synced from offline camera QR queue.",
                )
            )
            seen_batch_daily_keys.add(daily_key)
        elif daily_key in existing_daily_map:
            existing_da = existing_daily_map[daily_key]
            if existing_da.status not in ("PRESENT", "LATE") or (
                existing_da.time_in is None or local_scan_time < existing_da.time_in
            ):
                existing_da.time_in = local_scan_time
                existing_da.status = status_val
                if recorder_id and not existing_da.recorded_by_id:
                    existing_da.recorded_by_id = recorder_id
                updated_daily_map[daily_key] = existing_da

    if new_class_rows:
        ClassAttendance.objects.bulk_create(new_class_rows, ignore_conflicts=True)
    if new_daily_rows:
        DailyAttendance.objects.bulk_create(new_daily_rows, ignore_conflicts=True)
    if updated_daily_map:
        DailyAttendance.objects.bulk_update(
            list(updated_daily_map.values()), ["time_in", "status", "recorded_by_id"]
        )

    adviser_user_ids = {
        enr.section.adviser.user_id
        for enr in enrollment_by_student.values()
        if enr.section and enr.section.adviser_id and enr.section.adviser and enr.section.adviser.user_id
    }
    cache_keys = ["dashboard:leader", f"dashboard:teacher:{user.id}", "reports:system_status"]
    cache_keys.extend(f"dashboard:teacher:{uid}" for uid in adviser_user_ids)
    cache.delete_many(cache_keys)

    return {
        "ok": True,
        "success": True,
        "synced_count": len(new_class_rows),
        "duplicate_count": duplicates,
        "rejected_count": rejected,
    }


@transaction.atomic
def save_manual_attendance(
    *, user, student_id: int, status_code: str, period_id: int | None = None, date_str: str | None = None
) -> ClassAttendance:
    clean_status = status_code.upper().strip()
    if clean_status not in {"PRESENT", "LATE", "ABSENT", "EXCUSED"}:
        raise AppError("INVALID_STATUS", "Status must be PRESENT, LATE, ABSENT, or EXCUSED.", 400)

    student = Student.objects.filter(id=student_id, is_active=True).first()
    if not student:
        raise AppError("STUDENT_NOT_FOUND", "Student not found.", 404)

    teacher = resolve_teacher_for_user(user)
    if not is_school_leader(user) and (
        not teacher or student.id not in get_teacher_student_ids(teacher)
    ):
        raise AppError(
            "FORBIDDEN",
            "You can only update attendance for students in your assigned classes.",
            403,
        )

    enr = (
        Enrollment.objects.filter(student=student, status__in=ACTIVE_ENROLLMENT_STATUSES)
        .select_related("section", "section__adviser")
        .order_by("-section__school_year__is_active", "-id")
        .first()
    )
    if not enr:
        raise AppError("NOT_ENROLLED", "Student has no active section enrollment.", 400)

    period = (
        ClassPeriod.objects.filter(id=period_id, section=enr.section).first()
        if period_id
        else ClassPeriod.objects.filter(section=enr.section, is_active=True).order_by("start_time").first()
    )
    if not period:
        raise AppError("NO_SCHEDULE", "No active class period found.", 400)

    target_date = timezone.localdate()
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            pass

    recorder = teacher or period.teacher or TeacherProfile.objects.filter(user__is_active=True).order_by("id").first()
    now = timezone.now()

    existing_log = ClassAttendance.objects.filter(
        enrollment=enr,
        class_period=period,
        attendance_date=target_date,
    ).first()
    if existing_log:
        preserve_scanned_at = (
            existing_log.status in ("PRESENT", "LATE")
            and clean_status in ("PRESENT", "LATE")
            and existing_log.scanned_at is not None
        )
        existing_log.recorded_by = recorder
        existing_log.status = clean_status
        existing_log.scan_method = "MANUAL"
        if not preserve_scanned_at:
            existing_log.scanned_at = now
        existing_log.save(update_fields=["recorded_by", "status", "scan_method", "scanned_at"])
        log = existing_log
    else:
        log = ClassAttendance.objects.create(
            enrollment=enr,
            class_period=period,
            attendance_date=target_date,
            recorded_by=recorder,
            status=clean_status,
            scan_method="MANUAL",
            scanned_at=now,
        )

    recompute_daily_attendance(
        enrollment_id=enr.id,
        attendance_date=target_date,
        recorder=recorder,
        remarks="Manual teacher update.",
    )
    adviser_uid = enr.section.adviser.user_id if (enr.section and enr.section.adviser_id and enr.section.adviser) else None
    _invalidate_live_attendance_caches(user_id=user.id, adviser_user_id=adviser_uid)
    return log


@transaction.atomic
def mark_unscanned_students_absent(
    *,
    user,
    period_id: int | None = None,
    section_id: int | None = None,
    date_str: str | None = None,
) -> dict:
    """
    Marks every unscanned active student in an assigned class period as ABSENT
    (or EXCUSED if covered by an active student ExitPass for that period) so
    DepEd SF2 and 30-day dropout warning reports stay complete without manual one-by-one clicks.
    """
    teacher = resolve_teacher_for_user(user)
    leader = is_school_leader(user)
    if not leader and (not teacher or not teacher.can_handle_classes):
        raise AppError(
            "FORBIDDEN",
            "Only assigned classroom teachers and school leaders can mark unscanned students absent.",
            403,
        )

    period = None
    if period_id:
        period = (
            ClassPeriod.objects.select_related("section", "section__adviser", "subject")
            .filter(id=period_id, is_active=True)
            .first()
        )
        if not period:
            raise AppError("PERIOD_NOT_FOUND", "Selected class period was not found.", 404)
    elif section_id:
        base_qs = ClassPeriod.objects.select_related("section", "section__adviser", "subject").filter(
            section_id=section_id, is_active=True
        )
        if teacher:
            period = base_qs.filter(teacher=teacher).order_by("start_time").first()
        if not period:
            period = base_qs.order_by("start_time").first()
        if not period:
            raise AppError("NO_SCHEDULE", "No active class period found for this section.", 400)
    else:
        raise AppError("PERIOD_REQUIRED", "Select a class period or section first.", 400)

    section = period.section
    is_adviser = bool(teacher and section.adviser_id == teacher.id)
    is_period_teacher = bool(teacher and period.teacher_id == teacher.id)
    if not (leader or is_adviser or is_period_teacher):
        raise AppError(
            "FORBIDDEN_SECTION",
            "You can only mark attendance for your assigned classes or advisory section.",
            403,
        )

    today = timezone.localdate()
    target_date = today
    if date_str:
        try:
            target_date = datetime.strptime(str(date_str).strip(), "%Y-%m-%d").date()
        except ValueError:
            raise AppError("INVALID_DATE", "Invalid date format (use YYYY-MM-DD).", 400)
    if target_date > today:
        raise AppError("FUTURE_DATE", "You cannot mark absences for a future date.", 400)
    if SchoolHoliday.objects.filter(holiday_date=target_date).exists():
        raise AppError(
            "HOLIDAY_DATE",
            "This date is marked as a school holiday or suspension, so absences were not recorded.",
            400,
        )

    enrollments = list(
        Enrollment.objects.filter(
            section=section,
            status__in=ACTIVE_ENROLLMENT_STATUSES,
            student__is_active=True,
        ).only("id")
    )
    all_enr_ids = [e.id for e in enrollments]
    if not all_enr_ids:
        return {
            "ok": True,
            "success": True,
            "period_id": period.id,
            "section_id": section.id,
            "attendance_date": str(target_date),
            "marked_absent_count": 0,
            "marked_excused_count": 0,
            "already_recorded_count": 0,
            "total_students": 0,
            "message": "No active enrolled students found in this class.",
        }

    existing_enr_ids = set(
        ClassAttendance.objects.filter(
            class_period=period,
            attendance_date=target_date,
            enrollment_id__in=all_enr_ids,
        ).values_list("enrollment_id", flat=True)
    )
    unscanned_enr_ids = [eid for eid in all_enr_ids if eid not in existing_enr_ids]

    if not unscanned_enr_ids:
        return {
            "ok": True,
            "success": True,
            "period_id": period.id,
            "section_id": section.id,
            "attendance_date": str(target_date),
            "marked_absent_count": 0,
            "marked_excused_count": 0,
            "already_recorded_count": len(existing_enr_ids),
            "total_students": len(all_enr_ids),
            "message": "Every student in this class already has an attendance record for this period.",
        }

    day_start, day_end = local_day_bounds(target_date)
    current_tz = timezone.get_current_timezone()
    period_start_dt = (
        timezone.make_aware(datetime.combine(target_date, period.start_time), current_tz)
        if period.start_time
        else day_start
    )
    period_end_dt = (
        timezone.make_aware(datetime.combine(target_date, period.end_time), current_tz)
        if period.end_time
        else day_end
    )

    excused_enr_ids: set[int] = set()
    for ep in ExitPass.objects.filter(
        pass_scope="STUDENT",
        enrollment_id__in=unscanned_enr_ids,
        is_cancelled=False,
        issued_at__lt=day_end,
        valid_until__gte=day_start,
    ):
        if (
            ep.issued_at <= period_end_dt
            and ep.valid_until >= period_start_dt
            and (ep.returned_at is None or ep.returned_at >= period_start_dt)
        ):
            excused_enr_ids.add(ep.enrollment_id)

    recorder = (
        teacher
        or period.teacher
        or section.adviser
        or TeacherProfile.objects.filter(user__is_active=True).order_by("id").first()
    )
    now = timezone.now()

    new_rows: list[ClassAttendance] = []
    absent_count = 0
    excused_count = 0
    for eid in unscanned_enr_ids:
        next_status = "EXCUSED" if eid in excused_enr_ids else "ABSENT"
        if next_status == "EXCUSED":
            excused_count += 1
        else:
            absent_count += 1
        new_rows.append(
            ClassAttendance(
                enrollment_id=eid,
                class_period=period,
                attendance_date=target_date,
                recorded_by=recorder,
                status=next_status,
                scan_method="MANUAL",
                scanned_at=now,
            )
        )

    ClassAttendance.objects.bulk_create(new_rows, ignore_conflicts=True)

    for eid in unscanned_enr_ids:
        recompute_daily_attendance(
            enrollment_id=eid,
            attendance_date=target_date,
            recorder=recorder,
            remarks="Marked absent (unscanned)" if eid not in excused_enr_ids else "Excused by active exit pass",
        )

    adviser_uid = section.adviser.user_id if (section.adviser_id and section.adviser) else None
    _invalidate_live_attendance_caches(user_id=user.id, adviser_user_id=adviser_uid)

    parts = []
    if absent_count:
        parts.append(f"Marked {absent_count} unscanned student(s) as Absent")
    if excused_count:
        parts.append(f"{excused_count} student(s) with an active exit pass as Excused")
    summary_msg = " and ".join(parts) + "." if parts else "Attendance updated."

    return {
        "ok": True,
        "success": True,
        "period_id": period.id,
        "section_id": section.id,
        "attendance_date": str(target_date),
        "marked_absent_count": absent_count,
        "marked_excused_count": excused_count,
        "already_recorded_count": len(existing_enr_ids),
        "total_students": len(all_enr_ids),
        "message": summary_msg,
    }


@transaction.atomic
def update_exit_pass_lifecycle(*, user, exit_pass: ExitPass, action_name: str) -> ExitPass:
    clean_action = action_name.upper().strip()
    if clean_action == "APPROVE":
        if not is_school_leader(user):
            raise AppError("FORBIDDEN", "Only school leaders can approve official locator slips.", 403)
        if exit_pass.is_cancelled:
            raise AppError("PASS_CANCELLED", "Cancelled passes cannot be approved.", 400)
        exit_pass.is_approved = True
        exit_pass.approved_by = user
        exit_pass.approved_at = timezone.now()
        exit_pass.save(update_fields=["is_approved", "approved_by", "approved_at"])
        _invalidate_live_attendance_caches(user_id=user.id)
        return exit_pass

    if clean_action == "RETURN":
        if exit_pass.is_cancelled:
            raise AppError("PASS_CANCELLED", "Cancelled exit passes cannot be marked returned.", 400)
        if exit_pass.pass_scope == "TEACHER" and not exit_pass.is_approved:
            raise AppError(
                "PASS_NOT_APPROVED",
                "Pending locator slips must be approved by a school leader before marking returned.",
                400,
            )
        exit_pass.returned_at = timezone.now()
        exit_pass.save(update_fields=["returned_at"])
        _invalidate_live_attendance_caches(user_id=user.id)
        return exit_pass

    if clean_action == "CANCEL":
        if exit_pass.pass_scope == "TEACHER" and not is_school_leader(user):
            raise AppError(
                "FORBIDDEN",
                "Only school leaders can cancel a teacher official locator slip.",
                403,
            )
        if not is_school_leader(user) and exit_pass.issued_by_id != user.id:
            raise AppError("FORBIDDEN", "Only school leaders or the issuer can cancel an exit pass.", 403)
        exit_pass.is_cancelled = True
        exit_pass.save(update_fields=["is_cancelled"])
        _invalidate_live_attendance_caches(user_id=user.id)
        return exit_pass

    raise AppError("INVALID_ACTION", "Unsupported exit pass action.", 400)
