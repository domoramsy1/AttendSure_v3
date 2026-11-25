# D:\AttendSure_V3\backend\apps\campus\selectors.py
from datetime import timedelta
from django.core.cache import cache
from django.db.models import OuterRef, Q, Subquery
from django.utils import timezone

from apps.accounts.models import AuditLog, TeacherProfile
from apps.accounts.selectors import (
    get_teacher_section_ids,
    resolve_teacher_for_user,
)
from apps.attendance.models import DailyAttendance, ExitPass
from apps.school.models import SchoolSettings
from apps.school.selectors import format_section_label
from common.media import build_media_url
from common.permissions import is_school_leader
from .models import CampusBoundary, LoafingIncident, TeacherDailyAttendance, TeacherLocationPing

ONLINE_WINDOW_MINUTES = 5
ACTIVE_BOUNDARY_CACHE_KEY = "campus:active_boundary"


def get_active_campus_boundary() -> CampusBoundary:
    def _load():
        boundary = CampusBoundary.objects.filter(is_active=True).order_by("id").first()
        if not boundary:
            boundary = CampusBoundary.objects.order_by("id").first()
        if not boundary:
            boundary = CampusBoundary.objects.create(campus_name="Main Campus")
        return boundary

    return cache.get_or_set(ACTIVE_BOUNDARY_CACHE_KEY, _load, timeout=30)


def get_active_campus_coords() -> tuple[float, float, int, str]:
    boundary = get_active_campus_boundary()
    return (
        float(boundary.center_latitude),
        float(boundary.center_longitude),
        int(boundary.radius_meters),
        boundary.campus_name,
    )


def format_loafing_incident(inc: LoafingIncident) -> dict:
    if inc.teacher_id and inc.teacher:
        person_name = inc.teacher.full_name
        person_code = inc.teacher.employee_id
        person_role = "TEACHER"
    elif inc.enrollment_id and inc.enrollment and inc.enrollment.student:
        person_name = inc.enrollment.student.full_name
        person_code = inc.enrollment.student.lrn
        person_role = "STUDENT"
    else:
        person_name = "Unknown"
        person_code = ""
        person_role = ""

    section_name = ""
    if inc.enrollment_id and inc.enrollment and inc.enrollment.section:
        sec = inc.enrollment.section
        section_name = format_section_label(
            sec.grade_level.name if sec.grade_level else "",
            sec.name,
        )
    elif inc.class_period_id and inc.class_period and inc.class_period.section:
        sec = inc.class_period.section
        section_name = format_section_label(
            sec.grade_level.name if sec.grade_level else "",
            sec.name,
        )

    period_label = ""
    if inc.class_period_id and inc.class_period and inc.class_period.subject:
        period_label = f"{inc.class_period.subject.code} ({str(inc.class_period.start_time)[:5]}-{str(inc.class_period.end_time)[:5]})"

    local_det = timezone.localtime(inc.detected_at)
    local_res = timezone.localtime(inc.resolved_at) if inc.resolved_at else None

    return {
        "id": inc.id,
        "incident_type": inc.incident_type,
        "status": inc.status,
        "person_role": person_role,
        "person_name": person_name,
        "person_code": person_code,
        "teacher_id": inc.teacher_id,
        "teacher_name": inc.teacher.full_name if inc.teacher_id and inc.teacher else "",
        "enrollment_id": inc.enrollment_id,
        "section_name": section_name,
        "class_period_id": inc.class_period_id,
        "class_period_label": period_label,
        "exit_pass_id": inc.exit_pass_id,
        "distance_meters": inc.distance_meters,
        "incident_date": str(local_det.date()),
        "detected_at": local_det.strftime("%Y-%m-%d %I:%M:%S %p"),
        "detected_time": local_det.strftime("%I:%M %p"),
        "resolved_at": local_res.strftime("%Y-%m-%d %I:%M:%S %p") if local_res else None,
        "remarks": inc.remarks,
        "reviewed_by_name": (
            (inc.reviewed_by.get_full_name() or inc.reviewed_by.username).strip()
            if inc.reviewed_by
            else ""
        ),
    }


