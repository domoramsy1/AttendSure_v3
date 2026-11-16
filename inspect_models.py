"""
AttendSure V3 - Database Models Inspector
File: D:\\AttendSure_V3\\scripts\\inspect_models.py
"""

import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
MODELS_DIR = PROJECT_ROOT / "backend" / "apps" / "academics" / "models"
OUTPUT_FILE = SCRIPTS_DIR / "results" / "models_code.txt"
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)


def main():
    if not MODELS_DIR.exists():
        print(f"[ERROR] Models directory not found: {MODELS_DIR}")
        sys.exit(1)

    out_lines = [
        "=" * 80,
        "ATTENDSURE V3 - ACADEMICS MODEL SCHEMA & DEFINITIONS",
        f"Path: {MODELS_DIR}",
        "=" * 80,
        ""
    ]

    py_files = sorted([f for f in MODELS_DIR.glob("*.py") if f.name != "__pycache__"])
    for py_file in py_files:
        out_lines.append("-" * 80)
        out_lines.append(f"MODEL FILE: {py_file.name}")
        out_lines.append("-" * 80)
        out_lines.append(py_file.read_text(encoding="utf-8", errors="replace"))
        out_lines.append("")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines))

    print(f"Scanned {len(py_files)} model files.")
    print(f"Report saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()