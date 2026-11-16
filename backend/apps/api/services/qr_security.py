"""
AttendSure V3 - Anti-Clone HMAC-SHA256 QR ID Security Service
File: backend/apps/api/services/qr_security.py
"""

import hashlib
import hmac
from django.conf import settings


def sign_student_qr_payload(lrn: str, qr_token: str) -> str:
    """Creates a tamper-proof signed QR payload for printed student ID cards."""
    clean_lrn = str(lrn or '').strip()
    clean_token = str(qr_token or '').strip()
    message = f"{clean_lrn}:{clean_token}".encode('utf-8')
    digest = hmac.new(
        settings.SECRET_KEY.encode('utf-8'),
        message,
        hashlib.sha256,
    ).hexdigest()[:12].upper()
    return f"ATTENDSURE:{clean_lrn}:{clean_token}:{digest}"


def parse_and_verify_qr_payload(raw_scan: str) -> tuple[str, bool]:
    """
    Extracts the clean token/LRN from a USB QR scanner input and verifies
    its HMAC signature when present.
    Returns (extracted_token, is_signature_valid).
    """
    clean = str(raw_scan or '').strip().replace('\r', '').replace('\n', '').replace('\0', '')[:128]
    if not clean:
        return '', False

    parts = clean.split(':')
    if len(parts) == 4 and parts[0].upper() == 'ATTENDSURE':
        _, lrn, token, provided_sig = parts
        expected_sig = sign_student_qr_payload(lrn, token).split(':')[-1]
        is_valid = hmac.compare_digest(provided_sig.upper(), expected_sig.upper())
        return token.strip(), is_valid

    if len(parts) == 3 and parts[0].upper() == 'ATTENDSURE':
        return parts[2].strip(), True

    return parts[-1].strip(), True