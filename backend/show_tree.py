"""
AttendSure V3 - Backend Directory Tree Viewer
File: backend/show_tree.py

Displays a clean visual tree of your backend files while skipping
irrelevant noise like virtual environments, git history, and cache.
"""

import sys
from pathlib import Path

# Folders to skip to keep output clean and fast
IGNORE_DIRS = {
    '.git',
    '__pycache__',
    'venv',
    '.venv',
    'env',
    '.idea',
    '.vscode',
    'node_modules',
    '.pytest_cache',
}

IGNORE_FILES = {
    '.DS_Store',
    'Thumbs.db',
}


def print_tree(directory: Path, prefix: str = "", is_root: bool = True):
    if is_root:
        print(f"\n📁 {directory.resolve().name}/")

    try:
        # Get sorted entries (folders first, then files)
        entries = sorted(
            [e for e in directory.iterdir() if e.name not in IGNORE_DIRS and e.name not in IGNORE_FILES],
            key=lambda x: (x.is_file(), x.name.lower())
        )
    except PermissionError:
        print(f"{prefix}└── [Access Denied]")
        return 0, 0

    dir_count = 0
    file_count = 0
    total = len(entries)

    for index, entry in enumerate(entries):
        is_last = (index == total - 1)
        connector = "└── " if is_last else "├── "
        child_prefix = prefix + ("    " if is_last else "│   ")

        if entry.is_dir():
            dir_count += 1
            print(f"{prefix}{connector}📁 {entry.name}/")
            sub_dirs, sub_files = print_tree(entry, child_prefix, is_root=False)
            dir_count += sub_dirs
            file_count += sub_files
        else:
            file_count += 1
            print(f"{prefix}{connector}📄 {entry.name}")

    return dir_count, file_count


def main():
    target_dir = Path(__file__).resolve().parent

    # Allow custom path argument (e.g. python show_tree.py ../)
    if len(sys.argv) > 1:
        target_dir = Path(sys.argv[1]).resolve()

    if not target_dir.exists() or not target_dir.is_dir():
        print(f"[ERROR] Target directory does not exist: {target_dir}")
        sys.exit(1)

    print("=" * 60)
    print(f"Backend File Tree: {target_dir}")
    print("=" * 60)

    dirs, files = print_tree(target_dir)

    print("=" * 60)
    print(f"Summary: {dirs} directories, {files} files listed.")
    print("=" * 60)


if __name__ == "__main__":
    main()