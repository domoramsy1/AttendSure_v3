# AttendSure Backend - Students Business Logic Services
# File: D:\AttendSure_V3\backend\apps\students\services.py

import csv
import io
import re
from datetime import date, datetime
from django.db import transaction
from django.utils import timezone

from apps.school.models import GradeLevel, SchoolYear, Section
from common.exceptions import AppError
from common.phone import normalize_ph_phone
from .models import Enrollment, Student

MAX_CSV_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 2000
CONTROL_HTML_RE = re.compile(r"[\x00-\x1f\x7f<>]")


def _clean_cell(raw: object, max_len: int = 120) -> str:
    text = CONTROL_HTML_RE.sub("", str(raw or "")).strip()
    if text.startswith(("=", "+", "-", "@", "|")) and not re.match(r"^\+?\d+$", text):
        text = text.lstrip("=+-@|").strip()
    return text[:max_len]


def _parse_csv_birth_date(raw_val: str) -> date:
    clean = _clean_cell(raw_val, 30)
    if not clean:
        return date(2012, 1, 1)
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(clean, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Invalid birth date '{clean}' (use YYYY-MM-DD or MM/DD/YYYY).")


def _normalize_gender(raw_val: str) -> str:
    val = _clean_cell(raw_val, 15).upper()
    if val in ("F", "FEMALE", "GIRL"):
        return "Female"
    return "Male"


VALID_ENROLLMENT_STATUSES = {"ENROLLED", "TRANSFERRED_IN", "TRANSFERRED_OUT", "DROPPED"}


def sync_student_enrollment(
    *,
    student: Student,
    section_id: int | None,
    enrollment_status: str | None = None,
) -> Enrollment | None:
    clean_status = str(enrollment_status or "").strip().upper()
    if clean_status and clean_status not in VALID_ENROLLMENT_STATUSES:
        clean_status = ""

    if section_id:
        sec = Section.objects.select_related("school_year").filter(id=section_id).first()
        if not sec:
            return None
        existing = Enrollment.objects.filter(
            student=student, section__school_year=sec.school_year
        ).first()
        if existing:
            existing.section = sec
            if clean_status:
                existing.status = clean_status
                if clean_status != "ENROLLED":
                    existing.status_date = timezone.localdate()
            existing.save(update_fields=["section", "status", "status_date", "updated_at"])
            return existing
        return Enrollment.objects.create(
            student=student,
            section=sec,
            status=clean_status or "ENROLLED",
            status_date=timezone.localdate() if (clean_status and clean_status != "ENROLLED") else None,
        )

    if clean_status:
        latest = (
            Enrollment.objects.filter(student=student)
            .select_related("section__school_year")
            .order_by("-section__school_year__is_active", "-id")
            .first()
        )
        if latest:
            latest.status = clean_status
            if clean_status != "ENROLLED":
                latest.status_date = timezone.localdate()
            latest.save(update_fields=["status", "status_date", "updated_at"])
            return latest
    return None


def bulk_import_students_csv(
    *,
    uploaded_file,
    default_section_id: int | None = None,
    auto_create_sections: bool = True,
    actor=None,
) -> dict:
    if not uploaded_file:
        raise AppError("MISSING_FILE", "Please choose a CSV file to upload.", 400)

    filename = str(getattr(uploaded_file, "name", "") or "").lower()
    if filename and not filename.endswith(".csv"):
        raise AppError("INVALID_FILE_TYPE", "Only .csv class list files are supported.", 400)

    file_size = getattr(uploaded_file, "size", 0) or 0
    if file_size > MAX_CSV_BYTES:
        raise AppError("FILE_TOO_LARGE", "CSV file must be 5 MB or smaller.", 400)

    raw_bytes = uploaded_file.read()
    if len(raw_bytes) > MAX_CSV_BYTES:
        raise AppError("FILE_TOO_LARGE", "CSV file must be 5 MB or smaller.", 400)

    try:
        decoded = raw_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = raw_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(decoded))
    if not reader.fieldnames:
        raise AppError("EMPTY_CSV", "The uploaded CSV file has no header row.", 400)

    school_year = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
    if not school_year:
        today = timezone.localdate()
        sy_name = f"{today.year}-{today.year + 1}" if today.month >= 6 else f"{today.year - 1}-{today.year}"
        school_year = SchoolYear.objects.create(
            name=sy_name,
            start_date=date(today.year, 6, 1),
            baseline_cutoff_date=date(today.year, 6, 5),
            end_date=date(today.year + 1, 3, 31),
            is_active=True,
        )

    sections_by_name: dict[str, Section] = {
        sec.name.strip().lower(): sec
        for sec in Section.objects.filter(is_active=True).select_related("grade_level")
    }
    default_section = (
        Section.objects.filter(id=default_section_id, is_active=True).first()
        if default_section_id
        else None
    )
    grades_by_key: dict[str, GradeLevel] = {}
    for gl in GradeLevel.objects.all():
        grades_by_key[gl.name.strip().lower()] = gl
        grades_by_key[gl.code.strip().lower()] = gl

    existing_students: dict[str, Student] = {
        st.lrn: st for st in Student.objects.select_related("location").all()
    }

    created_count = 0
    updated_count = 0
    skipped_count = 0
    errors: list[dict] = []

    rows = list(reader)
    if len(rows) > MAX_IMPORT_ROWS:
        raise AppError(
            "TOO_MANY_ROWS",
            f"CSV exceeds the {MAX_IMPORT_ROWS}-row limit per upload.",
            400,
        )

    for idx, raw_row in enumerate(rows, start=2):
        norm = {
            str(k or "").strip().lower().replace(" ", "_"): v
            for k, v in raw_row.items()
            if k is not None
        }

        if not any(str(v or "").strip() for v in norm.values()):
            continue

        raw_lrn = re.sub(r"\D+", "", str(norm.get("lrn") or ""))
        if len(raw_lrn) != 12:
            skipped_count += 1
            errors.append(
                {
                    "row": idx,
                    "lrn": _clean_cell(norm.get("lrn"), 20),
                    "reason": "LRN must be exactly 12 digits.",
                }
            )
            continue

        first_name = _clean_cell(norm.get("first_name") or norm.get("firstname"), 100)
        last_name = _clean_cell(norm.get("last_name") or norm.get("lastname"), 100)
        if not first_name or not last_name:
            skipped_count += 1
            errors.append(
                {
                    "row": idx,
                    "lrn": raw_lrn,
                    "reason": "Both first_name and last_name are required.",
                }
            )
            continue

        raw_phone = _clean_cell(
            norm.get("guardian_contact") or norm.get("contact_number") or norm.get("phone"),
            40,
        )
        normalized_phone = normalize_ph_phone(raw_phone) if raw_phone else ""

        try:
            birth_date = _parse_csv_birth_date(str(norm.get("birth_date") or norm.get("birthdate") or ""))
        except ValueError as exc:
            skipped_count += 1
            errors.append({"row": idx, "lrn": raw_lrn, "reason": str(exc)})
            continue

        section_name = _clean_cell(norm.get("section_name") or norm.get("section"), 100)
        grade_raw = _clean_cell(norm.get("grade_level") or norm.get("grade"), 60)

        target_section = default_section
        if section_name:
            sec_key = section_name.lower()
            target_section = sections_by_name.get(sec_key)
            if not target_section and auto_create_sections:
                grade_obj = grades_by_key.get(grade_raw.lower()) if grade_raw else None
                if not grade_obj:
                    num_match = re.search(r"(\d+)", grade_raw or "7")
                    lvl_num = int(num_match.group(1)) if num_match else 7
                    g_code = f"G{lvl_num}"
                    g_name = grade_raw if grade_raw else f"Grade {lvl_num}"
                    grade_obj = grades_by_key.get(g_code.lower())
                    if not grade_obj:
                        grade_obj, _ = GradeLevel.objects.get_or_create(
                            level_number=lvl_num,
                            defaults={
                                "code": g_code[:20],
                                "name": g_name[:100],
                                "stage": "SHS" if lvl_num >= 11 else "JHS",
                            },
                        )
                        grades_by_key[g_code.lower()] = grade_obj
                        grades_by_key[grade_obj.name.lower()] = grade_obj

                target_section, _ = Section.objects.get_or_create(
                    school_year=school_year,
                    grade_level=grade_obj,
                    name=section_name,
                    defaults={"is_active": True, "capacity": 45},
                )
                sections_by_name[sec_key] = target_section

        if not target_section:
            skipped_count += 1
            errors.append(
                {
                    "row": idx,
                    "lrn": raw_lrn,
                    "reason": "No target section found (provide section_name or select a default section).",
                }
            )
            continue

        barangay_val = _clean_cell(norm.get("barangay"), 100)
        city_val = _clean_cell(norm.get("municipality_city") or norm.get("city"), 100)
        province_val = _clean_cell(norm.get("province"), 100)

        student_fields = {
            "first_name": first_name,
            "middle_name": _clean_cell(norm.get("middle_name") or norm.get("middlename"), 100),
            "last_name": last_name,
            "suffix": _clean_cell(norm.get("suffix"), 20),
            "gender": _normalize_gender(str(norm.get("gender") or norm.get("sex") or "Male")),
            "birth_date": birth_date,
            "mother_tongue": _clean_cell(norm.get("mother_tongue"), 100),
            "ethnic_group": _clean_cell(norm.get("ethnic_group"), 100),
            "religion": _clean_cell(norm.get("religion"), 100),
            "house_street_sitio": _clean_cell(norm.get("house_street_sitio") or norm.get("house_street"), 255),
            "father_name": _clean_cell(norm.get("father_name"), 200),
            "mother_maiden_name": _clean_cell(norm.get("mother_maiden_name"), 200),
            "guardian_name": _clean_cell(norm.get("guardian_name"), 200),
            "guardian_relationship": _clean_cell(norm.get("guardian_relationship"), 50),
            "guardian_contact": normalized_phone,
            "is_active": True,
        }

        try:
            with transaction.atomic():
                existing = existing_students.get(raw_lrn)
                if existing:
                    for attr, val in student_fields.items():
                        if val != "" or attr in ("first_name", "last_name", "gender", "birth_date", "is_active"):
                            setattr(existing, attr, val)
                    if barangay_val or city_val or province_val:
                        existing.set_address_location(
                            barangay=barangay_val or existing.barangay,
                            municipality_city=city_val or existing.municipality_city,
                            province=province_val or existing.province,
                        )
                    existing.save()
                    student_obj = existing
                    updated_count += 1
                else:
                    student_obj = Student(lrn=raw_lrn, **student_fields)
                    student_obj.set_address_location(
                        barangay=barangay_val,
                        municipality_city=city_val,
                        province=province_val,
                    )
                    student_obj.save()
                    existing_students[raw_lrn] = student_obj
                    created_count += 1

                sync_student_enrollment(student=student_obj, section_id=target_section.id)
        except Exception as exc:
            skipped_count += 1
            errors.append(
                {
                    "row": idx,
                    "lrn": raw_lrn,
                    "reason": _clean_cell(str(exc), 140) or "Could not save row.",
                }
            )

    return {
        "ok": True,
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "errors": errors[:50],
    }
