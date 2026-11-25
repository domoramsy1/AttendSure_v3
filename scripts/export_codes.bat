@setlocal & set "_PY=python" & (if exist "%~dp0..\backend\venv\Scripts\python.exe" set "_PY=%~dp0..\backend\venv\Scripts\python.exe") & call "%%_PY%%" -x "%~f0" %* & exit /b
r"""
AttendSure - Directory Structure, Path Summary & Source Code Exporter
Location: scripts/export_codes.bat
"""

import argparse
import itertools
import os
import re
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

PRIORITY_PAIR_NAMES = [
    ("backend", "web"),
    ("backend", "mobile"),
    ("web", "mobile"),
]


def _safe_rel(path: Path, base: Path) -> str:
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def is_env_secret_file(path: Path) -> bool:
    """Returns True for .env and .env.* secret files while keeping .env.example."""
    name = path.name.lower()
    if name == ".env.example":
        return False
    return name == ".env" or name.startswith(".env.")


def is_ignored_file(path: Path, exclude_env: bool = True) -> bool:
    if exclude_env and is_env_secret_file(path):
        return True
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


def get_visible_entries(directory: Path, exclude_env: bool = True):
    try:
        raw_entries = list(directory.iterdir())
    except OSError:
        return [], []
    dirs = sorted(
        [d for d in raw_entries if d.is_dir() and d.name not in IGNORED_DIRS],
        key=lambda p: p.name.lower(),
    )
    files = sorted(
        [
            f
            for f in raw_entries
            if f.is_file()
            and not is_ignored_file(f, exclude_env=exclude_env)
        ],
        key=lambda p: p.name.lower(),
    )
    return dirs, files


def normalize_targets(targets: list[Path]) -> list[Path]:
    resolved_list: list[Path] = []
    seen: set[Path] = set()
    for item in targets:
        rp = item.resolve()
        if rp not in seen:
            seen.add(rp)
            resolved_list.append(rp)

    if PROJECT_ROOT.resolve() in seen:
        return [PROJECT_ROOT.resolve()]

    filtered: list[Path] = []
    for candidate in resolved_list:
        if any(other != candidate and other in candidate.parents for other in resolved_list):
            continue
        filtered.append(candidate)
    return filtered


def collect_multi_tree_and_files(targets: list[Path], exclude_env: bool = True):
    targets = normalize_targets(targets)
    tree_lines: list[str] = [f"{PROJECT_ROOT.name}/"]
    collected_files: list[Path] = []
    seen_files: set[Path] = set()
    folder_stats: dict[str, int] = {}
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
                if entry not in seen_files:
                    seen_files.add(entry)
                    collected_files.append(entry)

    if len(targets) == 1 and targets[0] == PROJECT_ROOT:
        _walk(PROJECT_ROOT, "")
        return tree_lines, collected_files, folder_stats, folder_count

    for t_idx, target in enumerate(targets):
        is_last_target = t_idx == len(targets) - 1
        top_conn = "+-- " if is_last_target else "|-- "
        next_prefix = "    " if is_last_target else "|   "

        if target.is_file():
            if is_ignored_file(target, exclude_env=exclude_env):
                continue
            rel_label = _safe_rel(target, PROJECT_ROOT).replace(os.sep, "/")
            tree_lines.append(f"{top_conn}{rel_label}")
            if target not in seen_files:
                seen_files.add(target)
                collected_files.append(target)
                folder_stats[str(target.parent)] = folder_stats.get(str(target.parent), 0) + 1
            continue

        folder_count += 1
        if PROJECT_ROOT in target.parents:
            parts = target.relative_to(PROJECT_ROOT).parts
            curr_p = ""
            for p_idx, part in enumerate(parts):
                if p_idx == 0:
                    tree_lines.append(f"{top_conn}{part}/")
                    curr_p = next_prefix
                else:
                    tree_lines.append(f"{curr_p}+-- {part}/")
                    curr_p += "    "
            _walk(target, curr_p)
        else:
            tree_lines.append(f"{top_conn}{target.name}/")
            _walk(target, next_prefix)

    return tree_lines, collected_files, folder_stats, folder_count


def format_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.2f} MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes} B"


