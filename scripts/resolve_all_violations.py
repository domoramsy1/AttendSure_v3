"""
AttendSure V3 - Master Terms Cleaner & System Integrity Fixer
File: scripts/resolve_all_violations.py
"""

import os
import sys
import re
import shutil
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = PROJECT_ROOT / "scripts" / "results"
OUTPUT_FILE = RESULTS_DIR / "blacklisted_terms_results.txt"

# 1. Statutory DepEd phrases that MUST be preserved exactly as mandated by DepEd orders
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

# 2. Ordered replacement rules (handles compound phrases first to prevent 'Class Class List')
REPLACEMENT_RULES = [
    # Compound phrases with 'class'
    (re.compile(r"\bCLASS\s+ROSTERS\b"), "CLASS LISTS"),
    (re.compile(r"\bClass\s+Rosters\b"), "Class Lists"),
    (re.compile(r"\bclass\s+rosters\b", re.IGNORECASE), "class lists"),
    (re.compile(r"\bCLASS\s+ROSTER\b"), "CLASS LIST"),
    (re.compile(r"\bClass\s+Roster\b"), "Class List"),
    (re.compile(r"\bclass\s+roster\b", re.IGNORECASE), "class list"),

    # Standalone Roster
    (re.compile(r"\bROSTERS\b"), "CLASS LISTS"),
    (re.compile(r"\bRosters\b"), "Class Lists"),
    (re.compile(r"\brosters\b"), "class lists"),
    (re.compile(r"\bROSTER\b"), "CLASS LIST"),
    (re.compile(r"\bRoster\b"), "Class List"),
    (re.compile(r"\broster\b"), "class list"),

    # Turnstiles / Turnstile
    (re.compile(r"\bTURNSTILES\b"), "KIOSKS"),
    (re.compile(r"\bTurnstiles\b"), "Kiosks"),
    (re.compile(r"\bturnstiles\b"), "kiosks"),
    (re.compile(r"\bTURNSTILE\b"), "KIOSK"),
    (re.compile(r"\bTurnstile\b"), "Kiosk"),
    (re.compile(r"\bturnstile\b"), "kiosk"),

    # Absenteeism (outside official DepEd form titles)
    (re.compile(r"\bABSENTEEISM\b"), "ABSENCES"),
    (re.compile(r"\bAbsenteeism\b"), "Absences"),
    (re.compile(r"\babsenteeism\b"), "absences"),

    # Teacher / Teachers -> Faculty
    (re.compile(r"\bTEACHERS\b"), "FACULTY"),
    (re.compile(r"\bTeachers\b"), "Faculty"),
    (re.compile(r"\bteachers\b"), "faculty"),
    (re.compile(r"\bTEACHER\b"), "FACULTY"),
    (re.compile(r"\bTeacher\b"), "Faculty"),
    (re.compile(r"\bteacher\b"), "faculty"),

    # Pedagogy & Matriculate
    (re.compile(r"\bPEDAGOGY\b"), "TEACHING METHOD"),
    (re.compile(r"\bPedagogy\b"), "Teaching Method"),
    (re.compile(r"\bpedagogy\b"), "teaching method"),
    (re.compile(r"\bMATRICULATE\b"), "ENROLL"),
    (re.compile(r"\bMatriculate\b"), "Enroll"),
    (re.compile(r"\bmatriculate\b"), "enroll"),
]

IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".expo", ".idea", ".vscode", "results", "_backup_monoliths", "frontend"
}

SCANNED_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".sql", ".md"
}

WHITELISTED_FILES = [
    "resolve_all_violations.py",
    "clean_blacklisted_terms.py",
    "check_blacklisted_terms.py",
    "replace_turnstile.py",
    "search_teacher.py",
    "search_turnstile.py",
    "remove_teacher_role.py",
    "blacklisted_terms_results.txt",
]

def is_deped_protected(line: str) -> bool:
    lower_line = line.lower()
    for phrase in DEPED_PROTECTED_PHRASES:
        if phrase.lower() in lower_line:
            return True
    return False

