from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from common.permissions import IsLeadershipOrReadOnly, IsStaffOrFaculty
from .selectors import (
    get_campus_audit_history,
    get_campus_boundary_overview,
    get_emergency_roll_call,
    get_live_campus_anomalies,
)
from .serializers import CampusBoundaryInputSerializer, TeacherCheckInSerializer
from .services import record_teacher_check_in, update_campus_boundary


class CampusBoundaryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get(self, request):
        return Response(get_campus_boundary_overview(user=request.user))

    def put(self, request):
        payload = (
            {k: request.data.get(k) for k in request.data.keys()}
            if hasattr(request.data, "keys")
            else dict(request.data)
        )
        if "geofence_radius_meters" in payload and "radius_meters" not in payload:
            payload["radius_meters"] = payload["geofence_radius_meters"]
        serializer = CampusBoundaryInputSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        update_campus_boundary(request=request, **serializer.validated_data)
        return Response(get_campus_boundary_overview(user=request.user))

    def post(self, request):
        return self.put(request)

    def patch(self, request):
        return self.put(request)


class TeacherCheckInView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrFaculty]

    def post(self, request):
        serializer = TeacherCheckInSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = record_teacher_check_in(
            user=request.user,
            validated_data=serializer.validated_data,
            header_device_id=request.headers.get("X-Device-UUID", ""),
        )
        return Response(result, status=status.HTTP_201_CREATED)


class BoundaryAuditView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrFaculty]

    def get(self, request):
        return Response(get_campus_audit_history(user=request.user))


class CampusAnomalyListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrFaculty]

    def get(self, request):
        anomalies = get_live_campus_anomalies(user=request.user)
        return Response({"ok": True, "total": len(anomalies), "anomalies": anomalies, "results": anomalies})


class EmergencyRollCallView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsStaffOrFaculty]

    def get(self, request):
        return Response(get_emergency_roll_call(request=request))