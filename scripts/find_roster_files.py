r"""
AttendSure V3 - Scan and List All Files Containing 'Roster'
File: D:\AttendSure_V3\scripts\find_roster_files.py
"""

import os
import re

# 1. Set directory paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
RESULTS_DIR = os.path.join(SCRIPT_DIR, "results")
OUTPUT_FILE = os.path.join(RESULTS_DIR, "roster_occurrences_results.txt")

# Ensure the results folder exists
os.makedirs(RESULTS_DIR, exist_ok=True)

# 2. Folders and file extensions to check
EXCLUDE_DIRS = {
    "node_modules", ".git", "dist", "build", ".venv",
    "__pycache__", "results", ".vscode", ".idea"
}

VALID_EXTENSIONS = (
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json",
    ".html", ".css", ".sql", ".txt", ".md"
)

# Case-insensitive whole word pattern for "roster"
PATTERN = re.compile(r"\broster\b", re.IGNORECASE)

def scan_files():
    matching_files = {}
    total_matches = 0

    print(f"Scanning project files in: {ROOT_DIR}")

    for root, dirs, files in os.walk(ROOT_DIR):
        # Skip excluded folders
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith(".")]

        for file_name in files:
            if not file_name.endswith(VALID_EXTENSIONS):
                continue

            file_path = os.path.join(root, file_name)
            relative_path = os.path.relpath(file_path, ROOT_DIR)

            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    lines = f.readlines()

                file_hits = []
                for line_number, line in enumerate(lines, start=1):
                    if PATTERN.search(line):
                        file_hits.append((line_number, line.strip()))

                if file_hits:
                    matching_files[relative_path] = file_hits
                    total_matches += len(file_hits)

            except Exception as err:
                print(f"Could not read {relative_path}: {err}")

    # 3. Write results to text file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("=" * 70 + "\n")
        out.write("ATTENDSURE V3 - SEARCH RESULTS FOR 'ROSTER'\n")
        out.write(f"Total matching files: {len(matching_files)}\n")
        out.write(f"Total matches found: {total_matches}\n")
        out.write("=" * 70 + "\n\n")

        if not matching_files:
            out.write("No files contain the word 'roster'.\n")
        else:
            for file_path, hits in matching_files.items():
                out.write(f"FILE: {file_path} ({len(hits)} occurrence(s))\n")
                out.write("-" * 70 + "\n")
                for line_num, line_text in hits:
                    out.write(f"  Line {line_num:4d}: {line_text}\n")
                out.write("\n")

    print(f"\nDone! Found {total_matches} match(es) across {len(matching_files)} file(s).")
    print(f"Results saved to: {OUTPUT_FILE}")

if __name__ == "__main__":
    scan_files()