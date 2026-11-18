from apps.school.models import SchoolYear
from .models import Enrollment, Student


def sync_student_enrollment(*, student: Student, section_id: int | None) -> None:
    if not section_id:
        return
    year = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
    if year:
        Enrollment.objects.update_or_create(
            student=student,
            school_year=year,
            defaults={"section_id": section_id, "status": "ENROLLED"},
        )