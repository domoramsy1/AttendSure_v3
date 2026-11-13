"""
AttendSure V3 - Project-Wide Substring Search for 'faculty'
File: scripts/search_teacher.py

Searches case-insensitively for any occurrence of the word 'faculty'
(including compound identifiers like list_teacher_active, listteacheractive,
FACULTY, TeacherProfile, etc.) across the entire project.
"""

import os
import sys
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
RESULTS_DIR = SCRIPT_DIR / "results"
OUTPUT_FILE = RESULTS_DIR / "teacher_search_results.txt"

# Folders to ignore
IGNORED_DIRS = {
    ".git",
    "node_modules",
    "__pycache__",
    ".venv",
    "venv",
    "env",
    ".expo",
    ".expo-shared",
    "dist",
    "build",
    ".idea",
    ".vscode",
}

# Relevant file extensions
ALLOWED_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".html",
    ".css",
    ".sql",
    ".md",
    ".txt",
    ".env",
    ".bat",
    ".sh",
}

def search_teacher():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    total_matches = 0
    matched_files_count = 0
    report_lines = []
    
    sep = "=" * 80
    header = f"{sep}\nAttendSure V3 - Search Results for 'faculty' (Case-Insensitive Substring)\nRoot Directory: {PROJECT_ROOT}\n{sep}"
    print(header)
    report_lines.append(header)
    
    for root, dirs, files in os.walk(PROJECT_ROOT):
        # Skip ignored directories in-place
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]
        
        for file in files:
            file_path = Path(root) / file
            
            if file_path.suffix.lower() not in ALLOWED_EXTENSIONS or file_path == OUTPUT_FILE:
                continue
                
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    file_matches = []
                    for line_num, line in enumerate(f, start=1):
                        if "faculty" in line.lower():
                            file_matches.append((line_num, line.rstrip()))
                            
                    if file_matches:
                        matched_files_count += 1
                        total_matches += len(file_matches)
                        rel_path = file_path.relative_to(PROJECT_ROOT)
                        file_header = f"\n[FILE] {rel_path} ({len(file_matches)} match(es)):"
                        print(file_header)
                        report_lines.append(file_header)
                        
                        for line_num, line_text in file_matches:
                            match_str = f"  Line {line_num:4d} | {line_text.strip()}"
                            print(match_str)
                            report_lines.append(match_str)
            except Exception:
                pass
                
    summary = f"\n{sep}\nSEARCH COMPLETE\nFound {total_matches} occurrence(s) across {matched_files_count} file(s).\nFull report saved to: {OUTPUT_FILE}\n{sep}"
    print(summary)
    report_lines.append(summary)
    
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("\n".join(report_lines))

if __name__ == "__main__":
    search_teacher()