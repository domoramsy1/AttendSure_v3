import hashlib
import os
import platform
import subprocess

def get_server_fingerprint() -> str:
    raw = []
    try:
        if platform.system() == 'Windows':
            u = subprocess.check_output('wmic csproduct get uuid', shell=True).decode().split()
            if len(u) > 1:
                raw.append(u[1])
            b = subprocess.check_output('wmic baseboard get serialnumber', shell=True).decode().split()
            if len(b) > 1:
                raw.append(b[1])
        elif platform.system() == 'Linux':
            if os.path.exists('/sys/class/dmi/id/product_uuid'):
                raw.append(open('/sys/class/dmi/id/product_uuid').read().strip())
    except Exception:
        pass
    if not raw:
        raw.append(platform.node())
    return hashlib.sha256('::'.join(raw).encode('utf-8')).hexdigest()[:32].upper()
