r"""
AttendSure - Master Diagnostics & Test Runner
Run: python testing\run_all_tests.py
"""

import subprocess
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import RESULTS_DIR, SCRIPTS_DIR, ensure_venv_python

ensure_venv_python()

SUITES = [
    SCRIPTS_DIR / "database" / "check_database.py",
    SCRIPTS_DIR / "testing" / "audit_codebase.py",
    SCRIPTS_DIR / "testing" / "check_campus_gps.py",
    SCRIPTS_DIR / "utilities" / "inspect_models.py",
    SCRIPTS_DIR / "testing" / "test_api_cruds.py",
]


def main():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    summary = [
        "=" * 76,
        f"ATTENDSURE DIAGNOSTICS SUMMARY ({datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')})",
        "=" * 76,
    ]
    failed = 0

    for script in SUITES:
        rel = script.relative_to(SCRIPTS_DIR)
        print(f"[*] Running {rel} ...")
        proc = subprocess.run([sys.executable, str(script)], capture_output=True, text=True, encoding="utf-8", errors="replace")
        ok = proc.returncode == 0
        if not ok:
            failed += 1
        status = "PASSED" if ok else f"FAILED ({proc.returncode})"
        log_file = RESULTS_DIR / f"{script.stem}_output.txt"
        log_file.write_text((proc.stdout or "") + "\n" + (proc.stderr or ""), encoding="utf-8")
        line = f"  {str(rel):<35} | {status:<14} | results/{log_file.name}"
        print(line)
        summary.append(line)

    summary.append("=" * 76)
    (RESULTS_DIR / "_summary.txt").write_text("\n".join(summary), encoding="utf-8")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