def get_campus_boundary_overview(*, user, request=None) -> dict:
    """
    O(1) SQL-query Campus Overview using Subquery/OuterRef for latest teacher ping.
    Only pings recorded TODAY count toward live Inside/Outside Campus status;
    older pings from previous days show as Off Duty / No Ping Today.
    """
    now_dt = timezone.now()
    today = timezone.localdate()
    online_cutoff = now_dt - timedelta(minutes=ONLINE_WINDOW_MINUTES)

    boundary = get_active_campus_boundary()
    lat = float(boundary.center_latitude)
    lon = float(boundary.center_longitude)
    radius = int(boundary.radius_meters)
    name = boundary.campus_name
    leader = is_school_leader(user)

    latest_ping_subquery = Subquery(
        TeacherLocationPing.objects.filter(teacher_id=OuterRef("pk"))
        .order_by("-recorded_at", "-id")
        .values("id")[:1]
    )

    teachers_qs = (
        TeacherProfile.objects.filter(user__is_active=True)
        .select_related("user", "department", "position")
        .annotate(latest_ping_id=latest_ping_subquery)
        .order_by("user__last_name", "user__first_name")
    )

    if not leader:
        teachers_qs = teachers_qs.filter(user_id=user.id)

    teachers = list(teachers_qs)
    latest_ping_ids = [t.latest_ping_id for t in teachers if t.latest_ping_id]

    latest_pings_by_id: dict[int, TeacherLocationPing] = (
        {
            p.id: p
            for p in TeacherLocationPing.objects.filter(id__in=latest_ping_ids).select_related("boundary")
        }
        if latest_ping_ids
        else {}
    )

    clocked_in_today_ids = set(
        TeacherDailyAttendance.objects.filter(
            attendance_date=today,
            time_in__isnull=False,
            time_out__isnull=True,
        ).values_list("teacher_id", flat=True)
    )

    incidents_qs = (
        LoafingIncident.objects.filter(detected_at__date=today)
        .select_related(
            "teacher",
            "teacher__user",
            "enrollment",
            "enrollment__student",
            "enrollment__section",
            "enrollment__section__grade_level",
            "class_period",
            "class_period__subject",
            "class_period__section",
            "class_period__section__grade_level",
            "trigger_ping",
            "trigger_ping__boundary",
            "reviewed_by",
        )
        .order_by("-detected_at")
    )
    if not leader:
        own_teacher = teachers[0] if teachers else None
        if own_teacher:
            incidents_qs = incidents_qs.filter(
                Q(teacher=own_teacher)
                | Q(enrollment__section_id__in=get_teacher_section_ids(own_teacher))
            )
        else:
            incidents_qs = incidents_qs.none()

    incidents_list = [format_loafing_incident(inc) for inc in incidents_qs[:100]]

    teacher_list: list[dict] = []
    online_count = 0
    verified_inside_count = 0
    outside_count = 0

    for t in teachers:
        latest = latest_pings_by_id.get(t.latest_ping_id) if t.latest_ping_id else None
        local_seen = timezone.localtime(latest.recorded_at) if latest else None
        ping_is_today = bool(local_seen and local_seen.date() == today)
        is_online = bool(latest and latest.recorded_at >= online_cutoff)

        inside = bool(ping_is_today and latest and latest.is_inside)
        dist = latest.distance_meters if (ping_is_today and latest) else None
        acc = latest.accuracy_meters if (ping_is_today and latest) else None
        ping_lat = float(latest.latitude) if (ping_is_today and latest) else None
        ping_lon = float(latest.longitude) if (ping_is_today and latest) else None

        if is_online:
            online_count += 1
        if ping_is_today and latest:
            if inside:
                verified_inside_count += 1
            else:
                outside_count += 1

        if not ping_is_today or not latest:
            zone_status = "OFF_DUTY"
            row_status = "OFFLINE"
        elif inside:
            zone_status = "INSIDE"
            row_status = "VERIFIED_INSIDE"
        elif latest.zone_status == "AUTHORIZED_OUTSIDE":
            zone_status = "AUTHORIZED_OUTSIDE"
            row_status = "AUTHORIZED_LEAVE"
        elif latest.zone_status == "LOAFING_ALERT":
            zone_status = "LOAFING_ALERT"
            row_status = "PERIMETER_BREACH"
        else:
            zone_status = "OFF_DUTY"
            row_status = "AWAY_OFF_DUTY" if is_online else "OFFLINE"

        if local_seen:
            last_seen_str = (
                local_seen.strftime("%I:%M:%S %p")
                if ping_is_today
                else local_seen.strftime("%b %d, %I:%M %p")
            )
        else:
            last_seen_str = "No ping yet"

        teacher_list.append(
            {
                "id": t.id,
                "teacher_id": t.id,
                "employee_id": t.employee_id,
                "full_name": t.full_name,
                "teacher_name": t.full_name,
                "department": t.department_name,
                "position": t.position_title,
                "photo_url": build_media_url(t.photo, request),
                "is_online": is_online,
                "is_clocked_in": t.id in clocked_in_today_ids,
                "zone_status": zone_status,
                "status": row_status,
                "is_inside": inside,
                "is_inside_geofence": inside,
                "distance_meters": dist,
                "distance": dist,
                "accuracy_meters": acc,
                "latitude": ping_lat,
                "longitude": ping_lon,
                "last_seen": last_seen_str,
                "recorded_at": local_seen.strftime("%I:%M:%S %p") if (ping_is_today and local_seen) else None,
                "bound_device_id": t.bound_device_id,
                "is_device_bound": bool(t.bound_device_id),
                "device_model": t.device_model or "",
            }
        )

    offline_count = max(len(teachers) - online_count, 0)

    return {
        "campus_name": name,
        "name": name,
        "latitude": lat,
        "longitude": lon,
        "center_latitude": lat,
        "center_longitude": lon,
        "radius_meters": radius,
        "geofence_radius_meters": radius,
        "loafing_grace_minutes": boundary.loafing_grace_minutes,
        "duty_start_time": str(boundary.duty_start_time)[:5],
        "duty_end_time": str(boundary.duty_end_time)[:5],
        "enforce_geofence_checkin": boundary.enforce_geofence_checkin,
        "is_active": boundary.is_active,
        "inside_count": verified_inside_count,
        "verified_inside": verified_inside_count,
        "outside_count": outside_count,
        "online_users_count": online_count,
        "offline_users_count": offline_count,
        "incidents_today": len(incidents_list),
        "open_incidents_count": sum(1 for i in incidents_list if i["status"] == "OPEN"),
        "teacher_list": teacher_list,
        "recent_breaches": incidents_list,
        "loafing_incidents": incidents_list,
    }


