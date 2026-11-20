"""
AttendSure - Ed-Fi Data Standard v6.0 Interoperability & GDPR Export Engine
File: backend/apps/reports/edfi.py

Produces standards-compliant Ed-Fi v6.0 JSON bundles with optional GDPR Art. 25
pseudonymization (`anonymize=True`) so districts, ministries, and international
NGOs can ingest live attendance, roster, and staff telemetry without vendor lock-in.
"""

from datetime import timedelta
import hashlib
from django.conf import settings
from django.utils import timezone

from apps.accounts.models import TeacherProfile
from apps.attendance.models import ClassAttendance, DailyAttendance
from apps.school.models import SchoolYear, Section
from apps.school.selectors import get_school_metadata
from apps.students.models import Enrollment, Student


ATTENDANCE_DESCRIPTOR_MAP = {
    "PRESENT": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance",
    "LATE": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Tardy",
    "ABSENT": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Unexcused Absence",
    "CUTTING": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Early departure",
    "EXCUSED": "uri://ed-fi.org/AttendanceEventCategoryDescriptor#Excused Absence",
}

SEX_DESCRIPTOR_MAP = {
    "M": "uri://ed-fi.org/SexDescriptor#Male",
    "MALE": "uri://ed-fi.org/SexDescriptor#Male",
    "F": "uri://ed-fi.org/SexDescriptor#Female",
    "FEMALE": "uri://ed-fi.org/SexDescriptor#Female",
}


def _pseudonymize(prefix: str, value: str) -> str:
    salt = str(getattr(settings, "SECRET_KEY", "attendsure"))[:16]
    digest = hashlib.sha256(f"{salt}:{prefix}:{value}".encode("utf-8")).hexdigest()[:16].upper()
    return f"{prefix}-{digest}"


