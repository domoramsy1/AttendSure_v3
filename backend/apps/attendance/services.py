from datetime import datetime, timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from common.exceptions import AppError
from common.gps import verify_campus_gps
from common.media import build_media_url
from common.permissions import is_school_leader
from common.qr_signer import verify_student_qr
from apps.accounts.selectors import get_teacher_student_ids, resolve_teacher_for_user
from apps.campus.selectors import get_active_campus_coords
from apps.messaging.services import notify_student_parent
from apps.school.models import ClassPeriod
from apps.school.selectors import format_section_label
from apps.students.models import Enrollment, Student
from .models import ClassAttendance, DailyAttendance, ExitPass


def determine_arrival_status(period: ClassPeriod | None, scanned_at, grace_minutes: int = 15) -> str:
    if not period or not period.start_time:
        return "PRESENT"
    local_dt = timezone.localtime(scanned_at)
    cutoff = timezone.make_aware(
        datetime.combine(local_dt.date(), period.start_time),
        timezone.get_current_timezone(),
    ) + timedelta(minutes=grace_minutes)
    return "LATE" if local_dt > cutoff else "PRESENT"


@transaction.atomic
def record_student_qr_scan(
    *,
    user,
    raw_qr: str,
    period_id: int | None = None,
    latitude=None,
    longitude=None,
    accuracy=None,
    is_mock_location: bool = False,
    request=None,
) -> dict:
    teacher = resolve_teacher_for_user(user)
    leader = is_school_leader(user)
    if not teacher and not leader:
        raise AppError("FORBIDDEN", "Only teachers and administrators can scan QR cards.", 403)

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
        if not gps["is_inside"]:
            raise AppError("OUTSIDE_CAMPUS", gps["reason"], 403)

    qr_data = verify_student_qr(raw_qr, allow_legacy_unsigned=True)
    if not qr_data:
        raise AppError("INVALID_QR", "Invalid or tampered student QR card.", 400)

    student = Student.objects.filter(
        Q(qr_token=qr_data.qr_token) | Q(lrn__iexact=qr_data.lrn),
        is_active=True,
    ).first()
    if not student:
        raise AppError("STUDENT_NOT_FOUND", "Unregistered student QR card.", 404)

    enrollment = (
        Enrollment.objects.filter(student=student, status="ENROLLED")
        .select_related("section", "section__grade_level")
        .order_by("-id")
        .first()
    )
    if not enrollment or not enrollment.section:
        raise AppError("NOT_ENROLLED", f"{student.full_name} has no active section.", 400)

    section = enrollment.section
    section_label = format_section_label(
        section.grade_level.name if section.grade_level else "", section.name
    )

    period_qs = ClassPeriod.objects.filter(section=section, is_active=True).select_related("subject")
    active_period = None
    if period_id:
        active_period = period_qs.filter(id=period_id).first()
    if not active_period and teacher:
        active_period = period_qs.filter(teacher=teacher).first()

    is_adviser = bool(teacher and section.adviser_id == teacher.id)
    if not (leader or is_adviser or (active_period and teacher and active_period.teacher_id == teacher.id)):
        raise AppError("FORBIDDEN_SECTION", f"You are not assigned to {section_label}.", 403)

    target_period = active_period or period_qs.order_by("start_time").first()
    if not target_period:
        raise AppError("NO_SCHEDULE", f"No active class period found for {section_label}.", 400)

    now = timezone.now()
    today = timezone.localdate()

    missed_count = (
        ClassPeriod.objects.filter(
            section=section, is_active=True, start_time__lt=target_period.start_time
        )
        .exclude(
            attendance_records__student=student,
            attendance_records__attendance_date=today,
            attendance_records__status__in=["PRESENT", "LATE"],
        )
        .count()
    )
    note = (
        f"CUTTING ALERT: Missed {missed_count} earlier period(s) today."
        if missed_count > 0
        else "Classroom QR attendance verified."
    )

    arrival_status = determine_arrival_status(target_period, now)
    record, created = ClassAttendance.objects.get_or_create(
        student=student,
        class_period=target_period,
        attendance_date=today,
        defaults={
            "recorded_by": target_period.teacher or teacher,
            "scanned_at": now,
            "scan_method": "QR",
            "status": arrival_status,
        },
    )

    if created:
        DailyAttendance.objects.update_or_create(
            student=student,
            attendance_date=today,
            defaults={"section": section, "status": arrival_status, "remarks": note[:255]},
        )
        subject_name = target_period.subject.title if target_period.subject else "Class"
        time_display = timezone.localtime(now).strftime("%I:%M %p")
        notify_student_parent(
            student=student,
            title=f"Cutting Alert: {student.first_name}" if missed_count > 0 else f"Attendance: {student.first_name} ({arrival_status})",
            message=(
                f"{student.full_name} scanned into {subject_name} at {time_display}, missing {missed_count} earlier period(s)."
                if missed_count > 0
                else f"{student.full_name} was marked {arrival_status} in {subject_name} at {time_display}."
            ),
            category="CUTTING_ALERT" if missed_count > 0 else "ATTENDANCE",
        )

    return {
        "ok": True,
        "success": True,
        "is_duplicate": not created,
        "student_id": student.id,
        "student_name": student.full_name,
        "lrn": student.lrn,
        "section": section_label,
        "status": record.status,
        "scanned_at": timezone.localtime(record.scanned_at).strftime("%I:%M:%S %p"),
        "attendance_note": note,
        "photo_url": build_media_url(student.photo, request),
    }


