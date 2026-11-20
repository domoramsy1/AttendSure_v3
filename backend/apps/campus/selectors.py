# D:\AttendSure_V3\backend\apps\campus\selectors.py

from datetime import datetime, timedelta
from django.utils import timezone

from apps.accounts.models import AuditLog, TeacherProfile
from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.school.models import ClassPeriod, SchoolSettings
from apps.school.selectors import format_section_label
from apps.students.models import Enrollment
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from .models import BoundaryAlert, CampusBoundary, TeacherLocationLog

ONLINE_WINDOW_MINUTES = 5


def get_active_campus_coords() -> tuple[float, float, int, str]:
    boundary = CampusBoundary.objects.filter(is_active=True).only(
        "latitude", "longitude", "radius_meters", "name"
    ).first()
    school = SchoolSettings.objects.only(
        "latitude", "longitude", "geofence_radius_meters", "school_name"
    ).first()

    lat = (
        float(boundary.latitude)
        if (boundary and boundary.latitude is not None)
        else (float(school.latitude) if (school and school.latitude is not None) else 8.4858)
    )
    lon = (
        float(boundary.longitude)
        if (boundary and boundary.longitude is not None)
        else (float(school.longitude) if (school and school.longitude is not None) else 124.6567)
    )
    radius = (
        int(boundary.radius_meters)
        if (boundary and boundary.radius_meters)
        else (int(school.geofence_radius_meters) if (school and school.geofence_radius_meters) else 150)
    )
    name = boundary.name if boundary else (school.school_name if school else "Campus Boundary")
    return lat, lon, radius, name


