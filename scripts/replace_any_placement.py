"""
AttendSure V3 - Universal Term Replacer (All Placements & Casing)
File: scripts/replace_any_placement.py

Replaces blacklisted terms across:
  - PascalCase / CamelCase (e.g., FacultyClassroomRosterAPIView -> FacultyClassroomClassListAPIView)
  - camelCase (e.g., currentRosterCount -> currentClassListCount)
  - snake_case (e.g., roster_data -> class_list_data, faculty_roster -> faculty_class_list)
  - UPPER_CASE (e.g., CLASSROOM ROSTER -> CLASSROOM CLASS LIST)
  - Regular text / comments
"""

import os
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# DepEd statutory text and official form subtitles that MUST NOT be touched
DEPED_PROTECTED_PHRASES = [
    "Absenteeism and Dropout Profile",
    "STS Form 4",
    "Each chief of a Bureau or Office shall require a daily record",
    "Signature of Teacher",
    "Teacher Factor",
    "Teacher I",
    "Teacher II",
    "Teacher III",
    "Teacher IV",
    "Teacher V",
    "Teacher VI",
    "Master Teacher",
    "Head Teacher",
    "Special Science Teacher",
    "teachers/advisers",
    "summary box of SF2 submitted by the teachers",
    "Only teachers who are handling advisory classes shall be reported",
]

SCANNED_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".sql", ".md"
}

IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".expo", ".idea", ".vscode", "results"
}

WHITELISTED_FILES = [
    "replace_any_placement.py",
    "check_blacklisted_terms.py",
    "clean_blacklisted_terms.py",
    "resolve_all_violations.py",
    "blacklisted_terms_results.txt",
]

def is_deped_protected(line: str) -> bool:
    lower_line = line.lower()
    for phrase in DEPED_PROTECTED_PHRASES:
        if phrase.lower() in lower_line:
            return True
    return False

