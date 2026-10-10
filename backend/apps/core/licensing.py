import base64
import json
import os
from datetime import datetime
from pathlib import Path
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.serialization import load_pem_public_key

from .fingerprint import get_server_fingerprint

# Your AttendSure public key (safe to include inside the code)
ATTENDSURE_PUBLIC_KEY_PEM = b"""-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA03zVoNO3PcTyaofmWGp6
BmcQUaiWFYXV1RvJ3ZK3dsLNSMJsiha/BjBdyf0MG7zPzNPYn7QMBBoG0P3/ObTw
KsYWw1tzrh5TKFjegkaoDhXpFRZzRDx7OZCQcnuYOIhBUgUcmnMXU9y35oZvSNk3
x/eXPPpGepvYFlOcJO+XUVRmkVggvhENakk6brpeP+bttl64DGKtgP7qDzJmywzx
jyJc7ZXcwlC28Czg33hwDh9kTu1p4LyOYy/PIPEEjK2a6sdRSrBxhVWopGsRFQjk
rXe1kkbIYOT0W2SG1BtgRVA6+wsgYoiEgHzg4KPC6wnSUxrDerix2LW+YHxwWAyY
NQIDAQAB
-----END PUBLIC KEY-----"""

class LicenseManager:
    LICENSE_PATH = Path("attendsure.lic")

    @classmethod
    def verify_license(cls, active_school_id: str) -> dict:
        """
        Validates the license file.
        Returns the license data if valid, or raises an exception.
        """
        if not cls.LICENSE_PATH.exists():
            raise PermissionError("License file (attendsure.lic) not found. Contact vendor for authorization.")

        with open(cls.LICENSE_PATH, "r") as f:
            raw_content = f.read().strip()

        try:
            # License format: BASE64_PAYLOAD.BASE64_SIGNATURE
            payload_b64, signature_b64 = raw_content.split(".")
            payload_bytes = base64.b64decode(payload_b64)
            signature_bytes = base64.b64decode(signature_b64)
            license_data = json.loads(payload_bytes.decode())
        except Exception:
            raise ValueError("Corrupted license file format.")

        # 1. Cryptographic Signature Check (proves only YOU created this file)
        public_key = load_pem_public_key(ATTENDSURE_PUBLIC_KEY_PEM)
        try:
            public_key.verify(
                signature_bytes,
                payload_bytes,
                padding.PKCS1v15(),
                hashes.SHA256()
            )
        except Exception:
            raise PermissionError("Invalid license signature. Unauthorized tampering detected.")

        # 2. School ID Check (ensures it is only used for the granted school)
        if str(license_data.get("school_id")) != str(active_school_id):
            raise PermissionError(
                f"License mismatch: Granted for school ID '{license_data.get('school_id')}', "
                f"but this server is running school ID '{active_school_id}'."
            )

        # 3. Server Hardware Lock (prevents copying to another computer)
        current_server_hw = get_server_fingerprint()
        if license_data.get("hardware_id") != current_server_hw:
            raise PermissionError(
                "Hardware mismatch: This software is licensed to run on a different physical computer."
            )

        # 4. Expiration Date Check
        expiry = datetime.strptime(license_data["expires_at"], "%Y-%m-%d").date()
        if datetime.now().date() > expiry:
            raise PermissionError(f"License expired on {expiry}. Please renew your software agreement.")

        return license_data