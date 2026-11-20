from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
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


class NotificationViewSet(AuditedModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.select_related("student", "recipient").order_by("-created_at")
        scope = str(self.request.query_params.get("scope") or "").strip().lower()
        if is_school_leader(self.request.user) and (
            scope == "all" or self.action in ("retrieve", "update", "partial_update", "destroy")
        ):
            return qs
        return qs.filter(recipient=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)
        target_role = str(validated.pop("target_role", "") or "").strip().upper()

        title = validated["title"]
        message = validated["message"]
        category = validated.get("category") or "ANNOUNCEMENT"
        student = validated.get("student")

        if target_role and target_role in ("PARENT", "FACULTY", "ALL"):
            role = get_user_role(request.user)
            if not (is_school_leader(request.user) or role == "FACULTY"):
                return Response(
                    {"error": "Only faculty and school leadership can broadcast notices."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            users_qs = User.objects.filter(is_active=True).select_related("profile")
            if target_role == "PARENT":
                users_qs = users_qs.filter(profile__role="PARENT")
            elif target_role == "FACULTY":
                users_qs = users_qs.filter(profile__role__in=["FACULTY", "ADMIN", "PRINCIPAL", "DEPT_HEAD"])

            recipients = list(users_qs.distinct())
            if not recipients:
                recipients = [request.user]

            created_rows = []
            for user_obj in recipients:
                notif = send_user_notification(
                    recipient=user_obj,
                    title=title,
                    message=message,
                    category=category,
                    student=student,
                )
                if notif:
                    created_rows.append(notif)

            record_audit_log(
                request=request,
                table_name=Notification._meta.db_table,
                record_id=created_rows[0].id if created_rows else 0,
                action="CREATE",
                new_data={"target_role": target_role, "dispatched_count": len(created_rows), "title": title[:120]},
            )
            payload = dict(self.get_serializer(created_rows[0]).data) if created_rows else {}
            payload["ok"] = True
            payload["dispatched_count"] = len(created_rows)
            return Response(payload, status=status.HTTP_201_CREATED)

        recipient = validated.get("recipient") or request.user
        if recipient.id != request.user.id and not is_school_leader(request.user):
            recipient = request.user

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
            new_data={"title": title[:120], "category": category},
        )
        payload = dict(self.get_serializer(notif).data)
        payload["ok"] = True
        payload["dispatched_count"] = 1
        return Response(payload, status=status.HTTP_201_CREATED)


class MarkNotificationsReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        raw_ids = request.data.get("notification_ids") or request.data.get("ids") or []
        clean_ids = [int(i) for i in raw_ids if str(i).isdigit()] if isinstance(raw_ids, list) else None
        count = mark_notifications_read(user=request.user, notification_ids=clean_ids)
        return Response({"ok": True, "marked_read_count": count})


class ChatThreadListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        threads = get_chat_threads_for_user(user=request.user, request=request)
        return Response({"threads": threads, "total": len(threads)})


class ChatMessageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        student_id = request.query_params.get("student_id")
        teacher_id = request.query_params.get("teacher_id") or request.query_params.get("faculty_id")
        if not student_id or not str(student_id).isdigit():
            return Response({"error": "Valid student_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        t_id = int(teacher_id) if (teacher_id and str(teacher_id).isdigit()) else None
        return Response(get_thread_messages(user=request.user, student_id=int(student_id), teacher_id=t_id))

    def post(self, request):
        student_id = request.data.get("student_id")
        teacher_id = request.data.get("teacher_id") or request.data.get("faculty_id")
        if not student_id or not str(student_id).isdigit():
            return Response({"error": "Valid student_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        t_id = int(teacher_id) if (teacher_id and str(teacher_id).isdigit()) else None

        student, teacher, parent_user = authorize_chat_thread(
            user=request.user, student_id=int(student_id), teacher_id=t_id
        )
        msg = create_chat_message(
            sender=request.user,
            student=student,
            teacher=teacher,
            parent_user=parent_user,
            body=request.data.get("body") or request.data.get("message") or "",
        )
        return Response(
            {
                "id": msg.id,
                "sender_id": msg.sender_id,
                "sender_name": request.user.get_full_name() or request.user.username,
                "is_mine": True,
                "body": msg.body,
                "is_read": False,
                "created_at": timezone.localtime(msg.created_at).strftime("%Y-%m-%d %I:%M %p"),
                "time_only": timezone.localtime(msg.created_at).strftime("%I:%M %p"),
            },
            status=status.HTTP_201_CREATED,
        )

    def put(self, request):
        msg_id = request.data.get("id") or request.data.get("message_id")
        if not msg_id or not str(msg_id).isdigit():
            return Response({"error": "Valid message id is required."}, status=status.HTTP_400_BAD_REQUEST)
        msg = update_chat_message(
            user=request.user,
            message_id=int(msg_id),
            new_body=request.data.get("body") or request.data.get("message") or "",
        )
        return Response({"ok": True, "id": msg.id, "body": msg.body})

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        msg_id = request.data.get("id") or request.query_params.get("id")
        if not msg_id or not str(msg_id).isdigit():
            return Response({"error": "Valid message id is required."}, status=status.HTTP_400_BAD_REQUEST)
        delete_chat_message(user=request.user, message_id=int(msg_id))
        return Response({"ok": True, "message": "Message deleted."})