def transform_line(line: str) -> str:
    if is_deped_protected(line):
        return line

    # 1. Compound phrases with 'class' first (avoids "Class Class List")
    line = re.sub(r'\bCLASS\s+ROSTERS\b', 'CLASS LISTS', line)
    line = re.sub(r'\bClass\s+Rosters\b', 'Class Lists', line)
    line = re.sub(r'\bclass\s+rosters\b', 'class lists', line, flags=re.IGNORECASE)
    line = re.sub(r'\bCLASS\s+ROSTER\b', 'CLASS LIST', line)
    line = re.sub(r'\bClass\s+Roster\b', 'Class List', line)
    line = re.sub(r'\bclass\s+roster\b', 'class list', line, flags=re.IGNORECASE)

    # 2. PascalCase & CamelCase (inside code identifiers)
    line = re.sub(r'(?<=[a-zA-Z0-9])Rosters(?=[A-Z0-9_]|$)', 'ClassLists', line)
    line = re.sub(r'(?<=[a-zA-Z0-9])Roster(?=[A-Z0-9_]|$)', 'ClassList', line)
    line = re.sub(r'\bRosters(?=[A-Z])', 'ClassLists', line)
    line = re.sub(r'\bRoster(?=[A-Z])', 'ClassList', line)

    # 3. snake_case (variable names, dictionary keys)
    line = re.sub(r'\brosters_', 'class_lists_', line)
    line = re.sub(r'\broster_', 'class_list_', line)
    line = re.sub(r'_rosters\b', '_class_lists', line)
    line = re.sub(r'_roster\b', '_class_list', line)
    line = re.sub(r'_rosters_', '_class_lists_', line)
    line = re.sub(r'_roster_', '_class_list_', line)

    # 4. Standalone words
    line = re.sub(r'\bROSTERS\b', 'CLASS LISTS', line)
    line = re.sub(r'\bROSTER\b', 'CLASS LIST', line)
    line = re.sub(r'\bRosters\b', 'Class Lists', line)
    line = re.sub(r'\bRoster\b', 'Class List', line)
    line = re.sub(r'\brosters\b', 'class lists', line)
    line = re.sub(r'\broster\b', 'class list', line)

    # 5. Turnstile in any placement
    line = re.sub(r'(?<=[a-zA-Z0-9])Turnstiles(?=[A-Z0-9_]|$)', 'Kiosks', line)
    line = re.sub(r'(?<=[a-zA-Z0-9])Turnstile(?=[A-Z0-9_]|$)', 'Kiosk', line)
    line = re.sub(r'\bTurnstiles(?=[A-Z])', 'Kiosks', line)
    line = re.sub(r'\bTurnstile(?=[A-Z])', 'Kiosk', line)
    line = re.sub(r'\bturnstiles_', 'kiosks_', line)
    line = re.sub(r'\bturnstile_', 'kiosk_', line)
    line = re.sub(r'_turnstiles\b', '_kiosks', line)
    line = re.sub(r'_turnstile\b', '_kiosk', line)
    line = re.sub(r'\bTURNSTILES\b', 'KIOSKS', line)
    line = re.sub(r'\bTURNSTILE\b', 'KIOSK', line)
    line = re.sub(r'\bTurnstiles\b', 'Kiosks', line)
    line = re.sub(r'\bTurnstile\b', 'Kiosk', line)
    line = re.sub(r'\bturnstiles\b', 'kiosks', line)
    line = re.sub(r'\bturnstile\b', 'kiosk', line)

    # 6. Absenteeism (outside protected DepEd headers)
    line = re.sub(r'\bABSENTEEISM\b', 'ABSENCES', line)
    line = re.sub(r'\bAbsenteeism\b', 'Absences', line)
    line = re.sub(r'\babsenteeism\b', 'absences', line)

    # 7. Teacher (non-DepEd positions)
    line = re.sub(r'\bTEACHERS\b', 'FACULTY', line)
    line = re.sub(r'\bTeachers\b', 'Faculty', line)
    line = re.sub(r'\bteachers\b', 'faculty', line)
    line = re.sub(r'\bTEACHER\b', 'FACULTY', line)
    line = re.sub(r'\bTeacher\b', 'Faculty', line)
    line = re.sub(r'\bteacher\b', 'faculty', line)

    return line

def run():
    print("=" * 80)
    print("Running AttendSure Universal Placements Replacer...")
    print("=" * 80)

    target_dirs = [
        PROJECT_ROOT / "web" / "src",
        PROJECT_ROOT / "mobile" / "src",
        PROJECT_ROOT / "backend",
        PROJECT_ROOT / "scripts",
    ]

    total_files = 0
    total_lines = 0

    for target_dir in target_dirs:
        if not target_dir.exists():
            continue

        for root, dirs, files in os.walk(target_dir):
            dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]

            for file in files:
                file_path = Path(root) / file
                if file_path.suffix.lower() not in SCANNED_EXTENSIONS or file_path.name.endswith(".bak"):
                    continue
                if file_path.name in WHITELISTED_FILES:
                    continue

                try:
                    content = file_path.read_text(encoding="utf-8", errors="ignore")
                    lines = content.splitlines(keepends=True)
                    new_lines = []
                    file_modified = False

                    for line in lines:
                        new_line = transform_line(line)
                        if new_line != line:
                            file_modified = True
                            total_lines += 1
                        new_lines.append(new_line)

                    if file_modified:
                        file_path.write_text("".join(new_lines), encoding="utf-8")
                        total_files += 1
                        rel = file_path.relative_to(PROJECT_ROOT)
                        print(f"[REPLACED] {rel}")

                except Exception as e:
                    print(f"[WARN] Could not process {file_path}: {e}")

    print("=" * 80)
    print(f"COMPLETE: Updated {total_files} file(s) across {total_lines} total lines.")
    print("=" * 80)

if __name__ == "__main__":
    run()