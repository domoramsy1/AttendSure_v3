# D:\AttendSure_V3\backend\apps\accounts\views.py
from datetime import datetime, time as dt_time, timedelta
import re
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework import permissions, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from common.audit import AuditedModelViewSet, record_audit_log
from common.exceptions import AppError
from common.permissions import (
    ALLOWED_ROLES,
    IsAdminOrPrincipal,
    IsSchoolLeader,
    IsSystemAdminOrReadOnly,
    get_user_role,
    is_admin_or_principal,
    is_school_leader,
    is_system_admin,
)
from common.phone import normalize_ph_phone
from .models import AuditLog, Department, TeacherProfile
from .serializers import (
    AUDIT_MODULE_LABELS,
    AuditLogSerializer,
    DepartmentSerializer,
    TeacherDropdownSerializer,
    TeacherProfileSerializer,
    UserAccountSerializer,
)
from .services import (
    authenticate_with_identifier,
    build_user_session_payload,
    reset_teacher_bound_device,
    unlock_all_locked_accounts,
    update_own_profile,
)

User = get_user_model()


class LoginThrottle(AnonRateThrottle):
    scope = "login"


class AccountWriteThrottle(UserRateThrottle):
    rate = "30/minute"


def _format_audit_row(item: AuditLog) -> dict:
    return AuditLogSerializer(item).data


def _is_judge_demo_enabled() -> bool:
    return bool(getattr(settings, "DEBUG", False) or getattr(settings, "ENABLE_JUDGE_DEMO", False))


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        identifier = str(
            request.data.get("username")
            or request.data.get("identifier")
            or request.data.get("email")
            or ""
        ).strip()[:150]
        password = str(request.data.get("password") or "")

        payload = authenticate_with_identifier(
            identifier=identifier,
            password=password,
            request=request,
        )
        user_id = payload.get("user", {}).get("id")
        if user_id:
            drf_token, _ = Token.objects.get_or_create(user_id=user_id)
            payload["token"] = drf_token.key

        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=user_id or 0,
            action="LOGIN",
            new_data={
                "username": payload["user"]["username"],
                "role": payload["user"]["role"],
            },
        )
        return Response(payload, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        raw_refresh = str(request.data.get("refresh") or "").strip()
        if raw_refresh:
            try:
                RefreshToken(raw_refresh).blacklist()
            except TokenError:
                pass

        if request.user and request.user.is_authenticated:
            Token.objects.filter(user_id=request.user.id).delete()
            record_audit_log(
                request=request,
                table_name="auth_user",
                record_id=request.user.id,
                action="LOGOUT",
                new_data={"username": request.user.username},
            )
        return Response({"ok": True, "message": "Signed out."}, status=status.HTTP_200_OK)


class DemoStatusView(APIView):
    """Checks if demo sign-in is turned on and returns real database staff roles."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        enabled = _is_judge_demo_enabled()
        roles = (
            [
                {
                    "role": "ADMIN",
                    "label": "System Admin",
                    "description": "Full school setup, campus boundary, and security logs",
                },
                {
                    "role": "PRINCIPAL",
                    "label": "School Principal",
                    "description": "Campus boundary, cutting-class alerts, and SF4 reports",
                },
                {
                    "role": "DEPT_HEAD",
                    "label": "Department Head",
                    "description": "Teacher DTR approval and class attendance checks",
                },
                {
                    "role": "TEACHER",
                    "label": "Teacher / Adviser",
                    "description": "Camera QR scanning, class lists, and exit passes",
                },
            ]
            if enabled
            else []
        )
        return Response({"enabled": enabled, "roles": roles})


class DemoLoginView(APIView):
    """Signs in an existing active staff account ONLY when DEBUG or ENABLE_JUDGE_DEMO is True."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle]

    ROLE_MAP = {
        "ADMIN": ("demo_admin", ["ADMIN"]),
        "PRINCIPAL": ("demo_principal", ["PRINCIPAL", "ADMIN"]),
        "DEPT_HEAD": ("demo_dept_head", ["DEPT_HEAD", "PRINCIPAL"]),
        "TEACHER": ("demo_teacher", ["TEACHER"]),
    }

    def post(self, request):
        if not _is_judge_demo_enabled():
            return Response(
                {"error": "Demo sign-in is turned off in production."},
                status=status.HTTP_404_NOT_FOUND,
            )

        role_key = str(request.data.get("role") or "ADMIN").strip().upper()
        if role_key not in ALLOWED_ROLES:
            raise AppError(
                "INVALID_ROLE",
                "Invalid role selected. Allowed roles are ADMIN, PRINCIPAL, DEPT_HEAD, and TEACHER.",
                400,
            )

        preferred_username, allowed_roles = self.ROLE_MAP[role_key]
        base_qs = User.objects.select_related(
            "profile",
            "teacher_profile",
            "teacher_profile__department",
            "teacher_profile__position",
        ).filter(is_active=True)

        user_obj = base_qs.filter(username__iexact=preferred_username).first()
        if not user_obj:
            user_obj = base_qs.filter(profile__role__in=allowed_roles).order_by("id").first()
        if not user_obj:
            raise AppError(
                "ACCOUNT_NOT_FOUND",
                "No active staff account exists in the database for this role yet.",
                404,
            )

        refresh = RefreshToken.for_user(user_obj)
        drf_token, _ = Token.objects.get_or_create(user_id=user_obj.id)
        session_user = build_user_session_payload(user=user_obj, request=request)

        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=user_obj.id,
            action="LOGIN",
            new_data={"username": user_obj.username, "mode": "DEMO"},
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
    """Reads and updates the signed-in user's own profile."""

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

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
            strip_tags(str(k))[:50]
            for k in (request.data.keys() if hasattr(request.data, "keys") else ["profile"])
            if str(k) not in ("password", "csrfmiddlewaretoken")
        ]
        record_audit_log(
            request=request,
            table_name="teacher_profiles",
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

        # Rotate DRF token so older sessions using the old token are signed out
        Token.objects.filter(user_id=request.user.id).delete()
        new_token = Token.objects.create(user=request.user)

        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=request.user.id,
            action="PASSWORD",
        )
        return Response({"ok": True, "message": "Password updated.", "token": new_token.key})


