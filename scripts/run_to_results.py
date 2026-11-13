"""
AttendSure V3 - Script Runner with Automatic Results Saving
File: D:\AttendSure_V3\scripts\run_to_results.py
Usage:
    python run_to_results.py test_all_cruds.py
    python run_to_results.py check_database.py
"""

import os
import sys
import subprocess
from datetime import datetime

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPTS_DIR, ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
RESULTS_DIR = os.path.join(SCRIPTS_DIR, "results")

os.makedirs(RESULTS_DIR, exist_ok=True)


def run_script_and_save(script_name: str) -> int:
    target_path = os.path.join(SCRIPTS_DIR, script_name)
    if not os.path.isfile(target_path):
        print(f"Error: Script '{script_name}' not found in {SCRIPTS_DIR}")
        return 1

    base_name = os.path.splitext(os.path.basename(script_name))[0]
    result_file = os.path.join(RESULTS_DIR, f"{base_name}_result.txt")

    env = os.environ.copy()
    existing_py_path = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{BACKEND_DIR}{os.pathsep}{existing_py_path}".strip(os.pathsep)
    env.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

    started_at = datetime.now().strftime("%Y-%m-%d %I:%M:%S %p")
    print(f"Running {script_name}...")

    completed = subprocess.run(
        [sys.executable, target_path],
        cwd=BACKEND_DIR if os.path.isdir(BACKEND_DIR) else PROJECT_ROOT,
        env=env,
        capture_output=True,
        text=True,
    )

    with open(result_file, "w", encoding="utf-8") as f:
        f.write(f"Script: {script_name}\n")
        f.write(f"Run Time: {started_at}\n")
        f.write(f"Exit Code: {completed.returncode}\n")
        f.write("=" * 60 + "\n\n")
        if completed.stdout:
            f.write(completed.stdout)
        if completed.stderr:
            f.write("\n--- ERRORS / WARNINGS ---\n")
            f.write(completed.stderr)

    print(f"Saved result to: {result_file}")
    return completed.returncode


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_to_results.py <script_filename.py>")
        sys.exit(1)

    exit_code = 0
    for arg in sys.argv[1:]:
        code = run_script_and_save(arg)
        if code != 0:
            exit_code = code

    sys.exit(exit_code)