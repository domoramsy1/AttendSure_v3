import hashlib
import hmac
from dataclasses import dataclass
from django.conf import settings


@dataclass(frozen=True)
class VerifiedQrData:
    lrn: str
    qr_token: str
    is_signed: bool


def sign_student_qr(lrn: str, qr_token: str) -> str:
    clean_lrn = str(lrn or "").strip()
    clean_token = str(qr_token or "").strip()
    payload = f"{clean_lrn}:{clean_token}".encode("utf-8")
    sig = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload, hashlib.sha256).hexdigest()[:12].upper()
    return f"ATTENDSURE:{clean_lrn}:{clean_token}:{sig}"


def verify_student_qr(raw_scan: str, *, allow_legacy_unsigned: bool | None = None) -> VerifiedQrData | None:
    if allow_legacy_unsigned is None:
        allow_legacy_unsigned = bool(getattr(settings, "ALLOW_LEGACY_UNSIGNED_QR", False))
    clean = str(raw_scan or "").strip().replace("\r", "").replace("\n", "").replace("\0", "")[:128]
    if not clean:
        return None

    parts = clean.split(":")
    if len(parts) == 4 and parts[0].upper() == "ATTENDSURE":
        _, lrn, token, provided_sig = parts
        expected_sig = sign_student_qr(lrn, token).rsplit(":", 1)[-1]
        if not hmac.compare_digest(provided_sig.upper(), expected_sig):
            return None
        return VerifiedQrData(lrn=lrn.strip(), qr_token=token.strip(), is_signed=True)

    if not allow_legacy_unsigned:
        return None

    token_only = parts[-1].strip()
    return VerifiedQrData(lrn=token_only, qr_token=token_only, is_signed=False)