def _slugify_part(raw: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    return cleaned or "target"


def build_export_labels(targets: list[Path]) -> tuple[str, str, str]:
    if len(targets) == 1 and targets[0] == PROJECT_ROOT:
        return PROJECT_ROOT.name.upper(), f"{PROJECT_ROOT.name}/ (Full Project)", "full_project"

    title_parts: list[str] = []
    target_labels: list[str] = []
    slug_parts: list[str] = []

    for t in targets:
        rel = _safe_rel(t, PROJECT_ROOT).replace(os.sep, "/")
        title_parts.append(t.name.upper())
        target_labels.append(f"{rel}/" if t.is_dir() else rel)
        slug_parts.append(_slugify_part(rel if PROJECT_ROOT in t.parents else t.stem))

    return " + ".join(title_parts), " + ".join(target_labels), "_".join(slug_parts)


def export_targets(
    targets: list[Path],
    print_codes: bool = False,
    exclude_env: bool = True,
) -> Path:
    clean_targets = normalize_targets(targets)
    tree_lines, files, folder_stats, folder_count = collect_multi_tree_and_files(
        clean_targets, exclude_env=exclude_env
    )
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    header_title, target_label, safe_slug = build_export_labels(clean_targets)

    records, total_bytes, total_lines = [], 0, 0
    for fpath in files:
        try:
            raw = fpath.read_bytes()
        except OSError:
            continue
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
        f"ATTENDSURE - {header_title} STRUCTURE & SOURCE CODE EXPORT",
        f"Generated   : {now_str}",
        f"Project Root: {PROJECT_ROOT}",
        f"Target      : {target_label}",
        f"Summary     : {folder_count} Folders, {total_files} Files, {total_lines:,} Lines ({format_size(total_bytes)})",
        sep,
        "",
        sep,
        "SECTION 1: VISUAL DIRECTORY STRUCTURE",
        sep,
        *tree_lines,
        "",
        sep,
        "SECTION 2A: FOLDER SUMMARY",
        sep,
    ]
    for f_dir, cnt in folder_stats.items():
        rel_f = _safe_rel(Path(f_dir), PROJECT_ROOT)
        label = PROJECT_ROOT.name if rel_f == "." else rel_f
        summary.append(f"  {label:<55} ({cnt} file{'s' if cnt != 1 else ''})")

    summary.extend(
        [
            "",
            sep,
            f"SECTION 2B: NUMBERED COMPLETE FILE PATH INDEX (1 to {total_files})",
            sep,
        ]
    )
    for idx, (fp, _, lc, sb) in enumerate(records, start=1):
        summary.append(f"[{idx:0{pad}d}] {fp}  ({lc} lines, {format_size(sb)})")

    summary_text = "\n".join(summary)
    print("\n" + summary_text)

    codes = ["", sep, f"SECTION 3: COMPLETE FILE CODES (1 to {total_files})", sep]
    for idx, (fp, content, lc, sb) in enumerate(records, start=1):
        codes.extend(
            [
                "",
                sep,
                f"FILE [{idx:0{pad}d} of {total_files:0{pad}d}]",
                f"Complete Path : {fp}",
                f"Relative Path : {_safe_rel(fp, PROJECT_ROOT)}",
                f"Metrics       : {lc} lines | {format_size(sb)}",
                sep,
                content.rstrip("\r\n"),
            ]
        )
    codes_text = "\n".join(codes)
    if print_codes:
        print(codes_text)

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = EXPORT_DIR / f"{safe_slug}_codes_export.txt"
    out_file.write_text(summary_text + "\n" + codes_text + "\n", encoding="utf-8")
    print(f"\n{sep}\n[SAVED] {out_file}\n{sep}")
    return out_file


def export_target(target: Path, print_codes: bool = False, exclude_env: bool = True) -> Path:
    return export_targets([target], print_codes=print_codes, exclude_env=exclude_env)


def build_folder_pairs(subfolders: list[Path]) -> list[tuple[Path, Path]]:
    by_lower = {d.name.lower(): d for d in subfolders}
    ordered_pairs: list[tuple[Path, Path]] = []
    seen_keys: set[frozenset[str]] = set()

    for first_name, second_name in PRIORITY_PAIR_NAMES:
        if first_name in by_lower and second_name in by_lower:
            key = frozenset((first_name, second_name))
            if key not in seen_keys:
                seen_keys.add(key)
                ordered_pairs.append((by_lower[first_name], by_lower[second_name]))

    for d1, d2 in itertools.combinations(subfolders, 2):
        key = frozenset((d1.name.lower(), d2.name.lower()))
        if key not in seen_keys:
            seen_keys.add(key)
            ordered_pairs.append((d1, d2))

    return ordered_pairs


def resolve_target(raw: str) -> Path | None:
    cleaned = raw.strip().strip('"').strip("'")
    if not cleaned:
        return None
    for base in (Path.cwd(), PROJECT_ROOT):
        cand = (base / cleaned).resolve()
        if cand.exists():
            return cand
    cand_abs = Path(cleaned)
    return cand_abs.resolve() if cand_abs.exists() else None


