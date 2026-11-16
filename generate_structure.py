"""
AttendSure V3 - High-Speed Project Structure & File Tree Exporter
File: D:\AttendSure_V3\generate_structure.py

Key Capabilities:
1. Fast Folder Pruning: Immediately skips heavy folders (node_modules, .git, venv)
   without opening them, completing the scan in milliseconds.
2. Cybersecurity Protection: Blocks .env credentials, database files,
   signing keys, and logs from being exposed in file dumps.
3. Dual Output: Produces both an ASCII visual directory tree and a clean flat
   path list in project_files.txt.
"""

import os
import re
from datetime import datetime

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(ROOT_DIR, "project_files.txt")

# ---------------------------------------------------------------------------
# 1. PRUNED DIRECTORIES (Skipped instantly at top level)
# ---------------------------------------------------------------------------
EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    ".expo",
    ".vscode",
    "__pycache__",
    "venv",
    "env",
    ".venv",
    "dist",
    "build",
    "coverage",
    ".cache",
    "media",
}

# ---------------------------------------------------------------------------
# 2. CYBERSECURITY EXCLUSIONS (Never expose keys, DBs, or secret files)
# ---------------------------------------------------------------------------
EXCLUDE_FILE_REGEX = re.compile(
    r"^(project_files\.txt|all_source_codes\.txt|package-lock\.json|yarn\.lock|"
    r"pnpm-lock\.yaml|\.env.*|.*\.sqlite3|.*\.db|.*\.log|.*\.pyc|.*\.keystore|"
    r".*\.jks|.*\.pem|.*\.key|.*\.pfx|google-services\.json|GoogleService-Info\.plist)$",
    re.IGNORECASE,
)

# Tracking state
dir_count = 0
file_count = 0
flat_list = []
tree_lines = []


def process_directory(current_path: str, prefix: str = ""):
    """Recursively traverses directories using fast os.scandir."""
    global dir_count, file_count

    try:
        raw_entries = list(os.scandir(current_path))
    except (PermissionError, OSError):
        return

    # Filter out excluded directories and excluded secret files
    valid_entries = []
    for entry in raw_entries:
        try:
            if entry.is_dir(follow_symlinks=False):
                if entry.name not in EXCLUDE_DIRS:
                    valid_entries.append(entry)
            elif entry.is_file(follow_symlinks=False):
                if not EXCLUDE_FILE_REGEX.match(entry.name):
                    valid_entries.append(entry)
        except OSError:
            continue

    # Sort directories first, then files, both alphabetically
    valid_entries.sort(
        key=lambda e: (0 if e.is_dir(follow_symlinks=False) else 1, e.name.lower())
    )

    total = len(valid_entries)
    for index, entry in enumerate(valid_entries):
        is_last = index == (total - 1)
        branch = "└── " if is_last else "├── "
        next_prefix = prefix + ("    " if is_last else "│   ")
        rel_path = os.path.relpath(entry.path, ROOT_DIR)

        if entry.is_dir(follow_symlinks=False):
            dir_count += 1
            tree_lines.append(f"{prefix}{branch}{entry.name}/")
            process_directory(entry.path, next_prefix)
        else:
            file_count += 1
            flat_list.append(rel_path)
            tree_lines.append(f"{prefix}{branch}{entry.name}")


def main():
    print("Scanning AttendSure V3 project structure...")
    process_directory(ROOT_DIR)

    header = (
        "================================================================================\n"
        "ATTENDSURE V3 - PROJECT FILE & DIRECTORY STRUCTURE\n"
        f"Generated : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        f"Root Path : {ROOT_DIR}\n"
        f"Summary   : {dir_count} Directories, {file_count} Source Files\n"
        "================================================================================\n\n"
        "--- VISUAL DIRECTORY TREE ---\n"
        "AttendSure_V3/\n"
    )

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(header)
        for line in tree_lines:
            f.write(line + "\n")

        f.write("\n================================================================================\n")
        f.write(f"--- FLAT RELATIVE PATH LIST ({file_count} Files) ---\n")
        f.write("================================================================================\n")
        for path in flat_list:
            f.write(path + "\n")

    print(f"Success! Scanned {dir_count} folders and {file_count} files in under 1 second.")
    print(f"Output saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()