@transaction.atomic
def sync_offline_qr_scans(*, user, raw_scans: list[dict]) -> dict:
    teacher = resolve_teacher_for_user(user)
    if not teacher and not is_school_leader(user):
        raise AppError("FORBIDDEN", "Only teachers and administrators can sync offline scans.", 403)

    parsed = []
    tokens = set()
    for item in raw_scans[:500]:
        qr_data = verify_student_qr(item.get("qr_token") or item.get("code") or "", allow_legacy_unsigned=True)
        if not qr_data:
            continue
        tokens.add(qr_data.qr_token)
        tokens.add(qr_data.lrn)
        parsed.append({
            "qr": qr_data,
            "period_id": item.get("schedule_id") or item.get("period_id"),
            "scanned_at": parse_datetime(str(item.get("scanned_at", ""))) or timezone.now(),
        })

    students = Student.objects.filter(Q(qr_token__in=tokens) | Q(lrn__in=tokens), is_active=True)
    student_lookup = {}
    for st in students:
        student_lookup[st.qr_token] = st
        student_lookup[st.lrn] = st

    enrollments = {
        e.student_id: e.section
        for e in Enrollment.objects.filter(student__in=students, status="ENROLLED").select_related("section")
    }

    synced = duplicates = 0
    rejected = len(raw_scans) - len(parsed)

    for entry in parsed:
        st = student_lookup.get(entry["qr"].qr_token) or student_lookup.get(entry["qr"].lrn)
        sec = enrollments.get(st.id) if st else None
        if not st or not sec:
            rejected += 1
            continue

        pid = entry["period_id"]
        period = (
            ClassPeriod.objects.filter(id=int(pid), section=sec, is_active=True).first()
            if (pid and str(pid).isdigit())
            else ClassPeriod.objects.filter(section=sec, is_active=True).order_by("start_time").first()
        )
        if not period:
            rejected += 1
            continue

        scan_dt = entry["scanned_at"]
        if timezone.is_naive(scan_dt):
            scan_dt = timezone.make_aware(scan_dt, timezone.get_current_timezone())
        scan_date = timezone.localtime(scan_dt).date()
        status_val = determine_arrival_status(period, scan_dt)

        _, created = ClassAttendance.objects.get_or_create(
            student=st,
            class_period=period,
            attendance_date=scan_date,
            defaults={
                "recorded_by": period.teacher or teacher,
                "scanned_at": scan_dt,
                "scan_method": "QR",
                "status": status_val,
            },
        )
        if not created:
            duplicates += 1
            continue

        DailyAttendance.objects.update_or_create(
            student=st,
            attendance_date=scan_date,
            defaults={"section": sec, "status": status_val, "remarks": "Synced from offline QR queue."},
        )
        synced += 1

    return {
        "ok": True,
        "success": True,
        "synced_count": synced,
        "duplicate_count": duplicates,
        "rejected_count": rejected,
    }


@transaction.atomic
def save_manual_attendance(
    *, user, student_id: int, status_code: str, period_id: int | None = None, date_str: str | None = None
) -> ClassAttendance:
    clean_status = status_code.upper().strip()
    if clean_status not in {"PRESENT", "LATE", "CUTTING", "ABSENT", "EXCUSED"}:
        raise AppError("INVALID_STATUS", "Invalid attendance status.", 400)

    student = Student.objects.filter(id=student_id, is_active=True).first()
    if not student:
        raise AppError("STUDENT_NOT_FOUND", "Student not found.", 404)

    teacher = resolve_teacher_for_user(user)
    if not is_school_leader(user) and (not teacher or student.id not in get_teacher_student_ids(teacher)):
        raise AppError("FORBIDDEN", "Access denied for this student.", 403)

    enr = Enrollment.objects.filter(student=student, status="ENROLLED").select_related("section").first()
    sec = enr.section if enr else None
    period = (
        ClassPeriod.objects.filter(id=period_id).first()
        if period_id
        else (ClassPeriod.objects.filter(section=sec, is_active=True).order_by("start_time").first() if sec else None)
    )
    if not period:
        raise AppError("NO_SCHEDULE", "No active class period found.", 400)

    target_date = timezone.localdate()
    if date_str:
        try:
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            pass

    log, _ = ClassAttendance.objects.update_or_create(
        student=student,
        class_period=period,
        attendance_date=target_date,
        defaults={
            "recorded_by": teacher or period.teacher,
            "status": clean_status,
            "scan_method": "MANUAL",
            "scanned_at": timezone.now(),
        },
    )
    if sec:
        DailyAttendance.objects.update_or_create(
            student=student,
            attendance_date=target_date,
            defaults={"section": sec, "status": clean_status, "remarks": "Manual teacher update."},
        )
    return log


@transaction.atomic
def change_exit_pass_status(*, user, exit_pass: ExitPass, next_status: str) -> ExitPass:
    if next_status in ("ACTIVE", "REVOKED") and not is_school_leader(user):
        raise AppError("FORBIDDEN", "Only school leadership can approve or decline passes.", 403)
    if next_status == "USED":
        if exit_pass.status != "ACTIVE":
            raise AppError("INVALID_PASS_STATE", f"Pass is currently {exit_pass.status}.", 400)
        if timezone.now() > exit_pass.valid_until:
            exit_pass.status = "EXPIRED"
            exit_pass.save(update_fields=["status", "updated_at"])
            raise AppError("PASS_EXPIRED", "Exit pass has expired.", 400)

    exit_pass.status = next_status
    exit_pass.save(update_fields=["status", "updated_at"])

    if next_status == "USED" and exit_pass.student:
        notify_student_parent(
            student=exit_pass.student,
            title=f"Authorized Campus Exit: {exit_pass.student.first_name}",
            message=f"{exit_pass.student.full_name} exited campus using approved pass #{exit_pass.pass_number}.",
            category="GATE_PASS",
        )
    return exit_pass