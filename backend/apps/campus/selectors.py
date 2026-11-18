from datetime import datetime
from django.utils import timezone
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from apps.accounts.models import AuditLog, TeacherProfile
from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.school.models import ClassPeriod, SchoolSettings
from apps.school.selectors import format_section_label
from apps.students.models import Enrollment
from .models import BoundaryAlert, CampusBoundary, TeacherLocationLog


def get_active_campus_coords() -> tuple[float, float, int, str]:
    boundary = CampusBoundary.objects.filter(is_active=True).first()
    school = SchoolSettings.objects.first()

    lat = float(boundary.latitude) if (boundary and boundary.latitude is not None) else (
        float(school.latitude) if (school and school.latitude is not None) else 8.4858
    )
    lon = float(boundary.longitude) if (boundary and boundary.longitude is not None) else (
        float(school.longitude) if (school and school.longitude is not None) else 124.6567
    )
    radius = int(boundary.radius_meters) if (boundary and boundary.radius_meters) else (
        int(school.geofence_radius_meters) if (school and school.geofence_radius_meters) else 150
    )
    name = boundary.name if boundary else (school.school_name if school else "Campus Boundary")
    return lat, lon, radius, name


def get_campus_boundary_overview(*, user) -> dict:
    today = timezone.localdate()
    lat, lon, radius, name = get_active_campus_coords()

    if is_school_leader(user):
        logs_qs = TeacherLocationLog.objects.filter(recorded_at__date=today).select_related("teacher")[:100]
        alerts_qs = BoundaryAlert.objects.filter(incident_date=today).select_related("teacher")
    else:
        teacher = resolve_teacher_for_user(user)
        logs_qs = (
            TeacherLocationLog.objects.filter(teacher=teacher, recorded_at__date=today).select_related("teacher")[:50]
            if teacher
            else TeacherLocationLog.objects.none()
        )
        alerts_qs = (
            BoundaryAlert.objects.filter(teacher=teacher, incident_date=today).select_related("teacher")
            if teacher
            else BoundaryAlert.objects.none()
        )

    logs = [
        {
            "id": item.id,
            "teacher_id": item.teacher_id,
            "faculty_id": item.teacher_id,
            "teacher_name": item.teacher.full_name,
            "faculty_name": item.teacher.full_name,
            "latitude": float(item.latitude),
            "longitude": float(item.longitude),
            "battery_level": item.battery_level,
            "is_inside_geofence": item.is_inside_geofence,
            "recorded_at": timezone.localtime(item.recorded_at).strftime("%I:%M:%S %p"),
        }
        for item in logs_qs
    ]

    return {
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "radius_meters": radius,
        "geofence_radius_meters": radius,
        "is_active": True,
        "inside_count": sum(1 for entry in logs if entry["is_inside_geofence"]),
        "outside_count": sum(1 for entry in logs if not entry["is_inside_geofence"]),
        "heartbeats": logs,
        "logs": logs,
        "boundary_alerts": [
            {
                "id": a.id,
                "teacher_name": a.teacher.full_name,
                "faculty_name": a.teacher.full_name,
                "trigger_reason": a.trigger_reason,
                "status": a.status,
                "created_at": timezone.localtime(a.created_at).strftime("%I:%M %p"),
            }
            for a in alerts_qs
        ],
    }


def get_campus_audit_history(*, user) -> dict:
    overview = get_campus_boundary_overview(user=user)
    audit_qs = AuditLog.objects.select_related("performed_by").filter(
        table_name__in=["geofence_settings", "attendsure_school_profile", "faculty_heartbeats", "loafing_incidents"]
    ).order_by("-created_at")
    if not is_school_leader(user):
        audit_qs = audit_qs.filter(performed_by=user)

    return {
        "ok": True,
        "heartbeats": overview["heartbeats"],
        "loafing_incidents": overview["boundary_alerts"],
        "audit_logs": [
            {
                "id": item.id,
                "user": (item.performed_by.get_full_name() or item.performed_by.username) if item.performed_by else "System",
                "action": item.action,
                "table_name": item.table_name,
                "ip_address": item.client_ip or "127.0.0.1",
                "timestamp": timezone.localtime(item.created_at).strftime("%Y-%m-%d %I:%M:%S %p"),
            }
            for item in audit_qs[:50]
        ],
    }


