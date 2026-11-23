# D:\AttendSure_V3\backend\apps\accounts\views.py
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from common.audit import AuditedModelViewSet, record_audit_log
from common.exceptions import AppError
from common.permissions import IsSchoolLeader, get_user_role, is_school_leader
from common.phone import normalize_ph_phone
from .models import AuditLog, FacultyProfile, UserProfile
from .serializers import (
    FacultyDropdownSerializer,
    FacultyProfileSerializer,
    UserAccountSerializer,
)
from .services import (
    authenticate_with_identifier,
    build_user_session_payload,
    reset_faculty_bound_device,
    unlock_all_locked_accounts,
    update_own_profile,
)

User = get_user_model()


class LoginThrottle(AnonRateThrottle):
    rate = "15/minute"


class AccountWriteThrottle(UserRateThrottle):
    rate = "30/minute"


def _format_audit_row(item: AuditLog) -> dict:
    performer = (
        (item.performed_by.get_full_name() or item.performed_by.username).strip()
        if item.performed_by
        else "System"
    )
    return {
        "id": item.id,
        "table_name": item.table_name,
        "record_id": item.record_id,
        "action": item.action,
        "performed_by": performer,
        "user": performer,
        "client_ip": item.client_ip or "",
        "ip_address": item.client_ip or "",
        "changed_fields": item.changed_fields,
        "new_data": item.new_data,
        "created_at": timezone.localtime(item.created_at).strftime("%Y-%m-%d %I:%M:%S %p"),
    }


def _is_judge_demo_enabled() -> bool:
    return bool(getattr(settings, "DEBUG", False) or getattr(settings, "ENABLE_JUDGE_DEMO", False))


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        identifier = (
            request.data.get("username")
            or request.data.get("identifier")
            or request.data.get("email")
            or ""
        )
        password = request.data.get("password") or ""
        payload = authenticate_with_identifier(
            identifier=identifier,
            password=password,
            request=request,
        )
        user_obj = User.objects.filter(id=payload["user"]["id"]).first()
        if user_obj:
            drf_token, _ = Token.objects.get_or_create(user=user_obj)
            payload["token"] = drf_token.key

        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=payload["user"]["id"],
            action="LOGIN",
            new_data={"username": payload["user"]["username"], "role": payload["user"]["role"]},
        )
        return Response(payload, status=status.HTTP_200_OK)


class DemoStatusView(APIView):
    """Reports whether 1-click competition judge login is enabled by server config."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"enabled": _is_judge_demo_enabled()})


class DemoLoginView(APIView):
    """Authenticates a real seeded database account ONLY when DEBUG or ENABLE_JUDGE_DEMO is True."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]

    ROLE_MAP = {
        "ADMIN": ("demo_admin", ["ADMIN"]),
        "PRINCIPAL": ("demo_principal", ["PRINCIPAL", "ADMIN"]),
        "DEPT_HEAD": ("demo_dept_head", ["DEPT_HEAD", "PRINCIPAL"]),
        "FACULTY": ("demo_teacher", ["FACULTY"]),
        "TEACHER": ("demo_teacher", ["FACULTY"]),
        "PARENT": ("demo_parent", ["PARENT"]),
    }

    def post(self, request):
        if not _is_judge_demo_enabled():
            return Response(
                {"error": "Demo sign-in is disabled in production."},
                status=status.HTTP_404_NOT_FOUND,
            )

        role_key = str(request.data.get("role") or "ADMIN").strip().upper()
        preferred_username, allowed_roles = self.ROLE_MAP.get(role_key, ("demo_admin", ["ADMIN"]))

        user_obj = (
            User.objects.select_related("profile", "profile__faculty")
            .filter(username__iexact=preferred_username, is_active=True)
            .first()
        )
        if not user_obj:
            user_obj = (
                User.objects.select_related("profile", "profile__faculty")
                .filter(is_active=True, profile__role__in=allowed_roles)
                .order_by("id")
                .first()
            )
        if not user_obj:
            raise AppError(
                "ACCOUNT_NOT_FOUND",
                "No active database account exists for this role yet.",
                404,
            )

        refresh = RefreshToken.for_user(user_obj)
        drf_token, _ = Token.objects.get_or_create(user=user_obj)
        session_user = build_user_session_payload(user=user_obj, request=request)

        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=user_obj.id,
            action="LOGIN",
            new_data={"username": user_obj.username, "mode": "JUDGE_DEMO"},
        )
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "token": drf_token.key,
                "user": session_user,
            }
        )