def _parse_int_id(raw) -> int | None:
    text = str(raw or "").strip()
    return int(text) if (text and text.isascii() and text.isdigit()) else None


class FieldAvailabilityView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def get(self, request):
        from apps.school.models import Room, Subject
        from apps.students.models import Student

        field = str(request.query_params.get("field") or "").strip().lower()
        value = str(request.query_params.get("value") or "").strip()[:150]
        exclude_id = _parse_int_id(request.query_params.get("exclude_id"))
        exclude_user_id = _parse_int_id(request.query_params.get("exclude_user_id"))
        exclude_teacher_id = _parse_int_id(request.query_params.get("exclude_teacher_id"))

        if not field or not value:
            return Response({"available": True, "is_taken": False, "field": field, "message": ""})

        taken = False
        message = ""

        if field == "username":
            qs = User.objects.filter(username__iexact=value)
            if exclude_user_id:
                qs = qs.exclude(id=exclude_user_id)
            elif exclude_teacher_id:
                qs = qs.exclude(teacher_profile__id=exclude_teacher_id)
            elif exclude_id:
                qs = qs.exclude(id=exclude_id)
            taken = qs.exists()
            if taken:
                message = "This username is already taken."
        elif field == "email":
            qs = User.objects.filter(email__iexact=value)
            if exclude_user_id:
                qs = qs.exclude(id=exclude_user_id)
            elif exclude_teacher_id:
                qs = qs.exclude(teacher_profile__id=exclude_teacher_id)
            elif exclude_id:
                qs = qs.exclude(id=exclude_id)
            taken = qs.exists()
            if taken:
                message = "This email address is already in use."
        elif field == "employee_id":
            qs = TeacherProfile.objects.filter(employee_id__iexact=value)
            if exclude_teacher_id:
                qs = qs.exclude(id=exclude_teacher_id)
            elif exclude_user_id:
                qs = qs.exclude(user_id=exclude_user_id)
            elif exclude_id:
                qs = qs.exclude(id=exclude_id)
            taken = qs.exists()
            if taken:
                message = "This Employee ID is already assigned."
        elif field in ("phone", "phone_number", "contact_number"):
            norm = normalize_ph_phone(value)
            if norm:
                qs = TeacherProfile.objects.filter(contact_number=norm)
                if exclude_teacher_id:
                    qs = qs.exclude(id=exclude_teacher_id)
                elif exclude_user_id:
                    qs = qs.exclude(user_id=exclude_user_id)
                elif exclude_id:
                    qs = qs.exclude(id=exclude_id)
                taken = qs.exists()
                if taken:
                    message = "This mobile number is already assigned to another staff account."
        elif field == "lrn":
            digits = re.sub(r"\D+", "", value)
            if len(digits) == 12:
                qs = Student.objects.filter(lrn=digits)
                if exclude_id:
                    qs = qs.exclude(id=exclude_id)
                existing_student = qs.only("id", "first_name", "middle_name", "last_name", "suffix", "lrn").first()
                if existing_student:
                    taken = True
                    if is_school_leader(request.user):
                        message = f"LRN {digits} is already registered to {existing_student.full_name}."
                    else:
                        message = f"LRN {digits} is already registered to another student."
        elif field == "subject_code":
            qs = Subject.objects.filter(code__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            taken = qs.exists()
            if taken:
                message = "A subject with this code already exists."
        elif field == "room_name":
            qs = Room.objects.filter(name__iexact=value)
            if exclude_id:
                qs = qs.exclude(id=exclude_id)
            taken = qs.exists()
            if taken:
                message = "A classroom with this name already exists."
        else:
            return Response({"available": True, "is_taken": False, "field": field, "message": ""})

        return Response(
            {
                "available": not taken,
                "is_taken": taken,
                "field": field,
                "message": message,
            }
        )


ValidateFieldView = FieldAvailabilityView


class ResetBoundDeviceView(APIView):
    """Clears the phone lock on a teacher profile so a new phone can be linked."""

    permission_classes = [permissions.IsAuthenticated, IsAdminOrPrincipal]
    throttle_classes = [AccountWriteThrottle]

    def post(self, request, pk: int | None = None, **kwargs):
        target_id = pk or kwargs.get("teacher_id") or request.data.get("teacher_id")
        if not target_id or not str(target_id).isascii() or not str(target_id).isdigit():
            raise AppError("INVALID_ID", "A valid teacher ID is required.", 400)

        teacher = reset_teacher_bound_device(teacher_id=int(target_id))
        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="RESET_DEV",
            new_data={"employee_id": teacher.employee_id},
        )
        return Response({"ok": True, "message": f"Phone lock cleared for {teacher.full_name}."})


