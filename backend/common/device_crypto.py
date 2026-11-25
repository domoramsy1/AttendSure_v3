# AttendSure Backend - Teacher Phone Asymmetric Signature & Challenge Helper
# File: D:\AttendSure_V3\backend\common\device_crypto.py

"""
Cryptographic verification for Teacher Time In / Time Out on-device check-in proofs.
Supports Ed25519 and ECDSA P-256 asymmetric signatures verified via Python `cryptography`.
Stores ONLY public keys on the server — private keys and screen-lock credentials never leave the phone.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from typing import Literal

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, ed25519
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from django.core.cache import cache

KeyAlgorithm = Literal["ED25519", "ECDSA_P256"]
SUPPORTED_ALGORITHMS: frozenset[str] = frozenset({"ED25519", "ECDSA_P256"})
CHECKIN_CHALLENGE_TTL_SECONDS = 120


def _decode_key_or_sig_bytes(raw: str) -> bytes:
    cleaned = str(raw or "").strip()
    if not cleaned:
        raise ValueError("Empty cryptographic material.")

    if cleaned.startswith("-----BEGIN "):
        return cleaned.encode("utf-8")

    # Hex encoding (even length, valid hex digits)
    if len(cleaned) % 2 == 0 and all(ch in "0123456789abcdefABCDEF" for ch in cleaned):
        return bytes.fromhex(cleaned)

    # Standard or URL-safe Base64 (with optional missing padding)
    b64 = cleaned.replace("-", "+").replace("_", "/")
    pad = (-len(b64)) % 4
    if pad:
        b64 += "=" * pad
    try:
        return base64.b64decode(b64, validate=True)
    except Exception as exc:
        raise ValueError("Unsupported encoding for public key or signature.") from exc


def load_teacher_public_key(
    public_key_str: str, algorithm: str | None = None
) -> tuple[ed25519.Ed25519PublicKey | ec.EllipticCurvePublicKey, KeyAlgorithm, bytes]:
    """
    Loads a teacher's phone public key (PEM SPKI, raw 32-byte Ed25519, or raw 65-byte SEC1 P-256)
    and returns `(public_key_obj, normalized_algorithm, canonical_public_bytes)`.
    """
    cleaned = str(public_key_str or "").strip()
    if not cleaned:
        raise ValueError("Public key is required.")

    alg_hint = str(algorithm or "").strip().upper()
    if alg_hint and alg_hint not in SUPPORTED_ALGORITHMS:
        raise ValueError(f"Unsupported signing algorithm '{alg_hint}'.")

    raw_bytes = _decode_key_or_sig_bytes(cleaned)

    if cleaned.startswith("-----BEGIN "):
        key_obj = serialization.load_pem_public_key(raw_bytes)
        if isinstance(key_obj, ed25519.Ed25519PublicKey):
            canonical = key_obj.public_bytes(
                encoding=serialization.Encoding.Raw,
                format=serialization.PublicFormat.Raw,
            )
            return key_obj, "ED25519", canonical
        if isinstance(key_obj, ec.EllipticCurvePublicKey) and isinstance(key_obj.curve, ec.SECP256R1):
            canonical = key_obj.public_bytes(
                encoding=serialization.Encoding.X962,
                format=serialization.PublicFormat.UncompressedPoint,
            )
            return key_obj, "ECDSA_P256", canonical
        raise ValueError("Only Ed25519 and ECDSA P-256 public keys are supported.")

    # DER-encoded SubjectPublicKeyInfo fallback
    if len(raw_bytes) not in (32, 65):
        try:
            key_obj = serialization.load_der_public_key(raw_bytes)
            if isinstance(key_obj, ed25519.Ed25519PublicKey):
                canonical = key_obj.public_bytes(
                    encoding=serialization.Encoding.Raw,
                    format=serialization.PublicFormat.Raw,
                )
                return key_obj, "ED25519", canonical
            if isinstance(key_obj, ec.EllipticCurvePublicKey) and isinstance(
                key_obj.curve, ec.SECP256R1
            ):
                canonical = key_obj.public_bytes(
                    encoding=serialization.Encoding.X962,
                    format=serialization.PublicFormat.UncompressedPoint,
                )
                return key_obj, "ECDSA_P256", canonical
        except Exception as exc:
            raise ValueError("Invalid public key format.") from exc

    if len(raw_bytes) == 32 and alg_hint in ("", "ED25519"):
        key_obj = ed25519.Ed25519PublicKey.from_public_bytes(raw_bytes)
        return key_obj, "ED25519", raw_bytes

    if len(raw_bytes) == 65 and raw_bytes[0] == 0x04 and alg_hint in ("", "ECDSA_P256"):
        key_obj = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), raw_bytes)
        return key_obj, "ECDSA_P256", raw_bytes

    raise ValueError("Public key bytes do not match Ed25519 (32 bytes) or ECDSA P-256 (65 bytes).")


def compute_public_key_id(canonical_public_bytes: bytes) -> str:
    """Returns the lowercase 64-character SHA-256 fingerprint of the canonical public key bytes."""
    return hashlib.sha256(canonical_public_bytes).hexdigest()


def build_checkin_signing_message(
    *,
    user_id: int | str,
    device_id: str,
    timestamp_ms: int,
    action: str,
    nonce: str | None = None,
) -> bytes:
    """Builds the exact canonical UTF-8 payload signed by the teacher's phone private key."""
    clean_action = str(action or "").strip().upper()
    clean_nonce = str(nonce or "").strip()
    parts = [str(user_id).strip(), str(device_id).strip(), str(int(timestamp_ms)), clean_action]
    if clean_nonce:
        parts.append(clean_nonce)
    return ":".join(parts).encode("utf-8")


