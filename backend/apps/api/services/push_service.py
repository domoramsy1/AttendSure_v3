"""
AttendSure V3 - Hardware Wake-Up Push Service
File: backend/apps/api/services/push_service.py

Cybersecurity & Performance:
- Uses TLS-encrypted HTTPS requests to the push gateway.
- Timeout guard (3.0s) prevents slow push calls from delaying gate scans.
- High-priority data-only message forces mobile OS to wake up the app.
"""

import json
import urllib.request
import urllib.error
import logging

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def send_silent_wake_up_push(push_token: str, action: str = "START_TRACKING_IN") -> bool:
    """
    Sends a silent high-priority wake-up push message to the faculty phone.
    action: "START_TRACKING_IN" (turn on GPS) or "STOP_TRACKING_OUT" (turn off GPS)
    """
    if not push_token or not push_token.startswith("ExponentPushToken"):
        return False

    payload = {
        "to": push_token,
        "priority": "high",  # Wakes Android and iOS from standby
        "_contentAvailable": True,  # Required for iOS background execution
        "data": {
            "action": action,
        },
    }

    try:
        req_data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=req_data,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Accept-Encoding": "gzip, deflate",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=3.0) as response:
            result = json.loads(response.read().decode("utf-8"))
            logger.info(f"[WakeUpPush] Signal '{action}' sent to device: {result}")
            return True

    except Exception as exc:
        logger.warning(f"[WakeUpPush] Could not send push wake-up: {exc}")
        return False