def get_campus_audit_history(*, user, request=None) -> dict:
    today = timezone.localdate()
    leader = is_school_leader(user)

    pings_qs = TeacherLocationPing.objects.select_related("teacher", "teacher__user", "boundary").order_by(
        "-recorded_at"
    )
    incidents_qs = LoafingIncident.objects.select_related(
        "teacher",
        "teacher__user",
        "enrollment",
        "enrollment__student",
        "enrollment__section",
        "enrollment__section__grade_level",
        "class_period",
        "class_period__subject",
        "trigger_ping",
        "trigger_ping__boundary",
        "reviewed_by",
    ).order_by("-detected_at")

    tracked_tables = {
        CampusBoundary._meta.db_table,
        SchoolSettings._meta.db_table,
        TeacherLocationPing._meta.db_table,
        LoafingIncident._meta.db_table,
    }
    audit_qs = (
        AuditLog.objects.select_related("performed_by")
        .filter(table_name__in=tracked_tables)
        .order_by("-created_at")
    )

    if not leader:
        own_teacher = resolve_teacher_for_user(user)
        pings_qs = pings_qs.filter(teacher=own_teacher) if own_teacher else pings_qs.none()
        incidents_qs = (
            incidents_qs.filter(
                Q(teacher=own_teacher)
                | Q(enrollment__section_id__in=get_teacher_section_ids(own_teacher))
            )
            if own_teacher
            else incidents_qs.none()
        )
        audit_qs = audit_qs.filter(performed_by=user)

    if request:
        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")
        if date_from:
            pings_qs = pings_qs.filter(recorded_at__date__gte=date_from)
        if date_to:
            pings_qs = pings_qs.filter(recorded_at__date__lte=date_to)
        teacher_id = request.query_params.get("teacher_id")
        if teacher_id and str(teacher_id).isdigit():
            pings_qs = pings_qs.filter(teacher_id=int(teacher_id))
        st_filter = str(request.query_params.get("status") or "").upper()
        if st_filter == "INSIDE":
            pings_qs = pings_qs.filter(zone_status="INSIDE")
        elif st_filter == "OUTSIDE":
            pings_qs = pings_qs.exclude(zone_status="INSIDE")

    zone_labels = {
        "INSIDE": "On Campus",
        "AUTHORIZED_OUTSIDE": "Official Exit Pass",
        "LOAFING_ALERT": "Teacher Loafing Alert",
        "OFF_DUTY": "Off Duty",
    }
    records = []
    for p in pings_qs[:150]:
        local_rec = timezone.localtime(p.recorded_at)
        dist = p.distance_meters
        dist_label = (
            f"{dist / 1000:.2f} km"
            if (dist is not None and dist >= 1000)
            else f"{round(dist)}m" if dist is not None else "—"
        )
        readable_zone = zone_labels.get(p.zone_status, p.zone_status.replace("_", " ").title())
        records.append(
            {
                "id": f"ping-{p.id}",
                "teacher_id": p.teacher_id,
                "teacher_name": p.teacher.full_name,
                "employee_id": p.teacher.employee_id,
                "category": "PING",
                "action": p.zone_status,
                "status": p.zone_status,
                "is_inside": p.is_inside,
                "is_inside_geofence": p.is_inside,
                "latitude": float(p.latitude),
                "longitude": float(p.longitude),
                "distance_meters": dist,
                "distance": dist,
                "accuracy_meters": p.accuracy_meters,
                "device_id": p.device_id,
                "timestamp": local_rec.strftime("%Y-%m-%d %I:%M:%S %p"),
                "date_only": str(local_rec.date()),
                "time_only": local_rec.strftime("%I:%M:%S %p"),
                "details": f"{readable_zone} ({dist_label} from school center)",
            }
        )

    incidents_data = [format_loafing_incident(inc) for inc in incidents_qs[:100]]
    audit_logs = [
        {
            "id": f"audit-{item.id}",
            "record_id": item.id,
            "category": "AUDIT",
            "user": (item.performed_by.get_full_name() or item.performed_by.username)
            if item.performed_by
            else "System",
            "action": item.action,
            "table_name": item.table_name,
            "ip_address": item.client_ip or "",
            "timestamp": timezone.localtime(item.created_at).strftime("%Y-%m-%d %I:%M:%S %p"),
        }
        for item in audit_qs[:60]
    ]

    return {
        "ok": True,
        "count": len(records),
        "records": records,
        "results": records,
        "loafing_incidents": incidents_data,
        "audit_logs": audit_logs,
        "today": str(today),
    }


