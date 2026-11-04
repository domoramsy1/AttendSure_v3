"""
AttendSure V3 - Scripts Folder Codebase Viewer
File: D:\\AttendSure_V3\\scripts\\inspect_scripts.py
"""

import os
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = SCRIPTS_DIR / "results" / "scripts_overview.txt"
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

CODE_EXTENSIONS = {'.py', '.bat', '.json', '.sql', '.txt'}
IGNORE_DIRS = {'__pycache__', '.git', 'results'}


def main():
    out_lines = [
        "=" * 80,
        "ATTENDSURE V3 - SCRIPTS CODEBASE SNAPSHOT",
        "=" * 80,
        ""
    ]

    file_count = 0
    for root, dirs, files in os.walk(SCRIPTS_DIR):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
        for f in sorted(files):
            p = Path(root) / f
            if p.suffix.lower() in CODE_EXTENSIONS and p != OUTPUT_FILE:
                file_count += 1
                out_lines.append("-" * 80)
                out_lines.append(f"FILE: scripts/{p.relative_to(SCRIPTS_DIR)}")
                out_lines.append("-" * 80)
                try:
                    out_lines.append(p.read_text(encoding="utf-8", errors="replace"))
                except Exception as e:
                    out_lines.append(f"[Error: {e}]")
                out_lines.append("")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out_lines))

    print(f"Scanned {file_count} script files.")
    print(f"Output saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()