"""
AttendSure V3 - Blacklisted Terms & Simple English Linter (DepEd Protected)
File: scripts/check_blacklisted_terms.py
"""

import sys
import os
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
RESULTS_DIR = SCRIPT_DIR / "results"
OUTPUT_FILE = RESULTS_DIR / "blacklisted_terms_results.txt"

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

BLACKLISTED_WORDS = {
    "turnstiles": "kiosks",
    "turnstile": "kiosk",
    "rosters": "class lists",
    "roster": "class list",
    "teachers": "faculty",
    "teacher": "faculty",
    "pedagogy": "teaching method",
    "matriculate": "enroll",
    "absenteeism": "absences",
}

IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".expo", ".idea", ".vscode", "results", "_backup_monoliths",
    "frontend", "utilities"
}

SCANNED_EXTENSIONS = {
    ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".html", ".css", ".sql", ".md"
}

WHITELISTED_FILES = [
    "check_blacklisted_terms.py",
    "clean_and_clear_all.py",
    "resolve_all_violations.py",
    "clean_blacklisted_terms.py",
    "replace_turnstile.py",
    "search_teacher.py",
    "search_turnstile.py",
    "remove_teacher_role.py",
    "organize_and_clean.py",
    "reorganize_backend.py",
    "upgrade_backend_clean.py",
    "find_terms.py",
    "replace_terms.py",
    "blacklisted_terms_results.txt",
]

def is_deped_protected(line: str) -> bool:
    lower = line.lower()
    for phrase in DEPED_PROTECTED_PHRASES:
        if phrase.lower() in lower:
            return True
    return False

def preserve_case(source: str, target: str) -> str:
    if source.isupper():
        return target.upper()
    if source.istitle() or (len(source) > 0 and source[0].isupper()):
        return " ".join(word.capitalize() for word in target.split(" "))
    return target.lower()

def scan():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    violations = 0
    report_lines = []

    sorted_words = sorted(BLACKLISTED_WORDS.keys(), key=lambda w: len(w), reverse=True)
    pattern = re.compile(rf"\b({'|'.join(re.escape(w) for w in sorted_words)})\b", re.IGNORECASE)

    target_dirs = [
        PROJECT_ROOT / "web" / "src",
        PROJECT_ROOT / "mobile" / "src",
        PROJECT_ROOT / "backend" / "apps",
        PROJECT_ROOT / "scripts" / "database",
        PROJECT_ROOT / "scripts" / "testing",
    ]

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
                    lines = content.splitlines(keepends=True)

                    for line_num, line in enumerate(lines, start=1):
                        if is_deped_protected(line):
                            continue

                        matches = list(pattern.finditer(line))
                        if matches:
                            violations += len(matches)
                            rel_path = file_path.relative_to(PROJECT_ROOT)

                            for match in matches:
                                word = match.group(0)
                                col = match.start() + 1
                                rep = preserve_case(word, BLACKLISTED_WORDS.get(word.lower(), "simple English term"))
                                msg = f"{rel_path}:{line_num}:{col}: error: Disallowed word '{word}' found. Use '{rep}' instead."
                                print(msg)
                                report_lines.append(msg)
                except Exception as e:
                    print(f"{file_path}:1:1: warning: {e}", file=sys.stderr)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("\n".join(report_lines) if report_lines else "CLEAN: 0 violations found.\n")

    return violations

if __name__ == "__main__":
    v = scan()
    sys.exit(1 if v > 0 else 0)