def clean_file_content(content: str) -> tuple[str, int]:
    lines = content.splitlines(keepends=True)
    new_lines = []
    changes = 0

    for line in lines:
        if is_deped_protected(line):
            new_lines.append(line)
            continue

        original_line = line
        for pat, rep in REPLACEMENT_RULES:
            line = pat.sub(rep, line)

        if line != original_line:
            changes += 1
        new_lines.append(line)

    return "".join(new_lines), changes

def run():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report_lines = []
    sep = "=" * 80
    header = f"{sep}\nAttendSure V3: Resolving All Term Violations & Protecting DepEd Forms\n{sep}"
    print(header)
    report_lines.append(header)

    # 1. Clean up duplicate / orphan 'frontend' directory if it exists
    old_frontend_dir = PROJECT_ROOT / "frontend"
    web_dir = PROJECT_ROOT / "web"
    if old_frontend_dir.exists() and web_dir.exists():
        msg = f"[CLEANUP] Removing orphan duplicate folder: {old_frontend_dir.relative_to(PROJECT_ROOT)}"
        print(msg)
        report_lines.append(msg)
        try:
            shutil.rmtree(old_frontend_dir)
            ok_msg = "  [OK] Orphan 'frontend' folder removed."
            print(ok_msg)
            report_lines.append(ok_msg)
        except Exception as e:
            warn_msg = f"  [WARN] Could not remove {old_frontend_dir}: {e}"
            print(warn_msg)
            report_lines.append(warn_msg)

    # 2. Fix seed_data.py password if present
    seed_data_py = PROJECT_ROOT / "scripts" / "database" / "seed_data.py"
    if seed_data_py.exists():
        t = seed_data_py.read_text(encoding="utf-8")
        if "Teacher@123" in t:
            t = t.replace("Teacher@123", "Faculty@123")
            seed_data_py.write_text(t, encoding="utf-8")
            s_msg = "[UPDATED] scripts/database/seed_data.py (Replaced seed password 'Teacher@123' -> 'Faculty@123')"
            print(s_msg)
            report_lines.append(s_msg)

    # 3. Scan and fix active projects and scripts
    target_dirs = [
        PROJECT_ROOT / "web" / "src",
        PROJECT_ROOT / "mobile" / "src",
        PROJECT_ROOT / "backend" / "apps",
        PROJECT_ROOT / "scripts" / "database",
        PROJECT_ROOT / "scripts" / "testing",
        PROJECT_ROOT / "scripts" / "utilities",
    ]

    total_files_updated = 0
    total_terms_changed = 0

    for target_dir in target_dirs:
        if not target_dir.exists():
            continue

        for root, dirs, files in os.walk(target_dir):
            dirs[:] = [d for d in dirs if d not in IGNORED_DIRS and not d.startswith(".")]

            for file in files:
                file_path = Path(root) / file
                if file_path.suffix.lower() not in SCANNED_EXTENSIONS or file_path.name.endswith(".bak"):
                    continue
                if file_path.name in WHITELISTED_FILES or file_path == OUTPUT_FILE:
                    continue

                try:
                    content = file_path.read_text(encoding="utf-8", errors="ignore")
                    new_content, count = clean_file_content(content)
                    if count > 0:
                        file_path.write_text(new_content, encoding="utf-8")
                        total_files_updated += 1
                        total_terms_changed += count
                        rel = file_path.relative_to(PROJECT_ROOT)
                        u_msg = f"[UPDATED] {rel} ({count} replacement(s))"
                        print(u_msg)
                        report_lines.append(u_msg)
                except Exception as e:
                    print(f"[WARN] Error processing {file_path}: {e}")

    summary = (
        f"\n{sep}\n"
        f"COMPLETE: Updated {total_files_updated} file(s) ({total_terms_changed} terms converted).\n"
        f"Log Saved To: {OUTPUT_FILE}\n"
        f"{sep}"
    )
    print(summary)
    report_lines.append(summary)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("\n".join(report_lines))

if __name__ == "__main__":
    run()