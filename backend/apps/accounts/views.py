# D:\AttendSure_V3\backend\apps\accounts\views.py

from datetime import date as dt_date
from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import AuditedModelViewSet, record_audit_log
from common.exceptions import AppError
from common.permissions import (
    IsLeadershipOrStaffReadOnly,
    IsSchoolLeader,
    IsStaffOrFaculty,
    IsSystemAdmin,
    get_user_role,
    is_school_leader,
)
from .models import AuditLog, TeacherProfile, UserProfile
from .serializers import TeacherDropdownSerializer, TeacherSerializer, UserAccountSerializer
from .services import (
    build_user_session_payload,
    invalidate_user_and_teacher_caches,
    login_with_credentials,
    login_with_demo_role,
    reset_teacher_bound_device,
    unlock_all_locked_accounts,
    update_own_profile,
)


def _format_audit_row(row: AuditLog) -> dict:
    local_dt = timezone.localtime(row.created_at)
    actor = row.performed_by
    actor_name = (actor.get_full_name() or actor.username) if actor else "system"

    details_parts = []
    if getattr(row, "changed_fields", None):
        details_parts.append(f"Updated: {', '.join(str(f) for f in row.changed_fields)}")
    elif getattr(row, "new_data", None) and isinstance(row.new_data, dict):
        summary = ", ".join(
            f"{k}={v}" for k, v in list(row.new_data.items())[:3] if str(k).lower() not in ("password", "token")
        )
        if summary:
            details_parts.append(summary)

    return {
        "id": row.id,
        "timestamp": local_dt.strftime("%Y-%m-%d %I:%M:%S %p"),
        "time_only": local_dt.strftime("%I:%M:%S %p"),
        "date_only": local_dt.strftime("%Y-%m-%d"),
        "user": actor_name,
        "username": actor.username if actor else "system",
        "action": row.action,
        "module": row.table_name,
        "details": " • ".join(details_parts) or f"{row.action} on {row.table_name} #{row.record_id}",
        "ip_address": row.client_ip or "",
        "status": "SUCCESS",
    }


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        username = str(request.data.get("username") or "")
        password = str(request.data.get("password") or "")
        payload = login_with_credentials(request=request, username=username, password=password)
        user_obj = payload.get("user") or {}
        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=int(user_obj.get("id") or 0),
            action="LOGIN",
            new_data={"username": user_obj.get("username", username)},
        )
        return Response(payload, status=status.HTTP_200_OK)


def _is_judge_demo_enabled() -> bool:
    return bool(getattr(settings, "DEBUG", False) or getattr(settings, "ENABLE_JUDGE_DEMO", False))


class DemoStatusView(APIView):
    """Reports whether 1-Click Judge Demo Mode is enabled in this deployment."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        enabled = _is_judge_demo_enabled()
        return Response(
            {
                "enabled": enabled,
                "roles": [
                    {
                        "role": "admin",
                        "label": "System Admin",
                        "description": "Full Command Center, UN SDG Impact, Ed-Fi Export, Access & Audit Logs",
                    },
                    {
                        "role": "principal",
                        "label": "School Principal",
                        "description": "Executive Dashboard, Dropout Early-Warning, SF4 Consolidated & Exit Pass Approvals",
                    },
                    {
                        "role": "faculty",
                        "label": "Class Adviser / Faculty",
                        "description": "Live USB QR Scanner, Daily Class List, SF1/SF2 Forms & Parent Messaging",
                    },
                    {
                        "role": "parent",
                        "label": "Parent / Guardian",
                        "description": "Real-time Child Attendance Portal, Push Alerts & Faculty Chat",
                    },
                ]
                if enabled
                else [],
            }
        )


class DemoLoginView(APIView):
    """1-Click Judge Demo sign-in. Strictly disabled (404) when DEBUG=False and ENABLE_JUDGE_DEMO=False."""

    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not _is_judge_demo_enabled():
            return Response(
                {"error": "Judge Demo Mode is disabled in this environment."},
                status=status.HTTP_404_NOT_FOUND,
            )
        role = str(request.data.get("role") or "admin").strip()
        payload = login_with_demo_role(request=request, role=role)
        user_obj = payload.get("user") or {}
        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=int(user_obj.get("id") or 0),
            action="DEMO_LOGIN",
            new_data={"role": role, "username": user_obj.get("username", "")},
        )
        return Response(payload, status=status.HTTP_200_OK)


class CurrentUserView(APIView):
    """Returns and updates the signed-in user's profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(build_user_session_payload(request.user, request))

    def put(self, request):
        payload = update_own_profile(
            user=request.user,
            data=request.data,
            files=request.FILES,
            request=request,
        )
        changed_keys = [
            str(k)
            for k in (request.data.keys() if hasattr(request.data, "keys") else ["profile"])
            if str(k).lower() not in ("password", "current_password", "new_password")
        ]
        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=request.user.id,
            action="PROFILE",
            changed_fields=changed_keys or ["profile"],
        )
        return Response(payload, status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)


