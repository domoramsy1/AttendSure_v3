import hashlib
import os
import platform
import subprocess
import uuid


def get_server_fingerprint() -> str:
    """Generates a deterministic hardware fingerprint without shell=True."""
    raw = []
    try:
        system_name = platform.system()
        if system_name == 'Windows':
            out = subprocess.check_output(
                ['powershell', '-NoProfile', '-Command', '(Get-CimInstance Win32_ComputerSystemProduct).UUID'],
                shell=False,
                timeout=3,
                stderr=subprocess.DEVNULL,
            ).decode('utf-8', errors='ignore').strip()
            if out:
                raw.append(out)
        elif system_name == 'Linux':
            uuid_path = '/sys/class/dmi/id/product_uuid'
            if os.path.exists(uuid_path):
                with open(uuid_path, 'r', encoding='utf-8') as f:
                    raw.append(f.read().strip())
    except Exception:
        pass

    if not raw:
        raw.append(platform.node())
        raw.append(str(uuid.getnode()))

    return hashlib.sha256('::'.join(raw).encode('utf-8')).hexdigest()[:32].upper()
