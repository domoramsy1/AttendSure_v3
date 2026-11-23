from datetime import datetime, timedelta
from django.utils import timezone

from apps.accounts.models import AuditLog, FacultyProfile
from apps.accounts.selectors import get_faculty_section_ids, resolve_faculty_for_user
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.school.models import ClassPeriod, SchoolSettings
from apps.school.selectors import format_section_label
from apps.students.models import Enrollment
from common.media import build_media_url
from common.permissions import get_user_role, is_school_leader
from .models import BoundaryAlert, CampusBoundary, FacultyAttendanceLog

ONLINE_WINDOW_MINUTES = 5


def get_active_campus_coords() -> tuple[float, float, int, str]:
    boundary = (
        CampusBoundary.objects.filter(is_active=True)
        .only("center_lat", "center_lng", "radius_meters", "name")
        .first()
    )
    if not boundary:
        school = (
            SchoolSettings.objects.select_related("campus_boundary")
            .only("school_name", "campus_boundary")
            .first()
        )
        if school and school.campus_boundary:
            boundary = school.campus_boundary

    lat = float(boundary.center_lat) if (boundary and boundary.center_lat is not None) else 8.4858
    lon = float(boundary.center_lng) if (boundary and boundary.center_lng is not None) else 124.6567
    radius = int(boundary.radius_meters) if (boundary and boundary.radius_meters) else 150
    name = boundary.name if boundary else "Main Campus"
    return lat, lon, radius, name


