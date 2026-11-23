# D:\AttendSure_V3\backend\apps\reports\views.py

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import escape
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors import get_faculty_section_ids, resolve_faculty_for_user
from apps.accounts.services import unlock_all_locked_accounts
from apps.messaging.services import retry_pending_push_notifications
from common.audit import record_audit_log
from common.exceptions import AppError
from common.permissions import get_user_role, is_school_leader
from .edfi import build_edfi_v6_export
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


def _parse_int_param(raw, *, default: int, name: str, min_val: int, max_val: int) -> int:
    if raw in (None, ""):
        return default
    try:
        val = int(str(raw).strip())
    except (TypeError, ValueError):
        raise AppError(f"INVALID_{name.upper()}", f"{name} must be a valid integer.", 400)
    if not (min_val <= val <= max_val):
        raise AppError(f"INVALID_{name.upper()}", f"{name} must be between {min_val} and {max_val}.", 400)
    return val


def _parse_month_int(raw, default: int) -> int:
    if raw in (None, ""):
        return default
    num, _ = resolve_month(raw)
    return num


def _authorize_section_access(user, section_id: int) -> bool:
    if is_school_leader(user):
        return True
    teacher = resolve_faculty_for_user(user)
    return bool(teacher and section_id in get_faculty_section_ids(teacher))


def _require_staff(user) -> None:
    if get_user_role(user) == "PARENT" and not is_school_leader(user):
        raise AppError("FORBIDDEN", "Staff or school leadership access required.", 403)


class DashboardOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_staff(request.user)
        return Response(get_dashboard_overview(user=request.user, request=request))


