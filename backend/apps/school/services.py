# AttendSure Backend - School Business Logic Services
# File: D:\AttendSure_V3\backend\apps\school\services.py

from datetime import time
from common.time_utils import format_time_range_12h
from .models import ClassPeriod, SchoolYear, Section, Subject, expand_schedule_days
from .selectors import format_section_label


def parse_schedule_time(raw_value) -> time | None:
    if isinstance(raw_value, time):
        return raw_value
    raw = str(raw_value or "").strip()
    if not raw:
        return None
    parts = raw.split(":")
    try:
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
        second = int(parts[2]) if len(parts) > 2 else 0
        return time(hour, minute, second)
    except (ValueError, IndexError):
        return None


def check_section_conflicts(
    *,
    school_year: SchoolYear | None,
    grade_level_id: int | None = None,
    name: str = "",
    adviser=None,
    room_name: str = "",
    exclude_id: int | None = None,
    is_active: bool = True,
) -> dict:
    sy = school_year or SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
    clean_name = str(name or "").strip()
    clean_room = str(room_name or "").strip()

    name_taken = False
    name_message = ""
    if sy and grade_level_id and clean_name:
        dup_qs = Section.objects.filter(
            school_year=sy,
            grade_level_id=grade_level_id,
            name__iexact=clean_name,
        )
        if exclude_id:
            dup_qs = dup_qs.exclude(pk=exclude_id)
        if dup_qs.exists():
            name_taken = True
            name_message = "A section with this name already exists for this grade level and school year."

    adviser_conflict = {
        "has_existing_advisory": False,
        "existing_sections": [],
        "can_handle_classes": True,
        "message": "",
    }
    if adviser is not None:
        if not adviser.can_handle_classes:
            adviser_conflict = {
                "has_existing_advisory": False,
                "existing_sections": [],
                "can_handle_classes": False,
                "message": "Non-teaching staff cannot be assigned as a homeroom class adviser. Choose a teaching teacher instead.",
            }
        elif sy and is_active:
            existing_qs = (
                Section.objects.filter(
                    school_year=sy,
                    adviser=adviser,
                    is_active=True,
                )
                .select_related("grade_level")
                .order_by("grade_level__level_number", "name")
            )
            if exclude_id:
                existing_qs = existing_qs.exclude(pk=exclude_id)
            existing_labels = [
                format_section_label(
                    sec.grade_level.name if sec.grade_level else "",
                    sec.name,
                )
                for sec in existing_qs
            ]
            if existing_labels:
                joined = ", ".join(existing_labels)
                adviser_conflict = {
                    "has_existing_advisory": True,
                    "existing_sections": existing_labels,
                    "can_handle_classes": True,
                    "message": (
                        f"This teacher is already the adviser of {joined} for {sy.name}. "
                        "Turn on 'Allow second advisory class' if this is an approved double-shift, "
                        "multigrade, or temporary assignment."
                    ),
                }

    room_in_use_by_sections: list[str] = []
    if sy and clean_room:
        room_qs = (
            Section.objects.filter(
                school_year=sy,
                is_active=True,
                room_name__iexact=clean_room,
            )
            .select_related("grade_level")
            .order_by("grade_level__level_number", "name")
        )
        if exclude_id:
            room_qs = room_qs.exclude(pk=exclude_id)
        room_in_use_by_sections = [
            format_section_label(
                sec.grade_level.name if sec.grade_level else "",
                sec.name,
            )
            for sec in room_qs
        ]

    return {
        "type": "section",
        "name_taken": name_taken,
        "name_message": name_message,
        "adviser_conflict": adviser_conflict,
        "room_in_use_by_sections": room_in_use_by_sections,
        "room_message": (
            f"{clean_room} is also set as the homeroom for {', '.join(room_in_use_by_sections)}. "
            "Make sure their class schedules do not overlap (for example, AM/PM shifts)."
            if room_in_use_by_sections
            else ""
        ),
        "has_hard_conflict": bool(name_taken or not adviser_conflict["can_handle_classes"]),
    }


def check_class_period_conflicts(
    *,
    section: Section | None,
    teacher=None,
    day_of_week: str | int | None = "ALL_WEEKDAYS",
    start_time: time | None = None,
    end_time: time | None = None,
    exclude_id: int | None = None,
    is_active: bool = True,
) -> dict:
    time_error: str | None = None
    section_conflict: str | None = None
    teacher_conflict: str | None = None
    room_conflict: str | None = None

    if teacher is not None and not teacher.can_handle_classes:
        teacher_conflict = (
            "Non-teaching staff cannot be assigned to teach a scheduled class period. "
            "Choose a teaching teacher instead."
        )

    if start_time and end_time and end_time <= start_time:
        time_error = "End time must be later than start time."

    if is_active and start_time and end_time and not time_error:
        target_days = expand_schedule_days(day_of_week)
        base_qs = ClassPeriod.objects.select_related(
            "subject",
            "section",
            "section__grade_level",
            "teacher",
            "teacher__user",
        ).filter(
            is_active=True,
            section__is_active=True,
            start_time__lt=end_time,
            end_time__gt=start_time,
        )
        if section and section.school_year_id:
            base_qs = base_qs.filter(section__school_year_id=section.school_year_id)
        if exclude_id:
            base_qs = base_qs.exclude(pk=exclude_id)

        if section:
            sec_label = format_section_label(
                section.grade_level.name if section.grade_level_id else "",
                section.name,
            )
            for other in base_qs.filter(section=section):
                if expand_schedule_days(other.day_of_week) & target_days:
                    win = format_time_range_12h(other.start_time, other.end_time)
                    section_conflict = (
                        f"Schedule clash in {sec_label}: {other.subject.code} already meets at {win}."
                    )
                    break

        if teacher and not teacher_conflict:
            for other in base_qs.filter(teacher=teacher):
                if expand_schedule_days(other.day_of_week) & target_days:
                    other_sec = format_section_label(
                        other.section.grade_level.name if other.section.grade_level_id else "",
                        other.section.name,
                    )
                    win = format_time_range_12h(other.start_time, other.end_time)
                    teacher_conflict = (
                        f"Teacher double-booking: {teacher.full_name} is already teaching "
                        f"{other_sec} ({other.subject.code}, {win})."
                    )
                    break

        clean_room = (section.room_name or "").strip() if section else ""
        if section and clean_room:
            for other in base_qs.filter(section__room_name__iexact=clean_room).exclude(section=section):
                if expand_schedule_days(other.day_of_week) & target_days:
                    other_sec = format_section_label(
                        other.section.grade_level.name if other.section.grade_level_id else "",
                        other.section.name,
                    )
                    win = format_time_range_12h(other.start_time, other.end_time)
                    room_conflict = (
                        f"Room double-booking: {clean_room} is already used by {other_sec} "
                        f"for {other.subject.code} ({win})."
                    )
                    break

    return {
        "type": "period",
        "has_conflict": bool(time_error or section_conflict or teacher_conflict or room_conflict),
        "time_error": time_error,
        "section_conflict": section_conflict,
        "teacher_conflict": teacher_conflict,
        "room_conflict": room_conflict,
    }


