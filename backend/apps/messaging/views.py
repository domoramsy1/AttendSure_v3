import inspect
import re

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from django.utils.html import strip_tags
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from common.audit import AuditedModelViewSet, record_audit_log
from common.permissions import get_user_role, is_school_leader
from .models import Notification
from .selectors import authorize_chat_thread, get_chat_threads_for_user, get_thread_messages
from .serializers import NotificationSerializer
from .services import (
    create_chat_message,
    delete_chat_message,
    mark_notifications_read,
    send_user_notification,
    update_chat_message,
)

User = get_user_model()

MAX_TITLE_LENGTH = 150
MAX_MESSAGE_LENGTH = 2000
MAX_MARK_READ_IDS = 200
CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class MessagingWriteThrottle(UserRateThrottle):
    """Prevents message flooding and notification spam."""

    rate = "60/minute"


def _parse_positive_int(value: object) -> int | None:
    """Safely parses ASCII positive integers without crashing on Unicode digits."""
    text = str(value or "").strip()
    if not text.isascii() or not text.isdigit():
        return None
    parsed = int(text)
    return parsed if parsed > 0 else None


def _clean_plain_text(value: object, max_length: int) -> str:
    """Removes HTML tags and hidden control characters, then enforces max length."""
    raw = str(value or "")
    without_controls = CONTROL_CHARS_RE.sub("", raw)
    cleaned = strip_tags(without_controls).strip()
    return cleaned[:max_length]


def _queue_push_alerts(notifications: list[Notification], push_map: dict[int, str], title: str, body: str) -> None:
    """Dispatches Expo push background tasks safely after the DB transaction commits."""
    try:
        from .tasks import deliver_expo_push_task
    except ImportError:
        return

    short_title = title[:MAX_TITLE_LENGTH]
    short_body = body[:250]

    for notif in notifications:
        token = push_map.get(notif.recipient_id, "")
        if token and token.startswith(("ExponentPushToken[", "ExpoPushToken[")):
            try:
                deliver_expo_push_task.delay(
                    notification_id=notif.id,
                    push_token=token,
                    title=short_title,
                    body=short_body,
                )
            except Exception:
                # Push queue failure must never break saved in-app notifications
                continue


def _get_allowed_faculty_parent_ids(user) -> list[int]:
    """Returns active parent user IDs strictly for learners handled by this faculty member."""
    try:
        from apps.accounts.selectors import get_faculty_student_ids, resolve_faculty_for_user
        from apps.students.models import Student

        faculty = resolve_faculty_for_user(user)
        if not faculty:
            return []
        student_ids = get_faculty_student_ids(faculty)
        if not student_ids:
            return []
        return list(
            Student.objects.filter(
                id__in=student_ids,
                is_active=True,
                parent_user_id__isnull=False,
                parent_user__is_active=True,
            )
            .values_list("parent_user_id", flat=True)
            .distinct()
        )
    except Exception:
        return []


def _call_authorize_thread(*, user, student_id: int, faculty_id: int | None):
    """Supports both updated `faculty_id` and legacy `teacher_id` selector signatures."""
    params = inspect.signature(authorize_chat_thread).parameters
    if "faculty_id" in params:
        return authorize_chat_thread(user=user, student_id=student_id, faculty_id=faculty_id)
    return authorize_chat_thread(user=user, student_id=student_id, teacher_id=faculty_id)


def _call_get_thread_messages(*, user, student_id: int, faculty_id: int | None):
    """Supports both updated `faculty_id` and legacy `teacher_id` selector signatures."""
    params = inspect.signature(get_thread_messages).parameters
    if "faculty_id" in params:
        return get_thread_messages(user=user, student_id=student_id, faculty_id=faculty_id)
    return get_thread_messages(user=user, student_id=student_id, teacher_id=faculty_id)


def _call_create_chat_message(*, sender, student, faculty, parent_user, body: str):
    """Supports both 3NF (`faculty` without `parent_user`) and legacy service signatures."""
    params = inspect.signature(create_chat_message).parameters
    kwargs = {"sender": sender, "student": student, "body": body}
    if "faculty" in params:
        kwargs["faculty"] = faculty
    elif "teacher" in params:
        kwargs["teacher"] = faculty
    if "parent_user" in params:
        kwargs["parent_user"] = parent_user
    return create_chat_message(**kwargs)