ResetDeviceBindingView = ResetBoundDeviceView


class UnlockAccountsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSchoolLeader]
    throttle_classes = [AccountWriteThrottle]

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


class TeacherDropdownView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from apps.school.models import SchoolYear, Section
        from apps.school.selectors import format_section_label

        qs = (
            TeacherProfile.objects.select_related("user", "department", "position")
            .only(
                "id",
                "employee_id",
                "middle_name",
                "suffix",
                "contact_number",
                "photo",
                "can_handle_classes",
                "user__id",
                "user__username",
                "user__first_name",
                "user__last_name",
                "user__email",
                "user__is_active",
                "department__id",
                "department__name",
                "position__id",
                "position__title",
            )
            .filter(user__is_active=True)
            .order_by("user__last_name", "user__first_name")
        )

        active_sy = SchoolYear.objects.filter(is_active=True).first()
        sec_qs = Section.objects.filter(is_active=True, adviser__isnull=False).select_related("grade_level")
        if active_sy:
            sec_qs = sec_qs.filter(school_year=active_sy)

        advised_map: dict[int, list[str]] = {}
        for sec in sec_qs.order_by("grade_level__level_number", "name"):
            label = format_section_label(sec.grade_level.name if sec.grade_level else "", sec.name)
            advised_map.setdefault(sec.adviser_id, []).append(label)

        return Response(
            TeacherDropdownSerializer(
                qs,
                many=True,
                context={"request": request, "advised_map": advised_map},
            ).data
        )


class TeacherProfileViewSet(AuditedModelViewSet):
    serializer_class = TeacherProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = TeacherProfile.objects.select_related(
            "user",
            "user__profile",
            "department",
            "position",
        ).order_by("user__last_name", "user__first_name")

        if not is_school_leader(self.request.user):
            return qs.filter(user_id=self.request.user.id)

        search = str(self.request.query_params.get("search") or "").strip()[:100]
        if search:
            qs = qs.filter(
                Q(employee_id__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(department__name__icontains=search)
            )

        active_only = str(self.request.query_params.get("is_active") or "").strip().lower()
        if active_only in ("1", "true", "yes"):
            qs = qs.filter(user__is_active=True)

        return qs

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS:
            if getattr(self, "action", None) == "reset_device":
                if not is_admin_or_principal(request.user):
                    self.permission_denied(
                        request,
                        message="Only System Admins or School Principals can reset phone locks.",
                    )
            elif not is_system_admin(request.user):
                self.permission_denied(
                    request,
                    message="Only System Admins can add, edit, or delete teacher records.",
                )

    @action(
        detail=True,
        methods=["post"],
        url_path="reset-device",
        permission_classes=[permissions.IsAuthenticated, IsAdminOrPrincipal],
    )
    def reset_device(self, request, pk=None):
        teacher = self.get_object()
        reset_teacher_bound_device(teacher_id=teacher.id)
        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="RESET_DEV",
            new_data={"employee_id": teacher.employee_id},
        )
        return Response({"ok": True, "message": f"Phone lock cleared for {teacher.full_name}."})


