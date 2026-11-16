"""
AttendSure V3 - Scripts Directory Tree and Codebase Viewer
Scans D:\\AttendSure_V3\\scripts, prints the file tree, and outputs all code.
File: D:\\AttendSure_V3\\scripts\\show_scripts_codebase.py
"""

import os
import sys
from pathlib import Path

# Base directory: the folder containing this script
SCRIPTS_DIR = Path(__file__).resolve().parent
# Updated output path
OUTPUT_FILE = SCRIPTS_DIR / "results" / "scripts_codebase_overview.txt"

# File types to inspect and display
CODE_EXTENSIONS = {'.py', '.bat', '.txt', '.json', '.sql', '.sh', '.cmd', '.md'}

# Folders and files to exclude from code dumping
IGNORE_DIRS = {'__pycache__', '.git', 'venv'}
IGNORE_FILES = {'scripts_codebase_overview.txt'}


def get_file_tree(folder: Path, prefix: str = "") -> list:
    """Builds a formatted text representation of the folder structure."""
    lines = []
    items = sorted(
        [item for item in folder.iterdir() if item.name not in IGNORE_DIRS],
        key=lambda x: (not x.is_dir(), x.name.lower())
    )

    total_items = len(items)
    for index, item in enumerate(items):
        is_last = (index == total_items - 1)
        connector = "└── " if is_last else "├── "
        lines.append(f"{prefix}{connector}{item.name}")

        if item.is_dir():
            sub_prefix = f"{prefix}{'    ' if is_last else '│   '}"
            lines.extend(get_file_tree(item, sub_prefix))

    return lines


def read_file_safely(file_path: Path) -> str:
    """Reads file text safely without crashing on encoding or byte issues."""
    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            return f.read()
    except Exception as e:
        return f"[Error reading file: {e}]"


def run_codebase_scan():
    output_lines = []

    header = "=" * 80
    output_lines.append(header)
    output_lines.append(f" ATTENDSURE V3 - SCRIPTS FOLDER STRUCTURE & CODEBASE")
    output_lines.append(f" Root Path: {SCRIPTS_DIR}")
    output_lines.append(header)
    output_lines.append("")

    # Part 1: Visual Folder Tree
    output_lines.append("📁 1. DIRECTORY STRUCTURE:")
    output_lines.append(f"scripts/")
    tree_lines = get_file_tree(SCRIPTS_DIR)
    output_lines.extend(tree_lines)
    output_lines.append("")
    output_lines.append(header)

    # Part 2: Codebase Content Dump
    output_lines.append("📄 2. CODEBASE CONTENTS:")
    output_lines.append(header)
    output_lines.append("")

    file_count = 0
    total_lines = 0

    for root, dirs, files in os.walk(SCRIPTS_DIR):
        # Exclude ignored folders
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

        for file_name in sorted(files):
            if file_name in IGNORE_FILES:
                continue

            file_path = Path(root) / file_name
            ext = file_path.suffix.lower()

            if ext in CODE_EXTENSIONS:
                file_count += 1
                rel_path = file_path.relative_to(SCRIPTS_DIR)
                code_content = read_file_safely(file_path)
                lines_in_file = len(code_content.splitlines())
                total_lines += lines_in_file

                output_lines.append("-" * 80)
                output_lines.append(f"FILE: scripts/{rel_path} ({lines_in_file} lines)")
                output_lines.append("-" * 80)
                output_lines.append(code_content)
                output_lines.append("")

    summary = [
        header,
        f" SCAN COMPLETE: {file_count} script files scanned, {total_lines} total lines of code.",
        header
    ]
    output_lines.extend(summary)

    full_output = "\n".join(output_lines)

    # Save to file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write(full_output)

    # Print to console
    print(full_output)
    print(f"\n[Saved to: {OUTPUT_FILE}]")


if __name__ == "__main__":
    run_codebase_scan()