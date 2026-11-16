"""
AttendSure V3 - Non-Blocking Mobile Push & In-App Notification Service
File: backend/apps/api/services/push_service.py
"""

import json
import logging
import threading
import urllib.request
from apps.academics.models import AppNotification, UserProfile

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _dispatch_expo_payload(payload: dict, notification_id: int | None = None):
    """Sends a push payload over HTTPS in a background thread so scans never lag."""
    try:
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4.0) as response:
            response.read()
        if notification_id:
            AppNotification.objects.filter(id=notification_id).update(is_pushed=True)
    except Exception as exc:
        logger.warning("Push delivery skipped or delayed: %s", exc)


def send_push_to_user(
    user,
    title: str,
    message: str,
    category: str = "ATTENDANCE",
    student=None,
    extra_data: dict | None = None,
) -> AppNotification | None:
    """Saves an in-app alert and dispatches a mobile push notification."""
    if not user or not getattr(user, "is_active", False):
        return None

    notif = AppNotification.objects.create(
        recipient=user,
        student=student,
        title=title[:150],
        message=message,
        category=category,
    )

    profile = getattr(user, "profile", None) or UserProfile.objects.filter(user=user).first()
    push_token = getattr(profile, "push_token", None) if profile else None

    if push_token and str(push_token).startswith(("ExponentPushToken", "ExpoPushToken")):
        payload = {
            "to": push_token,
            "sound": "default",
            "priority": "high",
            "title": title[:150],
            "body": message[:250],
            "data": {
                "notification_id": notif.id,
                "category": category,
                "student_id": student.id if student else None,
                **(extra_data or {}),
            },
        }
        threading.Thread(
            target=_dispatch_expo_payload,
            args=(payload, notif.id),
            daemon=True,
        ).start()

    return notif


def notify_student_parent(
    student,
    title: str,
    message: str,
    category: str = "ATTENDANCE",
    extra_data: dict | None = None,
):
    """Links and notifies the parent mobile app account assigned to a student."""
    if not student:
        return None

    parent_user = student.parent_user
    if not parent_user and student.parent_contact:
        matched_profile = UserProfile.objects.filter(
            role="PARENT",
            phone_number=student.parent_contact,
            user__is_active=True,
        ).select_related("user").first()
        if matched_profile:
            parent_user = matched_profile.user
            student.parent_user = parent_user
            student.save(update_fields=["parent_user"])

    if not parent_user:
        return None

    return send_push_to_user(
        user=parent_user,
        title=title,
        message=message,
        category=category,
        student=student,
        extra_data=extra_data,
    )


def send_silent_wake_up_push(push_token: str, action: str = "START_TRACKING_IN") -> bool:
    """Sends a silent high-priority wake-up signal to a faculty mobile phone."""
    if not push_token or not str(push_token).startswith(("ExponentPushToken", "ExpoPushToken")):
        return False

    payload = {
        "to": push_token,
        "priority": "high",
        "contentAvailable": True,
        "data": {"action": action},
    }
    threading.Thread(
        target=_dispatch_expo_payload,
        args=(payload, None),
        daemon=True,
    ).start()
    return True