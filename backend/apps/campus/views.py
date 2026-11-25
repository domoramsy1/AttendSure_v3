# AttendSure Backend - Campus API Views
# File: D:\AttendSure_V3\backend\apps\campus\views.py

import time
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.accounts.selectors import resolve_teacher_for_user
from apps.attendance.loafing_detector import detect_daily_student_loafing
from common.device_crypto import CHECKIN_CHALLENGE_TTL_SECONDS, issue_checkin_challenge_nonce
from common.exceptions import AppError
from common.permissions import (
    IsAdminOrPrincipalOrReadOnly,
    IsSchoolLeader,
    IsTeacherOrLeader,
    is_school_leader,
)
from .selectors import (
    format_loafing_incident,
    get_campus_audit_history,
    get_campus_boundary_overview,
    get_emergency_roll_call,
    get_loafing_incidents_queryset,
)
from .serializers import CampusBoundaryInputSerializer, TeacherGpsPingSerializer
from .services import (
    detect_silent_on_duty_teachers,
    record_teacher_gps_ping,
    resolve_loafing_incident,
    update_campus_boundary,
)


class GpsPingThrottle(UserRateThrottle):
    scope = "scan_ping"


class CampusOverviewView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrPrincipalOrReadOnly]

    def get(self, request):
        return Response(get_campus_boundary_overview(user=request.user, request=request))

    def put(self, request):
        serializer = CampusBoundaryInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_campus_boundary(request=request, **serializer.validated_data)
        return Response(get_campus_boundary_overview(user=request.user, request=request))

    def post(self, request):
        return self.put(request)

    def patch(self, request):
        return self.put(request)


CampusBoundaryView = CampusOverviewView


class TeacherGpsPingView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]
    throttle_classes = [GpsPingThrottle]

    def post(self, request):
        serializer = TeacherGpsPingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = record_teacher_gps_ping(
            user=request.user,
            validated_data=serializer.validated_data,
            header_device_id=request.headers.get("X-Device-UUID", ""),
            is_checkin=False,
            request=request,
        )
        return Response(result, status=status.HTTP_201_CREATED)


class TeacherCheckInChallengeView(APIView):
    """Issues a short-lived single-use challenge nonce for asymmetric Teacher Time In / Out signing."""

    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]
    throttle_classes = [GpsPingThrottle]

    def get(self, request):
        teacher = resolve_teacher_for_user(request.user)
        if not teacher:
            raise AppError("NO_TEACHER_PROFILE", "No active teacher profile is linked to this account.", 403)
        nonce = issue_checkin_challenge_nonce(teacher.id)
        return Response(
            {
                "ok": True,
                "nonce": nonce,
                "expires_in_seconds": CHECKIN_CHALLENGE_TTL_SECONDS,
                "server_time_ms": int(time.time() * 1000),
            },
            status=status.HTTP_200_OK,
        )


class TeacherCheckInView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]
    throttle_classes = [GpsPingThrottle]

    def post(self, request):
        serializer = TeacherGpsPingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action_val = str(serializer.validated_data.get("action") or "CHECK_IN").upper()
        is_checkout = action_val in ("CHECK_OUT", "TIME_OUT", "TIME_OUT_AM", "TIME_OUT_PM")
        result = record_teacher_gps_ping(
            user=request.user,
            validated_data=serializer.validated_data,
            header_device_id=request.headers.get("X-Device-UUID", ""),
            is_checkin=not is_checkout,
            is_checkout=is_checkout,
            request=request,
        )
        return Response(result, status=status.HTTP_201_CREATED)

class BoundaryAuditView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get(self, request):
        return Response(get_campus_audit_history(user=request.user, request=request))


class LoafingIncidentViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get_queryset(self):
        return get_loafing_incidents_queryset(
            user=self.request.user,
            incident_type=str(self.request.query_params.get("incident_type") or ""),
            status_filter=str(self.request.query_params.get("status") or ""),
            date_str=str(self.request.query_params.get("date") or ""),
        )

    def list(self, request, *args, **kwargs):
        items = [format_loafing_incident(inc) for inc in self.get_queryset()[:200]]
        return Response({"ok": True, "count": len(items), "results": items, "incidents": items})

    def retrieve(self, request, *args, **kwargs):
        return Response(format_loafing_incident(self.get_object()))

    def update(self, request, *args, **kwargs):
        if not is_school_leader(request.user):
            self.permission_denied(
                request,
                message="Only school leaders can resolve or update loafing incidents.",
            )
        incident = self.get_object()
        updated = resolve_loafing_incident(
            request=request,
            incident=incident,
            next_status=str(request.data.get("status") or ""),
            remarks=str(request.data.get("remarks") or ""),
        )
        formatted = format_loafing_incident(updated)
        return Response({"ok": True, **formatted, "incident": formatted})

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    @action(
        detail=True,
        methods=["post"],
        url_path="resolve",
        permission_classes=[permissions.IsAuthenticated, IsSchoolLeader],
    )
    def resolve(self, request, pk=None):
        incident = self.get_object()
        updated = resolve_loafing_incident(
            request=request,
            incident=incident,
            next_status=str(request.data.get("status") or ""),
            remarks=str(request.data.get("remarks") or ""),
        )
        return Response({"ok": True, "incident": format_loafing_incident(updated)})

    @action(
        detail=False,
        methods=["post"],
        url_path="run-audit",
        permission_classes=[permissions.IsAuthenticated, IsTeacherOrLeader],
    )
    def run_audit(self, request):
        sec_id = request.data.get("section_id")
        parsed_sec = int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        summary = detect_daily_student_loafing(section_id=parsed_sec, user=request.user)
        created_signal_lost = 0
        if is_school_leader(request.user) and parsed_sec is None:
            sig = detect_silent_on_duty_teachers()
            created_signal_lost = int(sig.get("created_signal_lost_incidents", 0))
        summary = {
            **summary,
            "created_signal_lost_incidents": created_signal_lost,
            "total_created": int(summary.get("total_created", 0)) + created_signal_lost,
        }
        return Response(summary, status=status.HTTP_200_OK)


class CampusAnomalyListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get(self, request):
        qs = get_loafing_incidents_queryset(
            user=request.user,
            status_filter=str(request.query_params.get("status") or "OPEN"),
        )
        incidents = [format_loafing_incident(inc) for inc in qs[:100]]
        return Response(
            {
                "ok": True,
                "total": len(incidents),
                "anomalies": incidents,
                "results": incidents,
            }
        )


class EmergencyRollCallView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsTeacherOrLeader]

    def get(self, request):
        return Response(get_emergency_roll_call(request=request))
