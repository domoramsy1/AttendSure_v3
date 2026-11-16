"""
AttendSure V3 - Master Script Runner
Executes diagnostic and test scripts, saving their logs and outputs into scripts/results/
File: D:\\AttendSure_V3\\scripts\\run_all_scripts_to_results.py
"""

import os
import sys
import subprocess
from datetime import datetime
from pathlib import Path

# Paths configuration
SCRIPTS_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPTS_DIR.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
RESULTS_DIR = SCRIPTS_DIR / "results"

# Ensure the results folder exists
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# List of safe inspection and test scripts to run automatically
TARGET_SCRIPTS = [
    "audit_system.py",
    "show_models.py",
    "show_tree.py",
    "show_scripts_codebase.py",
    "test_all_cruds.py",
    "test_auth.py",
    "test_classroom.py",
    "test_faculty_live.py",
    "test_geofence.py",
    "test_live_db.py",
    "test_reports.py",
]


def run_single_script(script_name: str) -> dict:
    script_path = SCRIPTS_DIR / script_name
    if not script_path.exists():
        return {
            "name": script_name,
            "status": "MISSING",
            "message": f"Script not found at {script_path}",
        }

    output_filename = f"{Path(script_name).stem}_result.txt"
    output_path = RESULTS_DIR / output_filename

    print(f"[*] Running {script_name}...")

    # Set up environment with backend in PYTHONPATH so Django models load cleanly
    env = os.environ.copy()
    current_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{BACKEND_DIR}{os.pathsep}{current_pythonpath}"

    try:
        process = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(BACKEND_DIR),
            capture_output=True,
            text=True,
            env=env,
            timeout=120,
        )

        stdout_text = process.stdout or ""
        stderr_text = process.stderr or ""
        status_text = "SUCCESS" if process.returncode == 0 else f"FAILED (Exit Code {process.returncode})"

        # Write output log to results folder
        header = f"=" * 80 + "\n"
        log_content = (
            f"{header}"
            f"ATTENDSURE V3 SCRIPT EXECUTION RESULT\n"
            f"Script: {script_name}\n"
            f"Executed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            f"Status: {status_text}\n"
            f"{header}\n\n"
            f"--- STANDARD OUTPUT ---\n{stdout_text}\n\n"
        )

        if stderr_text:
            log_content += f"--- STANDARD ERROR / WARNINGS ---\n{stderr_text}\n"

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(log_content)

        return {
            "name": script_name,
            "status": status_text,
            "output_file": output_path.name,
        }

    except subprocess.TimeoutExpired:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"Script {script_name} timed out after 120 seconds.\n")
        return {"name": script_name, "status": "TIMEOUT", "output_file": output_path.name}

    except Exception as ex:
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"Failed to execute {script_name}: {ex}\n")
        return {"name": script_name, "status": "ERROR", "output_file": output_path.name}


def main():
    print("=" * 80)
    print(" ATTENDSURE V3 - RUNNING ALL SCRIPTS & COLLECTING RESULTS")
    print(f" Target folder: {RESULTS_DIR}")
    print("=" * 80)

    summary_records = []
    for script in TARGET_SCRIPTS:
        res = run_single_script(script)
        summary_records.append(res)
        print(f"    -> [{res['status']}] Output saved to: results/{res.get('output_file', 'N/A')}")

    # Write overall master summary file
    summary_file = RESULTS_DIR / "_all_scripts_summary.txt"
    summary_lines = [
        "=" * 80,
        "ATTENDSURE V3 - ALL SCRIPTS SUMMARY REPORT",
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "=" * 80,
        f"{'Script Name':<30} | {'Status':<20} | {'Log File'}",
        "-" * 80,
    ]

    for item in summary_records:
        summary_lines.append(
            f"{item['name']:<30} | {item['status']:<20} | {item.get('output_file', 'None')}"
        )

    summary_lines.append("=" * 80)

    with open(summary_file, "w", encoding="utf-8") as f:
        f.write("\n".join(summary_lines))

    print("\n" + "\n".join(summary_lines))
    print(f"\nAll script results are saved inside: {RESULTS_DIR}")


if __name__ == "__main__":
    main()