class DepartmentViewSet(AuditedModelViewSet):
    queryset = Department.objects.order_by("name")
    serializer_class = DepartmentSerializer
    permission_classes = [permissions.IsAuthenticated, IsSystemAdminOrReadOnly]


class UserAccountViewSet(AuditedModelViewSet):
    serializer_class = UserAccountSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = User.objects.select_related(
            "profile",
            "teacher_profile",
            "teacher_profile__department",
            "teacher_profile__position",
        ).order_by("username")

        if get_user_role(self.request.user) != "ADMIN" and not self.request.user.is_superuser:
            return qs.filter(id=self.request.user.id)

        search = str(self.request.query_params.get("search") or "").strip()[:100]
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
        if not is_system_admin(request.user):
            self.permission_denied(
                request, message="Only System Admins can view or manage staff user accounts."
            )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id:
            raise AppError("CANNOT_DELETE_SELF", "You cannot delete your own active account.", 400)
        return super().destroy(request, *args, **kwargs)


class AuditLogListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrPrincipal]

    def get(self, request):
        limit_raw = str(request.query_params.get("limit") or "100").strip()
        limit = min(int(limit_raw), 500) if (limit_raw.isascii() and limit_raw.isdigit()) else 100

        qs = AuditLog.objects.select_related("performed_by").only(
            "id",
            "table_name",
            "record_id",
            "action",
            "client_ip",
            "user_agent",
            "changed_fields",
            "new_data",
            "created_at",
            "performed_by__id",
            "performed_by__username",
            "performed_by__first_name",
            "performed_by__last_name",
        )

        action_filter = str(request.query_params.get("action") or "").strip().upper()[:16]
        if action_filter and action_filter != "ALL":
            qs = qs.filter(action__iexact=action_filter)

        date_filter = str(request.query_params.get("date") or "").strip()
        if date_filter:
            try:
                parsed_date = datetime.strptime(date_filter, "%Y-%m-%d").date()
            except ValueError:
                parsed_date = None
            if parsed_date is not None:
                tz = timezone.get_current_timezone()
                start_dt = timezone.make_aware(datetime.combine(parsed_date, dt_time.min), tz)
                end_dt = start_dt + timedelta(days=1)
                qs = qs.filter(created_at__gte=start_dt, created_at__lt=end_dt)

        search_term = str(request.query_params.get("search") or "").strip()[:100]
        if search_term:
            search_q = (
                Q(performed_by__username__icontains=search_term)
                | Q(performed_by__first_name__icontains=search_term)
                | Q(performed_by__last_name__icontains=search_term)
                | Q(table_name__icontains=search_term)
                | Q(client_ip__icontains=search_term)
                | Q(action__icontains=search_term)
            )
            if search_term.isascii() and search_term.isdigit():
                search_q |= Q(record_id=int(search_term))
            lowered = search_term.lower()
            matched_tables = [
                tbl for tbl, label in AUDIT_MODULE_LABELS.items() if lowered in label.lower()
            ]
            if matched_tables:
                search_q |= Q(table_name__in=matched_tables)
            qs = qs.filter(search_q)

        logs = qs.order_by("-created_at")[:limit]
        results = AuditLogSerializer(logs, many=True).data
        return Response(
            {
                "results": results,
                "records": results,
                "count": len(results),
                "is_admin": is_admin_or_principal(request.user),
            }
        )


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes = [permissions.IsAuthenticated, IsAdminOrPrincipal]
    serializer_class = AuditLogSerializer
    queryset = AuditLog.objects.select_related("performed_by").order_by("-created_at")

    def list(self, request, *args, **kwargs):
        return AuditLogListView().get(request)