def normalize_day_of_week(raw_value: str | int | None) -> str:
    clean = str(raw_value or "ALL_WEEKDAYS").strip().upper()
    mapping = {
        "MON-FRI": "ALL_WEEKDAYS",
        "ALL": "ALL_WEEKDAYS",
        "ALL_WEEKDAYS": "ALL_WEEKDAYS",
        "WEEKDAYS": "ALL_WEEKDAYS",
        "MWF": "MWF",
        "TTH": "TTH",
        "MON": "1",
        "MONDAY": "1",
        "1": "1",
        "TUE": "2",
        "TUESDAY": "2",
        "2": "2",
        "WED": "3",
        "WEDNESDAY": "3",
        "3": "3",
        "THU": "4",
        "THURSDAY": "4",
        "4": "4",
        "FRI": "5",
        "FRIDAY": "5",
        "5": "5",
        "SAT": "6",
        "SATURDAY": "6",
        "6": "6",
        "SUN": "7",
        "SUNDAY": "7",
        "7": "7",
    }
    return mapping.get(clean, "ALL_WEEKDAYS")


def _build_uniform_candidate_slots() -> list[tuple[str, time, time]]:
    """
    Non-overlapping candidate time slots for automatic subject assignment:
    - First 10 slots: 07:30-17:30 Mon-Fri (ALL_WEEKDAYS)
    - Next slots: non-overlapping MWF/TTH extended & early-morning slots, then Saturday slots
    """
    slots: list[tuple[str, time, time]] = [
        ("ALL_WEEKDAYS", time(hr, 30), time(hr + 1, 30))
        for hr in range(7, 17)
    ]
    for hr in (17, 6, 18, 19, 20):
        slots.append(("MWF", time(hr, 30), time(hr + 1, 30)))
        slots.append(("TTH", time(hr, 30), time(hr + 1, 30)))
    for hr in range(7, 17):
        slots.append(("6", time(hr, 30), time(hr + 1, 30)))
    for day_num in ("1", "2", "3", "4", "5"):
        slots.append((day_num, time(21, 30), time(22, 30)))
    return slots


def sync_uniform_subjects_for_section(section: Section) -> None:
    if not section or not section.grade_level_id:
        return
    subjects = list(Subject.objects.filter(grade_level_id=section.grade_level_id).order_by("id"))
    existing_periods = list(
        ClassPeriod.objects.filter(section=section).only(
            "subject_id", "day_of_week", "start_time", "end_time", "is_active"
        )
    )
    existing_ids = {p.subject_id for p in existing_periods}
    occupied: list[tuple[set[int], time, time]] = [
        (expand_schedule_days(p.day_of_week), p.start_time, p.end_time)
        for p in existing_periods
        if p.is_active and p.start_time and p.end_time
    ]

    candidate_slots = _build_uniform_candidate_slots()
    to_create = []
    for subj in subjects:
        if subj.id in existing_ids:
            continue

        chosen: tuple[str, time, time] | None = None
        for day_code, s_time, e_time in candidate_slots:
            cand_days = expand_schedule_days(day_code)
            has_clash = any(
                (occ_days & cand_days) and (s_time < occ_end and e_time > occ_start)
                for occ_days, occ_start, occ_end in occupied
            )
            if not has_clash:
                chosen = (day_code, s_time, e_time)
                occupied.append((cand_days, s_time, e_time))
                break

        if chosen is not None:
            day_code, s_time, e_time = chosen
            to_create.append(
                ClassPeriod(
                    schedule_code=f"{section.id}-{subj.code}"[:64],
                    section=section,
                    subject=subj,
                    day_of_week=day_code,
                    start_time=s_time,
                    end_time=e_time,
                    is_active=True,
                )
            )
        else:
            # Overflow fallback beyond all available slots: keep inactive so timetables never double-book.
            to_create.append(
                ClassPeriod(
                    schedule_code=f"{section.id}-{subj.code}"[:64],
                    section=section,
                    subject=subj,
                    day_of_week="ALL_WEEKDAYS",
                    start_time=time(16, 30),
                    end_time=time(17, 30),
                    is_active=False,
                )
            )
    if to_create:
        ClassPeriod.objects.bulk_create(to_create)
