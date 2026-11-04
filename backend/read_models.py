import os
from pathlib import Path

# Path to the target models folder
TARGET_DIR = Path(r"D:\AttendSure_V3\backend\apps\academics\models")
OUTPUT_FILE = Path(r"D:\AttendSure_V3\backend\all_models_code.txt")


def read_all_code():
    if not TARGET_DIR.exists():
        print(f"Error: Directory not found -> {TARGET_DIR}")
        return

    output_lines = []

    print(f"Scanning files in: {TARGET_DIR}\n")

    # Walk through directory and all subdirectories
    for root, _, files in os.walk(TARGET_DIR):
        for file in sorted(files):
            # Only read Python code files
            if file.endswith(".py"):
                file_path = Path(root) / file
                rel_path = file_path.relative_to(TARGET_DIR)

                header = "=" * 80 + f"\nFILE: {rel_path}\nFULL PATH: {file_path}\n" + "=" * 80

                print(header)
                output_lines.append(header)

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        print(content)
                        output_lines.append(content)
                except Exception as e:
                    err_msg = f"[Error reading file: {e}]"
                    print(err_msg)
                    output_lines.append(err_msg)

                print("\n\n")
                output_lines.append("\n\n")

    # Save to a single output text file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as out:
        out.write("\n".join(output_lines))

    print("=" * 80)
    print(f"Done! A full copy of all code has been saved to:\n{OUTPUT_FILE}")
    print("=" * 80)


if __name__ == "__main__":
    read_all_code()