def verify_teacher_checkin_signature(
    *,
    public_key_str: str,
    signature_str: str,
    message: bytes,
    algorithm: str | None = None,
) -> tuple[bool, KeyAlgorithm, str, bytes]:
    """
    Verifies a digital signature produced on the teacher's phone.
    Returns `(is_valid, algorithm, public_key_id, raw_signature_bytes)`.
    """
    key_obj, detected_alg, canonical_pub = load_teacher_public_key(public_key_str, algorithm)
    key_id = compute_public_key_id(canonical_pub)
    sig_bytes = _decode_key_or_sig_bytes(signature_str)

    try:
        if detected_alg == "ED25519":
            if len(sig_bytes) != 64:
                return False, detected_alg, key_id, sig_bytes
            assert isinstance(key_obj, ed25519.Ed25519PublicKey)
            key_obj.verify(sig_bytes, message)
            return True, detected_alg, key_id, sig_bytes

        # ECDSA P-256: accept either ASN.1 DER or raw 64-byte IEEE P1363 (r || s)
        assert isinstance(key_obj, ec.EllipticCurvePublicKey)
        der_sig = sig_bytes
        if len(sig_bytes) == 64:
            r = int.from_bytes(sig_bytes[:32], "big")
            s = int.from_bytes(sig_bytes[32:], "big")
            der_sig = encode_dss_signature(r, s)
        key_obj.verify(der_sig, message, ec.ECDSA(hashes.SHA256()))
        return True, detected_alg, key_id, sig_bytes
    except (InvalidSignature, ValueError):
        return False, detected_alg, key_id, sig_bytes


def issue_checkin_challenge_nonce(teacher_id: int) -> str:
    """Issues a short-lived single-use cryptographic challenge nonce for a teacher check-in."""
    nonce = secrets.token_urlsafe(24)
    cache.set(f"checkin_challenge:{teacher_id}:{nonce}", True, timeout=CHECKIN_CHALLENGE_TTL_SECONDS)
    return nonce


def consume_checkin_challenge_nonce(teacher_id: int, nonce: str) -> bool:
    """Atomically consumes a previously issued check-in challenge nonce so it cannot be replayed."""
    clean_nonce = str(nonce or "").strip()
    if not clean_nonce:
        return False
    issued_key = f"checkin_challenge:{teacher_id}:{clean_nonce}"
    used_key = f"checkin_challenge_used:{teacher_id}:{clean_nonce}"
    if not cache.get(issued_key):
        return False
    if not cache.add(used_key, True, timeout=CHECKIN_CHALLENGE_TTL_SECONDS):
        return False
    cache.delete(issued_key)
    return True


def generate_ed25519_keypair() -> tuple[ed25519.Ed25519PrivateKey, str, str]:
    """Helper for automated tests: generates `(private_key, public_key_hex, key_id_sha256)`."""
    priv = ed25519.Ed25519PrivateKey.generate()
    pub_bytes = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return priv, pub_bytes.hex(), compute_public_key_id(pub_bytes)


def sign_checkin_payload_ed25519(
    *,
    private_key: ed25519.Ed25519PrivateKey,
    user_id: int | str,
    device_id: str,
    timestamp_ms: int,
    action: str,
    nonce: str | None = None,
) -> str:
    """Helper for automated tests: signs the canonical check-in message and returns hex signature."""
    msg = build_checkin_signing_message(
        user_id=user_id,
        device_id=device_id,
        timestamp_ms=timestamp_ms,
        action=action,
        nonce=nonce,
    )
    return private_key.sign(msg).hex()
