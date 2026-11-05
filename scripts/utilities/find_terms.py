import os
import re

OUTPUT_FILE = "search_results.txt"
PATTERN = re.compile(r"roster|turnstile", re.IGNORECASE)
EXCLUDE_DIRS = {"node_modules", ".git", "venv", "__pycache__", ".expo", "staticfiles", "media"}
EXCLUDE_EXTS = {".png", ".jpg", ".jpeg", ".ico", ".pdf", ".pyc", ".lock"}

matches_found = 0

with open(OUTPUT_FILE, "w", encoding="utf-8") as out_file:
    for root, dirs, files in os.walk("."):
        # Skip dependency and cache folders
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in EXCLUDE_EXTS or file == OUTPUT_FILE:
                continue

            file_path = os.path.join(root, file)
            try:
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line_number, line in enumerate(f, start=1):
                        if PATTERN.search(line):
                            out_file.write(f"{file_path} [Line {line_number}]: {line.strip()}\n")
                            matches_found += 1
            except Exception:
                continue

print(f"Done! Found {matches_found} matches. Saved to {OUTPUT_FILE}")