import os
from pathlib import Path

# Directories to ignore (libraries, modules, build artifacts, virtual environments)
EXCLUDE_DIRS = {
    # Version control
    ".git", ".svn", ".hg",
    # JavaScript / Node
    "node_modules", ".next", ".nuxt", "dist", "out",
    # Python virtual environments & caches
    "venv", ".venv", "env", ".env", "site-packages", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".tox", ".eggs",
    # PHP / Composer
    "vendor",
    # Java / Kotlin / Build folders
    ".gradle", "build", "target", "bin", "obj", ".idea", ".vscode",
    # Mobile
    ".expo",
    # OS caches
    ".DS_Store", "Thumbs.db"
}

# Compiled files and binaries to ignore
EXCLUDE_EXTENSIONS = {
    ".pyc", ".pyo", ".pyd", ".class", ".o", ".obj", ".dll", ".so", ".dylib",
    ".log", ".tmp", ".swp"
}

# Lockfiles and system files to ignore
EXCLUDE_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "composer.lock",
    ".DS_Store", "Thumbs.db"
}


def generate_tree(start_dir: str, output_file: str = "file_results/structure.txt"):
    """
    Recursively scans the directory and outputs a visual ASCII tree
    to a .txt file, excluding libraries, virtual environments, and caches.
    """
    start_path = Path(start_dir).resolve()
    lines = [f"Project Directory Tree: {start_path.name}", "=" * 50]

    def _walk(directory: Path, prefix: str = ""):
        try:
            # Sort directories first, then files alphabetically
            entries = sorted(
                list(directory.iterdir()),
                key=lambda e: (not e.is_dir(), e.name.lower())
            )
        except PermissionError:
            lines.append(f"{prefix}[Permission Denied]")
            return

        # Filter excluded items
        filtered = []
        for entry in entries:
            name = entry.name
            if entry.is_dir():
                if name in EXCLUDE_DIRS or name.startswith('.'):
                    continue
            else:
                if name in EXCLUDE_FILES or entry.suffix.lower() in EXCLUDE_EXTENSIONS:
                    continue
            filtered.append(entry)

        count = len(filtered)
        for index, entry in enumerate(filtered):
            is_last = (index == count - 1)
            connector = "└── " if is_last else "├── "
            child_prefix = "    " if is_last else "│   "

            if entry.is_dir():
                lines.append(f"{prefix}{connector}{entry.name}/")
                _walk(entry, prefix + child_prefix)
            else:
                lines.append(f"{prefix}{connector}{entry.name}")

    _walk(start_path)

    output_path = start_path / output_file
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"File structure successfully saved to: {output_path.resolve()}")


if __name__ == "__main__":
    # Scans the directory where the script is run
    current_directory = os.path.dirname(os.path.abspath(__file__))
    generate_tree(current_directory, "file_results/structure.txt")