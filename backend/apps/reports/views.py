# AttendSure Backend - Reports API Views
# File: D:\AttendSure_V3\backend\apps\reports\views.py

# D:\AttendSure_V3\backend\apps\reports\views.py
import csv
import io
from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import escape, strip_tags
from rest_framework import renderers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from apps.accounts.services import unlock_all_locked_accounts
from apps.attendance.loafing_detector import detect_daily_student_loafing
from common.audit import record_audit_log
from common.exceptions import AppError
from common.permissions import IsSchoolLeader, IsTeacherOrLeader, is_school_leader
from .edfi import build_edfi_v6_export
from .printables import (
    apply_html_security_headers,
    build_print_pack_payload,
    render_print_pack_csv,
    render_print_pack_html,
    sanitize_csv_cell,
)
from .selectors import (
    get_dashboard_overview,
    get_dropout_risk_report,
    get_monthly_dtr_data,
    get_sdg_impact_summary,
    get_system_status,
)
from .sf1 import generate_sf1_report
from .sf2 import generate_sf2_report, resolve_month
from .sf4 import generate_sf4_report


def _current_month_name() -> str:
    return timezone.localdate().strftime("%B")


def _is_pos_int(raw: object) -> bool:
    s = str(raw or "").strip()
    return s.isascii() and s.isdigit()


def _parse_int_param(
    raw, *, default: int, name: str, min_val: int, max_val: int
) -> int:
    if raw in (None, ""):
        return default
    try:
        val = int(str(raw).strip())
    except (TypeError, ValueError):
        raise AppError(
            f"INVALID_{name.upper()}", f"{name} must be a whole number.", 400
        )
    if not (min_val <= val <= max_val):
        raise AppError(
            f"INVALID_{name.upper()}",
            f"{name} must be between {min_val} and {max_val}.",
            400,
        )
    return val


def _parse_month_int(raw, default: int) -> int:
    if raw in (None, ""):
        return default
    num, _ = resolve_month(raw)
    return num


def _authorize_section_access(user, section_id: int) -> bool:
    if is_school_leader(user):
        return True
    teacher = resolve_teacher_for_user(user)
    return bool(teacher and section_id in get_teacher_section_ids(teacher))


class DashboardOverviewView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request):
        return Response(get_dashboard_overview(user=request.user, request=request))


