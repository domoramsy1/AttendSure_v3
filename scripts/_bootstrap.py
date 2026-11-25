# AttendSure Scripts - Bootstrap
# File: D:\AttendSure_V3\scripts\_bootstrap.py

r"""
AttendSure - Shared Script Bootstrap & Virtualenv Resolver
File: D:\AttendSure_V3\scripts\_bootstrap.py
"""

import os
import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
WEB_DIR = PROJECT_ROOT / "web"
MOBILE_DIR = PROJECT_ROOT / "mobile"
RESULTS_DIR = SCRIPTS_DIR / "results"
EXPORTS_DIR = SCRIPTS_DIR / "exports"


def get_venv_python() -> Path | None:
    candidates = [
        BACKEND_DIR / "venv" / "Scripts" / "python.exe",
        BACKEND_DIR / ".venv" / "Scripts" / "python.exe",
        PROJECT_ROOT / "venv" / "Scripts" / "python.exe",
    ]
    for path in candidates:
        if path.is_file():
            return path
    return None


def ensure_venv_python() -> None:
    """Re-runs the active script inside backend/venv if started with global Python."""
    if os.environ.get("ATTENDSURE_VENV_BOOTSTRAPPED") == "1":
        return
    venv_py = get_venv_python()
    if venv_py and Path(sys.executable).resolve() != venv_py.resolve():
        env = os.environ.copy()
        env["ATTENDSURE_VENV_BOOTSTRAPPED"] = "1"
        result = subprocess.run([str(venv_py), *sys.argv], env=env)
        sys.exit(result.returncode)


def setup_django() -> None:
    """Configures sys.path and initializes Django 6 with config.settings."""
    ensure_venv_python()
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    backend_str = str(BACKEND_DIR)
    if backend_str not in sys.path:
        sys.path.insert(0, backend_str)

    os.environ.pop("DJANGO_SETTINGS_MODULE", None)
    os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"

    import django
    django.setup()
