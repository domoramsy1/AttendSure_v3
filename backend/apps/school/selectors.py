# D:\AttendSure_V3\backend\apps\school\selectors.py
from django.core.cache import cache
from django.db.models import Count, Q

from apps.accounts.selectors import get_faculty_section_ids, resolve_faculty_for_user
from common.media import build_media_url, save_base64_logo_to_disk
from common.permissions import is_school_leader
from .models import ClassPeriod, SchoolSettings, SchoolYear, Section

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


def get_school_metadata(request=None, school: SchoolSettings | None = None) -> dict:
    raw = cache.get(SCHOOL_META_CACHE_KEY)
    if raw is None:
        school = school or (
            SchoolSettings.objects.select_related(
                "division_ref",
                "active_school_year",
                "campus_boundary",
                "principal_faculty",
                "principal_faculty__position_ref",
                "principal_faculty__department_ref",
            ).first()
        )
        if not school:
            active_sy = SchoolYear.objects.filter(is_active=True).first()
            return {
                "school_id": "",
                "school_name": "",
                "region": "",
                "division": "",
                "district": "",
                "academic_year": active_sy.code if active_sy else "",
                "school_address": "",
                "school_contact": "",
                "school_email": "",
                "website": "",
                "school_head": "",
                "principal_name": "",
                "principal_title": "",
                "superintendent_name": "",
                "left_logo": None,
                "right_logo": None,
                "school_logo": None,
                "latitude": 8.4858,
                "longitude": 124.6567,
                "geofence_radius_meters": 150,
                "is_configured": False,
            }

        school = migrate_inline_logos_to_files(school)
        div = school.division_ref
        sy = school.active_school_year or SchoolYear.objects.filter(is_active=True).first()
        principal = school.principal_faculty
        boundary = school.campus_boundary
        head_name = principal.full_name if principal else ""
        head_title = (principal.position if principal and principal.position else "School Principal")

        raw = {
            "school_id": school.school_id,
            "school_name": school.school_name,
            "region": div.region if div else "",
            "division": div.division if div else "",
            "district": div.district if div else "",
            "academic_year": sy.code if sy else "",
            "school_address": school.address,
            "school_contact": school.contact_number,
            "school_email": school.email,
            "website": school.website,
            "school_head": head_name.upper(),
            "principal_name": head_name,
            "principal_title": head_title,
            "superintendent_name": school.superintendent_name,
            "left_logo_path": school.left_logo,
            "right_logo_path": school.right_logo,
            "school_logo_path": school.school_logo,
            "latitude": float(boundary.center_lat) if boundary else 8.4858,
            "longitude": float(boundary.center_lng) if boundary else 124.6567,
            "geofence_radius_meters": int(boundary.radius_meters) if boundary else 150,
            "weekend_rest_enabled": bool(school.weekend_rest_enabled),
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
        "principal_name": raw["principal_name"],
        "principal_title": raw["principal_title"],
        "superintendent_name": raw["superintendent_name"],
        "left_logo": build_media_url(raw["left_logo_path"], request),
        "right_logo": build_media_url(raw["right_logo_path"], request),
        "school_logo": build_media_url(raw["school_logo_path"], request),
        "latitude": raw["latitude"],
        "longitude": raw["longitude"],
        "geofence_radius_meters": raw["geofence_radius_meters"],
        "weekend_rest_enabled": raw["weekend_rest_enabled"],
        "is_configured": raw["is_configured"],
    }


def get_sections_for_user(user, *, include_inactive: bool = False):
    qs = Section.objects.all()
    if not (include_inactive and is_school_leader(user)):
        qs = qs.filter(is_active=True)
    qs = (
        qs.select_related("grade_level", "school_year", "adviser", "room", "room__building_ref")
        .annotate(
            enrolled_count=Count(
                "enrollments",
                filter=Q(
                    enrollments__status__in=["ENROLLED", "TRANSFERRED_IN"],
                    enrollments__student__is_active=True,
                ),
                distinct=True,
            )
        )
        .order_by("grade_level__level_order", "name")
    )
    if not is_school_leader(user):
        faculty = resolve_faculty_for_user(user)
        qs = qs.filter(id__in=get_faculty_section_ids(faculty)) if faculty else qs.none()
    return qs


def get_class_periods_for_user(user, section_id: int | None = None):
    qs = (
        ClassPeriod.objects.select_related(
            "section",
            "section__grade_level",
            "section__room",
            "subject",
            "faculty",
            "room",
        )
        .prefetch_related("days")
        .order_by("start_time")
    )
    if section_id:
        qs = qs.filter(section_id=section_id)
    if not is_school_leader(user):
        faculty = resolve_faculty_for_user(user)
        if faculty:
            qs = qs.filter(
                Q(faculty=faculty) | Q(section_id__in=get_faculty_section_ids(faculty))
            ).distinct()
        else:
            qs = qs.none()
    return qs