class CurrentUserView(APIView):
    """Returns and updates the signed-in user's own profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(build_user_session_payload(user=request.user, request=request))

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
            if str(k) not in ("password", "csrfmiddlewaretoken")
        ]
        record_audit_log(
            request=request,
            table_name="user_profiles",
            record_id=request.user.id,
            action="PROFILE",
            changed_fields=changed_keys or ["profile"],
        )
        return Response(payload)

    def patch(self, request):
        return self.put(request)


CurrentProfileView = CurrentUserView


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AccountWriteThrottle]

    def post(self, request):
        current_password = str(
            request.data.get("current_password") or request.data.get("old_password") or ""
        )
        new_password = str(request.data.get("new_password") or "")
        if not current_password or not new_password:
            return Response(
                {"error": "Both current password and new password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(current_password):
            return Response(
                {"error": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            validate_password(new_password, user=request.user)
        except DjangoValidationError as exc:
            return Response({"error": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        request.user.set_password(new_password)
        request.user.save(update_fields=["password"])
        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=request.user.id,
            action="PASSWORD",
        )
        return Response({"ok": True, "message": "Password updated."})


class FieldAvailabilityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        field = str(request.query_params.get("field") or "").strip().lower()
        value = str(request.query_params.get("value") or "").strip()
        exclude_id = request.query_params.get("exclude_id")

        if not field or not value:
            return Response({"available": True, "is_taken": False})

        if field == "username":
            qs = User.objects.filter(username__iexact=value)
        elif field == "email":
            qs = User.objects.filter(email__iexact=value)
        elif field == "employee_id":
            qs = FacultyProfile.objects.filter(employee_id__iexact=value)
        elif field in ("phone", "phone_number", "contact_number"):
            norm = normalize_ph_phone(value)
            qs = UserProfile.objects.filter(phone_number=norm)
        else:
            return Response({"available": True, "is_taken": False})

        if exclude_id and str(exclude_id).isascii() and str(exclude_id).isdigit():
            qs = qs.exclude(id=int(exclude_id))

        taken = qs.exists()
        return Response({"available": not taken, "is_taken": taken})


ValidateFieldView = FieldAvailabilityView


class RegisterPushTokenView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [AccountWriteThrottle]

    def post(self, request):
        token = str(request.data.get("push_token") or request.data.get("token") or "").strip()
        if token and not token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
            return Response(
                {"error": "Invalid mobile push token format."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.push_token = token or None
        profile.save(update_fields=["push_token"])
        return Response({"ok": True, "registered": True})


SavePushTokenView = RegisterPushTokenView


class ResetBoundDeviceView(APIView):
    """Clears the phone hardware lock on a faculty profile so a replacement phone can be paired."""

    permission_classes = [permissions.IsAuthenticated, IsSchoolLeader]

    def post(self, request, pk: int | None = None, **kwargs):
        target_id = (
            pk
            or kwargs.get("faculty_id")
            or request.data.get("faculty_id")
            or request.data.get("teacher_id")
        )
        if not target_id or not str(target_id).isascii() or not str(target_id).isdigit():
            raise AppError("INVALID_ID", "Valid faculty profile ID is required.", 400)

        faculty = reset_faculty_bound_device(faculty_id=int(target_id))
        record_audit_log(
            request=request,
            table_name=faculty._meta.db_table,
            record_id=faculty.id,
            action="RESET_DEV",
            new_data={"employee_id": faculty.employee_id},
        )
        return Response({"ok": True, "message": f"Phone lock cleared for {faculty.full_name}."})


ResetDeviceBindingView = ResetBoundDeviceView


class UnlockAccountsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSchoolLeader]

    def post(self, request):
        unlocked_count = unlock_all_locked_accounts()
        record_audit_log(
            request=request,
            table_name="user_profiles",
            record_id=request.user.id,
            action="UNLOCK_ALL",
            new_data={"unlocked_count": unlocked_count},
        )
        return Response({"ok": True, "unlocked_count": unlocked_count})


class FacultyDropdownView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = (
            FacultyProfile.objects.select_related("department_ref", "position_ref")
            .filter(is_active=True)
            .order_by("last_name", "first_name")
        )
        return Response(FacultyDropdownSerializer(qs, many=True).data)


class FacultyProfileViewSet(AuditedModelViewSet):
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = FacultyProfile.objects.select_related(
            "account",
            "department_ref",
            "position_ref",
        ).order_by("last_name", "first_name")

        search = str(self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(employee_id__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(department_ref__name__icontains=search)
            )

        active_only = str(self.request.query_params.get("is_active") or "").strip().lower()
        if active_only in ("1", "true", "yes"):
            qs = qs.filter(is_active=True)

        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS and not is_school_leader(request.user):
            self.permission_denied(request, message="Only school leaders can modify faculty records.")


class UserAccountViewSet(AuditedModelViewSet):
    serializer_class = UserAccountSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = User.objects.select_related(
            "profile",
            "profile__faculty",
            "profile__faculty__department_ref",
            "profile__faculty__position_ref",
        ).order_by("username")

        if get_user_role(self.request.user) != "ADMIN" and not self.request.user.is_superuser:
            return qs.filter(id=self.request.user.id)

        search = str(self.request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(
                Q(username__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
            )
        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS:
            if get_user_role(request.user) != "ADMIN" and not request.user.is_superuser:
                self.permission_denied(
                    request, message="Only system administrators can manage user accounts."
                )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id:
            raise AppError("CANNOT_DELETE_SELF", "You cannot delete your own active account.", 400)
        return super().destroy(request, *args, **kwargs)


class AuditLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSchoolLeader]

    def get(self, request):
        limit_raw = str(request.query_params.get("limit") or "100")
        limit = min(int(limit_raw), 500) if (limit_raw.isascii() and limit_raw.isdigit()) else 100
        logs = AuditLog.objects.select_related("performed_by").order_by("-created_at")[:limit]
        results = [_format_audit_row(item) for item in logs]
        return Response({"results": results, "records": results, "count": len(results)})


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsSchoolLeader]
    queryset = AuditLog.objects.select_related("performed_by").order_by("-created_at")

    def list(self, request, *args, **kwargs):
        return AuditLogListView().get(request)