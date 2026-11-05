"""
AttendSure V3 - Academic Models Inspector
File: backend/scripts/dump_models_codebase.py
"""

import os
from pathlib import Path
from datetime import datetime

# Define backend paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BACKEND_DIR / "apps" / "academics" / "models"
MODELS_FILE = BACKEND_DIR / "apps" / "academics" / "models.py"

# Output folder and text file path
RESULTS_DIR = BACKEND_DIR / "scripts" / "results"
OUTPUT_FILE = RESULTS_DIR / "academics_models_report.txt"


def write_line(file_handle, text=""):
    file_handle.write(text + "\n")


def write_banner(file_handle, text):
    file_handle.write("\n" + "=" * 80 + "\n")
    file_handle.write(f" {text}\n")
    file_handle.write("=" * 80 + "\n\n")


def export_models_report():
    # Make sure results directory exists
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_FILE, "w", encoding="utf-8", errors="replace") as out:
        write_banner(out, f"ATTENDSURE V3 - ACADEMICS MODELS DUMP ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')})")

        # Check if models is a folder
        if MODELS_DIR.is_dir():
            write_banner(out, f"1. DIRECTORY TREE: {MODELS_DIR}")
            for root, dirs, files in os.walk(MODELS_DIR):
                depth = len(Path(root).relative_to(MODELS_DIR).parts)
                indent = "  " * depth
                folder_name = os.path.basename(root) or MODELS_DIR.name
                write_line(out, f"{indent}[DIR] {folder_name}/")
                for f in sorted(files):
                    write_line(out, f"{indent}  |-- {f}")

            py_files = sorted(list(MODELS_DIR.rglob("*.py")))
            if not py_files:
                write_line(out, "\nNo Python (.py) files found in this models folder.")
            else:
                write_banner(out, "2. FULL CODE CONTENT")
                for py_file in py_files:
                    write_banner(out, f"FILE: {py_file}")
                    try:
                        content = py_file.read_text(encoding="utf-8", errors="replace")
                        out.write(content)
                        out.write("\n")
                    except Exception as err:
                        write_line(out, f"Error reading {py_file.name}: {err}")

        # Check if models is a single file
        elif MODELS_FILE.is_file():
            write_banner(out, f"1. SINGLE FILE FOUND: {MODELS_FILE}")
            try:
                content = MODELS_FILE.read_text(encoding="utf-8", errors="replace")
                out.write(content)
                out.write("\n")
            except Exception as err:
                write_line(out, f"Error reading {MODELS_FILE.name}: {err}")

        # If neither path exists
        else:
            write_banner(out, "TARGET NOT FOUND")
            write_line(out, f"Checked folder: {MODELS_DIR}")
            write_line(out, f"Checked file: {MODELS_FILE}")
            write_line(out, "\nExisting items inside apps/academics/:")
            academics_dir = BACKEND_DIR / "apps" / "academics"
            if academics_dir.is_dir():
                for item in sorted(academics_dir.iterdir()):
                    write_line(out, f" - {item.name} ({'DIR' if item.is_dir() else 'FILE'})")

    print(f"\nReport generated successfully!")
    print(f"Saved at: {OUTPUT_FILE}")


if __name__ == "__main__":
    export_models_report()