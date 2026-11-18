from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import Notification
from .selectors import authorize_chat_thread, get_chat_threads_for_user, get_thread_messages
from .serializers import NotificationSerializer
from .services import (
    create_chat_message,
    delete_chat_message,
    mark_notifications_read,
    update_chat_message,
)


class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.select_related("student").filter(
            recipient=self.request.user
        ).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(recipient=serializer.validated_data.get("recipient") or self.request.user)


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
        delete_chat_message(user=request.user, message_id=int(msg_id))
        return Response({"ok": True, "message": "Message deleted."})