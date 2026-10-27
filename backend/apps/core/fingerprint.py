"""
AttendSure V3 - Server Hardware Fingerprinting
File: backend/apps/core/fingerprint.py
"""

import hashlib
import platform
import uuid


def generate_hardware_fingerprint() -> str:
    """
    Creates a unique, persistent hardware hash based on node identity and CPU platform.
    """
    node_id = str(uuid.getnode())
    machine_arch = platform.machine()
    system_name = platform.system()
    raw_id = f"{node_id}-{machine_arch}-{system_name}"

    return hashlib.sha256(raw_id.encode('utf-8')).hexdigest()[:32]