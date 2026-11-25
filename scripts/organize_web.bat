@REM AttendSure Scripts - Organize Web
@REM File: D:\AttendSure_V3\scripts\organize_web.bat

@setlocal & set "_PY=python" & (if exist "%~dp0..\backend\venv\Scripts\python.exe" set "_PY=%~dp0..\backend\venv\Scripts\python.exe") & call "%%_PY%%" -x "%~f0" %* & exit /b
r"""
AttendSure - Web Portal Dead-File Archiver
Moves commented-out and unused starter files into web/_archived_legacy/.
"""

import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = PROJECT_ROOT / "web"
ARCHIVE_DIR = WEB_DIR / "_archived_legacy"

DEAD_WEB_FILES = [
    "src/App.css",
    "src/components/reports/DepEdLetterhead.tsx",
    "src/components/reports/ReportHeader.tsx",
    "src/components/layout/AppLayout.tsx",
    "src/components/layout/ProfileDropdown.tsx",
    "src/components/modals/SystemHealthModal.tsx",
    "src/components/modals/UserFormModal.tsx",
    "src/components/modals/UserDeleteModal.tsx",
    "src/constants/uiCopy.ts",
    "src/types/sf1.ts",
]


def main():
    moved = 0
    for rel in DEAD_WEB_FILES:
        src = WEB_DIR / rel
        if src.is_file():
            dest = ARCHIVE_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                dest.unlink()
            shutil.move(str(src), str(dest))
            print(f"[ARCHIVED] web/{rel} -> web/_archived_legacy/{rel}")
            moved += 1

    for folder in sorted((WEB_DIR / "src").rglob("*"), reverse=True):
        if folder.is_dir():
            try:
                folder.rmdir()
            except OSError:
                pass

    print(f"\n[OK] Cleaned web/ structure ({moved} unused file(s) archived).")


if __name__ == "__main__":
    main()
