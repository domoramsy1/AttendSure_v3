# AttendSure Scripts - Inspect Models
# File: D:\AttendSure_V3\scripts\utilities\inspect_models.py

r"""
AttendSure - 6-Domain Models Schema Inspector (3NF)
Run: python utilities\inspect_models.py
"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import BACKEND_DIR, RESULTS_DIR

DOMAIN_APPS = ["accounts", "school", "students", "attendance", "campus", "reports"]


def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_file = RESULTS_DIR / "domain_models_report.txt"
    blocks = [
        "=" * 80,
        f"ATTENDSURE 3NF DOMAIN MODELS SNAPSHOT ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})",
        "=" * 80,
    ]

    found = 0
    for app in DOMAIN_APPS:
        model_file = BACKEND_DIR / "apps" / app / "models.py"
        if model_file.is_file():
            found += 1
            blocks.extend([
                "",
                "-" * 80,
                f"APP: {app}  |  FILE: backend/apps/{app}/models.py",
                "-" * 80,
                model_file.read_text(encoding="utf-8", errors="replace").rstrip(),
            ])

    if found == 0:
        print(f"[ERROR] No domain models.py files found under {BACKEND_DIR / 'apps'}")
        sys.exit(1)

    out_file.write_text("\n".join(blocks) + "\n", encoding="utf-8")
    print(f"[OK] Exported {found} domain models.py files to: {out_file}")


if __name__ == "__main__":
    main()
