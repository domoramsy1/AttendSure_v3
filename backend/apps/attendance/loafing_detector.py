from datetime import datetime, time as dt_time
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from apps.campus.models import LoafingIncident
from apps.school.models import ClassPeriod, period_runs_on_weekday
from apps.students.models import Enrollment
from common.permissions import is_school_leader
from .models import ClassAttendance, DailyAttendance, ExitPass


@transaction.atomic
def detect_daily_student_cutting(
    *,
    target_date=None,
    section_id: int | None = None,
    user=None,
    force_all_periods: bool = False,
) -> dict:
    """
    Bulk, zero-N+1 student cutting detector for:
    1. STUDENT_CUTTING_CLASS: student marked PRESENT/LATE in an earlier period today (or DailyAttendance)
       but cutting a subsequent active class period without an active ExitPass.
    2. EXPIRED_EXIT_PASS: unreturned, uncancelled ExitPass whose valid_until has already passed.
    """
    now = timezone.now()
    local_now = timezone.localtime(now)
    audit_date = target_date or local_now.date()
    audit_weekday = audit_date.isoweekday()
    is_past_date = audit_date < local_now.date()

    allowed_section_ids: set[int] | None = None
    if user is not None and not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        allowed_section_ids = get_teacher_section_ids(teacher) if teacher else set()

    # 1. Fetch active enrollments scoped by section / teacher permissions
    enr_qs = Enrollment.objects.filter(
        status__in=["ENROLLED", "TRANSFERRED_IN"],
        student__is_active=True,
    ).select_related("student", "section", "section__grade_level")
    if section_id:
        enr_qs = enr_qs.filter(section_id=section_id)
    if allowed_section_ids is not None:
        enr_qs = enr_qs.filter(section_id__in=allowed_section_ids)

    enrollments = list(enr_qs)
    enrollment_ids = [e.id for e in enrollments]
    section_ids = {e.section_id for e in enrollments}

    created_cutting = 0
    created_expired = 0

    if enrollment_ids:
        # 2. Fetch active class periods for relevant sections in 1 query,
        # then keep only periods scheduled to meet on audit_date's weekday.
        periods = [
            p
            for p in ClassPeriod.objects.filter(section_id__in=section_ids, is_active=True)
            .select_related("subject", "section")
            .order_by("section_id", "start_time", "id")
            if period_runs_on_weekday(p.day_of_week, audit_weekday)
        ]
        periods_by_section: dict[int, list[ClassPeriod]] = {}
        period_ids = []
        for p in periods:
            periods_by_section.setdefault(p.section_id, []).append(p)
            period_ids.append(p.id)

        eligible_section_ids = {
            sec_id for sec_id, sec_periods in periods_by_section.items() if len(sec_periods) >= 2
        }

        if eligible_section_ids:
            # 3. Fetch all ClassAttendance and DailyAttendance rows for audit_date in 2 queries
            class_rows = list(
                ClassAttendance.objects.filter(
                    attendance_date=audit_date,
                    enrollment_id__in=enrollment_ids,
                    class_period_id__in=period_ids,
                ).values("enrollment_id", "class_period_id", "status", "class_period__start_time")
            )
            daily_present_ids = set(
                DailyAttendance.objects.filter(
                    attendance_date=audit_date,
                    enrollment_id__in=enrollment_ids,
                    status__in=["PRESENT", "LATE"],
                ).values_list("enrollment_id", flat=True)
            )

            # Build lookup maps
            present_or_excused_pairs: set[tuple[int, int]] = set()
            explicit_absent_pairs: set[tuple[int, int]] = set()
            earliest_present_time: dict[int, dt_time] = {}
            started_period_ids: set[int] = set()

            for row in class_rows:
                enr_id = row["enrollment_id"]
                pid = row["class_period_id"]
                st = row["status"]
                started_period_ids.add(pid)
                if st in ("PRESENT", "LATE", "EXCUSED"):
                    present_or_excused_pairs.add((enr_id, pid))
                    if st in ("PRESENT", "LATE"):
                        daily_present_ids.add(enr_id)
                        p_start = row["class_period__start_time"]
                        if p_start is not None:
                            prev = earliest_present_time.get(enr_id)
                            if prev is None or p_start < prev:
                                earliest_present_time[enr_id] = p_start
                elif st == "ABSENT":
                    explicit_absent_pairs.add((enr_id, pid))

            # 4. Fetch non-cancelled ExitPasses for these enrollments that could overlap audit_date (1 query)
            day_start = timezone.make_aware(datetime.combine(audit_date, dt_time.min))
            day_end = timezone.make_aware(datetime.combine(audit_date, dt_time.max))
            student_passes_by_enr: dict[int, list[ExitPass]] = {}
            for ep in ExitPass.objects.filter(
                pass_scope="STUDENT",
                enrollment_id__in=enrollment_ids,
                is_cancelled=False,
                issued_at__lte=day_end,
                valid_until__gte=day_start,
            ):
                student_passes_by_enr.setdefault(ep.enrollment_id, []).append(ep)

            # 5. Fetch already-logged STUDENT_CUTTING_CLASS incidents for audit_date (1 query)
            existing_cutting_pairs = set(
                LoafingIncident.objects.filter(
                    incident_type="STUDENT_CUTTING_CLASS",
                    detected_at__date=audit_date,
                    enrollment_id__in=enrollment_ids,
                ).values_list("enrollment_id", "class_period_id")
            )

            new_incidents: list[LoafingIncident] = []
            current_tz = timezone.get_current_timezone()

            for enr in enrollments:
                if enr.id not in daily_present_ids:
                    continue
                sec_periods = periods_by_section.get(enr.section_id, [])
                if len(sec_periods) < 2:
                    continue

                first_seen_time = earliest_present_time.get(enr.id)
                enr_passes = student_passes_by_enr.get(enr.id, [])

                for period in sec_periods:
                    if (enr.id, period.id) in present_or_excused_pairs:
                        continue
                    if (enr.id, period.id) in existing_cutting_pairs:
                        continue

                    # Only flag periods that follow an earlier presence (or where roll-call ran / time passed)
                    is_subsequent = first_seen_time is not None and period.start_time > first_seen_time
                    period_elapsed = (
                        force_all_periods
                        or is_past_date
                        or (period.id in started_period_ids)
                        or ((enr.id, period.id) in explicit_absent_pairs)
                        or (local_now.time() >= period.start_time)
                    )
                    if not (is_subsequent or period_elapsed):
                        continue
                    if first_seen_time is not None and period.start_time < first_seen_time and period.id not in started_period_ids:
                        continue

                    # Check if an active ExitPass covers this period
                    period_start_dt = timezone.make_aware(
                        datetime.combine(audit_date, period.start_time), current_tz
                    )
                    period_end_dt = timezone.make_aware(
                        datetime.combine(audit_date, period.end_time), current_tz
                    )
                    covered_by_pass = any(
                        ep.issued_at <= period_end_dt
                        and ep.valid_until >= period_start_dt
                        and (ep.returned_at is None or ep.returned_at >= period_start_dt)
                        for ep in enr_passes
                    )
                    if covered_by_pass:
                        continue

                    subj_label = period.subject.code if period.subject_id else "Class"
                    new_incidents.append(
                        LoafingIncident(
                            incident_type="STUDENT_CUTTING_CLASS",
                            status="OPEN",
                            enrollment=enr,
                            class_period=period,
                            detected_at=now,
                            remarks=f"Present earlier on {audit_date} but missing from {subj_label} without an exit pass.",
                        )
                    )
                    existing_cutting_pairs.add((enr.id, period.id))

            if new_incidents:
                LoafingIncident.objects.bulk_create(new_incidents)
                created_cutting = len(new_incidents)

    # 6. Detect EXPIRED_EXIT_PASS incidents (overdue, unreturned, uncancelled passes)
    overdue_qs = ExitPass.objects.filter(
        is_cancelled=False,
        returned_at__isnull=True,
        valid_until__lt=now,
    ).select_related("enrollment", "teacher")
    if allowed_section_ids is not None:
        teacher = resolve_teacher_for_user(user)
        overdue_qs = overdue_qs.filter(
            Q(enrollment__section_id__in=allowed_section_ids)
            | (Q(teacher=teacher) if teacher else Q(pk__isnull=True))
        )

    overdue_passes = list(overdue_qs[:200])
    if overdue_passes:
        overdue_ids = [ep.id for ep in overdue_passes]
        existing_pass_incidents = set(
            LoafingIncident.objects.filter(
                incident_type="EXPIRED_EXIT_PASS",
                exit_pass_id__in=overdue_ids,
            ).values_list("exit_pass_id", flat=True)
        )
        expired_incidents = [
            LoafingIncident(
                incident_type="EXPIRED_EXIT_PASS",
                status="OPEN",
                teacher=ep.teacher,
                enrollment=ep.enrollment,
                exit_pass=ep,
                detected_at=now,
                remarks=f"Exit pass #{ep.pass_number} expired without a recorded return.",
            )
            for ep in overdue_passes
            if ep.id not in existing_pass_incidents
        ]
        if expired_incidents:
            LoafingIncident.objects.bulk_create(expired_incidents)
            created_expired = len(expired_incidents)

    return {
        "ok": True,
        "audit_date": str(audit_date),
        "created_cutting_incidents": created_cutting,
        "created_expired_pass_incidents": created_expired,
        "total_created": created_cutting + created_expired,
    }


# Backwards-compatible alias for existing callers and tests
detect_daily_student_loafing = detect_daily_student_cutting
