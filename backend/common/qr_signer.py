# AttendSure Backend - Common QR Signer
# File: D:\AttendSure_V3\backend\common\qr_signer.py

from dataclasses import dataclass
from django.core.signing import BadSignature, Signer

QR_SIGNER_SALT = "attendsure.student.qr.hmac.v1"
QR_PREFIX = "ATTENDSURE:"


@dataclass(frozen=True)
class VerifiedQrData:
    lrn: str
    qr_token: str
    is_signed: bool


def _get_signer() -> Signer:
    return Signer(salt=QR_SIGNER_SALT)


def sign_student_qr(lrn: str, qr_token: str) -> str:
    """Signs a student's LRN and secret qr_token with HMAC-SHA256 tied to SECRET_KEY."""
    clean_lrn = str(lrn or "").strip()
    clean_token = str(qr_token or "").strip()
    signed_value = _get_signer().sign(f"{clean_lrn}|{clean_token}")
    return f"{QR_PREFIX}{signed_value}"


def verify_student_qr(raw_scan: str) -> VerifiedQrData | None:
    """
    Verifies a cryptographically signed student QR payload.
    Unsigned raw LRNs, forged signatures, and tampered tokens are strictly rejected.
    """
    clean = str(raw_scan or "").strip().replace("\r", "").replace("\n", "").replace("\0", "")[:256]
    if not clean or not clean.startswith(QR_PREFIX):
        return None

    signed_body = clean[len(QR_PREFIX):]
    if not signed_body:
        return None

    try:
        unsigned = _get_signer().unsign(signed_body)
    except BadSignature:
        return None

    if "|" not in unsigned:
        return None

    lrn, token = unsigned.split("|", 1)
    clean_lrn = lrn.strip()
    clean_token = token.strip()
    if not clean_lrn or not clean_token:
        return None

    return VerifiedQrData(lrn=clean_lrn, qr_token=clean_token, is_signed=True)