class NotificationViewSet(AuditedModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]

    def get_throttles(self):
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [MessagingWriteThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        qs = (
            Notification.objects.select_related("student", "recipient")
            .only(
                "id",
                "recipient_id",
                "recipient__id",
                "recipient__username",
                "recipient__first_name",
                "recipient__last_name",
                "student_id",
                "student__id",
                "student__lrn",
                "student__first_name",
                "student__middle_name",
                "student__last_name",
                "student__suffix",
                "title",
                "message",
                "category",
                "is_read",
                "is_pushed",
                "created_at",
            )
            .order_by("-created_at")
        )
        scope = str(self.request.query_params.get("scope") or "").strip().lower()
        if is_school_leader(self.request.user) and (
            scope == "all" or self.action in ("retrieve", "update", "partial_update", "destroy")
        ):
            return qs
        return qs.filter(recipient=self.request.user)

    def perform_update(self, serializer):
        leader = is_school_leader(self.request.user)
        validated = serializer.validated_data
        if not leader:
            disallowed = set(validated.keys()) - {"is_read"}
            if disallowed:
                self.permission_denied(
                    self.request,
                    message="Only school leaders can edit notification content.",
                )
        if "title" in validated:
            cleaned_title = _clean_plain_text(validated["title"], MAX_TITLE_LENGTH)
            if not cleaned_title:
                raise ValidationError({"title": "Title cannot be empty."})
            validated["title"] = cleaned_title
        if "message" in validated:
            cleaned_msg = _clean_plain_text(validated["message"], MAX_MESSAGE_LENGTH)
            if not cleaned_msg:
                raise ValidationError({"message": "Message cannot be empty."})
            validated["message"] = cleaned_msg
        if "category" in validated:
            validated["category"] = str(validated["category"] or "ANNOUNCEMENT").strip().upper()
        super().perform_update(serializer)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)

        target_role = str(validated.pop("target_role", "") or "").strip().upper()
        title = _clean_plain_text(validated.get("title"), MAX_TITLE_LENGTH)
        message = _clean_plain_text(validated.get("message"), MAX_MESSAGE_LENGTH)
        category = str(validated.get("category") or "ANNOUNCEMENT").strip().upper()
        student = validated.get("student")

        if not title or not message:
            return Response(
                {"error": "Both title and message are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        leader = is_school_leader(request.user)
        user_role = get_user_role(request.user)

        # Group broadcast path (fast single-query bulk insert)
        if target_role:
            if target_role not in ("PARENT", "FACULTY", "ALL"):
                return Response(
                    {"error": "Invalid target_role. Choose PARENT, FACULTY, or ALL."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if not (leader or user_role == "FACULTY"):
                return Response(
                    {"error": "Only faculty and school leaders can send group notices."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            # Regular faculty can only broadcast to parents of their own handled students
            if not leader:
                if target_role != "PARENT":
                    return Response(
                        {"error": "Only school leaders can broadcast to all faculty or the entire school."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
                allowed_parent_ids = _get_allowed_faculty_parent_ids(request.user)
                users_qs = User.objects.filter(id__in=allowed_parent_ids, is_active=True)
            else:
                users_qs = User.objects.filter(is_active=True)
                if target_role == "PARENT":
                    users_qs = users_qs.filter(profile__role="PARENT")
                elif target_role == "FACULTY":
                    users_qs = users_qs.filter(
                        profile__role__in=["FACULTY", "ADMIN", "PRINCIPAL", "DEPT_HEAD"]
                    )

            recipient_rows = list(
                users_qs.select_related("profile")
                .only("id", "is_active", "profile__push_token")
                .distinct()
            )
            if not recipient_rows:
                return Response(
                    {"error": "No active recipients matched the selected group."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            now = timezone.now()
            push_map = {
                u.id: str(getattr(getattr(u, "profile", None), "push_token", "") or "").strip()
                for u in recipient_rows
            }

            # Never attach an individual student's record to a group-wide broadcast (prevents data leak)
            notifications_to_insert = [
                Notification(
                    recipient_id=u.id,
                    student=None,
                    title=title,
                    message=message,
                    category=category,
                    created_at=now,
                )
                for u in recipient_rows
            ]

            with transaction.atomic():
                created_rows = Notification.objects.bulk_create(
                    notifications_to_insert, batch_size=500
                )
                record_audit_log(
                    request=request,
                    table_name=Notification._meta.db_table,
                    record_id=created_rows[0].id if created_rows else 0,
                    action="CREATE",
                    new_data={
                        "target_role": target_role,
                        "dispatched_count": len(created_rows),
                        "title": title[:120],
                    },
                )
                transaction.on_commit(
                    lambda: _queue_push_alerts(created_rows, push_map, title, message)
                )

            first_row = created_rows[0]
            payload = {
                "id": first_row.id,
                "title": first_row.title,
                "message": first_row.message,
                "category": first_row.category,
                "created_at": first_row.created_at,
                "ok": True,
                "dispatched_count": len(created_rows),
            }
            return Response(payload, status=status.HTTP_201_CREATED)

        # Direct single-user notification path
        recipient = validated.get("recipient") or request.user
        if recipient.id != request.user.id:
            if leader:
                pass
            elif user_role == "FACULTY":
                allowed_parent_ids = set(_get_allowed_faculty_parent_ids(request.user))
                if recipient.id not in allowed_parent_ids:
                    return Response(
                        {"error": "You can only notify parents of learners in your classes."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            else:
                return Response(
                    {"error": "You do not have permission to send notices to other users."},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # Prevent linking a student that does not belong to a parent recipient
        if student is not None and get_user_role(recipient) == "PARENT":
            if getattr(student, "parent_user_id", None) != recipient.id:
                return Response(
                    {"error": "Selected student is not linked to this parent account."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            notif = send_user_notification(
                recipient=recipient,
                title=title,
                message=message,
                category=category,
                student=student,
            )
            record_audit_log(
                request=request,
                table_name=Notification._meta.db_table,
                record_id=notif.id if notif else 0,
                action="CREATE",
                new_data={
                    "recipient_id": recipient.id,
                    "title": title[:120],
                    "category": category,
                },
            )

        payload = dict(self.get_serializer(notif).data) if notif else {}
        payload["ok"] = True
        payload["dispatched_count"] = 1 if notif else 0
        return Response(payload, status=status.HTTP_201_CREATED)


class MarkNotificationsReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [MessagingWriteThrottle]

    def post(self, request):
        raw_ids = request.data.get("notification_ids")
        if raw_ids is None:
            raw_ids = request.data.get("ids")

        clean_ids: list[int] | None = None
        if raw_ids is not None:
            if not isinstance(raw_ids, list):
                return Response(
                    {"error": "notification_ids must be a list of numbers."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            parsed_ids = []
            for item in raw_ids[:MAX_MARK_READ_IDS]:
                parsed = _parse_positive_int(item)
                if parsed is not None:
                    parsed_ids.append(parsed)
            clean_ids = list(dict.fromkeys(parsed_ids))

        count = mark_notifications_read(user=request.user, notification_ids=clean_ids)
        return Response({"ok": True, "marked_read_count": count})


class ChatThreadListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        threads = get_chat_threads_for_user(user=request.user, request=request)
        return Response({"threads": threads, "total": len(threads)})


class ChatMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_throttles(self):
        if self.request.method in ("POST", "PUT", "PATCH", "DELETE"):
            return [MessagingWriteThrottle()]
        return super().get_throttles()

    def get(self, request):
        student_id = _parse_positive_int(request.query_params.get("student_id"))
        raw_faculty_id = request.query_params.get("faculty_id") or request.query_params.get("teacher_id")
        faculty_id = _parse_positive_int(raw_faculty_id) if raw_faculty_id is not None else None

        if not student_id:
            return Response(
                {"error": "A valid student_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if raw_faculty_id is not None and faculty_id is None:
            return Response(
                {"error": "A valid faculty_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            _call_get_thread_messages(
                user=request.user,
                student_id=student_id,
                faculty_id=faculty_id,
            )
        )

    def post(self, request):
        student_id = _parse_positive_int(request.data.get("student_id"))
        raw_faculty_id = request.data.get("faculty_id") or request.data.get("teacher_id")
        faculty_id = _parse_positive_int(raw_faculty_id) if raw_faculty_id is not None else None

        if not student_id:
            return Response(
                {"error": "A valid student_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if raw_faculty_id is not None and faculty_id is None:
            return Response(
                {"error": "A valid faculty_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clean_body = _clean_plain_text(
            request.data.get("body") or request.data.get("message"),
            MAX_MESSAGE_LENGTH,
        )
        if not clean_body:
            return Response(
                {"error": "Message text cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        student, faculty, parent_user = _call_authorize_thread(
            user=request.user,
            student_id=student_id,
            faculty_id=faculty_id,
        )
        msg = _call_create_chat_message(
            sender=request.user,
            student=student,
            faculty=faculty,
            parent_user=parent_user,
            body=clean_body,
        )

        local_dt = timezone.localtime(msg.created_at)
        sender_name = (request.user.get_full_name() or request.user.username).strip()

        return Response(
            {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "sender_name": sender_name,
                "is_mine": True,
                "body": msg.body,
                "is_read": False,
                "created_at": local_dt.strftime("%Y-%m-%d %I:%M %p"),
                "time_only": local_dt.strftime("%I:%M %p"),
            },
            status=status.HTTP_201_CREATED,
        )

    def put(self, request):
        msg_id = _parse_positive_int(request.data.get("id") or request.data.get("message_id"))
        if not msg_id:
            return Response(
                {"error": "A valid message id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        clean_body = _clean_plain_text(
            request.data.get("body") or request.data.get("message"),
            MAX_MESSAGE_LENGTH,
        )
        if not clean_body:
            return Response(
                {"error": "Message text cannot be empty."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        msg = update_chat_message(
            user=request.user,
            message_id=msg_id,
            new_body=clean_body,
        )
        return Response({"ok": True, "id": msg.id, "body": msg.body})

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        msg_id = _parse_positive_int(request.data.get("id") or request.query_params.get("id"))
        if not msg_id:
            return Response(
                {"error": "A valid message id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        delete_chat_message(user=request.user, message_id=msg_id)
        return Response({"ok": True, "message": "Message deleted."})