def get_live_campus_anomalies(*, user) -> list[dict]:
    leader = is_school_leader(user)
    if not (leader or get_user_role(user) == "FACULTY"):
        return []

    today = timezone.localdate()
    now_dt = timezone.now()
    now_time = timezone.localtime(now_dt).time()
    today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))

    student_passes = set(
        ExitPass.objects.filter(
            student__isnull=False, status="ACTIVE", valid_from__lte=now_dt, valid_until__gte=now_dt
        ).values_list("student_id", flat=True)
    )
    teacher_passes = set(
        ExitPass.objects.filter(
            teacher__isnull=False, status="ACTIVE", valid_from__lte=now_dt, valid_until__gte=now_dt
        ).values_list("teacher_id", flat=True)
    )
    present_today = set(
        DailyAttendance.objects.filter(
            attendance_date=today, status__in=["PRESENT", "LATE"]
        ).values_list("student_id", flat=True)
    )

    periods_qs = ClassPeriod.objects.select_related("section", "subject", "teacher").filter(
        is_active=True, start_time__lte=now_time
    )
    if not leader:
        own_teacher = resolve_teacher_for_user(user)
        if not own_teacher:
            return []
        periods_qs = periods_qs.filter(section_id__in=get_teacher_section_ids(own_teacher))

    periods = list(periods_qs)
    period_ids = [p.id for p in periods]
    section_ids = {p.section_id for p in periods if p.section_id}

    verified_pairs = set(
        ClassAttendance.objects.filter(
            attendance_date=today,
            class_period_id__in=period_ids,
            status__in=["PRESENT", "LATE", "EXCUSED"],
        ).values_list("student_id", "class_period_id")
    )
    started_periods = {pid for _, pid in verified_pairs}

    rosters: dict[int, list] = {}
    for enr in Enrollment.objects.filter(
        section_id__in=section_ids, status="ENROLLED", student__is_active=True
    ).select_related("student"):
        rosters.setdefault(enr.section_id, []).append(enr.student)

    anomalies = []
    time_str = timezone.localtime(now_dt).strftime("%I:%M %p")

    for period in periods:
        if not period.section or period.id not in started_periods:
            continue
        for st in rosters.get(period.section_id, []):
            if st.id in present_today and (st.id, period.id) not in verified_pairs and st.id not in student_passes:
                subj = period.subject.code if period.subject else "CLASS"
                anomalies.append({
                    "category": "STUDENT",
                    "anomaly_type": "CUTTING_CLASS",
                    "severity": "HIGH",
                    "person_id": st.id,
                    "lrn": st.lrn,
                    "name": st.full_name,
                    "section": period.section.name,
                    "subject": subj,
                    "details": f"Present earlier today but missing from {subj} without an exit pass.",
                    "detected_at": time_str,
                })

    if leader:
        active_periods = [p for p in periods if p.teacher_id and p.end_time and p.end_time >= now_time]
        teacher_ids = {p.teacher_id for p in active_periods}
        latest_logs = {}
        for log in TeacherLocationLog.objects.filter(
            teacher_id__in=teacher_ids, recorded_at__gte=today_start
        ).order_by("teacher_id", "-recorded_at"):
            latest_logs.setdefault(log.teacher_id, log)

        for period in active_periods:
            t = period.teacher
            if not t or t.id in teacher_passes:
                continue
            latest = latest_logs.get(t.id)
            if latest and not latest.is_inside_geofence:
                subj = period.subject.code if period.subject else "CLASS"
                anomalies.append({
                    "category": "FACULTY",
                    "anomaly_type": "OUTSIDE_GEOFENCE",
                    "severity": "HIGH",
                    "person_id": t.id,
                    "employee_id": t.employee_id,
                    "name": t.full_name,
                    "section": period.section.name if period.section else "",
                    "subject": subj,
                    "details": f"Outside campus boundary during {subj} without an exit pass.",
                    "detected_at": timezone.localtime(latest.recorded_at).strftime("%I:%M %p"),
                })

    return anomalies


def get_emergency_roll_call(*, request=None) -> dict:
    today = timezone.localdate()
    departed_ids = set(
        ExitPass.objects.filter(
            student__isnull=False, valid_from__date=today, status__in=["ACTIVE", "USED"]
        ).values_list("student_id", flat=True)
    )
    present_rows = (
        DailyAttendance.objects.filter(attendance_date=today, status__in=["PRESENT", "LATE"])
        .exclude(student_id__in=departed_ids)
        .select_related("student", "section", "section__grade_level")
        .order_by("section__grade_level__level_order", "section__name", "student__last_name")
    )

    students = [
        {
            "student_id": row.student_id,
            "lrn": row.student.lrn,
            "full_name": row.student.full_name,
            "section": format_section_label(
                row.section.grade_level.name if (row.section and row.section.grade_level) else "",
                row.section.name if row.section else "",
            ),
            "parent_contact": row.student.parent_contact,
            "photo_url": build_media_url(row.student.photo, request),
        }
        for row in present_rows
    ]

    teacher_ids = (
        TeacherLocationLog.objects.filter(recorded_at__date=today, is_inside_geofence=True)
        .values_list("teacher_id", flat=True)
        .distinct()
    )
    teachers = [
        {
            "teacher_id": t.id,
            "faculty_id": t.id,
            "employee_id": t.employee_id,
            "full_name": t.full_name,
            "department": t.department,
        }
        for t in TeacherProfile.objects.filter(id__in=teacher_ids, is_active=True).order_by("last_name")
    ]

    return {
        "timestamp": timezone.localtime().strftime("%Y-%m-%d %I:%M:%S %p"),
        "total_people_on_campus": len(students) + len(teachers),
        "students_count": len(students),
        "faculty_count": len(teachers),
        "students": students,
        "faculty": teachers,
    }