def get_loafing_incidents_queryset(*, user, incident_type: str = "", status_filter: str = "", date_str: str = ""):
    qs = LoafingIncident.objects.select_related(
        "teacher",
        "teacher__user",
        "enrollment",
        "enrollment__student",
        "enrollment__section",
        "enrollment__section__grade_level",
        "class_period",
        "class_period__subject",
        "class_period__section",
        "class_period__section__grade_level",
        "exit_pass",
        "trigger_ping",
        "trigger_ping__boundary",
        "reviewed_by",
    ).order_by("-detected_at")

    if not is_school_leader(user):
        own_teacher = resolve_teacher_for_user(user)
        if not own_teacher:
            return qs.none()
        qs = qs.filter(
            Q(teacher=own_teacher)
            | Q(enrollment__section_id__in=get_teacher_section_ids(own_teacher))
        )

    if incident_type and incident_type.upper() != "ALL":
        qs = qs.filter(incident_type=incident_type.upper())
    if status_filter and status_filter.upper() != "ALL":
        qs = qs.filter(status=status_filter.upper())
    if date_str:
        qs = qs.filter(detected_at__date=date_str)
    return qs


def get_emergency_roll_call(*, request=None) -> dict:
    today = timezone.localdate()
    now = timezone.now()

    departed_enr_ids = set(
        ExitPass.objects.filter(
            pass_scope="STUDENT",
            is_cancelled=False,
            returned_at__isnull=True,
            issued_at__date=today,
            valid_until__gte=now,
        ).values_list("enrollment_id", flat=True)
    )

    present_rows = list(
        DailyAttendance.objects.filter(attendance_date=today, status__in=["PRESENT", "LATE"])
        .exclude(enrollment_id__in=departed_enr_ids)
        .select_related(
            "enrollment",
            "enrollment__student",
            "enrollment__section",
            "enrollment__section__grade_level",
        )
    )

    students = []
    for row in present_rows:
        st = row.enrollment.student
        sec = row.enrollment.section
        students.append(
            {
                "student_id": st.id,
                "enrollment_id": row.enrollment_id,
                "lrn": st.lrn,
                "full_name": st.full_name,
                "section": format_section_label(
                    sec.grade_level.name if (sec and sec.grade_level) else "",
                    sec.name if sec else "",
                ),
                "guardian_contact": st.guardian_contact,
                "photo_url": build_media_url(st.photo, request),
            }
        )
    students.sort(key=lambda item: (item["section"], item["full_name"]))

    latest_ping_subquery = Subquery(
        TeacherLocationPing.objects.filter(teacher_id=OuterRef("pk"), recorded_at__date=today)
        .order_by("-recorded_at", "-id")
        .values("zone_status")[:1]
    )
    teachers_inside = (
        TeacherProfile.objects.filter(user__is_active=True)
        .select_related("user", "department")
        .annotate(latest_zone=latest_ping_subquery)
        .filter(latest_zone="INSIDE")
        .order_by("user__last_name", "user__first_name")
    )

    teachers_payload = [
        {
            "teacher_id": t.id,
            "employee_id": t.employee_id,
            "full_name": t.full_name,
            "department": t.department_name,
        }
        for t in teachers_inside
    ]

    return {
        "timestamp": timezone.localtime().strftime("%Y-%m-%d %I:%M:%S %p"),
        "total_people_on_campus": len(students) + len(teachers_payload),
        "students_count": len(students),
        "teachers_count": len(teachers_payload),
        "students": students,
        "teachers": teachers_payload,
    }