# D:\AttendSure_V3\backend\apps\students\services.py

import csv
import io
import re
from datetime import date, datetime
from django.db import transaction

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


def _parse_csv_birthdate(raw_val: str) -> date:
    clean = _clean_cell(raw_val, 30)
    if not clean:
        return date(2012, 1, 1)
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(clean, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Invalid birthdate '{clean}' (use YYYY-MM-DD or MM/DD/YYYY).")


def _normalize_sex(raw_val: str) -> str:
    val = _clean_cell(raw_val, 15).upper()
    if val in ("F", "FEMALE", "GIRL"):
        return "Female"
    return "Male"


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
        today = date.today()
        sy_code = f"{today.year}-{today.year + 1}" if today.month >= 6 else f"{today.year - 1}-{today.year}"
        school_year = SchoolYear.objects.create(
            code=sy_code,
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
        st.lrn: st for st in Student.objects.all()
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
            errors.append({
                "row": idx,
                "lrn": _clean_cell(norm.get("lrn"), 20),
                "reason": "LRN must be exactly 12 digits.",
            })
            continue

        first_name = _clean_cell(norm.get("first_name") or norm.get("firstname"), 100)
        last_name = _clean_cell(norm.get("last_name") or norm.get("lastname"), 100)
        if not first_name or not last_name:
            skipped_count += 1
            errors.append({
                "row": idx,
                "lrn": raw_lrn,
                "reason": "Both first_name and last_name are required.",
            })
            continue

        raw_phone = _clean_cell(
            norm.get("parent_contact") or norm.get("contact_number") or norm.get("phone"),
            40,
        )
        normalized_phone = normalize_ph_phone(raw_phone) if raw_phone else ""
        if not normalized_phone:
            skipped_count += 1
            errors.append({
                "row": idx,
                "lrn": raw_lrn,
                "reason": "Valid parent_contact phone number is required.",
            })
            continue

        try:
            birthdate = _parse_csv_birthdate(str(norm.get("birthdate") or norm.get("birth_date") or ""))
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
                            code=g_code[:20],
                            defaults={
                                "name": g_name[:100],
                                "stage": "SHS" if lvl_num >= 11 else "JHS",
                                "level_order": lvl_num,
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
            errors.append({
                "row": idx,
                "lrn": raw_lrn,
                "reason": "No target section found (provide section_name or select a default section).",
            })
            continue

        student_fields = {
            "first_name": first_name,
            "middle_name": _clean_cell(norm.get("middle_name") or norm.get("middlename"), 100),
            "last_name": last_name,
            "suffix": _clean_cell(norm.get("suffix"), 20),
            "sex": _normalize_sex(str(norm.get("sex") or norm.get("gender") or "Male")),
            "birthdate": birthdate,
            "mother_tongue": _clean_cell(norm.get("mother_tongue"), 100),
            "ethnic_group": _clean_cell(norm.get("ethnic_group"), 100),
            "religion": _clean_cell(norm.get("religion"), 100),
            "house_street_sitio": _clean_cell(norm.get("house_street_sitio") or norm.get("house_street"), 255),
            "barangay": _clean_cell(norm.get("barangay"), 100),
            "municipality_city": _clean_cell(norm.get("municipality_city") or norm.get("city"), 100),
            "province": _clean_cell(norm.get("province"), 100),
            "father_name": _clean_cell(norm.get("father_name"), 200),
            "mother_maiden_name": _clean_cell(norm.get("mother_maiden_name"), 200),
            "guardian_name": _clean_cell(norm.get("guardian_name"), 200),
            "guardian_relationship": _clean_cell(norm.get("guardian_relationship"), 50),
            "parent_contact": normalized_phone,
            "is_active": True,
        }

        try:
            with transaction.atomic():
                existing = existing_students.get(raw_lrn)
                if existing:
                    for attr, val in student_fields.items():
                        if val != "" or attr in ("first_name", "last_name", "sex", "birthdate", "parent_contact", "is_active"):
                            setattr(existing, attr, val)
                    if actor and getattr(actor, "is_authenticated", False):
                        existing.updated_by = actor
                    existing.save()
                    student_obj = existing
                    updated_count += 1
                else:
                    if actor and getattr(actor, "is_authenticated", False):
                        student_fields["created_by"] = actor
                    student_obj = Student.objects.create(lrn=raw_lrn, **student_fields)
                    existing_students[raw_lrn] = student_obj
                    created_count += 1

                Enrollment.objects.update_or_create(
                    student=student_obj,
                    school_year=school_year,
                    defaults={"section": target_section, "status": "ENROLLED"},
                )
        except Exception as exc:
            skipped_count += 1
            errors.append({
                "row": idx,
                "lrn": raw_lrn,
                "reason": _clean_cell(str(exc), 140) or "Could not save row.",
            })

    return {
        "ok": True,
        "created_count": created_count,
        "updated_count": updated_count,
        "skipped_count": skipped_count,
        "errors": errors[:50],
    }