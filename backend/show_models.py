"""
AttendSure V3 - Models File Tree and Code Inspector
File: backend/show_models.py
"""

import os
from pathlib import Path

# Base backend directory
BACKEND_DIR = Path(__file__).resolve().parent
MODELS_DIR = BACKEND_DIR / "apps" / "academics" / "models"
MODELS_FILE = BACKEND_DIR / "apps" / "academics" / "models.py"


def print_banner(text: str):
    print("\n" + "=" * 70)
    print(f" {text}")
    print("=" * 70)


def show_tree(folder_path: Path):
    print_banner(f"FOLDER TREE: {folder_path}")
    for root, dirs, files in os.walk(folder_path):
        depth = len(Path(root).relative_to(folder_path).parts)
        indent = "  " * depth
        folder_name = os.path.basename(root) or folder_path.name
        print(f"{indent}[DIR] {folder_name}/")
        for file in sorted(files):
            print(f"{indent}  |-- {file}")


def print_code(file_path: Path):
    print_banner(f"FILE: {file_path}")
    try:
        content = file_path.read_text(encoding="utf-8", errors="replace")
        print(content)
    except Exception as exc:
        print(f"Error reading {file_path.name}: {exc}")


def main():
    if MODELS_DIR.is_dir():
        show_tree(MODELS_DIR)

        python_files = sorted(list(MODELS_DIR.rglob("*.py")))
        if not python_files:
            print("\nNo Python (.py) files found in this directory.")
            return

        print_banner("CODE CONTENT")
        for py_file in python_files:
            print_code(py_file)

    elif MODELS_FILE.is_file():
        print_banner(f"SINGLE FILE FOUND: {MODELS_FILE}")
        print_code(MODELS_FILE)

    else:
        print_banner("DIRECTORY OR FILE NOT FOUND")
        print(f"Checked path: {MODELS_DIR}")
        print(f"Checked path: {MODELS_FILE}")
        print("\nListing all files in apps/academics/:")
        academics_dir = BACKEND_DIR / "apps" / "academics"
        if academics_dir.is_dir():
            for item in sorted(academics_dir.iterdir()):
                print(f" - {item.name} ({'DIR' if item.is_dir() else 'FILE'})")


if __name__ == "__main__":
    main()