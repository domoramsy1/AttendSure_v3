"""
AttendSure V3 - Secure Codebase Exporter
File: save_codebase.py

Cybersecurity Safeguards:
1. Blocks real environment files (.env, .env.local) and secrets from inclusion.
2. Skips binary databases, keys, credentials, and dependency trees.
3. Automatically writes to attendsure_codebase.txt in the project root.
"""

import os

# Automatically detect current working folder
PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__)) if '__file__' in locals() else os.getcwd()
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "attendsure_codebase.txt")

# 1. Folders to ignore (Libraries, caches, binaries, virtual environments)[cite: 10]
EXCLUDE_DIRS = {
    'node_modules',
    'venv',
    '.venv',
    'env',
    'Lib',
    'Scripts',
    'site-packages',
    '__pycache__',
    '.git',
    '.expo',
    '.expo-shared',
    'dist',
    'build',
    '.vscode',
    '.idea',
    'coverage',
    'staticfiles',
    'media',
}

# 2. Strict file extensions allowed for code review[cite: 10]
ALLOWED_EXTENSIONS = {
    '.py',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.html',
    '.css',
    '.json',
    '.sql',
    '.md',
}

# 3. Cybersecurity blacklist: NEVER bundle sensitive keys or lock files[cite: 10]
EXCLUDE_FILES = {
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Pipfile.lock',
    'poetry.lock',
    'db.sqlite3',
    'attendsure_codebase.txt',
    'save_codebase.py',
}

# 4. Sensitive file extensions to reject completely
BLOCKED_SECRET_EXTENSIONS = {
    '.pem',
    '.key',
    '.pfx',
    '.crt',
    '.sqlite3',
    '.db',
    '.log',
}

MAX_FILE_SIZE_BYTES = 1024 * 1024  # 1 MB limit per file

saved_count = 0
skipped_count = 0

print(f"Scanning project directory: {PROJECT_ROOT} ...")

with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
    # Top File Header
    outfile.write("=" * 80 + "\n")
    outfile.write("ATTENDSURE V3 - FULL SOURCE CODEBASE EXPORT\n")
    outfile.write(f"Root: {PROJECT_ROOT}\n")
    outfile.write("=" * 80 + "\n\n")

    for root, dirs, files in os.walk(PROJECT_ROOT):
        # Exclude blacklisted folders in-place[cite: 10]
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for file in files:
            file_lower = file.lower()
            _, ext = os.path.splitext(file_lower)

            # Skip blocked filenames or dangerous extensions[cite: 10]
            if file in EXCLUDE_FILES or file_lower in EXCLUDE_FILES or ext in BLOCKED_SECRET_EXTENSIONS:
                continue

            # Only process safe code extensions[cite: 10]
            if ext in ALLOWED_EXTENSIONS:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, PROJECT_ROOT)

                # Cybersecurity & Performance: Ignore files exceeding 1MB
                try:
                    if os.path.getsize(full_path) > MAX_FILE_SIZE_BYTES:
                        print(f"Skipping oversized file (>1MB): {rel_path}")
                        skipped_count += 1
                        continue
                except OSError:
                    continue

                try:
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as infile:
                        content = infile.read()

                    header = f"\n{'=' * 80}\nFILE: .\\{rel_path}\n{'=' * 80}\n"
                    outfile.write(header)
                    outfile.write(content)
                    outfile.write("\n")
                    saved_count += 1
                except Exception as err:
                    print(f"Skipped {rel_path}: {err}")
                    skipped_count += 1

print("\n" + "=" * 50)
print("EXPORT COMPLETE")
print(f"Files bundled:  {saved_count}")
print(f"Files skipped:  {skipped_count}")
print(f"Output saved to: {OUTPUT_FILE}")
print("=" * 50)