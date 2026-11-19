from django.contrib.auth.models import User
from django.core.cache import cache
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import AuditedModelViewSet, record_audit_log
from common.exceptions import AppError
from common.media import save_base64_logo_to_disk
from common.permissions import IsLeadershipOrReadOnly, IsSystemAdmin, get_user_role, is_school_leader
from .models import AuditLog, TeacherProfile, UserProfile
from .selectors import build_user_session_payload, resolve_teacher_for_user
from .serializers import TeacherDropdownSerializer, TeacherSerializer, UserAccountSerializer
from .services import login_with_credentials


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


class CurrentUserView(APIView):
    """Returns and updates the signed-in user's profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(build_user_session_payload(request.user, request))

    @transaction.atomic
    def put(self, request):
        user = request.user
        data = request.data
        profile, _ = UserProfile.objects.get_or_create(user=user)
        teacher = resolve_teacher_for_user(user)

        first_name = str(data.get("first_name") if "first_name" in data else user.first_name).strip()
        last_name = str(data.get("last_name") if "last_name" in data else user.last_name).strip()
        email = str(data.get("email") if "email" in data else user.email).strip().lower()

        if "first_name" in data:
            user.first_name = first_name[:150]
        if "last_name" in data:
            user.last_name = last_name[:150]
        if "email" in data:
            user.email = email[:254]

        raw_password = str(data.get("password") or "").strip()
        if raw_password:
            if len(raw_password) < 8:
                raise AppError("WEAK_PASSWORD", "Password must be at least 8 characters long.", 400)
            user.set_password(raw_password)

        user.save()

        contact = str(data.get("contact_number") or data.get("phone_number") or "").strip()
        if contact and hasattr(profile, "phone_number"):
            profile.phone_number = contact[:25]

        photo_updated_path = None
        if "photo" in data:
            raw_photo = data.get("photo")
            if not raw_photo:
                if hasattr(profile, "photo"):
                    profile.photo = None
                if teacher:
                    teacher.photo = None
            elif isinstance(raw_photo, str) and raw_photo.startswith("data:image"):
                saved_path = save_base64_logo_to_disk(raw_photo, subdir="avatars", prefix="photo")
                if saved_path:
                    photo_updated_path = saved_path
                    if hasattr(profile, "photo"):
                        profile.photo = saved_path
                    if teacher:
                        teacher.photo = saved_path

        if hasattr(profile, "is_profile_completed"):
            profile.is_profile_completed = True
        profile.save()

        if teacher:
            if "first_name" in data and first_name:
                teacher.first_name = first_name[:100]
            if "middle_name" in data:
                teacher.middle_name = str(data.get("middle_name") or "").strip()[:100]
            if "last_name" in data and last_name:
                teacher.last_name = last_name[:100]
            if "suffix" in data:
                teacher.suffix = str(data.get("suffix") or "").strip()[:20]
            if contact:
                teacher.contact_number = contact[:25]
            if "email" in data:
                teacher.email = email[:254]
            if "department" in data and str(data.get("department") or "").strip():
                teacher.department = str(data.get("department")).strip()[:120]
            if "position" in data and str(data.get("position") or "").strip():
                teacher.position = str(data.get("position")).strip()[:120]
            if photo_updated_path:
                teacher.photo = photo_updated_path
            teacher.save()
            cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])

        record_audit_log(
            request=request,
            table_name="auth_user",
            record_id=user.id,
            action="PROFILE",
            changed_fields=list(data.keys()) if hasattr(data, "keys") else ["profile"],
        )
        return Response(build_user_session_payload(user, request))

    def patch(self, request):
        return self.put(request)


MeView = CurrentUserView
CurrentProfileView = CurrentUserView


class ValidateFieldView(APIView):
    """Real-time uniqueness check for username, employee_id, or email."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        field = str(request.query_params.get("field") or "username").strip().lower()
        value = str(request.query_params.get("value") or "").strip()
        exclude_raw = request.query_params.get("exclude_id")
        exclude_id = int(exclude_raw) if (exclude_raw and str(exclude_raw).isdigit()) else None

        if not value:
            return Response({"is_taken": False, "valid": True})

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
    """Registers or updates the mobile push notification token for the signed-in user."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        token = str(
            request.data.get("push_token")
            or request.data.get("expo_push_token")
            or request.data.get("token")
            or ""
        ).strip()[:255]
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        for attr in ("expo_push_token", "push_token"):
            if hasattr(profile, attr):
                setattr(profile, attr, token)
                profile.save(update_fields=[attr])
                break
        return Response({"ok": True, "registered": bool(token)})

# Backward-compatible alias imported by config/legacy_urls.py
SavePushTokenView = PushTokenUpdateView

class ResetDeviceLockView(APIView):
    """Clears hardware phone binding on a teacher profile so they can pair a replacement phone."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk: int | None = None):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ("ADMIN", "SUPERADMIN", "PRINCIPAL")):
            raise AppError("FORBIDDEN", "Only School Principals or System Admins can reset device locks.", 403)

        target_id = pk or request.data.get("teacher_id") or request.data.get("faculty_id")
        if not target_id or not str(target_id).isdigit():
            raise AppError("INVALID_ID", "Valid teacher ID is required.", 400)

        teacher = TeacherProfile.objects.select_related("account").filter(id=int(target_id)).first()
        if not teacher:
            raise AppError("NOT_FOUND", "Teacher profile not found.", 404)

        for attr in ("bound_device_id", "device_id", "registered_device_id"):
            if hasattr(teacher, attr):
                setattr(teacher, attr, None)
        if hasattr(teacher, "device_bound_at"):
            teacher.device_bound_at = None
        teacher.save()

        if teacher.account:
            for attr in ("bound_device_id", "device_id"):
                if hasattr(teacher.account, attr):
                    setattr(teacher.account, attr, "")
            teacher.account.save()

        record_audit_log(
            request=request,
            table_name=teacher._meta.db_table,
            record_id=teacher.id,
            action="SECURITY",
            new_data={"reset_device_for": teacher.full_name},
        )
        return Response({"ok": True, "message": f"Phone hardware lock cleared for {teacher.full_name}."})