MeView = CurrentUserView
CurrentProfileView = CurrentUserView


class ValidateFieldView(APIView):
    """Checks if a username, employee_id, or email is already used (Staff/Leaders only)."""

    permission_classes = [permissions.IsAuthenticated, IsStaffOrFaculty]

    def get(self, request):
        field = str(request.query_params.get("field") or "username").strip().lower()
        value = str(request.query_params.get("value") or "").strip()[:254]
        exclude_raw = request.query_params.get("exclude_id")
        exclude_id = int(exclude_raw) if (exclude_raw and str(exclude_raw).isdigit()) else None

        if not value:
            return Response({"is_taken": False, "valid": True, "message": ""})

        is_taken = False
        message = ""

        if field == "username":
            qs = User.objects.filter(username__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            is_taken = qs.exists()
            if is_taken:
                message = "Username is already taken."
        elif field == "employee_id":
            qs = TeacherProfile.objects.filter(employee_id__iexact=value)
            if exclude_id:
                qs = qs.exclude(account__user_id=exclude_id).exclude(id=exclude_id)
            is_taken = qs.exists()
            if is_taken:
                message = "Employee ID is already assigned."
        elif field == "email":
            qs = User.objects.filter(email__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            is_taken = qs.exists()
            if is_taken:
                message = "Email address is already in use."

        return Response({"is_taken": is_taken, "valid": not is_taken, "message": message})


class PushTokenUpdateView(APIView):
    """Saves the mobile push notification token for the signed-in user."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        token = str(
            request.data.get("push_token")
            or request.data.get("expo_push_token")
            or request.data.get("token")
            or ""
        ).strip()[:255]
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.push_token = token or None
        profile.save(update_fields=["push_token"])
        return Response({"ok": True, "registered": bool(token)})


SavePushTokenView = PushTokenUpdateView


class ResetDeviceLockView(APIView):
    """Clears the phone hardware lock on a teacher profile so a replacement phone can be paired."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int | None = None):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ("ADMIN", "SUPERADMIN", "PRINCIPAL")):
            raise AppError("FORBIDDEN", "Only School Principals or System Admins can reset device locks.", 403)

        target_id = pk or request.data.get("teacher_id") or request.data.get("faculty_id")
        if not target_id or not str(target_id).isdigit():
            raise AppError("INVALID_ID", "A valid teacher ID is required.", 400)

        teacher = reset_teacher_bound_device(teacher_id=int(target_id))
        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="SECURITY",
            new_data={"reset_device_for": teacher.full_name},
        )
        return Response({"ok": True, "message": f"Phone hardware lock cleared for {teacher.full_name}."})


ResetDeviceBindingView = ResetDeviceLockView


class UnlockAccountsView(APIView):
    """Unlocks all locked user accounts and clears failed sign-in counters (Principals & Admins)."""

    permission_classes = [permissions.IsAuthenticated, IsSchoolLeader]

    def post(self, request):
        unlocked = unlock_all_locked_accounts()
        record_audit_log(
            request=request,
            table_name="user_profiles",
            record_id=0,
            action="SECURITY",
            new_data={"unlocked_accounts": unlocked},
        )
        return Response(
            {
                "ok": True,
                "unlocked_count": unlocked,
                "message": f"Unlocked {unlocked} account(s) and cleared failed sign-in attempts.",
            }
        )


class AuditLogListView(APIView):
    """Returns user activity and security audit logs."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        leader = is_school_leader(request.user)
        qs = AuditLog.objects.select_related("performed_by").order_by("-created_at")
        if not leader:
            qs = qs.filter(performed_by=request.user)

        search = str(request.query_params.get("search") or "").strip()[:80]
        action_filter = str(request.query_params.get("action") or "ALL").strip().upper()
        date_filter = str(request.query_params.get("date") or "").strip()

        if action_filter and action_filter != "ALL":
            qs = qs.filter(action__icontains=action_filter)
        if date_filter:
            try:
                parsed_date = dt_date.fromisoformat(date_filter)
                qs = qs.filter(created_at__date=parsed_date)
            except ValueError:
                raise AppError("INVALID_DATE", "Date filter must be in YYYY-MM-DD format.", 400)
        if search:
            qs = qs.filter(
                Q(performed_by__username__icontains=search)
                | Q(performed_by__first_name__icontains=search)
                | Q(performed_by__last_name__icontains=search)
                | Q(action__icontains=search)
                | Q(table_name__icontains=search)
            )

        records = [_format_audit_row(row) for row in qs[:150]]
        return Response(
            {
                "is_admin": leader,
                "count": len(records),
                "records": records,
                "results": records,
            }
        )


ActivityLogListView = AuditLogListView


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only viewset for audit log entries."""

    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = AuditLog.objects.select_related("performed_by").order_by("-created_at")
        if not is_school_leader(self.request.user):
            qs = qs.filter(performed_by=self.request.user)
        return qs

    def list(self, request, *args, **kwargs):
        return AuditLogListView().get(request)

    def retrieve(self, request, pk=None, *args, **kwargs):
        if not pk or not str(pk).isdigit():
            return Response({"error": "Invalid audit log ID."}, status=status.HTTP_400_BAD_REQUEST)
        row = self.get_queryset().filter(pk=int(pk)).first()
        if not row:
            return Response({"error": "Audit log entry not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_format_audit_row(row))


class TeacherViewSet(AuditedModelViewSet):
    queryset = TeacherProfile.objects.select_related("account").order_by("last_name", "first_name")
    serializer_class = TeacherSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrStaffReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get("department", "").strip()
        search = self.request.query_params.get("search", "").strip()[:80]
        if dept:
            qs = qs.filter(department__iexact=dept)
        if search:
            qs = qs.filter(
                Q(employee_id__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(position__icontains=search)
                | Q(department__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        super().perform_create(serializer)
        invalidate_user_and_teacher_caches(teacher_id=serializer.instance.id)

    def perform_update(self, serializer):
        super().perform_update(serializer)
        account = getattr(serializer.instance, "account", None)
        invalidate_user_and_teacher_caches(
            user_id=account.user_id if account else None,
            teacher_id=serializer.instance.id,
        )

    def perform_destroy(self, instance):
        account = getattr(instance, "account", None)
        user_id = account.user_id if account else None
        teacher_id = instance.id
        super().perform_destroy(instance)
        invalidate_user_and_teacher_caches(user_id=user_id, teacher_id=teacher_id)

    @action(
        detail=False,
        methods=["get"],
        url_path="dropdown",
        permission_classes=[permissions.IsAuthenticated, IsStaffOrFaculty],
    )
    def dropdown(self, request):
        include_all = str(request.query_params.get("include_all", "")).lower() in ("1", "true", "yes")
        cache_key = "teachers:dropdown:all" if include_all else "teachers:dropdown:active"
        rows = cache.get(cache_key)
        if rows is None:
            qs = TeacherProfile.objects.order_by("last_name", "first_name")
            if not include_all:
                qs = qs.filter(is_active=True)
            rows = list(
                qs.only(
                    "id",
                    "employee_id",
                    "first_name",
                    "middle_name",
                    "last_name",
                    "suffix",
                    "department",
                    "position",
                    "contact_number",
                    "email",
                    "can_teach",
                    "is_active",
                    "photo",
                )
            )
            cache.set(cache_key, rows, timeout=30)

        return Response(TeacherDropdownSerializer(rows, many=True, context={"request": request}).data)


class UserAccountViewSet(AuditedModelViewSet):
    queryset = User.objects.select_related("profile", "profile__teacher").order_by("username")
    serializer_class = UserAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()[:80]
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        super().perform_create(serializer)
        prof = getattr(serializer.instance, "profile", None)
        invalidate_user_and_teacher_caches(
            user_id=serializer.instance.id,
            teacher_id=prof.teacher_id if prof else None,
        )

    def perform_update(self, serializer):
        super().perform_update(serializer)
        prof = getattr(serializer.instance, "profile", None)
        invalidate_user_and_teacher_caches(
            user_id=serializer.instance.id,
            teacher_id=prof.teacher_id if prof else None,
        )

    def perform_destroy(self, instance):
        if instance.id == self.request.user.id:
            raise AppError("SELF_DELETE_FORBIDDEN", "You cannot delete your own currently signed-in account.", 400)
        user_id = instance.id
        prof = getattr(instance, "profile", None)
        teacher_id = prof.teacher_id if prof else None
        super().perform_destroy(instance)
        invalidate_user_and_teacher_caches(user_id=user_id, teacher_id=teacher_id)