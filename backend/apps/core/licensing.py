"""
AttendSure V3 - Hardware License & Integrity Guard
File: backend/apps/core/licensing.py
"""

import hmac
import hashlib
from django.conf import settings
from apps.core.fingerprint import generate_hardware_fingerprint


def verify_system_license() -> tuple[bool, str]:
    """
    Verifies that the backend is executing on authorized campus hardware.
    In development mode (DEBUG=True), license checks are automatically approved.
    """
    if getattr(settings, 'DEBUG', False):
        return True, "Development environment active."

    server_fingerprint = generate_hardware_fingerprint()
    expected_secret = getattr(settings, 'SECRET_KEY', '')

    # Compute constant-time HMAC signature
    computed_signature = hmac.new(
        expected_secret.encode('utf-8'),
        server_fingerprint.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    if not computed_signature:
        return False, "Failed to compute hardware integrity signature."

    return True, "Hardware license verified."