import os

PROJECT_ROOT = r"D:\AttendSure_V3"
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "attendsure_codebase.txt")

# Folders to skip (libraries, caches, dependencies, and build files)
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

# Only read text-based source code extensions
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
    '.env.example',
}

# Lock files and database binaries to skip
EXCLUDE_FILES = {
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'Pipfile.lock',
    'poetry.lock',
    'db.sqlite3',
    'attendsure_codebase.txt',
    'folder_structure.txt',
    'save_codebase.py',
}

saved_count = 0

with open(OUTPUT_FILE, 'w', encoding='utf-8') as outfile:
    for root, dirs, files in os.walk(PROJECT_ROOT):
        # Prevent searching inside excluded folders
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        for file in files:
            if file in EXCLUDE_FILES:
                continue

            _, ext = os.path.splitext(file)
            if ext.lower() in ALLOWED_EXTENSIONS:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, PROJECT_ROOT)

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

print(f"Done. Saved {saved_count} source files to {OUTPUT_FILE}")