def get_campus_boundary_overview(*, user) -> dict:
    now_dt = timezone.now()
    today = timezone.localdate()
    today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
    online_cutoff = now_dt - timedelta(minutes=ONLINE_WINDOW_MINUTES)

    lat, lon, radius, name = get_active_campus_coords()
    leader = is_school_leader(user)

    if leader:
        teachers = list(
            TeacherProfile.objects.filter(is_active=True)
            .only(
                "id",
                "employee_id",
                "first_name",
                "middle_name",
                "last_name",
                "department",
                "position",
                "bound_device_id",
                "device_model",
                "photo",
            )
            .order_by("last_name", "first_name")
        )
        logs_qs = (
            TeacherLocationLog.objects.filter(recorded_at__gte=today_start)
            .select_related("teacher")
            .order_by("-recorded_at")[:300]
        )
        alerts_qs = (
            BoundaryAlert.objects.filter(incident_date=today)
            .select_related("teacher")
            .order_by("-created_at")[:100]
        )
    else:
        own_teacher = resolve_teacher_for_user(user)
        teachers = [own_teacher] if own_teacher else []
        logs_qs = (
            TeacherLocationLog.objects.filter(teacher=own_teacher, recorded_at__gte=today_start)
            .select_related("teacher")
            .order_by("-recorded_at")[:60]
            if own_teacher
            else TeacherLocationLog.objects.none()
        )
        alerts_qs = (
            BoundaryAlert.objects.filter(teacher=own_teacher, incident_date=today)
            .select_related("teacher")
            .order_by("-created_at")
            if own_teacher
            else BoundaryAlert.objects.none()
        )

    raw_logs = list(logs_qs)
    latest_by_teacher: dict[int, TeacherLocationLog] = {}
    logs: list[dict] = []

    for item in raw_logs:
        latest_by_teacher.setdefault(item.teacher_id, item)
        local_rec = timezone.localtime(item.recorded_at)
        logs.append(
            {
                "id": item.id,
                "teacher_id": item.teacher_id,
                "faculty_id": item.teacher_id,
                "employee_id": item.teacher.employee_id if item.teacher else "",
                "teacher_name": item.teacher.full_name if item.teacher else "Unknown",
                "faculty_name": item.teacher.full_name if item.teacher else "Unknown",
                "latitude": float(item.latitude),
                "longitude": float(item.longitude),
                "accuracy": float(getattr(item, "accuracy_meters", 0) or 0) or None,
                "battery_level": item.battery_level,
                "is_inside_geofence": item.is_inside_geofence,
                "verified_inside": item.is_inside_geofence,
                "recorded_at": local_rec.strftime("%I:%M:%S %p"),
                "timestamp": local_rec.strftime("%Y-%m-%d %I:%M:%S %p"),
            }
        )

    faculty_list: list[dict] = []
    online_count = 0
    verified_inside_count = 0
    outside_teacher_count = 0

    for t in teachers:
        latest = latest_by_teacher.get(t.id)
        is_online = bool(latest and latest.recorded_at >= online_cutoff)
        inside = bool(latest and latest.is_inside_geofence)

        if is_online:
            online_count += 1
        if latest:
            if inside:
                verified_inside_count += 1
            else:
                outside_teacher_count += 1

        local_seen = timezone.localtime(latest.recorded_at) if latest else None
        bound_id = getattr(t, "bound_device_id", None)

        faculty_list.append(
            {
                "id": t.id,
                "teacher_id": t.id,
                "faculty_id": t.id,
                "employee_id": t.employee_id,
                "full_name": t.full_name,
                "faculty_name": t.full_name,
                "teacher_name": t.full_name,
                "department": t.department or "",
                "position": t.position or "",
                "is_online": is_online,
                "status": "ONLINE" if is_online else "OFFLINE",
                "is_inside_geofence": inside,
                "verified_inside": inside,
                "latitude": float(latest.latitude) if latest else None,
                "longitude": float(latest.longitude) if latest else None,
                "battery_level": latest.battery_level if latest else None,
                "last_seen": local_seen.strftime("%I:%M:%S %p") if local_seen else "No signal today",
                "recorded_at": local_seen.strftime("%I:%M:%S %p") if local_seen else None,
                "bound_device_id": bound_id,
                "is_device_bound": bool(bound_id),
                "device_model": getattr(t, "device_model", None) or "",
            }
        )

    offline_count = max(len(teachers) - online_count, 0)

    boundary_alerts = [
        {
            "id": a.id,
            "teacher_id": a.teacher_id,
            "faculty_id": a.teacher_id,
            "employee_id": a.teacher.employee_id if a.teacher else "",
            "teacher_name": a.teacher.full_name if a.teacher else "Unknown",
            "faculty_name": a.teacher.full_name if a.teacher else "Unknown",
            "trigger_reason": a.trigger_reason,
            "reason": a.trigger_reason,
            "status": a.status,
            "created_at": timezone.localtime(a.created_at).strftime("%I:%M %p"),
            "timestamp": timezone.localtime(a.created_at).strftime("%Y-%m-%d %I:%M:%S %p"),
        }
        for a in alerts_qs
    ]

    return {
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "radius_meters": radius,
        "geofence_radius_meters": radius,
        "is_active": True,
        "inside_count": verified_inside_count,
        "verified_inside": verified_inside_count,
        "outside_count": outside_teacher_count,
        "online_users_count": online_count,
        "offline_users_count": offline_count,
        "incidents_today": len(boundary_alerts),
        "faculty_list": faculty_list,
        "heartbeats": logs,
        "logs": logs,
        "boundary_alerts": boundary_alerts,
        "recent_breaches": boundary_alerts,
    }