def parse_selection_tokens(
    raw_input: str,
    subfolders: list[Path],
    pairs: list[tuple[Path, Path]],
) -> list[Path] | None:
    tokens = [t.strip() for t in re.split(r"[+,]", raw_input) if t.strip()]
    if not tokens:
        return None

    selected: list[Path] = []
    pair_offset = len(subfolders)

    for tok in tokens:
        if tok.isdigit():
            idx = int(tok)
            if 1 <= idx <= len(subfolders):
                selected.append(subfolders[idx - 1])
                continue
            pair_idx = idx - pair_offset - 1
            if 0 <= pair_idx < len(pairs) and len(tokens) == 1:
                p1, p2 = pairs[pair_idx]
                return [p1, p2]
            return None

        resolved = resolve_target(tok)
        if not resolved:
            for d in subfolders:
                if d.name.lower() == tok.lower().rstrip("/\\"):
                    resolved = d
                    break
        if not resolved:
            return None
        selected.append(resolved)

    return selected if selected else None


def main():
    parser = argparse.ArgumentParser(
        description="Export directory structure and source code for single folders, folder pairs, or the full project."
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="Folder/file name(s), pair expression (e.g. backend+web), 'all', 'each', or 'pairs'.",
    )
    parser.add_argument("-p", "--print-codes", action="store_true")
    parser.add_argument(
        "--exclude-env",
        action="store_true",
        help="Exclude .env secret files (enabled by default).",
    )
    parser.add_argument(
        "--include-env",
        action="store_true",
        help="Include .env secret files (off by default to protect secrets).",
    )
    args = parser.parse_args()
    exclude_env = not args.include_env

    subfolders, _ = get_visible_entries(PROJECT_ROOT, exclude_env=exclude_env)
    folder_pairs = build_folder_pairs(subfolders)

    if not args.targets:
        print("\n" + "=" * 64)
        print("  ATTENDSURE CODE EXPORTER")
        print("=" * 64)

        print("  INDIVIDUAL FOLDERS:")
        for i, d in enumerate(subfolders, 1):
            print(f"    [{i}] {d.name}/")

        if folder_pairs:
            print("\n  PAIRED FOLDERS (COMBINED IN ONE FILE):")
            start_num = len(subfolders) + 1
            for offset, (p1, p2) in enumerate(folder_pairs):
                opt_num = start_num + offset
                print(f"    [{opt_num}] {p1.name}/ + {p2.name}/")

        print("\n  ALL & BATCH OPTIONS:")
        print("    [A] ALL        (Full project in one file)")
        print("    [E] EACH       (Every individual folder separately)")
        if folder_pairs:
            print("    [P] ALL PAIRS  (Every 2-folder pair separately)")
        print("\n  Tip: You can also combine any options with '+' (e.g. 1+4 or backend+web)")

        choice = input("\nSelect option, pair number, or path: ").strip()
        if not choice:
            return

        upper_choice = choice.upper()
        if upper_choice in ("A", "ALL"):
            export_targets([PROJECT_ROOT], args.print_codes, exclude_env)
        elif upper_choice in ("E", "EACH"):
            for d in subfolders:
                export_targets([d], args.print_codes, exclude_env)
        elif upper_choice in ("P", "PAIRS", "ALL PAIRS") and folder_pairs:
            for p1, p2 in folder_pairs:
                export_targets([p1, p2], args.print_codes, exclude_env)
        else:
            parsed = parse_selection_tokens(choice, subfolders, folder_pairs)
            if not parsed:
                sys.exit(f"[ERROR] Invalid selection or path not found: {choice}")
            export_targets(parsed, args.print_codes, exclude_env)
        return

    joined_arg = "+".join(args.targets).strip()
    key = joined_arg.lower()

    if key == "all":
        export_targets([PROJECT_ROOT], args.print_codes, exclude_env)
    elif key == "each":
        for d in subfolders:
            export_targets([d], args.print_codes, exclude_env)
    elif key in ("pairs", "all-pairs"):
        for p1, p2 in folder_pairs:
            export_targets([p1, p2], args.print_codes, exclude_env)
    else:
        parsed = parse_selection_tokens(joined_arg, subfolders, folder_pairs)
        if not parsed:
            sys.exit(f"[ERROR] Path or folder combination not found: {' '.join(args.targets)}")
        export_targets(parsed, args.print_codes, exclude_env)


if __name__ == "__main__":
    main()