def get_campus_boundary_overview(*, user) -> dict:
    now_dt = timezone.now()
    today = timezone.localdate()
    online_cutoff = now_dt - timedelta(minutes=ONLINE_WINDOW_MINUTES)

    lat, lon, radius, name = get_active_campus_coords()
    leader = is_school_leader(user)

    if leader:
        faculty_members = list(
            FacultyProfile.objects.filter(is_active=True)
            .select_related("department_ref", "position_ref")
            .order_by("last_name", "first_name")
        )
        logs_qs = (
            FacultyAttendanceLog.objects.filter(log_date=today)
            .select_related("faculty")
            .order_by("-recorded_at")[:300]
        )
        alerts_qs = (
            BoundaryAlert.objects.filter(incident_date=today)
            .select_related("faculty")
            .order_by("-left_at")[:100]
        )
    else:
        own_faculty = resolve_faculty_for_user(user)
        faculty_members = [own_faculty] if own_faculty else []
        logs_qs = (
            FacultyAttendanceLog.objects.filter(faculty=own_faculty, log_date=today)
            .select_related("faculty")
            .order_by("-recorded_at")[:60]
            if own_faculty
            else FacultyAttendanceLog.objects.none()
        )
        alerts_qs = (
            BoundaryAlert.objects.filter(faculty=own_faculty, incident_date=today)
            .select_related("faculty")
            .order_by("-left_at")
            if own_faculty
            else BoundaryAlert.objects.none()
        )

    raw_logs = list(logs_qs)
    latest_by_faculty: dict[int, FacultyAttendanceLog] = {}
    logs: list[dict] = []

    for item in raw_logs:
        latest_by_faculty.setdefault(item.faculty_id, item)
        local_rec = timezone.localtime(item.recorded_at)
        fac_name = item.faculty.full_name if item.faculty else "Unknown"
        emp_id = item.faculty.employee_id if item.faculty else ""
        logs.append(
            {
                "id": item.id,
                "faculty_id": item.faculty_id,
                "employee_id": emp_id,
                "faculty_name": fac_name,
                "action": item.action,
                "latitude": float(item.latitude) if item.latitude is not None else lat,
                "longitude": float(item.longitude) if item.longitude is not None else lon,
                "distance_meters": float(item.distance_meters or 0.0),
                "is_inside_geofence": bool(item.is_within_boundary),
                "verified_inside": bool(item.is_within_boundary),
                "face_verified": bool(item.face_verified),
                "recorded_at": local_rec.strftime("%I:%M:%S %p"),
                "timestamp": local_rec.strftime("%Y-%m-%d %I:%M:%S %p"),
            }
        )

    faculty_list: list[dict] = []
    online_count = 0
    verified_inside_count = 0
    outside_count = 0

    for fac in faculty_members:
        latest = latest_by_faculty.get(fac.id)
        is_online = bool(latest and latest.recorded_at >= online_cutoff)
        inside = bool(latest and latest.is_within_boundary)

        if is_online:
            online_count += 1
        if latest:
            if inside:
                verified_inside_count += 1
            else:
                outside_count += 1

        local_seen = timezone.localtime(latest.recorded_at) if latest else None
        bound_id = fac.bound_device_id

        faculty_list.append(
            {
                "id": fac.id,
                "faculty_id": fac.id,
                "employee_id": fac.employee_id,
                "full_name": fac.full_name,
                "faculty_name": fac.full_name,
                "department": fac.department,
                "position": fac.position,
                "is_online": is_online,
                "status": "ONLINE" if is_online else "OFFLINE",
                "is_inside_geofence": inside,
                "verified_inside": inside,
                "latitude": float(latest.latitude) if (latest and latest.latitude is not None) else None,
                "longitude": float(latest.longitude) if (latest and latest.longitude is not None) else None,
                "last_seen": local_seen.strftime("%I:%M:%S %p") if local_seen else "No check-in today",
                "recorded_at": local_seen.strftime("%I:%M:%S %p") if local_seen else None,
                "bound_device_id": bound_id,
                "is_device_bound": bool(bound_id),
                "device_model": fac.device_model or "",
            }
        )

    offline_count = max(len(faculty_members) - online_count, 0)

    boundary_alerts = [
        {
            "id": a.id,
            "faculty_id": a.faculty_id,
            "employee_id": a.faculty.employee_id if a.faculty else "",
            "faculty_name": a.faculty.full_name if a.faculty else "Unknown",
            "trigger_reason": a.remarks or f"Outside campus boundary ({round(a.distance_meters)}m)",
            "reason": a.remarks or f"Outside campus boundary ({round(a.distance_meters)}m)",
            "status": a.status,
            "created_at": timezone.localtime(a.left_at).strftime("%I:%M %p"),
            "timestamp": timezone.localtime(a.left_at).strftime("%Y-%m-%d %I:%M:%S %p"),
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
        "outside_count": outside_count,
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
        CampusBoundary._meta.db_table,
        SchoolSettings._meta.db_table,
        FacultyAttendanceLog._meta.db_table,
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
                "details": f"GPS ({hb['latitude']:.5f}, {hb['longitude']:.5f})",
                "latitude": hb["latitude"],
                "longitude": hb["longitude"],
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

    student_passes = set(
        ExitPass.objects.filter(
            student__isnull=False, status="ACTIVE", valid_from__lte=now_dt, valid_until__gte=now_dt
        ).values_list("student_id", flat=True)
    )
    faculty_passes = set(
        ExitPass.objects.filter(
            faculty__isnull=False, status="ACTIVE", valid_from__lte=now_dt, valid_until__gte=now_dt
        ).values_list("faculty_id", flat=True)
    )
    present_today = set(
        DailyAttendance.objects.filter(
            attendance_date=today, status__in=["PRESENT", "LATE"]
        ).values_list("student_id", flat=True)
    )

    periods_qs = ClassPeriod.objects.select_related("section", "subject", "faculty").filter(
        is_active=True, start_time__lte=now_time
    )
    if not leader:
        own_faculty = resolve_faculty_for_user(user)
        if not own_faculty:
            return []
        periods_qs = periods_qs.filter(section_id__in=get_faculty_section_ids(own_faculty))

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

    class_lists_by_sec: dict[int, list] = {}
    for enr in Enrollment.objects.filter(
        section_id__in=section_ids, status="ENROLLED", student__is_active=True
    ).select_related("student"):
        class_lists_by_sec.setdefault(enr.section_id, []).append(enr.student)

    anomalies = []
    time_str = timezone.localtime(now_dt).strftime("%I:%M %p")

    for period in periods:
        if not period.section or period.id not in started_periods:
            continue
        for st in class_lists_by_sec.get(period.section_id, []):
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
        active_periods = [p for p in periods if p.faculty_id and p.end_time and p.end_time >= now_time]
        fac_ids = {p.faculty_id for p in active_periods}
        latest_logs = {}
        for log in FacultyAttendanceLog.objects.filter(
            faculty_id__in=fac_ids, log_date=today
        ).order_by("faculty_id", "-recorded_at"):
            latest_logs.setdefault(log.faculty_id, log)

        for period in active_periods:
            fac = period.faculty
            if not fac or fac.id in faculty_passes:
                continue
            latest = latest_logs.get(fac.id)
            if latest and not latest.is_within_boundary:
                subj = period.subject.code if period.subject else "CLASS"
                anomalies.append(
                    {
                        "category": "FACULTY",
                        "anomaly_type": "OUTSIDE_GEOFENCE",
                        "severity": "HIGH",
                        "person_id": fac.id,
                        "employee_id": fac.employee_id,
                        "name": fac.full_name,
                        "section": period.section.name if period.section else "",
                        "subject": subj,
                        "details": f"Outside campus boundary during {subj} without an exit pass.",
                        "detected_at": timezone.localtime(latest.recorded_at).strftime("%I:%M %p"),
                    }
                )

    return anomalies


def get_emergency_roll_call(*, request=None) -> dict:
    today = timezone.localdate()

    departed_ids = set(
        ExitPass.objects.filter(
            student__isnull=False, valid_from__date=today, status__in=["ACTIVE", "USED"]
        ).values_list("student_id", flat=True)
    )
    present_rows = list(
        DailyAttendance.objects.filter(attendance_date=today, status__in=["PRESENT", "LATE"])
        .exclude(student_id__in=departed_ids)
        .select_related("student")
    )
    present_student_ids = [r.student_id for r in present_rows]

    section_by_student = {
        enr.student_id: enr.section
        for enr in Enrollment.objects.filter(
            student_id__in=present_student_ids, status="ENROLLED"
        ).select_related("section", "section__grade_level")
    }

    students = []
    for row in present_rows:
        sec = section_by_student.get(row.student_id)
        students.append(
            {
                "student_id": row.student_id,
                "lrn": row.student.lrn,
                "full_name": row.student.full_name,
                "section": format_section_label(
                    sec.grade_level.name if (sec and sec.grade_level) else "",
                    sec.name if sec else "",
                ),
                "parent_contact": row.student.parent_contact,
                "photo_url": build_media_url(row.student.photo, request),
            }
        )
    students.sort(key=lambda item: (item["section"], item["full_name"]))

    latest_inside_by_faculty: dict[int, bool] = {}
    for log in FacultyAttendanceLog.objects.filter(log_date=today).order_by("-recorded_at"):
        latest_inside_by_faculty.setdefault(log.faculty_id, bool(log.is_within_boundary))

    inside_faculty_ids = [fid for fid, is_in in latest_inside_by_faculty.items() if is_in]
    faculty = [
        {
            "faculty_id": f.id,
            "employee_id": f.employee_id,
            "full_name": f.full_name,
            "department": f.department,
        }
        for f in FacultyProfile.objects.filter(id__in=inside_faculty_ids, is_active=True)
        .select_related("department_ref")
        .order_by("last_name")
    ]

    return {
        "timestamp": timezone.localtime().strftime("%Y-%m-%d %I:%M:%S %p"),
        "total_people_on_campus": len(students) + len(faculty),
        "students_count": len(students),
        "faculty_count": len(faculty),
        "students": students,
        "faculty": faculty,
    }