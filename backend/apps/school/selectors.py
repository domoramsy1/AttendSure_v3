from django.core.cache import cache
from django.db.models import Count, Q
from common.media import build_media_url, save_base64_logo_to_disk
from common.permissions import is_school_leader
from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from .models import ClassPeriod, SchoolSettings, Section

SCHOOL_META_CACHE_KEY = "school:metadata:raw"


def format_section_label(grade_name: str, section_name: str) -> str:
    g, s = str(grade_name or "").strip(), str(section_name or "").strip()
    if not g:
        return s
    if not s or g.lower().endswith(s.lower()):
        return g
    return f"{g} - {s}"


def migrate_inline_logos_to_files(school: SchoolSettings) -> SchoolSettings:
    """Replaces raw Base64 logo strings in PostgreSQL with lightweight /media/ paths."""
    updates = {}
    for field_name in ("school_logo", "left_logo", "right_logo"):
        val = getattr(school, field_name, None)
        if val and isinstance(val, str) and (
            val.startswith("data:image") or val.startswith(("/9j/", "iVBORw0KGgo"))
        ):
            disk_path = save_base64_logo_to_disk(val)
            if disk_path:
                updates[field_name] = disk_path
                setattr(school, field_name, disk_path)

    if updates:
        SchoolSettings.objects.filter(pk=school.pk).update(**updates)
        cache.delete(SCHOOL_META_CACHE_KEY)
    return school


def get_school_metadata(request=None) -> dict:
    raw = cache.get(SCHOOL_META_CACHE_KEY)
    if raw is None:
        school = SchoolSettings.objects.select_related("principal_teacher").first()
        if not school:
            return {"school_id": "", "school_name": "", "is_configured": False}

        school = migrate_inline_logos_to_files(school)
        head_name = school.principal_name or (
            school.principal_teacher.full_name if school.principal_teacher else ""
        )
        raw = {
            "school_id": school.school_id,
            "school_name": school.school_name,
            "region": school.region,
            "division": school.division,
            "district": school.district,
            "academic_year": school.academic_year,
            "school_address": school.address,
            "school_contact": school.contact_number,
            "school_email": school.email,
            "website": school.website,
            "school_head": head_name.upper(),
            "principal_title": school.principal_title,
            "superintendent_name": school.superintendent_name,
            "left_logo_path": school.left_logo,
            "right_logo_path": school.right_logo,
            "school_logo_path": school.school_logo,
            "is_configured": bool(school.school_name and school.school_id),
        }
        cache.set(SCHOOL_META_CACHE_KEY, raw, timeout=300)

    return {
        "school_id": raw["school_id"],
        "school_name": raw["school_name"],
        "region": raw["region"],
        "division": raw["division"],
        "district": raw["district"],
        "academic_year": raw["academic_year"],
        "school_address": raw["school_address"],
        "school_contact": raw["school_contact"],
        "school_email": raw["school_email"],
        "website": raw["website"],
        "school_head": raw["school_head"],
        "principal_title": raw["principal_title"],
        "superintendent_name": raw["superintendent_name"],
        "left_logo": build_media_url(raw["left_logo_path"], request),
        "right_logo": build_media_url(raw["right_logo_path"], request),
        "school_logo": build_media_url(raw["school_logo_path"], request),
        "is_configured": raw["is_configured"],
    }


def get_sections_for_user(user):
    qs = (
        Section.objects.filter(is_active=True)
        .select_related("grade_level", "school_year", "adviser", "room")
        .annotate(
            enrolled_count=Count(
                "enrollments",
                filter=Q(enrollments__status="ENROLLED", enrollments__student__is_active=True),
                distinct=True,
            )
        )
        .order_by("grade_level__level_order", "name")
    )
    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        qs = qs.filter(id__in=get_teacher_section_ids(teacher)) if teacher else qs.none()
    return qs


def get_class_periods_for_user(user, section_id: int | None = None):
    qs = ClassPeriod.objects.select_related(
        "section", "section__grade_level", "subject", "teacher", "room"
    ).order_by("start_time")
    if section_id:
        qs = qs.filter(section_id=section_id)
    if not is_school_leader(user):
        teacher = resolve_teacher_for_user(user)
        if teacher:
            qs = qs.filter(Q(teacher=teacher) | Q(section_id__in=get_teacher_section_ids(teacher))).distinct()
        else:
            qs = qs.none()
    return qs