class Sf1ReportView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request, pk: int | None = None):
        raw_id = pk or request.query_params.get("section_id")
        if not _is_pos_int(raw_id):
            return Response(
                {"error": "A valid section ID is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sec_id = int(raw_id)
        if not _authorize_section_access(request.user, sec_id):
            return Response(
                {"error": "You do not have access to this class section."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            generate_sf1_report(
                section_id=sec_id,
                school_year=request.query_params.get("school_year"),
                request=request,
            )
        )


class Sf1PrintView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request):
        raw_id = request.query_params.get("section_id")
        if not _is_pos_int(raw_id):
            return Response(
                {"error": "A valid section ID is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sec_id = int(raw_id)
        if not _authorize_section_access(request.user, sec_id):
            return Response(
                {"error": "You do not have access to this class section."},
                status=status.HTTP_403_FORBIDDEN,
            )
        context = generate_sf1_report(section_id=sec_id, request=request)
        resp = render(request, "reports/sf1.html", context)
        return apply_html_security_headers(resp)


class Sf2ReportView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request, pk: int | None = None):
        raw_id = pk or request.query_params.get("section_id")
        if not _is_pos_int(raw_id):
            return Response(
                {"error": "A valid section ID is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sec_id = int(raw_id)
        if not _authorize_section_access(request.user, sec_id):
            return Response(
                {"error": "You do not have access to this class section."},
                status=status.HTTP_403_FORBIDDEN,
            )
        today = timezone.localdate()
        month = request.query_params.get("month") or _current_month_name()
        year = _parse_int_param(
            request.query_params.get("year"),
            default=today.year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        return Response(
            generate_sf2_report(
                section_id=sec_id, month_name=month, year=year, request=request
            )
        )


class Sf4ReportView(APIView):
    permission_classes = [IsSchoolLeader]

    def get(self, request):
        today = timezone.localdate()
        month = request.query_params.get("month") or _current_month_name()
        year = _parse_int_param(
            request.query_params.get("year"),
            default=today.year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        sy = request.query_params.get("school_year", "")
        return Response(
            generate_sf4_report(
                month_name=month, year=year, school_year=sy, request=request
            )
        )


class MonthlyDtrView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request, pk: int | None = None):
        today = timezone.localdate()
        month = _parse_month_int(request.query_params.get("month"), today.month)
        year = _parse_int_param(
            request.query_params.get("year"),
            default=today.year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        raw_tid = pk or request.query_params.get("teacher_id")
        t_id = int(raw_tid) if _is_pos_int(raw_tid) else None
        list_only = str(request.query_params.get("list", "")).lower() in (
            "1",
            "true",
            "yes",
        )
        return Response(
            get_monthly_dtr_data(
                user=request.user,
                month=month,
                year=year,
                teacher_id=t_id,
                list_only=list_only,
                request=request,
            )
        )

    def post(self, request, pk: int | None = None):
        from .services import process_monthly_dtr_action

        today = timezone.localdate()
        month = _parse_month_int(request.data.get("month"), today.month)
        year = _parse_int_param(
            request.data.get("year"),
            default=today.year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        raw_tid = pk or request.data.get("teacher_id")
        t_id = int(raw_tid) if _is_pos_int(raw_tid) else None

        result = process_monthly_dtr_action(
            request=request,
            action=str(request.data.get("action") or ""),
            month=month,
            year=year,
            teacher_id=t_id,
            data=request.data,
        )
        return Response(result, status=status.HTTP_200_OK)


class ReportExportView(APIView):
    """Builds printable HTML exports for SF1, SF2, SF4, and CSC Form 48 (DTR)."""

    permission_classes = [IsTeacherOrLeader]

    def _handle(self, request, params):
        today = timezone.localdate()
        default_month = _current_month_name()
        report_type = (
            str(params.get("report_type") or params.get("type") or "SF1")
            .strip()
            .upper()
        )
        year = _parse_int_param(
            params.get("year"),
            default=today.year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        raw_sec = params.get("section_id")
        sec_id = int(raw_sec) if _is_pos_int(raw_sec) else None

        wants_json = (
            str(params.get("format") or "").strip().lower() == "json"
            or "application/json" in str(request.headers.get("Accept") or "").lower()
        )

        def _respond(title: str, html: str):
            if wants_json:
                return Response({"title": title, "html": html})
            resp = HttpResponse(html, content_type="text/html; charset=utf-8")
            return apply_html_security_headers(resp)

        if report_type == "SF1":
            if not sec_id:
                raise AppError(
                    "SECTION_REQUIRED",
                    "A valid section ID is required for SF1 export.",
                    400,
                )
            if not _authorize_section_access(request.user, sec_id):
                raise AppError("FORBIDDEN", "You do not have access to this class section.", 403)
            context = generate_sf1_report(
                section_id=sec_id,
                school_year=params.get("school_year"),
                request=request,
            )
            html = render_to_string("reports/sf1.html", context, request=request)
            return _respond(f"SF1_{context.get('section_name', sec_id)}", html)

        if report_type == "SF2":
            if not sec_id:
                raise AppError(
                    "SECTION_REQUIRED",
                    "A valid section ID is required for SF2 export.",
                    400,
                )
            if not _authorize_section_access(request.user, sec_id):
                raise AppError("FORBIDDEN", "You do not have access to this class section.", 403)
            data = generate_sf2_report(
                section_id=sec_id,
                month_name=params.get("month") or default_month,
                year=year,
                request=request,
            )
            rows_html = "".join(
                f"<tr><td>{escape(r['lrn'])}</td><td>{escape(r['name'])}</td><td>{escape(r['sex'])}</td>"
                f"<td>{r['total_absent']}</td><td>{r['total_tardy']}</td></tr>"
                for r in (data["males"] + data["females"])
            )
            html = (
                f"<!doctype html><html><head><meta charset='utf-8'><title>SF2 - {escape(data['section_name'])}</title>"
                "<style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}"
                "th,td{border:1px solid #333;padding:4px 6px;text-align:left}</style></head><body>"
                f"<h2>School Form 2 (SF2) — {escape(data['school_name'])}</h2>"
                f"<p>Section: <b>{escape(data['grade_level'])} - {escape(data['section_name'])}</b> | "
                f"Month: <b>{escape(data['month'])} {data['year']}</b> | Adviser: <b>{escape(data['adviser_name'])}</b></p>"
                "<table><thead><tr><th>LRN</th><th>Student Name</th><th>Sex</th><th>Total Absent</th><th>Total Late</th></tr></thead>"
                f"<tbody>{rows_html}</tbody></table></body></html>"
            )
            return _respond(
                f"SF2_{data['section_name']}_{data['month']}_{data['year']}", html
            )

        if report_type == "SF4":
            if not is_school_leader(request.user):
                raise AppError(
                    "FORBIDDEN", "School leadership access is required for SF4 export.", 403
                )
            data = generate_sf4_report(
                month_name=params.get("month") or default_month,
                year=year,
                school_year=params.get("school_year") or "",
                request=request,
            )
            rows_html = ""
            for grp in data.get("grade_groups", []):
                for sec in grp.get("sections", []):
                    rows_html += (
                        f"<tr><td>{escape(grp['grade_level'])}</td><td>{escape(sec['section_name'])}</td>"
                        f"<td>{escape(sec['adviser_name'])}</td><td>{sec['registered_end']['total']}</td>"
                        f"<td>{sec['daily_average']['total']}</td><td>{sec['attendance_percentage']['total']}%</td></tr>"
                    )
            html = (
                f"<!doctype html><html><head><meta charset='utf-8'><title>SF4 - {escape(data['month'])} {data['year']}</title>"
                "<style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}"
                "th,td{border:1px solid #333;padding:4px 6px;text-align:left}</style></head><body>"
                f"<h2>School Form 4 (SF4) — {escape(data['school_name'])}</h2>"
                f"<p>Month: <b>{escape(data['month'])} {data['year']}</b></p>"
                "<table><thead><tr><th>Grade</th><th>Section</th><th>Adviser</th><th>Enrolled</th><th>Daily Average</th><th>% Attendance</th></tr></thead>"
                f"<tbody>{rows_html}</tbody></table></body></html>"
            )
            return _respond(f"SF4_{data['month']}_{data['year']}", html)

        if report_type == "DTR":
            month_num = _parse_month_int(params.get("month"), today.month)
            raw_tid = params.get("teacher_id")
            t_id = int(raw_tid) if _is_pos_int(raw_tid) else None
            data = get_monthly_dtr_data(
                user=request.user,
                month=month_num,
                year=year,
                teacher_id=t_id,
                request=request,
            )
            rows_html = "".join(
                f"<tr><td>{r['day']}</td><td>{escape(r['am_arrival'])}</td><td>{escape(r['am_departure'])}</td>"
                f"<td>{escape(r['pm_arrival'])}</td><td>{escape(r['pm_departure'])}</td><td>{escape(r['status'])}</td></tr>"
                for r in data["rows"]
                if r["status"] != "OUT_OF_MONTH"
            )
            html = (
                f"<!doctype html><html><head><meta charset='utf-8'><title>CSC Form 48 - {escape(data['teacher_name'])}</title>"
                "<style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}"
                "th,td{border:1px solid #333;padding:4px 6px;text-align:center}</style></head><body>"
                f"<h2>Civil Service Form No. 48 (DTR) — {escape(data['teacher_name'])}</h2>"
                f"<p>Month: <b>{escape(data['month'])} {data['year']}</b> | Days Present: <b>{data['days_present']}</b></p>"
                "<table><thead><tr><th>Day</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th><th>Status</th></tr></thead>"
                f"<tbody>{rows_html}</tbody></table></body></html>"
            )
            return _respond(
                f"CSC_Form_48_{data['teacher_name']}_{data['month']}_{data['year']}",
                html,
            )

        raise AppError(
            "INVALID_REPORT_TYPE", f"Unsupported report type '{report_type}'.", 400
        )

    def get(self, request):
        return self._handle(request, request.query_params)

    def post(self, request):
        return self._handle(request, request.data)


class _PassthroughCsvRenderer(renderers.BaseRenderer):
    media_type = "text/csv"
    format = "csv"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data if isinstance(data, (bytes, str)) else str(data)


class PrintPackView(APIView):
    """
    Downloadable & printable pack generator for Class Schedules, Class Lists,
    Student QR ID Cards, Teacher Directory, and Complete Teacher Packets.
    Supports GET and POST with strict RBAC scoping and AuditLog logging.
    """

    permission_classes = [IsTeacherOrLeader]
    renderer_classes = [renderers.JSONRenderer, _PassthroughCsvRenderer]

    def _handle(self, request, params):
        payload = build_print_pack_payload(request=request, params=params)
        pack_type = payload["pack_type"]
        export_format = payload["export_format"]
        scope = payload["scope"]
        action_mode = str(params.get("action_mode") or "").strip().upper()
        audit_action = (
            action_mode
            if action_mode in ("PRINT", "EXPORT")
            else ("PRINT" if export_format == "html" else "EXPORT")
        )

        record_audit_log(
            request=request,
            table_name="deped_reports",
            record_id=0,
            action=audit_action,
            new_data={
                "pack_type": pack_type,
                "scope": scope,
                "export_format": export_format,
                "summary": payload.get("summary", {}),
            },
        )

        stamp = timezone.localtime().strftime("%Y%m%d_%H%M")
        filename_base = f"AttendSure_{pack_type.lower()}_{stamp}"

        if export_format == "html":
            html = render_print_pack_html(payload)
            wants_json_wrap = (
                str(params.get("wrap_json") or "").strip().lower() in ("1", "true", "yes")
            )
            if wants_json_wrap:
                return Response(
                    {
                        "title": filename_base,
                        "pack_type": pack_type,
                        "scope": scope,
                        "summary": payload.get("summary", {}),
                        "html": html,
                    }
                )
            resp = HttpResponse(html, content_type="text/html; charset=utf-8")
            resp["Content-Disposition"] = f'inline; filename="{filename_base}.html"'
            return apply_html_security_headers(resp)

        if export_format == "csv":
            csv_text = render_print_pack_csv(payload)
            resp = HttpResponse(csv_text, content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="{filename_base}.csv"'
            resp["X-Content-Type-Options"] = "nosniff"
            return resp

        return Response(payload, status=status.HTTP_200_OK)

    def get(self, request):
        return self._handle(request, request.query_params)

    def post(self, request):
        return self._handle(request, request.data)


class EdFiExportView(APIView):
    """Exports school, class, teacher, and attendance records in JSON or CSV format."""

    permission_classes = [IsSchoolLeader]
    renderer_classes = [renderers.JSONRenderer, _PassthroughCsvRenderer]
    use_deped_filename = False

    def get(self, request):
        days = _parse_int_param(
            request.query_params.get("days"),
            default=30,
            name="days",
            min_val=1,
            max_val=90,
        )
        anonymize = str(request.query_params.get("anonymize") or "").strip().lower() in (
            "1",
            "true",
            "yes",
        )
        export_fmt = str(
            request.query_params.get("export_format")
            or request.query_params.get("format")
            or "json"
        ).strip().lower()

        payload = build_edfi_v6_export(request=request, days=days, anonymize=anonymize)
        today = timezone.localdate()

        record_audit_log(
            request=request,
            table_name="edfi_export",
            record_id=0,
            action="EXPORT",
            new_data={
                "format": export_fmt,
                "anonymize": anonymize,
                "days": days,
                "events": payload.get("recordCounts", {}).get(
                    "studentSchoolAttendanceEvents", 0
                ),
            },
        )

        if export_fmt == "csv":
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(
                [
                    "event_date",
                    "learner_id",
                    "section_identifier",
                    "attendance_status",
                    "reason",
                    "school_id",
                    "school_year",
                ]
            )
            schools_list = payload.get("schools") or []
            school_id = (
                schools_list[0].get("schoolId", "")
                if schools_list
                else payload.get("school", {}).get("schoolId", "")
            )
            school_year = (
                payload.get("reportingWindow", {}).get("schoolYear")
                or payload.get("school", {}).get("schoolYear", "")
            )

            for evt in payload.get("studentSchoolAttendanceEvents", []):
                section_ident = evt.get("sectionIdentifier") or evt.get(
                    "sectionReference", {}
                ).get("sectionIdentifier", "")
                writer.writerow(
                    [
                        sanitize_csv_cell(evt.get("eventDate", "")),
                        sanitize_csv_cell(
                            evt.get("studentReference", {}).get("studentUniqueId", "")
                        ),
                        sanitize_csv_cell(section_ident),
                        sanitize_csv_cell(
                            evt.get("attendanceEventCategoryDescriptor", "")
                        ),
                        sanitize_csv_cell(evt.get("attendanceEventReason", "")),
                        sanitize_csv_cell(school_id),
                        sanitize_csv_cell(school_year),
                    ]
                )
            filename = (
                f"attendsure_deped_division_export_{today}.csv"
                if self.use_deped_filename
                else f"attendsure_division_export_{today}.csv"
            )
            resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
            resp["Content-Disposition"] = f'attachment; filename="{filename}"'
            resp["X-Content-Type-Options"] = "nosniff"
            return resp

        mode_tag = "masked" if anonymize else "standard"
        filename = (
            f"attendsure_deped_division_export_{mode_tag}_{today}.json"
            if self.use_deped_filename
            else f"attendsure_edfi_v6_{mode_tag}_{today}.json"
        )
        response = JsonResponse(payload)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        response["X-Content-Type-Options"] = "nosniff"
        return response


class StandardDataExportView(EdFiExportView):
    """DepEd Division Data Export (.JSON / .CSV)."""

    use_deped_filename = True


class ReportAuditLogView(APIView):
    """Lists and saves audit log entries whenever SF1, SF2, SF4, or DTR forms are printed or exported."""

    permission_classes = [IsTeacherOrLeader]

    def get(self, request):
        from apps.accounts.models import AuditLog
        from apps.accounts.views import _format_audit_row

        qs = (
            AuditLog.objects.select_related("performed_by")
            .only(
                "id",
                "table_name",
                "record_id",
                "action",
                "client_ip",
                "changed_fields",
                "new_data",
                "created_at",
                "performed_by__id",
                "performed_by__username",
                "performed_by__first_name",
                "performed_by__last_name",
            )
            .filter(table_name__in=["deped_reports", "edfi_export"])
            .order_by("-created_at")
        )
        if not is_school_leader(request.user):
            qs = qs.filter(performed_by_id=request.user.id)
        records = [_format_audit_row(row) for row in qs[:100]]
        return Response({"count": len(records), "records": records, "results": records})

    def post(self, request):
        raw_section = request.data.get("section_id")
        record_id = int(raw_section) if _is_pos_int(raw_section) else 0
        action_code = strip_tags(str(request.data.get("action") or "EXPORT")).strip().upper()[:10]
        report_name = strip_tags(str(request.data.get("report_name") or "School Form")).strip()[:80]
        tracking_id = strip_tags(str(request.data.get("document_tracking_id") or "")).strip()[:80]

        record_audit_log(
            request=request,
            table_name="deped_reports",
            record_id=record_id,
            action=action_code or "EXPORT",
            new_data={"report_name": report_name, "tracking_id": tracking_id},
        )
        return Response({"ok": True, "logged": True}, status=status.HTTP_201_CREATED)


class DropoutRiskView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request):
        sec_id = request.query_params.get("section_id")
        return Response(
            get_dropout_risk_report(
                user=request.user,
                section_id=int(sec_id) if _is_pos_int(sec_id) else None,
                request=request,
            )
        )


class SdgImpactView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request):
        return Response(get_sdg_impact_summary())


class SystemStatusView(APIView):
    permission_classes = [IsTeacherOrLeader]

    def get(self, request):
        return Response(get_system_status())

    def post(self, request):
        if not is_school_leader(request.user):
            raise AppError("FORBIDDEN", "School leadership access is required.", 403)

        action_name = str(request.data.get("action") or "RUN_LOAFING_AUDIT").strip().upper()
        unlocked = 0
        audit_summary = None

        if action_name in ("UNLOCK_ACCOUNTS", "UNLOCK_TEACHERS"):
            unlocked = unlock_all_locked_accounts()
            record_audit_log(
                request=request,
                table_name="user_profiles",
                record_id=0,
                action="UNLOCK_ALL",
                new_data={"unlocked_count": unlocked},
            )
            message = f"Unlocked {unlocked} locked staff account(s)."
        else:
            from apps.campus.services import detect_silent_on_duty_teachers

            student_summary = detect_daily_student_loafing(user=request.user)
            signal_summary = detect_silent_on_duty_teachers()
            created_signal_lost = int(signal_summary.get("created_signal_lost_incidents", 0))
            audit_summary = {
                **student_summary,
                "checked_teachers": int(signal_summary.get("checked_teachers", 0)),
                "created_signal_lost_incidents": created_signal_lost,
                "total_created": int(student_summary.get("total_created", 0)) + created_signal_lost,
            }
            message = (
                f"Attendance & phone health check finished for {audit_summary['audit_date']}: "
                f"{audit_summary['created_cutting_incidents']} cutting-class alert(s), "
                f"{audit_summary['created_expired_pass_incidents']} expired exit-pass alert(s), "
                f"{created_signal_lost} teacher phone signal-lost alert(s)."
            )

        data = dict(get_system_status())
        data["ok"] = True
        data["unlocked_count"] = unlocked
        if audit_summary:
            data["audit_summary"] = audit_summary
        data["message"] = message
        return Response(data)
