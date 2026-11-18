r"""
AttendSure - Bytecode & Application Cache Cleaner
Run: python utilities\clean_project.py
"""

import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import BACKEND_DIR, EXPORTS_DIR, PROJECT_ROOT, RESULTS_DIR, SCRIPTS_DIR, setup_django

setup_django()

from django.core.cache import cache

SKIP_ROOTS = {"venv", ".venv", "node_modules", ".git", "_legacy_backup", "_archived_legacy"}


def main():
    removed = 0
    for pycache in PROJECT_ROOT.rglob("__pycache__"):
        if any(part in SKIP_ROOTS for part in pycache.parts):
            continue
        shutil.rmtree(pycache, ignore_errors=True)
        removed += 1

    # Remove stray folders if an older utility created them inside scripts/utilities/
    for stray in (SCRIPTS_DIR / "utilities" / "data", SCRIPTS_DIR / "utilities" / "results"):
        if stray.is_dir():
            shutil.rmtree(stray, ignore_errors=True)

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (BACKEND_DIR / "logs").mkdir(parents=True, exist_ok=True)

    cache.clear()
    print(f"[OK] Removed {removed} __pycache__ folder(s) and cleared Django cache.")


if __name__ == "__main__":
    main()
