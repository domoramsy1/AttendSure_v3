"""
AttendSure V3 - Master Script Runner
File: D:\\AttendSure_V3\\scripts\\run_all.py
"""

import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
RESULTS_DIR = SCRIPTS_DIR / "results"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

TARGET_SCRIPTS = [
    "check_db.py",
    "check_kiosks.py",
    "check_gps.py",
    "audit_system.py",
    "inspect_models.py",
    "inspect_tree.py",
    "inspect_scripts.py",
    "test_cruds.py",
    "test_auth.py",
    "test_classroom.py",
    "test_geofence.py",
    "test_reports.py",
    "test_db.py",
]


def run_script(script_name: str) -> dict:
    script_path = SCRIPTS_DIR / script_name
    if not script_path.exists():
        return {"name": script_name, "status": "MISSING"}

    output_path = RESULTS_DIR / f"{Path(script_name).stem}_result.txt"
    print(f"[*] Running {script_name}...")

    env = os.environ.copy()
    env["PYTHONPATH"] = f"{BACKEND_DIR}{os.pathsep}{PROJECT_ROOT}{os.pathsep}{env.get('PYTHONPATH', '')}"
    env["PYTHONIOENCODING"] = "utf-8"

    try:
        proc = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(BACKEND_DIR),
            capture_output=True,
            text=True,
            env=env,
            timeout=90,
        )

        status_text = "PASSED" if proc.returncode == 0 else f"FAILED (Exit Code {proc.returncode})"
        content = (
            f"================================================================================\n"
            f"ATTENDSURE V3 SCRIPT RESULT: {script_name}\n"
            f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"Status: {status_text}\n"
            f"================================================================================\n\n"
            f"--- OUTPUT ---\n{proc.stdout}\n"
        )
        if proc.stderr:
            content += f"--- ERRORS / WARNINGS ---\n{proc.stderr}\n"

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(content)

        return {"name": script_name, "status": status_text, "file": output_path.name}

    except Exception as exc:
        return {"name": script_name, "status": f"ERROR: {exc}"}


def main():
    print("=" * 80)
    print(" ATTENDSURE V3 - RUNNING DIAGNOSTICS & TESTS")
    print(f" Target Folder: {RESULTS_DIR}")
    print("=" * 80)

    summary = []
    for s in TARGET_SCRIPTS:
        res = run_script(s)
        summary.append(res)
        print(f"    -> [{res['status']}]")

    summary_file = RESULTS_DIR / "_summary.txt"
    with open(summary_file, "w", encoding="utf-8") as f:
        f.write(f"ATTENDSURE V3 TEST SUMMARY - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        for item in summary:
            f.write(f"{item['name']:<25} | {item['status']}\n")

    print("\n[OK] Diagnostics and tests complete. Logs written to scripts/results/.")


if __name__ == "__main__":
    main()