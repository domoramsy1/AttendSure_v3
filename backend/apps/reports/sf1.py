from datetime import date, timedelta

from apps.school.models import Section
from apps.school.selectors import get_school_metadata
from apps.students.models import Enrollment
from common.exceptions import AppError


def compute_age(birth_date: date | None, cutoff: date) -> int | str:
    if not birth_date:
        return ""
    return max(
        0,
        cutoff.year
        - birth_date.year
        - ((cutoff.month, cutoff.day) < (birth_date.month, birth_date.day)),
    )


def generate_sf1_report(
    *, section_id: int, school_year: str | None = None, request=None
) -> dict:
    section = (
        Section.objects.select_related(
            "grade_level", "school_year", "adviser", "adviser__user"
        )
        .filter(id=section_id)
        .first()
    )
    if not section:
        raise AppError("SECTION_NOT_FOUND", f"Section {section_id} not found.", 404)

    sy = section.school_year
    sy_name = str(school_year or (sy.name if sy else "2026-2027"))
    base_yr = (
        int(sy_name.split("-")[0])
        if "-" in sy_name and sy_name.split("-")[0].isdigit()
        else 2026
    )
    june_1 = date(base_yr, 6, 1)
    cutoff = (sy.baseline_cutoff_date if sy else None) or (
        june_1 + timedelta(days=(4 - june_1.weekday()) % 7)
    )

    enrollments = (
        Enrollment.objects.filter(
            section=section, status__in=["ENROLLED", "TRANSFERRED_IN"], student__is_active=True
        )
        .select_related("student", "student__location")
        .order_by("student__last_name", "student__first_name")
    )

    males, females, combined = [], [], []
    for enr in enrollments:
        st = enr.student
        is_male = str(st.gender).upper().startswith("M")
        address = ", ".join(
            filter(
                None,
                [st.house_street_sitio, st.barangay, st.municipality_city, st.province],
            )
        )
        row = {
            "id": st.id,
            "lrn": st.lrn,
            "name": st.full_name,
            "sex": "M" if is_male else "F",
            "gender": st.gender,
            "birth_date": st.birth_date.strftime("%m/%d/%Y") if st.birth_date else "",
            "birthdate": st.birth_date.strftime("%m/%d/%Y") if st.birth_date else "",
            "age": compute_age(st.birth_date, cutoff),
            "mother_tongue": st.mother_tongue,
            "ethnic_group": st.ethnic_group,
            "religion": st.religion,
            "address": address,
            "father_name": st.father_name,
            "mother_maiden_name": st.mother_maiden_name,
            "guardian_name": st.guardian_name,
            "guardian_rel": st.guardian_relationship,
            "guardian_contact": st.guardian_contact,
            "remarks": enr.remarks,
        }
        combined.append(row)
        (males if is_male else females).append(row)

    return {
        **get_school_metadata(request),
        "academic_year": sy_name,
        "grade_level": section.grade_level.name if section.grade_level else "",
        "section_name": section.name,
        "adviser_name": section.adviser.full_name if section.adviser else "",
        "students": combined,
        "males": males,
        "females": females,
        "total_male": len(males),
        "total_female": len(females),
        "total_combined": len(combined),
    }
