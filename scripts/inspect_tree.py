"""
AttendSure V3 - Backend Directory Tree Inspector
File: D:\\AttendSure_V3\\scripts\\inspect_tree.py
"""

from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
TARGET_DIR = SCRIPTS_DIR.parent / "backend"
IGNORE_DIRS = {'.git', '__pycache__', 'venv', '.venv', 'logs', 'staticfiles', 'media'}


def print_tree(directory: Path, prefix: str = ""):
    entries = sorted(
        [e for e in directory.iterdir() if e.name not in IGNORE_DIRS],
        key=lambda x: (x.is_file(), x.name.lower())
    )
    total = len(entries)
    for idx, entry in enumerate(entries):
        is_last = (idx == total - 1)
        connector = "\\-- " if is_last else "|-- "
        if entry.is_dir():
            print(f"{prefix}{connector}[DIR] {entry.name}/")
            print_tree(entry, prefix + ("    " if is_last else "|   "))
        else:
            print(f"{prefix}{connector}[FILE] {entry.name}")


if __name__ == "__main__":
    print("=" * 60)
    print(f"Backend Directory Tree: {TARGET_DIR}")
    print("=" * 60)
    print_tree(TARGET_DIR)