class Sf1ReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int | None = None):
        raw_id = pk or request.query_params.get("section_id")
        if not raw_id or not str(raw_id).isdigit():
            return Response({"error": "Valid section_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        sec_id = int(raw_id)
        if not _authorize_section_access(request.user, sec_id):
            return Response({"error": "Access denied to this section."}, status=status.HTTP_403_FORBIDDEN)
        return Response(
            generate_sf1_report(
                section_id=sec_id,
                school_year=request.query_params.get("school_year"),
                request=request,
            )
        )


class Sf1PrintView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        raw_id = request.query_params.get("section_id")
        if not raw_id or not str(raw_id).isdigit():
            return Response({"error": "Valid section_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        sec_id = int(raw_id)
        if not _authorize_section_access(request.user, sec_id):
            return Response({"error": "Access denied to this section."}, status=status.HTTP_403_FORBIDDEN)
        context = generate_sf1_report(section_id=sec_id, request=request)
        return render(request, "reports/sf1.html", context)


class Sf2ReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int | None = None):
        raw_id = pk or request.query_params.get("section_id")
        if not raw_id or not str(raw_id).isdigit():
            return Response({"error": "Valid section_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        sec_id = int(raw_id)
        if not _authorize_section_access(request.user, sec_id):
            return Response({"error": "Access denied to this section."}, status=status.HTTP_403_FORBIDDEN)
        month = request.query_params.get("month", "October")
        year = _parse_int_param(
            request.query_params.get("year"),
            default=timezone.localdate().year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        return Response(generate_sf2_report(section_id=sec_id, month_name=month, year=year, request=request))


class Sf4ReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_school_leader(request.user):
            return Response({"error": "Leadership access required."}, status=status.HTTP_403_FORBIDDEN)
        month = request.query_params.get("month", "October")
        year = _parse_int_param(
            request.query_params.get("year"),
            default=timezone.localdate().year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        sy = request.query_params.get("school_year", "")
        return Response(generate_sf4_report(month_name=month, year=year, school_year=sy, request=request))


class MonthlyDtrView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int | None = None):
        _require_staff(request.user)
        month = _parse_month_int(request.query_params.get("month"), timezone.localdate().month)
        year = _parse_int_param(
            request.query_params.get("year"),
            default=timezone.localdate().year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        raw_tid = pk or request.query_params.get("faculty_id") or request.query_params.get("teacher_id")
        t_id = int(raw_tid) if (raw_tid and str(raw_tid).isdigit()) else None
        list_only = str(request.query_params.get("list", "")).lower() in ("1", "true", "yes")
        return Response(
            get_monthly_dtr_data(
                user=request.user,
                month=month,
                year=year,
                faculty_id=t_id,
                list_only=list_only,
                request=request,
            )
        )

    def post(self, request, pk: int | None = None):
        from .services import process_monthly_dtr_action

        _require_staff(request.user)
        month = _parse_month_int(request.data.get("month"), timezone.localdate().month)
        year = _parse_int_param(
            request.data.get("year"),
            default=timezone.localdate().year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        raw_tid = pk or request.data.get("faculty_id") or request.data.get("teacher_id")
        t_id = int(raw_tid) if (raw_tid and str(raw_tid).isdigit()) else None

        result = process_monthly_dtr_action(
            request=request,
            action=str(request.data.get("action") or ""),
            month=month,
            year=year,
            faculty_id=t_id,
            data=request.data,
        )
        return Response(result, status=status.HTTP_200_OK)


class ReportExportView(APIView):
    """Generates printable HTML exports for SF1, SF2, SF4, and DTR reports."""

    permission_classes = [permissions.IsAuthenticated]

    def _handle(self, request, params):
        _require_staff(request.user)
        report_type = str(params.get("report_type") or params.get("type") or "SF1").strip().upper()
        year = _parse_int_param(
            params.get("year"),
            default=timezone.localdate().year,
            name="year",
            min_val=1900,
            max_val=2100,
        )
        raw_sec = params.get("section_id")
        sec_id = int(raw_sec) if (raw_sec and str(raw_sec).isdigit()) else None

        wants_json = (
            str(params.get("format") or "").strip().lower() == "json"
            or "application/json" in str(request.headers.get("Accept") or "").lower()
        )

        def _respond(title: str, html: str):
            if wants_json:
                return Response({"title": title, "html": html})
            return HttpResponse(html, content_type="text/html; charset=utf-8")

        if report_type == "SF1":
            if not sec_id:
                raise AppError("SECTION_REQUIRED", "Valid section_id is required for SF1 export.", 400)
            if not _authorize_section_access(request.user, sec_id):
                raise AppError("FORBIDDEN", "Access denied to this section.", 403)
            context = generate_sf1_report(section_id=sec_id, school_year=params.get("school_year"), request=request)
            html = render_to_string("reports/sf1.html", context, request=request)
            return _respond(f"SF1_{context.get('section_name', sec_id)}", html)

        if report_type == "SF2":
            if not sec_id:
                raise AppError("SECTION_REQUIRED", "Valid section_id is required for SF2 export.", 400)
            if not _authorize_section_access(request.user, sec_id):
                raise AppError("FORBIDDEN", "Access denied to this section.", 403)
            data = generate_sf2_report(
                section_id=sec_id,
                month_name=params.get("month") or "October",
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
                "<table><thead><tr><th>LRN</th><th>Learner Name</th><th>Sex</th><th>Total Absent</th><th>Total Tardy</th></tr></thead>"
                f"<tbody>{rows_html}</tbody></table></body></html>"
            )
            return _respond(f"SF2_{data['section_name']}_{data['month']}_{data['year']}", html)

        if report_type == "SF4":
            if not is_school_leader(request.user):
                raise AppError("FORBIDDEN", "Leadership access required for SF4 export.", 403)
            data = generate_sf4_report(
                month_name=params.get("month") or "October",
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
                "<table><thead><tr><th>Grade</th><th>Section</th><th>Adviser</th><th>Registered</th><th>ADA</th><th>% Attendance</th></tr></thead>"
                f"<tbody>{rows_html}</tbody></table></body></html>"
            )
            return _respond(f"SF4_{data['month']}_{data['year']}", html)

        if report_type == "DTR":
            month_num = _parse_month_int(params.get("month"), timezone.localdate().month)
            raw_tid = params.get("faculty_id") or params.get("teacher_id")
            t_id = int(raw_tid) if (raw_tid and str(raw_tid).isdigit()) else None
            data = get_monthly_dtr_data(user=request.user, month=month_num, year=year, faculty_id=t_id, request=request)
            rows_html = "".join(
                f"<tr><td>{r['day']}</td><td>{escape(r['am_arrival'])}</td><td>{escape(r['am_departure'])}</td>"
                f"<td>{escape(r['pm_arrival'])}</td><td>{escape(r['pm_departure'])}</td><td>{escape(r['status'])}</td></tr>"
                for r in data["rows"]
                if r["status"] != "OUT_OF_MONTH"
            )
            html = (
                f"<!doctype html><html><head><meta charset='utf-8'><title>CSC Form 48 - {escape(data['faculty_name'])}</title>"
                "<style>body{font-family:Arial,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse}"
                "th,td{border:1px solid #333;padding:4px 6px;text-align:center}</style></head><body>"
                f"<h2>Civil Service Form No. 48 (DTR) — {escape(data['faculty_name'])}</h2>"
                f"<p>Month: <b>{escape(data['month'])} {data['year']}</b> | Days Present: <b>{data['days_present']}</b></p>"
                "<table><thead><tr><th>Day</th><th>AM In</th><th>AM Out</th><th>PM In</th><th>PM Out</th><th>Status</th></tr></thead>"
                f"<tbody>{rows_html}</tbody></table></body></html>"
            )
            return _respond(f"CSC_Form_48_{data['faculty_name']}_{data['month']}_{data['year']}", html)

        raise AppError("INVALID_REPORT_TYPE", f"Unsupported report type '{report_type}'.", 400)

    def get(self, request):
        return self._handle(request, request.query_params)

    def post(self, request):
        return self._handle(request, request.data)


class EdFiExportView(APIView):
    """Exports live school, roster, staff, and attendance data in Ed-Fi Data Standard v6.0 JSON format."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_school_leader(request.user):
            raise AppError("FORBIDDEN", "School leadership access required.", 403)

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
        payload = build_edfi_v6_export(request=request, days=days, anonymize=anonymize)
        today = timezone.localdate()
        mode_tag = "gdpr_pseudonymized" if anonymize else "standard"

        record_audit_log(
            request=request,
            table_name="edfi_export",
            record_id=0,
            action="EXPORT",
            new_data={
                "standard": "Ed-Fi v6.0",
                "anonymize": anonymize,
                "days": days,
                "events": payload["recordCounts"]["studentSchoolAttendanceEvents"],
            },
        )

        response = JsonResponse(payload)
        response["Content-Disposition"] = f'attachment; filename="attendsure_edfi_v6_{mode_tag}_{today}.json"'
        return response


class ReportAuditLogView(APIView):
    """Lists and records audit entries whenever SF1, SF2, SF4, or DTR forms are printed or exported."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.accounts.models import AuditLog
        from apps.accounts.views import _format_audit_row

        _require_staff(request.user)
        qs = AuditLog.objects.select_related("performed_by").filter(
            table_name__in=["deped_reports", "edfi_export"]
        ).order_by("-created_at")
        if not is_school_leader(request.user):
            qs = qs.filter(performed_by=request.user)
        records = [_format_audit_row(row) for row in qs[:100]]
        return Response({"count": len(records), "records": records, "results": records})

    def post(self, request):
        _require_staff(request.user)
        raw_section = request.data.get("section_id")
        record_id = int(raw_section) if (raw_section and str(raw_section).isdigit()) else 0
        action_code = str(request.data.get("action") or "EXPORT").strip().upper()[:10]
        report_name = str(request.data.get("report_name") or "School Form").strip()[:80]
        tracking_id = str(request.data.get("document_tracking_id") or "").strip()[:80]

        record_audit_log(
            request=request,
            table_name="deped_reports",
            record_id=record_id,
            action=action_code,
            new_data={"report_name": report_name, "tracking_id": tracking_id},
        )
        return Response({"ok": True, "logged": True}, status=status.HTTP_201_CREATED)


class DropoutRiskView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_staff(request.user)
        sec_id = request.query_params.get("section_id")
        return Response(
            get_dropout_risk_report(
                user=request.user,
                section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
                request=request,
            )
        )


class SdgImpactView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_staff(request.user)
        return Response(get_sdg_impact_summary())


class SystemStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_staff(request.user)
        return Response(get_system_status())

    def post(self, request):
        if not is_school_leader(request.user):
            raise AppError("FORBIDDEN", "School leadership access required.", 403)

        action_name = str(request.data.get("action") or "RETRY_FAILED").strip().upper()
        retried = 0
        unlocked = 0

        if action_name in ("RETRY_FAILED", "SYNC_PUSH", "DISPATCH_PUSH", ""):
            retried = retry_pending_push_notifications()
        elif action_name in ("UNLOCK_ACCOUNTS", "UNLOCK_FACULTY"):
            unlocked = unlock_all_locked_accounts()

        data = dict(get_system_status())
        data["ok"] = True
        data["retried_count"] = retried
        data["unlocked_count"] = unlocked
        data["message"] = (
            f"Unlocked {unlocked} account(s)."
            if action_name in ("UNLOCK_ACCOUNTS", "UNLOCK_FACULTY")
            else f"Queued {retried} pending push alert(s) for delivery."
        )
        return Response(data)