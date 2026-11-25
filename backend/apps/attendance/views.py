# AttendSure Backend - Attendance API Views
# File: D:\AttendSure_V3\backend\apps\attendance\views.py

from datetime import datetime
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.accounts.selectors import get_teacher_enrollment_ids, resolve_teacher_for_user
from common.audit import AuditedModelViewSet, record_audit_log
from common.exceptions import AppError
from common.permissions import IsSchoolLeader, IsTeacherOrLeader, is_school_leader
from .loafing_detector import detect_daily_student_loafing
from .models import ClassAttendance, DailyAttendance
from .selectors import (
    get_adviser_matrix,
    get_assigned_classes_with_class_lists,
    get_attendance_logs,
    get_exit_passes_for_user,
    get_section_class_list,
)
from .serializers import ExitPassSerializer
from .services import (
    _invalidate_live_attendance_caches,
    mark_unscanned_students_absent,
    recompute_daily_attendance,
    record_student_qr_scan,
    save_manual_attendance,
    sync_offline_qr_scans,
    update_exit_pass_lifecycle,
)


class ScanThrottle(UserRateThrottle):
    scope = "scan_ping"


class ScanStudentQrView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]
    throttle_classes = [ScanThrottle]

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
            client_scan_uuid=request.data.get("client_scan_uuid"),
            latitude=request.data.get("latitude"),
            longitude=request.data.get("longitude"),
            accuracy=request.data.get("accuracy"),
            is_mock_location=bool(request.data.get("is_mock_location", False)),
            request=request,
        )
        code = status.HTTP_200_OK if result["is_duplicate"] else status.HTTP_201_CREATED
        return Response(result, status=code)


class OfflineQrSyncView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]
    throttle_classes = [ScanThrottle]

    def post(self, request):
        scans = request.data.get("scans") or []
        if not isinstance(scans, list) or not scans:
            return Response({"error": "Non-empty scans list is required."}, status=status.HTTP_400_BAD_REQUEST)
        return Response(sync_offline_qr_scans(user=request.user, raw_scans=scans))


class StudentLoafingAuditView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def post(self, request):
        date_str = request.data.get("date")
        target_date = None
        if date_str:
            try:
                target_date = datetime.strptime(str(date_str), "%Y-%m-%d").date()
            except ValueError:
                return Response({"error": "Invalid date format (use YYYY-MM-DD)."}, status=status.HTTP_400_BAD_REQUEST)
        sec_id = request.data.get("section_id")
        parsed_sec = int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        result = detect_daily_student_loafing(
            target_date=target_date,
            section_id=parsed_sec,
            user=request.user,
        )
        return Response(result, status=status.HTTP_200_OK)


