from datetime import time
from .models import ClassPeriod, ClassPeriodDay, Section, Subject


def sync_uniform_subjects_for_section(section: Section) -> None:
    if not section or not section.grade_level_id:
        return
    subjects = list(Subject.objects.filter(grade_level_id=section.grade_level_id).order_by("id"))
    existing_ids = set(ClassPeriod.objects.filter(section=section).values_list("subject_id", flat=True))
    to_create = []
    for idx, subj in enumerate(subjects):
        if subj.id in existing_ids:
            continue
        start_hr = min(7 + idx, 16)
        to_create.append(
            ClassPeriod(
                section=section,
                subject=subj,
                start_time=time(start_hr, 30),
                end_time=time(min(start_hr + 1, 17), 30),
                days_of_week="MON-FRI",
                room=section.room,
                room_number=section.room_number or "",
                is_active=True,
            )
        )
    if to_create:
        ClassPeriod.objects.bulk_create(to_create, ignore_conflicts=True)


def sync_period_days(period: ClassPeriod, days_text: str) -> None:
    presets = {"MON-FRI": [1, 2, 3, 4, 5], "MWF": [1, 3, 5], "TTH": [2, 4], "SAT": [6]}
    lookup = {"MON": 1, "TUE": 2, "WED": 3, "THU": 4, "FRI": 5, "SAT": 6, "SUN": 7}
    clean = str(days_text or "MON-FRI").upper().strip()
    day_nums = presets.get(clean) or [lookup[p.strip()] for p in clean.split(",") if p.strip() in lookup] or [1, 2, 3, 4, 5]

    ClassPeriodDay.objects.filter(class_period=period).exclude(day_of_week__in=day_nums).delete()
    existing = set(ClassPeriodDay.objects.filter(class_period=period).values_list("day_of_week", flat=True))
    ClassPeriodDay.objects.bulk_create(
        [ClassPeriodDay(class_period=period, day_of_week=d) for d in day_nums if d not in existing]
    )