@setlocal & set "_PY=python" & (if exist "%~dp0..\backend\venv\Scripts\python.exe" set "_PY=%~dp0..\backend\venv\Scripts\python.exe") & call "%%_PY%%" -x "%~f0" %* & exit /b
r"""
AttendSure - Directory Structure, Path Summary & Source Code Exporter
Location: D:\AttendSure_V3\scripts\export_codes.bat
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_FILE = Path(__file__).resolve()
SCRIPTS_DIR = SCRIPT_FILE.parent
PROJECT_ROOT = SCRIPTS_DIR.parent
EXPORT_DIR = SCRIPTS_DIR / "exports"

IGNORED_DIRS = {
    ".git", ".idea", ".vscode", ".expo", ".next", ".turbo", "__pycache__",
    "venv", ".venv", "env", "node_modules", "_legacy_backup", "_archived_legacy",
    "staticfiles", "media", "logs", "exports", "results", "dist", "build", "coverage",
}

IGNORED_FILES = {
    "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "Thumbs.db", ".DS_Store",
}

BINARY_EXTENSIONS = {
    ".pyc", ".pyo", ".pyd", ".exe", ".dll", ".so", ".dylib",
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".svg",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".woff", ".woff2", ".ttf", ".eot", ".mp3", ".mp4", ".wav", ".ogg",
    ".sqlite3", ".db", ".keystore", ".jks",
}

MAX_FILE_BYTES = 1024 * 1024


def _safe_rel(path: Path, base: Path) -> str:
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def is_ignored_file(path: Path) -> bool:
    if path.name in IGNORED_FILES or path.name.endswith("_codes_export.txt"):
        return True
    if path.suffix.lower() in BINARY_EXTENSIONS:
        return True
    try:
        if path.stat().st_size > MAX_FILE_BYTES:
            return True
        with path.open("rb") as fh:
            return b"\x00" in fh.read(4096)
    except OSError:
        return True


def get_visible_entries(directory: Path, exclude_env: bool = False):
    try:
        raw_entries = list(directory.iterdir())
    except OSError:
        return [], []
    dirs = sorted([d for d in raw_entries if d.is_dir() and d.name not in IGNORED_DIRS], key=lambda p: p.name.lower())
    files = sorted(
        [f for f in raw_entries if f.is_file() and not is_ignored_file(f) and not (exclude_env and f.name == ".env")],
        key=lambda p: p.name.lower(),
    )
    return dirs, files


def collect_tree_and_files(target: Path, exclude_env: bool = False):
    tree_lines, collected_files, folder_stats = [], [], {}
    if target.is_file():
        tree_lines.append(f"{PROJECT_ROOT.name}/")
        tree_lines.append(f"+-- {_safe_rel(target, PROJECT_ROOT)}")
        return tree_lines, [target], {str(target.parent): 1}, 1

    prefix = ""
    if target == PROJECT_ROOT:
        tree_lines.append(f"{PROJECT_ROOT.name}/")
    elif PROJECT_ROOT in target.parents:
        tree_lines.append(f"{PROJECT_ROOT.name}/")
        for part in target.relative_to(PROJECT_ROOT).parts:
            tree_lines.append(f"{prefix}+-- {part}/")
            prefix += "    "
    else:
        tree_lines.append(f"{target.name}/")

    folder_count = 0

    def _walk(curr_dir: Path, curr_prefix: str):
        nonlocal folder_count
        dirs, files = get_visible_entries(curr_dir, exclude_env=exclude_env)
        folder_stats[str(curr_dir)] = len(files)
        entries = dirs + files
        for idx, entry in enumerate(entries):
            is_last = idx == len(entries) - 1
            conn = "+-- " if is_last else "|-- "
            if entry.is_dir():
                folder_count += 1
                tree_lines.append(f"{curr_prefix}{conn}{entry.name}/")
                _walk(entry, curr_prefix + ("    " if is_last else "|   "))
            else:
                tree_lines.append(f"{curr_prefix}{conn}{entry.name}")
                collected_files.append(entry)

    _walk(target, prefix)
    return tree_lines, collected_files, folder_stats, folder_count


def format_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.2f} MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes} B"


def export_target(target: Path, print_codes: bool = False, exclude_env: bool = False) -> Path:
    target = target.resolve()
    tree_lines, files, folder_stats, folder_count = collect_tree_and_files(target, exclude_env=exclude_env)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rel_target = _safe_rel(target, PROJECT_ROOT)
    target_label = f"{rel_target.replace(os.sep, '/')}/" if target.is_dir() else rel_target

    records, total_bytes, total_lines = [], 0, 0
    for fpath in files:
        raw = fpath.read_bytes()
        text = raw.decode("utf-8", errors="replace")
        lc = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
        total_bytes += len(raw)
        total_lines += lc
        records.append((fpath, text, lc, len(raw)))

    total_files = len(records)
    pad = max(3, len(str(total_files)))
    sep = "=" * 80

    summary = [
        sep,
        f"ATTENDSURE - {target.name.upper()} STRUCTURE & SOURCE CODE EXPORT",
        f"Generated   : {now_str}",
        f"Project Root: {PROJECT_ROOT}",
        f"Target      : {target_label}",
        f"Summary     : {folder_count} Folders, {total_files} Files, {total_lines:,} Lines ({format_size(total_bytes)})",
        sep, "", sep, "SECTION 1: VISUAL DIRECTORY STRUCTURE", sep, *tree_lines,
        "", sep, "SECTION 2A: FOLDER SUMMARY", sep,
    ]
    for f_dir, cnt in folder_stats.items():
        rel_f = _safe_rel(Path(f_dir), PROJECT_ROOT)
        summary.append(f"  {(PROJECT_ROOT.name if rel_f == '.' else rel_f):<55} ({cnt} file{'s' if cnt != 1 else ''})")

    summary.extend(["", sep, f"SECTION 2B: NUMBERED COMPLETE FILE PATH INDEX (1 to {total_files})", sep])
    for idx, (fp, _, lc, sb) in enumerate(records, start=1):
        summary.append(f"[{idx:0{pad}d}] {fp}  ({lc} lines, {format_size(sb)})")

    summary_text = "\n".join(summary)
    print("\n" + summary_text)

    codes = ["", sep, f"SECTION 3: COMPLETE FILE CODES (1 to {total_files})", sep]
    for idx, (fp, content, lc, sb) in enumerate(records, start=1):
        codes.extend([
            "", sep, f"FILE [{idx:0{pad}d} of {total_files:0{pad}d}]",
            f"Complete Path : {fp}", f"Relative Path : {_safe_rel(fp, PROJECT_ROOT)}",
            f"Metrics       : {lc} lines | {format_size(sb)}", sep, content.rstrip("\r\n"),
        ])
    codes_text = "\n".join(codes)
    if print_codes:
        print(codes_text)

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = "full_project" if target == PROJECT_ROOT else target.stem.lower()
    out_file = EXPORT_DIR / f"{safe_name}_codes_export.txt"
    out_file.write_text(summary_text + "\n" + codes_text + "\n", encoding="utf-8")
    print(f"\n{sep}\n[SAVED] {out_file}\n{sep}")
    return out_file


def resolve_target(raw: str) -> Path | None:
    for base in (Path.cwd(), PROJECT_ROOT):
        cand = (base / raw).resolve()
        if cand.exists():
            return cand
    cand_abs = Path(raw)
    return cand_abs.resolve() if cand_abs.exists() else None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("target", nargs="?")
    parser.add_argument("-p", "--print-codes", action="store_true")
    parser.add_argument("--exclude-env", action="store_true")
    args = parser.parse_args()

    subfolders, _ = get_visible_entries(PROJECT_ROOT)
    if not args.target:
        print("\n" + "=" * 60 + "\n  ATTENDSURE CODE EXPORTER\n" + "=" * 60)
        for i, d in enumerate(subfolders, 1):
            print(f"  [{i}] {d.name}/")
        print("  [A] ALL   [E] EACH FOLDER")
        choice = input("Select option or path: ").strip()
        if not choice:
            return
        if choice.upper() == "A":
            export_target(PROJECT_ROOT, args.print_codes, args.exclude_env)
        elif choice.upper() == "E":
            for d in subfolders:
                export_target(d, args.print_codes, args.exclude_env)
        elif choice.isdigit() and 1 <= int(choice) <= len(subfolders):
            export_target(subfolders[int(choice) - 1], args.print_codes, args.exclude_env)
        else:
            res = resolve_target(choice)
            if res:
                export_target(res, args.print_codes, args.exclude_env)
        return

    key = args.target.lower()
    if key == "all":
        export_target(PROJECT_ROOT, args.print_codes, args.exclude_env)
    elif key == "each":
        for d in subfolders:
            export_target(d, args.print_codes, args.exclude_env)
    else:
        res = resolve_target(args.target)
        if not res:
            sys.exit(f"[ERROR] Path not found: {args.target}")
        export_target(res, args.print_codes, args.exclude_env)


if __name__ == "__main__":
    main()