ResetDeviceBindingView = ResetDeviceLockView


class AuditLogListView(APIView):
    """Returns user activity and security audit logs."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        leader = is_school_leader(request.user)
        qs = AuditLog.objects.select_related("actor").order_by("-created_at")
        if not leader:
            qs = qs.filter(actor=request.user)

        search = str(request.query_params.get("search") or "").strip()
        action_filter = str(request.query_params.get("action") or "ALL").strip().upper()
        date_filter = str(request.query_params.get("date") or "").strip()

        if action_filter and action_filter != "ALL":
            qs = qs.filter(action__icontains=action_filter)
        if date_filter:
            qs = qs.filter(created_at__date=date_filter)
        if search:
            qs = qs.filter(
                Q(actor__username__icontains=search)
                | Q(action__icontains=search)
                | Q(table_name__icontains=search)
            )

        records = []
        for row in qs[:150]:
            local_dt = timezone.localtime(row.created_at)
            actor_name = row.actor.username if row.actor else "system"
            details_parts = []
            if getattr(row, "changed_fields", None):
                details_parts.append(f"Fields: {', '.join(str(f) for f in row.changed_fields)}")
            elif getattr(row, "new_data", None) and isinstance(row.new_data, dict):
                summary = ", ".join(f"{k}={v}" for k, v in list(row.new_data.items())[:3])
                if summary:
                    details_parts.append(summary)

            records.append(
                {
                    "id": row.id,
                    "timestamp": local_dt.strftime("%Y-%m-%d %I:%M:%S %p"),
                    "time_only": local_dt.strftime("%I:%M:%S %p"),
                    "date_only": local_dt.strftime("%Y-%m-%d"),
                    "user": actor_name,
                    "action": row.action,
                    "module": row.table_name,
                    "details": " • ".join(details_parts) or f"{row.action} on {row.table_name} #{row.record_id}",
                    "ip_address": getattr(row, "ip_address", None) or "127.0.0.1",
                    "status": "SUCCESS",
                }
            )

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
        qs = AuditLog.objects.select_related("actor").order_by("-created_at")
        if not is_school_leader(self.request.user):
            qs = qs.filter(actor=self.request.user)
        return qs

    def list(self, request, *args, **kwargs):
        return AuditLogListView().get(request)

    def retrieve(self, request, pk=None, *args, **kwargs):
        qs = self.get_queryset()
        row = qs.filter(pk=pk).first()
        if not row:
            return Response({"error": "Audit log entry not found."}, status=status.HTTP_404_NOT_FOUND)
        local_dt = timezone.localtime(row.created_at)
        return Response(
            {
                "id": row.id,
                "timestamp": local_dt.strftime("%Y-%m-%d %I:%M:%S %p"),
                "time_only": local_dt.strftime("%I:%M:%S %p"),
                "date_only": local_dt.strftime("%Y-%m-%d"),
                "user": row.actor.username if row.actor else "system",
                "action": row.action,
                "module": row.table_name,
                "ip_address": getattr(row, "ip_address", None) or "127.0.0.1",
                "status": "SUCCESS",
            }
        )


class TeacherViewSet(AuditedModelViewSet):
    queryset = TeacherProfile.objects.select_related("account").order_by("last_name", "first_name")
    serializer_class = TeacherSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        dept = self.request.query_params.get("department", "").strip()
        search = self.request.query_params.get("search", "").strip()
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
            cache.set(cache_key, rows, timeout=15)

        return Response(TeacherDropdownSerializer(rows, many=True, context={"request": request}).data)


class UserAccountViewSet(AuditedModelViewSet):
    queryset = User.objects.select_related("profile", "profile__teacher").order_by("username")
    serializer_class = UserAccountSerializer
    permission_classes = [permissions.IsAuthenticated, IsSystemAdmin]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
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
        cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])

    def perform_update(self, serializer):
        super().perform_update(serializer)
        cache.delete_many(["teachers:dropdown:active", "teachers:dropdown:all"])