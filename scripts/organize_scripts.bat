@setlocal & set "_PY=python" & (if exist "%~dp0..\backend\venv\Scripts\python.exe" set "_PY=%~dp0..\backend\venv\Scripts\python.exe") & call "%%_PY%%" -x "%~f0" %* & exit /b
r"""
AttendSure - Scripts Folder Organizer
Archives legacy/duplicate scripts into scripts/_archived_legacy/ and creates clean folders.
"""

import shutil
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
ARCHIVE_DIR = SCRIPTS_DIR / "_archived_legacy"

REQUIRED_DIRS = [
    SCRIPTS_DIR / "database",
    SCRIPTS_DIR / "testing",
    SCRIPTS_DIR / "utilities",
    SCRIPTS_DIR / "exports",
    SCRIPTS_DIR / "results",
]

KEEP_FILES = {
    "_bootstrap.py",
    "organize_scripts.bat",
    "start_all.bat",
    "start_tunnel.bat",
    "export_codes.bat",
    "push_and_sync.ps1",
    "database/check_database.py",
    "database/reset_connections.py",
    "database/seed_school.py",
    "database/sync_avatars.py",
    "testing/run_all_tests.py",
    "testing/test_api_cruds.py",
    "testing/check_campus_gps.py",
    "testing/audit_codebase.py",
    "testing/stress_test_api.py",
    "utilities/clean_project.py",
    "utilities/inspect_models.py",
    "utilities/update_project.py",
}

SKIP_ROOT_DIRS = {"_archived_legacy", "exports", "results", "__pycache__"}


def main():
    for folder in REQUIRED_DIRS:
        folder.mkdir(parents=True, exist_ok=True)

    moved = 0
    for item in sorted(SCRIPTS_DIR.rglob("*")):
        if not item.is_file():
            continue
        rel_parts = item.relative_to(SCRIPTS_DIR).parts
        if rel_parts[0] in SKIP_ROOT_DIRS:
            continue

        rel_posix = item.relative_to(SCRIPTS_DIR).as_posix()
        if rel_posix not in KEEP_FILES:
            dest = ARCHIVE_DIR / rel_posix
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                dest.unlink()
            shutil.move(str(item), str(dest))
            print(f"[ARCHIVED] {rel_posix} -> _archived_legacy/{rel_posix}")
            moved += 1

    # Remove empty legacy directories such as scripts/data/
    for folder in sorted(SCRIPTS_DIR.rglob("*"), reverse=True):
        if folder.is_dir() and folder.name not in SKIP_ROOT_DIRS and folder not in REQUIRED_DIRS:
            try:
                folder.rmdir()
            except OSError:
                pass

    print(f"\n[OK] Organized scripts/ cleanly ({moved} legacy file(s) archived).")


if __name__ == "__main__":
    main()
