from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date

from common.audit import record_audit_log
from common.exceptions import AppError
from common.permissions import get_user_role, is_school_leader
from apps.accounts.models import FacultyProfile
from apps.accounts.selectors import resolve_faculty_for_user
from apps.campus.models import BoundaryAlert, MonthlyTimeRecord


def _clean_text(val: object, max_len: int = 120) -> str:
    return str(val or "").replace("<", "").replace(">", "").strip()[:max_len]


@transaction.atomic
def process_monthly_dtr_action(
    *,
    request,
    action: str,
    month: int,
    year: int,
    faculty_id: int | None = None,
    data: dict | None = None,
) -> dict:
    payload = data or {}
    user = request.user
    role = get_user_role(user)
    leader = is_school_leader(user)
    own_faculty = resolve_faculty_for_user(user)

    target_id = faculty_id or payload.get("faculty_id")
    faculty_member = (
        FacultyProfile.objects.filter(id=int(target_id)).first()
        if (target_id and str(target_id).isdigit())
        else own_faculty
    )
    if not faculty_member:
        raise AppError("FACULTY_NOT_FOUND", "Faculty profile not found.", 404)

    clean_action = str(action or "").strip().upper()

    if clean_action == "SUBMIT_DTR":
        if not leader and (not own_faculty or own_faculty.id != faculty_member.id):
            raise AppError("FORBIDDEN", "You can only submit your own Daily Time Record.", 403)

        dtr, _ = MonthlyTimeRecord.objects.get_or_create(faculty=faculty_member, month=month, year=year)
        if dtr.is_dept_head_approved and not leader:
            raise AppError("ALREADY_APPROVED", "Approved DTRs are locked against edits.", 400)

        dtr.regular_hours = _clean_text(payload.get("regular_days_hours") or payload.get("regular_hours"), 100)
        dtr.saturday_hours = _clean_text(payload.get("saturdays_hours") or payload.get("saturday_hours"), 100)
        dtr.is_submitted = True
        dtr.submitted_at = timezone.now()
        dtr.save()

        record_audit_log(
            request=request,
            table_name=dtr._meta.db_table,
            record_id=dtr.id,
            action="SUBMIT",
            new_data={"month": month, "year": year, "faculty_id": faculty_member.id},
        )
        return {"ok": True, "message": "Daily Time Record certified and submitted."}

    if clean_action == "APPROVE_DEPT_HEAD":
        if not leader:
            raise AppError("FORBIDDEN", "Only Department Heads, Principals, or Admins can approve DTRs.", 403)

        dtr, _ = MonthlyTimeRecord.objects.get_or_create(faculty=faculty_member, month=month, year=year)
        if "regular_days_hours" in payload or "regular_hours" in payload:
            reg = _clean_text(payload.get("regular_days_hours") or payload.get("regular_hours"), 100)
            if reg:
                dtr.regular_hours = reg
        if "saturdays_hours" in payload or "saturday_hours" in payload:
            sat = _clean_text(payload.get("saturdays_hours") or payload.get("saturday_hours"), 100)
            if sat:
                dtr.saturday_hours = sat

        dtr.is_submitted = True
        dtr.is_dept_head_approved = True
        dtr.approved_by = user
        dtr.dept_head_approved_at = timezone.now()
        dtr.save()

        record_audit_log(
            request=request,
            table_name=dtr._meta.db_table,
            record_id=dtr.id,
            action="APPROVE",
            new_data={"month": month, "year": year, "faculty_id": faculty_member.id},
        )
        return {"ok": True, "message": f"Official DTR approved for {faculty_member.full_name}."}

    if clean_action == "EXCUSE_LOAFING":
        if not (user.is_superuser or role in ("ADMIN", "PRINCIPAL")):
            raise AppError("FORBIDDEN", "Only the School Principal or System Admin can excuse campus alerts.", 403)

        raw_date = str(payload.get("date_str") or "").strip()
        remarks = _clean_text(payload.get("remarks"), 240)
        if not remarks:
            raise AppError("REMARKS_REQUIRED", "Official remarks are required to excuse an alert.", 400)

        incident_dt = parse_date(raw_date)
        if not incident_dt:
            raise AppError("INVALID_DATE", "Valid incident date (YYYY-MM-DD) is required.", 400)

        updated_count = BoundaryAlert.objects.filter(
            faculty=faculty_member, incident_date=incident_dt
        ).update(status="EXCUSED", remarks=remarks)

        record_audit_log(
            request=request,
            table_name=BoundaryAlert._meta.db_table,
            record_id=faculty_member.id,
            action="EXCUSE",
            new_data={"date": str(incident_dt), "remarks": remarks, "updated": updated_count},
        )
        return {"ok": True, "message": f"Boundary alert on {incident_dt} marked as excused."}

    raise AppError("INVALID_ACTION", f"Unsupported DTR action: {clean_action}", 400)