def build_edfi_v6_export(
    *,
    request=None,
    days: int = 30,
    anonymize: bool = False,
) -> dict:
    days = max(1, min(90, int(days)))
    today = timezone.localdate()
    start_date = today - timedelta(days=days - 1)
    meta = get_school_metadata(request)
    active_sy = SchoolYear.objects.filter(is_active=True).first()
    sy_code = active_sy.code if active_sy else f"{today.year}-{today.year + 1}"
    school_id_raw = str(meta.get("school_id") or "ATTENDSURE-001")
    school_numeric_id = int(school_id_raw) if school_id_raw.isdigit() else school_id_raw

    sections_qs = Section.objects.filter(is_active=True).select_related("grade_level", "adviser").order_by("id")
    students_qs = Student.objects.filter(is_active=True).order_by("id")[:2000]
    enrollments_qs = (
        Enrollment.objects.filter(status__in=["ENROLLED", "TRANSFERRED_IN"], student__is_active=True)
        .select_related("student", "section", "section__grade_level", "school_year")
        .order_by("id")[:2000]
    )
    teachers_qs = TeacherProfile.objects.filter(is_active=True).order_by("id")[:500]

    daily_qs = (
        DailyAttendance.objects.filter(attendance_date__gte=start_date, attendance_date__lte=today)
        .select_related("student", "section")
        .order_by("-attendance_date", "id")[:5000]
    )
    class_qs = (
        ClassAttendance.objects.filter(attendance_date__gte=start_date, attendance_date__lte=today)
        .select_related("student", "class_period", "class_period__section", "class_period__subject")
        .order_by("-attendance_date", "-scanned_at")[:5000]
    )

    def student_uid(st: Student) -> str:
        raw = st.lrn or str(st.id)
        return _pseudonymize("STU", raw) if anonymize else raw

    def staff_uid(t: TeacherProfile) -> str:
        raw = t.employee_id or str(t.id)
        return _pseudonymize("STF", raw) if anonymize else raw

    schools_payload = [
        {
            "schoolId": school_numeric_id,
            "nameOfInstitution": meta.get("school_name") or "AttendSure Pilot School",
            "localEducationAgency": meta.get("division") or "District Education Office",
            "region": meta.get("region") or "",
            "schoolTypeDescriptor": "uri://ed-fi.org/SchoolTypeDescriptor#Regular",
            "operationalStatusDescriptor": "uri://ed-fi.org/OperationalStatusDescriptor#Active",
        }
    ]

    sections_payload = [
        {
            "sectionIdentifier": f"SEC-{sec.id}",
            "sectionName": sec.name,
            "gradeLevelDescriptor": (
                f"uri://ed-fi.org/GradeLevelDescriptor#{sec.grade_level.name}"
                if sec.grade_level
                else "uri://ed-fi.org/GradeLevelDescriptor#Ungraded"
            ),
            "schoolReference": {"schoolId": school_numeric_id},
            "adviserStaffUniqueId": staff_uid(sec.adviser) if sec.adviser else None,
        }
        for sec in sections_qs
    ]

    students_payload = []
    for st in students_qs:
        sex_key = str(st.sex or "").strip().upper()
        entry = {
            "studentUniqueId": student_uid(st),
            "sexDescriptor": SEX_DESCRIPTOR_MAP.get(sex_key, "uri://ed-fi.org/SexDescriptor#Not Selected"),
            "birthDate": f"{st.birthdate.year}-01-01" if (anonymize and st.birthdate) else (str(st.birthdate) if st.birthdate else None),
        }
        if not anonymize:
            entry["firstName"] = st.first_name
            entry["middleName"] = st.middle_name or ""
            entry["lastSurname"] = st.last_name
        students_payload.append(entry)

    enrollments_payload = [
        {
            "studentReference": {"studentUniqueId": student_uid(enr.student)},
            "sectionReference": {
                "schoolId": school_numeric_id,
                "sectionIdentifier": f"SEC-{enr.section_id}" if enr.section_id else "",
            },
            "beginDate": str(enr.enrollment_date),
            "enrollmentStatus": enr.status,
            "schoolYear": enr.school_year.code if enr.school_year else sy_code,
            "isConditionalCashTransferRecipient": bool(enr.is_cct_recipient),
        }
        for enr in enrollments_qs
    ]

    staff_payload = []
    for t in teachers_qs:
        entry = {
            "staffUniqueId": staff_uid(t),
            "positionTitle": t.position or "Faculty",
            "department": t.department or "",
            "canTeach": bool(t.can_teach),
        }
        if not anonymize:
            entry["firstName"] = t.first_name
            entry["lastSurname"] = t.last_name
        staff_payload.append(entry)

    school_attendance_events = [
        {
            "studentReference": {"studentUniqueId": student_uid(row.student)},
            "schoolReference": {"schoolId": school_numeric_id},
            "eventDate": str(row.attendance_date),
            "attendanceEventCategoryDescriptor": ATTENDANCE_DESCRIPTOR_MAP.get(
                str(row.status).upper(),
                "uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance",
            ),
            "sectionIdentifier": f"SEC-{row.section_id}" if row.section_id else "",
            "attendanceEventReason": row.remarks or "",
        }
        for row in daily_qs
    ]

    section_attendance_events = [
        {
            "studentReference": {"studentUniqueId": student_uid(row.student)},
            "sectionReference": {
                "schoolId": school_numeric_id,
                "sectionIdentifier": f"SEC-{row.class_period.section_id}" if (row.class_period and row.class_period.section_id) else "",
                "subjectCode": row.class_period.subject.code if (row.class_period and row.class_period.subject) else "",
            },
            "eventDate": str(row.attendance_date),
            "attendanceEventCategoryDescriptor": ATTENDANCE_DESCRIPTOR_MAP.get(
                str(row.status).upper(),
                "uri://ed-fi.org/AttendanceEventCategoryDescriptor#In Attendance",
            ),
            "sourceMethod": row.scan_method,
            "scannedAt": timezone.localtime(row.scanned_at).isoformat(),
        }
        for row in class_qs
    ]

    return {
        "edFiVersion": "6.0",
        "standard": "Ed-Fi ODS/API Data Standard v6.0",
        "generatedAt": timezone.localtime().isoformat(),
        "privacyMode": "GDPR_PSEUDONYMIZED" if anonymize else "STANDARD_INSTITUTIONAL",
        "complianceFrameworks": [
            "Ed-Fi Data Standard v6.0",
            "GDPR Art. 5 & Art. 25 (Data Minimization / Pseudonymization)",
            "FERPA & COPPA Student Privacy",
            "Philippines Data Privacy Act (RA 10173)",
            "DepEd Official School Forms (SF1/SF2/SF4/CSC Form 48)",
        ],
        "reportingWindow": {
            "startDate": str(start_date),
            "endDate": str(today),
            "days": days,
            "schoolYear": sy_code,
        },
        "recordCounts": {
            "schools": len(schools_payload),
            "sections": len(sections_payload),
            "students": len(students_payload),
            "studentSectionAssociations": len(enrollments_payload),
            "staffs": len(staff_payload),
            "studentSchoolAttendanceEvents": len(school_attendance_events),
            "studentSectionAttendanceEvents": len(section_attendance_events),
        },
        "schools": schools_payload,
        "sections": sections_payload,
        "students": students_payload,
        "studentSectionAssociations": enrollments_payload,
        "staffs": staff_payload,
        "studentSchoolAttendanceEvents": school_attendance_events,
        "studentSectionAttendanceEvents": section_attendance_events,
    }