def get_campus_audit_history(*, user) -> dict:
    overview = get_campus_boundary_overview(user=user)
    tracked_tables = {
        "geofence_settings",
        "attendsure_school_profile",
        "faculty_heartbeats",
        "loafing_incidents",
        CampusBoundary._meta.db_table,
        SchoolSettings._meta.db_table,
        TeacherLocationLog._meta.db_table,
        BoundaryAlert._meta.db_table,
    }

    audit_qs = (
        AuditLog.objects.select_related("performed_by")
        .filter(table_name__in=tracked_tables)
        .order_by("-created_at")
    )
    if not is_school_leader(user):
        audit_qs = audit_qs.filter(performed_by=user)

    audit_logs = [
        {
            "id": f"audit-{item.id}",
            "record_id": item.id,
            "category": "AUDIT",
            "user": (item.performed_by.get_full_name() or item.performed_by.username)
            if item.performed_by
            else "System",
            "faculty_name": (item.performed_by.get_full_name() or item.performed_by.username)
            if item.performed_by
            else "System",
            "action": item.action,
            "status": "LOGGED",
            "details": f"{item.action} on {item.table_name}",
            "table_name": item.table_name,
            "ip_address": item.client_ip or "",
            "timestamp": timezone.localtime(item.created_at).strftime("%Y-%m-%d %I:%M:%S %p"),
        }
        for item in audit_qs[:60]
    ]

    records: list[dict] = []
    for alert in overview["boundary_alerts"]:
        records.append(
            {
                "id": f"alert-{alert['id']}",
                "category": "BREACH",
                "user": alert["faculty_name"],
                "faculty_name": alert["faculty_name"],
                "employee_id": alert.get("employee_id", ""),
                "action": "BOUNDARY_ALERT",
                "status": alert["status"],
                "details": alert["trigger_reason"],
                "is_inside_geofence": False,
                "ip_address": "",
                "timestamp": alert["timestamp"],
            }
        )

    for hb in overview["heartbeats"][:100]:
        records.append(
            {
                "id": f"hb-{hb['id']}",
                "category": "HEARTBEAT",
                "user": hb["faculty_name"],
                "faculty_name": hb["faculty_name"],
                "employee_id": hb.get("employee_id", ""),
                "action": "INSIDE_CAMPUS" if hb["is_inside_geofence"] else "OUTSIDE_CAMPUS",
                "status": "INSIDE" if hb["is_inside_geofence"] else "OUTSIDE",
                "details": (
                    f"GPS ({hb['latitude']:.5f}, {hb['longitude']:.5f})"
                    + (f" • Battery {hb['battery_level']}%" if hb.get("battery_level") is not None else "")
                ),
                "latitude": hb["latitude"],
                "longitude": hb["longitude"],
                "battery_level": hb.get("battery_level"),
                "is_inside_geofence": hb["is_inside_geofence"],
                "ip_address": "",
                "timestamp": hb["timestamp"],
            }
        )

    records.extend(audit_logs)

    return {
        "ok": True,
        "count": len(records),
        "records": records,
        "results": records,
        "heartbeats": overview["heartbeats"],
        "loafing_incidents": overview["boundary_alerts"],
        "audit_logs": audit_logs,
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
                anomalies.append(
                    {
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
                    }
                )

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
                anomalies.append(
                    {
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
                    }
                )

    return anomalies


def get_emergency_roll_call(*, request=None) -> dict:
    today = timezone.localdate()
    today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))

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

    latest_inside_by_teacher: dict[int, bool] = {}
    for log in TeacherLocationLog.objects.filter(recorded_at__gte=today_start).order_by("-recorded_at"):
        latest_inside_by_teacher.setdefault(log.teacher_id, log.is_inside_geofence)

    inside_teacher_ids = [tid for tid, is_in in latest_inside_by_teacher.items() if is_in]
    teachers = [
        {
            "teacher_id": t.id,
            "faculty_id": t.id,
            "employee_id": t.employee_id,
            "full_name": t.full_name,
            "department": t.department,
        }
        for t in TeacherProfile.objects.filter(id__in=inside_teacher_ids, is_active=True).order_by("last_name")
    ]

    return {
        "timestamp": timezone.localtime().strftime("%Y-%m-%d %I:%M:%S %p"),
        "total_people_on_campus": len(students) + len(teachers),
        "students_count": len(students),
        "faculty_count": len(teachers),
        "students": students,
        "faculty": teachers,
    }