class ClassAttendanceView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

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
            new_data={"enrollment_id": log.enrollment_id, "status": log.status},
        )
        return Response({"ok": True, "success": True, "id": log.id, "status": log.status}, status=status.HTTP_201_CREATED)

    def put(self, request):
        rec_id = request.data.get("id") or request.query_params.get("id")
        if rec_id is not None and str(rec_id).strip() != "":
            if not str(rec_id).isdigit():
                return Response({"error": "Valid attendance record id is required."}, status=status.HTTP_400_BAD_REQUEST)
            existing = ClassAttendance.objects.select_related("enrollment").filter(id=int(rec_id)).first()
            if not existing:
                return Response({"error": "Attendance record not found."}, status=status.HTTP_404_NOT_FOUND)
            log = save_manual_attendance(
                user=request.user,
                student_id=existing.enrollment.student_id,
                status_code=str(request.data.get("status", existing.status)),
                period_id=existing.class_period_id,
                date_str=str(existing.attendance_date),
            )
            record_audit_log(
                request=request,
                table_name=log._meta.db_table,
                record_id=log.id,
                action="UPDATE",
                new_data={"enrollment_id": log.enrollment_id, "status": log.status},
            )
            return Response({"ok": True, "success": True, "id": log.id, "status": log.status})
        return self.post(request)

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        rec_id = request.data.get("id") or request.query_params.get("id")
        if not rec_id or not str(rec_id).isdigit():
            return Response({"error": "Valid attendance record id is required."}, status=status.HTTP_400_BAD_REQUEST)

        existing = ClassAttendance.objects.select_related("enrollment__section__adviser").filter(id=int(rec_id)).first()
        if not existing:
            return Response({"error": "Attendance record not found."}, status=status.HTTP_404_NOT_FOUND)

        if not is_school_leader(request.user):
            teacher = resolve_teacher_for_user(request.user)
            if not teacher or existing.enrollment_id not in get_teacher_enrollment_ids(teacher):
                return Response(
                    {"error": "You can only remove attendance for your assigned students."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        enr_id = existing.enrollment_id
        att_date = existing.attendance_date
        rec_pk = existing.id
        adviser_uid = (
            existing.enrollment.section.adviser.user_id
            if (
                existing.enrollment
                and existing.enrollment.section
                and existing.enrollment.section.adviser_id
                and existing.enrollment.section.adviser
            )
            else None
        )
        existing.delete()
        recompute_daily_attendance(enrollment_id=enr_id, attendance_date=att_date)

        _invalidate_live_attendance_caches(user_id=request.user.id, adviser_user_id=adviser_uid)

        record_audit_log(
            request=request,
            table_name=ClassAttendance._meta.db_table,
            record_id=rec_pk,
            action="DELETE",
            new_data={"enrollment_id": enr_id, "attendance_date": str(att_date)},
        )
        return Response({"ok": True, "success": True, "message": "Attendance record removed."})


class MarkUnscannedAbsentView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def post(self, request):
        per_id = request.data.get("schedule_id") or request.data.get("period_id")
        sec_id = request.data.get("section_id") or request.data.get("section")
        date_str = request.data.get("attendance_date") or request.data.get("date")
        result = mark_unscanned_students_absent(
            user=request.user,
            period_id=int(per_id) if (per_id and str(per_id).isdigit()) else None,
            section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
            date_str=str(date_str) if date_str else None,
        )
        record_audit_log(
            request=request,
            table_name=ClassAttendance._meta.db_table,
            record_id=result["period_id"],
            action="BULK_ABSENT",
            new_data={
                "period_id": result["period_id"],
                "section_id": result["section_id"],
                "attendance_date": result["attendance_date"],
                "marked_absent_count": result["marked_absent_count"],
                "marked_excused_count": result["marked_excused_count"],
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class AssignedClassListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

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
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get(self, request):
        sec_id = request.query_params.get("section_id") or request.query_params.get("section")
        parsed_id = int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        return Response(get_section_class_list(user=request.user, section_id=parsed_id, request=request))


class AdviserMatrixView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get(self, request):
        sec_id = request.query_params.get("section_id")
        date_str = request.query_params.get("date")
        target_date = None
        if date_str:
            try:
                target_date = datetime.strptime(str(date_str), "%Y-%m-%d").date()
            except ValueError:
                return Response(
                    {"error": "Invalid date format (use YYYY-MM-DD)."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return Response(
            get_adviser_matrix(
                user=request.user,
                section_id=int(sec_id) if (sec_id and str(sec_id).isdigit()) else None,
                target_date=target_date,
                request=request,
            )
        )


class ExitPassViewSet(AuditedModelViewSet):
    serializer_class = ExitPassSerializer
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get_queryset(self):
        return get_exit_passes_for_user(
            user=self.request.user,
            status_filter=self.request.query_params.get("status", "ALL"),
            search=self.request.query_params.get("search", "").strip(),
        )

    def _assert_can_modify_pass(self, instance):
        user = self.request.user
        if is_school_leader(user):
            return
        own_teacher = resolve_teacher_for_user(user)
        if instance.issued_by_id != user.id and (not own_teacher or instance.teacher_id != own_teacher.id):
            raise AppError("FORBIDDEN", "You can only edit or remove exit passes you issued.", 403)
        if instance.returned_at is not None:
            raise AppError("PASS_LOCKED", "Returned exit passes cannot be modified.", 400)
        if instance.pass_scope == "TEACHER" and instance.is_approved:
            raise AppError(
                "PASS_LOCKED",
                "Approved teacher locator slips can only be changed or removed by a school leader.",
                403,
            )

    def perform_update(self, serializer):
        self._assert_can_modify_pass(serializer.instance)
        super().perform_update(serializer)

    def perform_destroy(self, instance):
        self._assert_can_modify_pass(instance)
        super().perform_destroy(instance)

    @action(
        detail=True,
        methods=["post"],
        url_path="approve",
        permission_classes=[permissions.IsAuthenticated, IsSchoolLeader],
    )
    def approve(self, request, pk=None):
        updated = update_exit_pass_lifecycle(user=request.user, exit_pass=self.get_object(), action_name="APPROVE")
        record_audit_log(
            request=request,
            table_name=updated._meta.db_table,
            record_id=updated.id,
            action="APPROVE",
            new_data={"pass_number": updated.pass_number, "pass_scope": updated.pass_scope},
        )
        return Response(
            {
                "ok": True,
                "success": True,
                "approved": True,
                "is_approved": updated.is_approved,
                "approved_by_name": (
                    (updated.approved_by.get_full_name() or updated.approved_by.username).strip()
                    if updated.approved_by
                    else ""
                ),
                "approved_at": updated.approved_at.isoformat() if updated.approved_at else None,
                "pass_status": updated.pass_status,
                "status": updated.pass_status,
                "issued_by_name": (
                    (updated.issued_by.get_full_name() or updated.issued_by.username).strip()
                    if updated.issued_by
                    else "School Staff"
                ),
            }
        )

    @action(detail=True, methods=["post"], url_path="mark-returned")
    def mark_returned(self, request, pk=None):
        updated = update_exit_pass_lifecycle(user=request.user, exit_pass=self.get_object(), action_name="RETURN")
        record_audit_log(
            request=request,
            table_name=updated._meta.db_table,
            record_id=updated.id,
            action="RETURN",
            new_data={"pass_number": updated.pass_number, "pass_scope": updated.pass_scope},
        )
        return Response({"ok": True, "success": True, "pass_status": updated.pass_status, "status": updated.pass_status})

    @action(detail=True, methods=["post"], url_path="mark-used")
    def mark_used(self, request, pk=None):
        return self.mark_returned(request, pk=pk)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        updated = update_exit_pass_lifecycle(user=request.user, exit_pass=self.get_object(), action_name="CANCEL")
        record_audit_log(
            request=request,
            table_name=updated._meta.db_table,
            record_id=updated.id,
            action="CANCEL",
            new_data={"pass_number": updated.pass_number, "pass_scope": updated.pass_scope},
        )
        return Response({"ok": True, "success": True, "pass_status": updated.pass_status, "status": updated.pass_status})

    @action(detail=True, methods=["post"], url_path="decline")
    def decline(self, request, pk=None):
        return self.cancel(request, pk=pk)
