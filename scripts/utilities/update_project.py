r"""
AttendSure - Safe Project Pull, Migration & Dependency Updater
Run: python utilities\update_project.py
"""

import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import BACKEND_DIR, MOBILE_DIR, PROJECT_ROOT, WEB_DIR, ensure_venv_python

ensure_venv_python()


def run_cmd(cmd: list[str], cwd: Path) -> None:
    res = subprocess.run(cmd, cwd=str(cwd), shell=(sys.platform == "win32"))
    if res.returncode != 0:
        sys.exit(f"[ERROR] Command failed ({res.returncode}): {' '.join(cmd)}")


def main():
    print("=" * 60 + "\n  ATTENDSURE PROJECT UPDATER\n" + "=" * 60)

    dirty = subprocess.getoutput(f'git -C "{PROJECT_ROOT}" status --porcelain').strip()
    if dirty:
        run_cmd(["git", "stash", "push", "-m", "attendsure_update_stash"], PROJECT_ROOT)
    run_cmd(["git", "pull", "origin", "main", "--tags"], PROJECT_ROOT)
    if dirty:
        subprocess.run(["git", "stash", "pop"], cwd=str(PROJECT_ROOT), shell=True)

    run_cmd([sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--quiet"], BACKEND_DIR)
    run_cmd([sys.executable, "manage.py", "migrate"], BACKEND_DIR)
    run_cmd([sys.executable, "manage.py", "check"], BACKEND_DIR)

    for fe_dir in (WEB_DIR, MOBILE_DIR):
        if (fe_dir / "package.json").is_file():
            run_cmd(["npm", "install", "--prefer-offline"], fe_dir)

    print("[SUCCESS] Backend, Web, and Mobile environments are synced and verified.")


if __name__ == "__main__":
    main()
