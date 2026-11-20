# D:\AttendSure_V3\backend\apps\messaging\services.py

from django.db import transaction

from apps.accounts.models import UserProfile
from common.exceptions import AppError
from .models import ChatMessage, Notification
from .tasks import deliver_expo_push_task


def send_user_notification(
    *,
    recipient,
    title: str,
    message: str,
    category: str = "ATTENDANCE",
    student=None,
) -> Notification | None:
    if not recipient or not recipient.is_active:
        return None

    notif = Notification.objects.create(
        recipient=recipient,
        student=student,
        title=title[:150],
        message=message,
        category=category,
    )

    profile = getattr(recipient, "profile", None) or UserProfile.objects.filter(user=recipient).first()
    push_token = profile.push_token if profile else None
    if push_token and str(push_token).startswith(("ExponentPushToken", "ExpoPushToken")):
        transaction.on_commit(
            lambda: deliver_expo_push_task.delay(
                notification_id=notif.id,
                push_token=push_token,
                title=title[:150],
                body=message[:250],
            )
        )
    return notif


def notify_student_parent(*, student, title: str, message: str, category: str = "ATTENDANCE"):
    if not student:
        return None

    parent_user = student.parent_user
    if not parent_user and student.parent_contact:
        matched = (
            UserProfile.objects.filter(
                role="PARENT",
                phone_number=student.parent_contact,
                user__is_active=True,
            )
            .select_related("user")
            .first()
        )
        if matched:
            parent_user = matched.user
            student.parent_user = parent_user
            student.save(update_fields=["parent_user"])

    if not parent_user:
        return None

    return send_user_notification(
        recipient=parent_user,
        title=title,
        message=message,
        category=category,
        student=student,
    )


def mark_notifications_read(*, user, notification_ids: list[int] | None = None) -> int:
    qs = Notification.objects.filter(recipient=user, is_read=False)
    if notification_ids:
        qs = qs.filter(id__in=notification_ids)
    return qs.update(is_read=True)


def retry_pending_push_notifications(limit: int = 100) -> int:
    """Re-queues unpushed notifications for active mobile devices."""
    pending = (
        Notification.objects.filter(is_pushed=False)
        .select_related("recipient__profile")
        .order_by("-created_at")[:limit]
    )
    queued = 0
    for notif in pending:
        profile = getattr(notif.recipient, "profile", None)
        push_token = profile.push_token if profile else None
        if push_token and str(push_token).startswith(("ExponentPushToken", "ExpoPushToken")):
            deliver_expo_push_task.delay(
                notification_id=notif.id,
                push_token=push_token,
                title=notif.title[:150],
                body=notif.message[:250],
            )
            queued += 1
    return queued


@transaction.atomic
def create_chat_message(*, sender, student, teacher, parent_user, body: str) -> ChatMessage:
    clean_body = str(body or "").strip()
    if not clean_body:
        raise AppError("EMPTY_MESSAGE", "Message text cannot be empty.", 400)
    if len(clean_body) > 1000:
        raise AppError("MESSAGE_TOO_LONG", "Message cannot exceed 1000 characters.", 400)

    msg = ChatMessage.objects.create(
        student=student,
        teacher=teacher,
        parent=parent_user,
        sender=sender,
        body=clean_body,
    )

    linked_account = getattr(teacher, "account", None)
    teacher_user = linked_account.user if linked_account else None
    recipient = teacher_user if sender.id == parent_user.id else parent_user
    sender_name = sender.get_full_name() or sender.username

    if recipient:
        send_user_notification(
            recipient=recipient,
            title=f"New Message ({student.first_name}): {sender_name}",
            message=clean_body[:180],
            category="ANNOUNCEMENT",
            student=student,
        )
    return msg


@transaction.atomic
def update_chat_message(*, user, message_id: int, new_body: str) -> ChatMessage:
    clean_body = str(new_body or "").strip()
    if not clean_body or len(clean_body) > 1000:
        raise AppError("INVALID_MESSAGE", "Message must be between 1 and 1000 characters.", 400)

    msg = ChatMessage.objects.filter(id=message_id).first()
    if not msg:
        raise AppError("MESSAGE_NOT_FOUND", "Message not found.", 404)
    if msg.sender_id != user.id:
        raise AppError("FORBIDDEN", "You can only edit your own messages.", 403)

    msg.body = clean_body
    msg.save(update_fields=["body"])
    return msg


@transaction.atomic
def delete_chat_message(*, user, message_id: int) -> None:
    msg = ChatMessage.objects.filter(id=message_id).first()
    if not msg:
        raise AppError("MESSAGE_NOT_FOUND", "Message not found.", 404)
    if msg.sender_id != user.id and not user.is_superuser:
        raise AppError("FORBIDDEN", "You can only delete your own messages.", 403)
    msg.delete()