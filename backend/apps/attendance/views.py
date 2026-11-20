from datetime import datetime
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import AuditedModelViewSet, record_audit_log
from common.exceptions import AppError
from common.permissions import get_user_role, is_school_leader
from .models import ClassAttendance, DailyAttendance
from .selectors import (
    PASS_FACULTY_FIELD,
    get_adviser_matrix,
    get_assigned_classes_with_class_lists,
    get_attendance_logs,
    get_exit_passes_for_user,
    get_faculty_student_ids,
    get_section_class_list,
    resolve_faculty_for_user,
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
        if not student_id or not str(student_id).isdigit():
            return Response({"error": "Valid student_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        per_id = request.data.get("schedule_id") or request.data.get("period_id")
        log = save_manual_attendance(
            user=request.user,
            student_id=int(student_id),
            status_code=str(request.data.get("status", "PRESENT")),
            period_id=int(per_id) if (per_id and str(per_id).isdigit()) else None,
            date_str=request.data.get("attendance_date"),
        )
        record_audit_log(
            request=request,
            table_name=log._meta.db_table,
            record_id=log.id,
            action="CREATE",
            new_data={"student_id": log.student_id, "status": log.status},
        )
        return Response({"ok": True, "success": True, "id": log.id, "status": log.status}, status=status.HTTP_201_CREATED)

    def put(self, request):
        rec_id = request.data.get("id") or request.query_params.get("id")
        if rec_id is not None and str(rec_id).strip() != "":
            if not str(rec_id).isdigit():
                return Response({"error": "Valid attendance record id is required."}, status=status.HTTP_400_BAD_REQUEST)
            existing = ClassAttendance.objects.filter(id=int(rec_id)).first()
            if not existing:
                return Response({"error": "Attendance record not found."}, status=status.HTTP_404_NOT_FOUND)
            log = save_manual_attendance(
                user=request.user,
                student_id=existing.student_id,
                status_code=str(request.data.get("status", existing.status)),
                period_id=existing.class_period_id,
                date_str=str(existing.attendance_date),
            )
            record_audit_log(
                request=request,
                table_name=log._meta.db_table,
                record_id=log.id,
                action="UPDATE",
                new_data={"student_id": log.student_id, "status": log.status},
            )
            return Response({"ok": True, "success": True, "id": log.id, "status": log.status})
        return self.post(request)

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        if get_user_role(request.user) == "PARENT":
            return Response({"error": "Parent accounts cannot remove attendance records."}, status=status.HTTP_403_FORBIDDEN)

        rec_id = request.data.get("id") or request.query_params.get("id")
        if not rec_id or not str(rec_id).isdigit():
            return Response({"error": "Valid attendance record id is required."}, status=status.HTTP_400_BAD_REQUEST)

        existing = ClassAttendance.objects.filter(id=int(rec_id)).first()
        if not existing:
            return Response({"error": "Attendance record not found."}, status=status.HTTP_404_NOT_FOUND)

        if not is_school_leader(request.user):
            faculty_member = resolve_faculty_for_user(request.user)
            if not faculty_member or existing.student_id not in get_faculty_student_ids(faculty_member):
                return Response({"error": "You can only remove attendance for your assigned students."}, status=status.HTTP_403_FORBIDDEN)

        student_id = existing.student_id
        att_date = existing.attendance_date
        rec_pk = existing.id
        existing.delete()

        remaining = ClassAttendance.objects.filter(student_id=student_id, attendance_date=att_date).order_by("-scanned_at").first()
        if remaining:
            DailyAttendance.objects.filter(student_id=student_id, attendance_date=att_date).update(status=remaining.status)
        else:
            DailyAttendance.objects.filter(student_id=student_id, attendance_date=att_date).delete()

        record_audit_log(
            request=request,
            table_name=ClassAttendance._meta.db_table,
            record_id=rec_pk,
            action="DELETE",
            new_data={"student_id": student_id, "attendance_date": str(att_date)},
        )
        return Response({"ok": True, "success": True, "message": "Attendance record removed."})


class AssignedClassListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        view_all = str(request.query_params.get("mode", "")).lower() == "all"
        summary_only = str(request.query_params.get("summary", "")).lower() in ("1", "true", "yes")
        return Response(
            get_assigned_classes_with_class_lists(
                user=request.user,
                view_all=view_all,
                include_students=not summary_only,
                request=request,
            )
        )


class SectionStudentListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        sec_id = request.query_params.get("section_id") or request.query_params.get("section")
        parsed_id = int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        return Response(get_section_class_list(user=request.user, section_id=parsed_id, request=request))


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


class ExitPassViewSet(AuditedModelViewSet):
    serializer_class = ExitPassSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return get_exit_passes_for_user(
            user=self.request.user,
            status_filter=self.request.query_params.get("status", "ALL"),
            search=self.request.query_params.get("search", "").strip(),
        )

    def _assert_can_modify_pass(self, instance):
        user = self.request.user
        if get_user_role(user) == "PARENT":
            raise AppError("FORBIDDEN", "Parent accounts cannot modify or delete exit passes.", 403)
        if is_school_leader(user):
            return
        own_faculty = resolve_faculty_for_user(user)
        pass_faculty_id = getattr(instance, f"{PASS_FACULTY_FIELD}_id", None)
        if not own_faculty or (instance.issued_by_id != own_faculty.id and pass_faculty_id != own_faculty.id):
            raise AppError("FORBIDDEN", "You can only edit or remove exit passes you issued.", 403)
        if instance.status == "USED":
            raise AppError("PASS_LOCKED", "Used exit passes cannot be modified by non-administrators.", 400)

    def perform_update(self, serializer):
        self._assert_can_modify_pass(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._assert_can_modify_pass(instance)
        super().perform_destroy(instance)

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