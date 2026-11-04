"""
AttendSure V3 - Project Cleaner
File: D:\\AttendSure_V3\\scripts\\clean_project.py
"""

import shutil
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent


def main():
    print("[*] Cleaning project repository...")
    removed = 0
    for cache_dir in PROJECT_ROOT.rglob("__pycache__"):
        try:
            shutil.rmtree(cache_dir)
            removed += 1
        except Exception:
            pass

    # Ensure required runtime folders exist
    (SCRIPTS_DIR / "results").mkdir(parents=True, exist_ok=True)
    (SCRIPTS_DIR / "data").mkdir(parents=True, exist_ok=True)
    (PROJECT_ROOT / "backend" / "logs").mkdir(parents=True, exist_ok=True)

    print(f"[✓] Removed {removed} stale __pycache__ folders.")
    print("[✓] Project structure verified and ready.")


if __name__ == "__main__":
    main()