from django.shortcuts import render
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import record_audit_log
from common.permissions import is_school_leader
from apps.accounts.selectors import get_teacher_section_ids, resolve_teacher_for_user
from .selectors import (
    get_dashboard_overview,
    get_dropout_risk_report,
    get_monthly_dtr_data,
    get_sdg_impact_summary,
    get_system_status,
)
from .sf1 import generate_sf1_report
from .sf2 import generate_sf2_report
from .sf4 import generate_sf4_report


def _authorize_section_access(user, section_id: int) -> bool:
    if is_school_leader(user):
        return True
    teacher = resolve_teacher_for_user(user)
    return bool(teacher and section_id in get_teacher_section_ids(teacher))


class DashboardOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
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
        year = int(request.query_params.get("year", timezone.localdate().year))
        return Response(generate_sf2_report(section_id=sec_id, month_name=month, year=year, request=request))


class Sf4ReportView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not is_school_leader(request.user):
            return Response({"error": "Leadership access required."}, status=status.HTTP_403_FORBIDDEN)
        month = request.query_params.get("month", "October")
        year = int(request.query_params.get("year", timezone.localdate().year))
        sy = request.query_params.get("school_year", "")
        return Response(generate_sf4_report(month_name=month, year=year, school_year=sy, request=request))


class MonthlyDtrView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk: int | None = None):
        month = int(request.query_params.get("month", timezone.localdate().month))
        year = int(request.query_params.get("year", timezone.localdate().year))
        raw_tid = pk or request.query_params.get("faculty_id") or request.query_params.get("teacher_id")
        t_id = int(raw_tid) if (raw_tid and str(raw_tid).isdigit()) else None
        list_only = str(request.query_params.get("list", "")).lower() in ("1", "true", "yes")
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

        month = int(request.data.get("month") or timezone.localdate().month)
        year = int(request.data.get("year") or timezone.localdate().year)
        raw_tid = pk or request.data.get("faculty_id") or request.data.get("teacher_id")
        t_id = int(raw_tid) if (raw_tid and str(raw_tid).isdigit()) else None

        result = process_monthly_dtr_action(
            request=request,
            action=str(request.data.get("action") or ""),
            month=month,
            year=year,
            teacher_id=t_id,
            data=request.data,
        )
        return Response(result, status=status.HTTP_200_OK)


class ReportAuditLogView(APIView):
    """Records verifiable audit entries whenever SF1, SF2, SF4, or DTR forms are printed or exported."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
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
        return Response(get_sdg_impact_summary())


class SystemStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(get_system_status())

    def post(self, request):
        return Response(get_system_status())