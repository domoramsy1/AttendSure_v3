from datetime import datetime
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import ClassAttendance
from .selectors import (
    get_adviser_matrix,
    get_assigned_classes_with_rosters,
    get_attendance_logs,
    get_exit_passes_for_user,
    get_section_student_roster,
)
from .serializers import ExitPassSerializer
from .services import (
    change_exit_pass_status,
    record_student_qr_scan,
    save_manual_attendance,
    sync_offline_qr_scans,
)


class ScanStudentQrView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        raw_qr = (
            request.data.get("qr_text")
            or request.data.get("code")
            or request.data.get("raw_identifier")
            or request.data.get("qr_token")
            or ""
        )
        period_id = request.data.get("schedule_id") or request.data.get("period_id")
        result = record_student_qr_scan(
            user=request.user,
            raw_qr=str(raw_qr),
            period_id=int(period_id) if (period_id and str(period_id).isdigit()) else None,
            latitude=request.data.get("latitude"),
            longitude=request.data.get("longitude"),
            accuracy=request.data.get("accuracy"),
            is_mock_location=bool(request.data.get("is_mock_location", False)),
            request=request,
        )
        code = status.HTTP_200_OK if result["is_duplicate"] else status.HTTP_201_CREATED
        return Response(result, status=code)


class OfflineQrSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        scans = request.data.get("scans") or []
        if not isinstance(scans, list) or not scans:
            return Response({"error": "Non-empty scans list is required."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(sync_offline_qr_scans(user=request.user, raw_scans=scans))


class ClassAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        date_str = request.query_params.get("date")
        target_date = timezone.localdate()
        if date_str:
            try:
                target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                pass
        sec_id = request.query_params.get("section_id")
        per_id = request.query_params.get("schedule_id") or request.query_params.get("period_id")
        records = get_attendance_logs(
            user=request.user,
            target_date=target_date,
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
            period_id=int(per_id) if (per_id and str(per_id).isdigit()) else None,
        )
        return Response({"records": records, "total": len(records)})

    def post(self, request):
        student_id = request.data.get("student_id")
        per_id = request.data.get("schedule_id") or request.data.get("period_id")
        log = save_manual_attendance(
            user=request.user,
            student_id=int(student_id),
            status_code=str(request.data.get("status", "PRESENT")),
            period_id=int(per_id) if (per_id and str(per_id).isdigit()) else None,
            date_str=request.data.get("attendance_date"),
        )
        return Response({"ok": True, "success": True, "id": log.id, "status": log.status}, status=status.HTTP_201_CREATED)

    def put(self, request):
        rec_id = request.data.get("id") or request.query_params.get("id")
        if rec_id and str(rec_id).isdigit():
            existing = ClassAttendance.objects.filter(id=int(rec_id)).first()
            if existing:
                log = save_manual_attendance(
                    user=request.user,
                    student_id=existing.student_id,
                    status_code=str(request.data.get("status", existing.status)),
                    period_id=existing.class_period_id,
                    date_str=str(existing.attendance_date),
                )
                return Response({"ok": True, "success": True, "id": log.id, "status": log.status})
        return self.post(request)

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        rec_id = request.data.get("id") or request.query_params.get("id")
        ClassAttendance.objects.filter(id=int(rec_id)).delete()
        return Response({"ok": True, "success": True, "message": "Attendance record removed."})


class AssignedClassRosterView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        view_all = str(request.query_params.get("mode", "")).lower() == "all"
        return Response(get_assigned_classes_with_rosters(user=request.user, view_all=view_all, request=request))


class SectionStudentListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sec_id = request.query_params.get("section_id") or request.query_params.get("section")
        parsed_id = int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        return Response(get_section_student_roster(user=request.user, section_id=parsed_id, request=request))


class AdviserMatrixView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sec_id = request.query_params.get("section_id")
        return Response(
            get_adviser_matrix(
                user=request.user,
                section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
                request=request,
            )
        )


class ExitPassViewSet(viewsets.ModelViewSet):
    serializer_class = ExitPassSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return get_exit_passes_for_user(
            user=self.request.user,
            status_filter=self.request.query_params.get("status", "ALL"),
            search=self.request.query_params.get("search", "").strip(),
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        updated = change_exit_pass_status(user=request.user, exit_pass=self.get_object(), next_status="ACTIVE")
        return Response({"ok": True, "success": True, "status": updated.status})

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        updated = change_exit_pass_status(user=request.user, exit_pass=self.get_object(), next_status="REVOKED")
        return Response({"ok": True, "success": True, "status": updated.status})

    @action(detail=True, methods=["post"], url_path="mark-used")
    def mark_used(self, request, pk=None):
        updated = change_exit_pass_status(user=request.user, exit_pass=self.get_object(), next_status="USED")
        return Response({"ok": True, "success": True, "status": updated.status})