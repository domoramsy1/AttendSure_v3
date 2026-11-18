import logging
import requests
from celery import shared_task
from .models import Notification

logger = logging.getLogger(__name__)
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


@shared_task(bind=True, max_retries=2, default_retry_delay=5)
def deliver_expo_push_task(self, notification_id: int, push_token: str, title: str, body: str):
    if not str(push_token or "").startswith(("ExponentPushToken", "ExpoPushToken")):
        return
    try:
        resp = requests.post(
            EXPO_PUSH_URL,
            json={"to": push_token, "sound": "default", "title": title[:150], "body": body[:250]},
            timeout=5,
        )
        resp.raise_for_status()
        Notification.objects.filter(id=notification_id).update(is_pushed=True)
    except requests.RequestException as exc:
        logger.warning("Push retry for notification %s: %s", notification_id, exc)
        raise self.retry(exc=exc)