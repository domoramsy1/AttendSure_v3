from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from common.audit import AuditedModelViewSet, record_audit_log
from common.permissions import IsLeadershipOrReadOnly, IsSystemAdmin, is_school_leader
from .models import TeacherProfile, UserProfile
from .selectors import get_audit_logs_queryset
from .serializers import TeacherDropdownSerializer, TeacherSerializer, UserAccountSerializer
from .services import (
    build_user_session_payload,
    login_with_credentials,
    reset_teacher_bound_device,
    update_own_profile,
)

User = get_user_model()


class LoginThrottle(AnonRateThrottle):
    rate = "10/minute"


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        payload = login_with_credentials(
            request=request,
            username=str(request.data.get("username", "")).strip(),
            password=str(request.data.get("password", "")).strip(),
        )
        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=payload["user"]["id"],
            action="LOGIN",
        )
        return Response(payload, status=status.HTTP_200_OK)


class CurrentProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(build_user_session_payload(request.user, request))

    def post(self, request):
        return self.put(request)

    def put(self, request):
        payload = update_own_profile(
            user=request.user, data=request.data, files=request.FILES, request=request
        )
        cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])
        return Response(payload)

    def patch(self, request):
        return self.put(request)


class ValidateFieldView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _check(self, field: str, value: str, exclude_id):
        field = str(field or "").strip().lower()
        value = str(value or "").strip()
        if field == "username" and value:
            qs = User.objects.filter(username__iexact=value)
            if exclude_id and str(exclude_id).isdigit():
                qs = qs.exclude(id=int(exclude_id))
            taken = qs.exists()
            return {"valid": not taken, "is_taken": taken, "message": "Username already taken." if taken else ""}
        if field == "email" and value:
            try:
                validate_email(value)
            except DjangoValidationError:
                return {"valid": False, "is_taken": False, "message": "Invalid email format."}
            qs = User.objects.filter(email__iexact=value)
            if exclude_id and str(exclude_id).isdigit():
                qs = qs.exclude(id=int(exclude_id))
            taken = qs.exists()
            return {"valid": not taken, "is_taken": taken, "message": "Email already in use." if taken else ""}
        return {"valid": True, "is_taken": False, "message": ""}

    def get(self, request):
        return Response(
            self._check(
                request.query_params.get("field"),
                request.query_params.get("value"),
                request.query_params.get("exclude_id"),
            )
        )

    def post(self, request):
        data = request.data or request.query_params
        return Response(self._check(data.get("field"), data.get("value"), data.get("exclude_id")))


class SavePushTokenView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        token = str(request.data.get("push_token", "")).strip()
        if not token:
            return Response({"error": "push_token is required."}, status=status.HTTP_400_BAD_REQUEST)
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.push_token = token
        profile.save(update_fields=["push_token"])
        return Response({"ok": True, "success": True, "message": "Push token saved."})


class ResetDeviceBindingView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk=None):
        if not is_school_leader(request.user):
            return Response({"error": "Leadership access required."}, status=status.HTTP_403_FORBIDDEN)
        teacher_id = pk or request.data.get("teacher_id") or request.data.get("faculty_id")
        teacher = reset_teacher_bound_device(teacher_id=int(teacher_id))
        record_audit_log(request=request, table_name="faculty_profiles", record_id=teacher.id, action="RESET_DEV")
        return Response({"ok": True, "success": True, "message": f"Device binding cleared for {teacher.full_name}."})


def _format_audit_details(item) -> str:
    parts = [f"Target: {item.table_name}", f"#{item.record_id}"]
    fields = item.changed_fields
    if fields:
        if isinstance(fields, list):
            parts.append(f"Fields: {', '.join(str(f) for f in fields[:8])}")
        elif isinstance(fields, dict):
            parts.append(f"Fields: {', '.join(str(k) for k in list(fields.keys())[:8])}")
        else:
            parts.append(f"Fields: {str(fields)[:80]}")
    return " • ".join(parts)


class AuditLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        is_admin = is_school_leader(request.user)
        logs = get_audit_logs_queryset(
            user=request.user,
            search=request.query_params.get("search", "").strip(),
            action=request.query_params.get("action", "ALL").strip(),
            date_str=request.query_params.get("date", "").strip(),
        )
        records = []
        for item in logs:
            local_dt = timezone.localtime(item.created_at)
            actor = (
                (item.performed_by.get_full_name() or item.performed_by.username)
                if item.performed_by
                else "System"
            )
            records.append({
                "id": item.id,
                "timestamp": local_dt.strftime("%Y-%m-%d %I:%M:%S %p"),
                "time_only": local_dt.strftime("%I:%M:%S %p"),
                "date_only": local_dt.strftime("%Y-%m-%d"),
                "user": actor,
                "action": (item.action or "AUDIT").upper(),
                "module": (item.table_name or "SYSTEM").upper(),
                "details": _format_audit_details(item),
                "ip_address": item.client_ip or "127.0.0.1",
                "status": "SUCCESS",
            })
        return Response({
            "ok": True,
            "success": True,
            "is_admin": is_admin,
            "total_activities": len(records),
            "total": len(records),
            "records": records,
            "results": records,
        })


class AuditLogViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        return AuditLogListView().get(request)


class TeacherViewSet(AuditedModelViewSet):
    queryset = TeacherProfile.objects.select_related("account").order_by("last_name", "first_name")
    serializer_class = TeacherSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def _clear_dropdown_cache(self):
        cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._clear_dropdown_cache()

    def perform_update(self, serializer):
        super().perform_update(serializer)
        self._clear_dropdown_cache()

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        self._clear_dropdown_cache()

    @action(detail=False, methods=["get"], url_path="dropdown")
    def dropdown(self, request):
        include_all = str(request.query_params.get("include_all", "")).lower() in ("1", "true", "yes")
        cache_key = "teachers:dropdown:all" if include_all else "teachers:dropdown:active"
        rows = cache.get(cache_key)
        if rows is None:
            # Query TeacherProfile directly without select_related("account") so .only() never conflicts
            qs = TeacherProfile.objects.order_by("last_name", "first_name")
            if not include_all:
                qs = qs.filter(is_active=True)
            rows = list(
                qs.only(
                    "id", "employee_id", "first_name", "middle_name", "last_name", "suffix",
                    "department", "position", "contact_number", "email", "can_teach", "is_active", "photo",
                )
            )
            cache.set(cache_key, rows, timeout=15)

        return Response(TeacherDropdownSerializer(rows, many=True, context={"request": request}).data)


class UserAccountViewSet(AuditedModelViewSet):
    queryset = User.objects.select_related("profile", "profile__teacher").order_by("username")
    serializer_class = UserAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]

    def perform_create(self, serializer):
        super().perform_create(serializer)
        cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])

    def perform_update(self, serializer):
        super().perform_update(serializer)
        cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])