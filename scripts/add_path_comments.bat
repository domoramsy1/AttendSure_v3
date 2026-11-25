@echo off
@REM AttendSure Scripts - System-Wide File Path Comment Tool
@REM File: D:\AttendSure_V3\scripts\add_path_comments.bat

setlocal EnableExtensions

REM Locate Python from local virtual environments first, then system PATH
set "PYTHON_EXE="
set "PYTHON_ARGS="

if exist "%~dp0.venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%~dp0..\.venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0..\.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%~dp0backend\.venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0backend\.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%~dp0..\backend\.venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0..\backend\.venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%~dp0venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0venv\Scripts\python.exe"
if not defined PYTHON_EXE if exist "%~dp0..\venv\Scripts\python.exe" set "PYTHON_EXE=%~dp0..\venv\Scripts\python.exe"

if not defined PYTHON_EXE (
    where python >nul 2>nul && set "PYTHON_EXE=python"
)
if not defined PYTHON_EXE (
    where py >nul 2>nul && (
        set "PYTHON_EXE=py"
        set "PYTHON_ARGS=-3"
    )
)

if not defined PYTHON_EXE (
    echo [ERROR] Python 3 was not found. Please install Python 3 or activate your virtual environment.
    exit /b 1
)

"%PYTHON_EXE%" %PYTHON_ARGS% -c "import pathlib,sys; s=pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'); m='# === '+'PYTHON_PAYLOAD_START ==='; exec(compile(s.split(m,1)[1], sys.argv[1], 'exec'))" "%~f0" %*
set "EXIT_CODE=%ERRORLEVEL%"

REM Pause only if double-clicked from Windows File Explorer
echo %CMDCMDLINE% | find /i "%~0" >nul && pause
exit /b %EXIT_CODE%

# === PYTHON_PAYLOAD_START ===
from __future__ import annotations

import argparse
import os
import pathlib
import re
import sys

SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".expo",
    ".gradle",
    ".idea",
    ".vscode",
    "android",
    "ios",
    "dist",
    "build",
    "coverage",
    "staticfiles",
    "media",
    "_archived_legacy",
}

COMMENT_SYNTAX: dict[str, tuple[str, str]] = {
    ".ts": ("// ", ""),
    ".tsx": ("// ", ""),
    ".js": ("// ", ""),
    ".jsx": ("// ", ""),
    ".mjs": ("// ", ""),
    ".cjs": ("// ", ""),
    ".mts": ("// ", ""),
    ".cts": ("// ", ""),
    ".py": ("# ", ""),
    ".sh": ("# ", ""),
    ".bash": ("# ", ""),
    ".ps1": ("# ", ""),
    ".yml": ("# ", ""),
    ".yaml": ("# ", ""),
    ".toml": ("# ", ""),
    ".conf": ("# ", ""),
    ".css": ("/* ", " */"),
    ".scss": ("/* ", " */"),
    ".html": ("<!-- ", " -->"),
    ".sql": ("-- ", ""),
    ".bat": ("@REM ", ""),
    ".cmd": ("@REM ", ""),
}

EXACT_FILE_SYNTAX: dict[str, tuple[str, str]] = {
    "Dockerfile": ("# ", ""),
}

EXACT_DESCRIPTIONS: dict[str, str] = {
    "mobile/index.ts": "AttendSure Mobile - Application Entry Point",
    "mobile/App.tsx": "AttendSure Mobile - Root Application Component",
    "mobile/babel.config.js": "AttendSure Mobile - Babel Configuration",
    "mobile/metro.config.js": "AttendSure Mobile - Metro Bundler Configuration",
    "mobile/expoCryptoShim.js": "AttendSure Mobile - Local SHA-256 Crypto Fallback Shim",
    "web/index.html": "AttendSure Web - Portal HTML Shell",
    "web/vite.config.ts": "AttendSure Web - Vite Build Configuration",
    "web/eslint.config.js": "AttendSure Web - Code Linter Configuration",
    "web/src/main.tsx": "AttendSure Web - Application Entry Point",
    "web/src/App.tsx": "AttendSure Web - Root Portal Application",
    "web/src/index.css": "AttendSure Web - Global Portal Styles",
    "web/src/App.css": "AttendSure Web - Portal Layout Styles",
    "backend/manage.py": "AttendSure Backend - Django Management Entry Point",
    "backend/gunicorn.conf.py": "AttendSure Backend - Gunicorn Server Configuration",
    "backend/config/settings.py": "AttendSure Backend - Django System Settings",
    "backend/config/urls.py": "AttendSure Backend - Root API URL Routes",
    "backend/config/wsgi.py": "AttendSure Backend - WSGI Server Entry Point",
    "backend/config/asgi.py": "AttendSure Backend - ASGI Server Entry Point",
    "backend/config/celery.py": "AttendSure Backend - Background Task Runner Setup",
    "docker-compose.yml": "AttendSure Deploy - Docker Compose Services",
    "Dockerfile": "AttendSure Deploy - Container Build Definition",
    "deploy/nginx.conf": "AttendSure Deploy - Nginx Reverse Proxy Configuration",
    "scripts/audit_codebase.py": "AttendSure Scripts - Automated Quality Gate Auditor",
    "scripts/organize_scripts.bat": "AttendSure Scripts - Script Folder Organizer",
    "scripts/add_path_comments.bat": "AttendSure Scripts - System-Wide File Path Comment Tool",
}

BACKEND_FILE_ROLES: dict[str, str] = {
    "__init__.py": "Package Initializer",
    "models.py": "Database Models",
    "views.py": "API Views",
    "serializers.py": "Data Serializers",
    "selectors.py": "Read Queries",
    "services.py": "Business Logic Services",
    "urls.py": "URL Routes",
    "admin.py": "Admin Panel Setup",
    "apps.py": "App Configuration",
    "tasks.py": "Background Tasks",
    "permissions.py": "Role Access Rules",
    "signals.py": "Model Event Signals",
    "validators.py": "Input Validators",
    "tests.py": "Automated Tests",
}

ACRONYMS = {
    "api": "API",
    "ui": "UI",
    "qr": "QR",
    "gps": "GPS",
    "jwt": "JWT",
    "swr": "SWR",
    "pdf": "PDF",
    "csv": "CSV",
    "svg": "SVG",
    "html": "HTML",
    "css": "CSS",
    "sql": "SQL",
    "db": "DB",
    "id": "ID",
    "ids": "IDs",
    "url": "URL",
    "urls": "URLs",
    "ip": "IP",
    "sf1": "SF1",
    "sf2": "SF2",
    "sf4": "SF4",
    "csc": "CSC",
    "deped": "DepEd",
    "rbac": "RBAC",
}


def humanize_identifier(raw_name: str) -> str:
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", raw_name)
    spaced = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", spaced)
    tokens = [t for t in re.split(r"[_\-\.\s]+", spaced) if t]
    words: list[str] = []
    for token in tokens:
        lower = token.lower()
        words.append(ACRONYMS[lower] if lower in ACRONYMS else token.capitalize())
    return " ".join(words) if words else "Module"


def build_default_description(rel_posix: str) -> str:
    if rel_posix in EXACT_DESCRIPTIONS:
        return EXACT_DESCRIPTIONS[rel_posix]

    parts = rel_posix.split("/")
    top = parts[0].lower() if len(parts) > 1 else ""
    filename = parts[-1]
    stem = pathlib.Path(filename).stem

    if top == "mobile":
        layer = "AttendSure Mobile"
    elif top == "web":
        layer = "AttendSure Web"
    elif top == "backend":
        layer = "AttendSure Backend"
    elif top == "scripts":
        layer = "AttendSure Scripts"
    elif top == "deploy":
        layer = "AttendSure Deploy"
    else:
        layer = "AttendSure System"

    if top == "backend":
        if "migrations" in parts and filename != "__init__.py":
            return f"{layer} - Database Migration ({stem})"
        app_label = ""
        if len(parts) >= 3 and parts[1] == "apps":
            app_label = humanize_identifier(parts[2]) + " "
        elif len(parts) >= 2 and parts[1] not in {"apps", filename}:
            app_label = humanize_identifier(parts[1]) + " "

        if filename in BACKEND_FILE_ROLES:
            return f"{layer} - {app_label}{BACKEND_FILE_ROLES[filename]}".strip()
        return f"{layer} - {app_label}{humanize_identifier(stem)}"

    title = humanize_identifier(stem)
    if stem == "index" and len(parts) >= 2:
        title = f"{humanize_identifier(parts[-2])} Index"

    if "screens" in parts and not title.lower().endswith("screen"):
        title = f"{title} Screen"
    elif "components" in parts and not any(
        title.lower().endswith(s) for s in ("component", "modal", "tab", "form", "card", "bar", "button", "panel")
    ):
        title = f"{title} Component"
    elif "hooks" in parts and not title.lower().endswith("hook"):
        title = f"{title} Hook"
    elif "services" in parts and not title.lower().endswith("service"):
        title = f"{title} Service"
    elif "utils" in parts and not title.lower().endswith(("utility", "utilities", "helper", "helpers")):
        title = f"{title} Utility"

    return f"{layer} - {title}"


def detect_project_root(script_path: pathlib.Path, explicit_root: str | None) -> pathlib.Path:
    if explicit_root:
        return pathlib.Path(explicit_root).resolve()

    markers = ("backend", "web", "mobile", "docker-compose.yml")
    script_dir = script_path.parent.resolve()

    for candidate in (script_dir, script_dir.parent, pathlib.Path.cwd().resolve()):
        if sum(1 for m in markers if (candidate / m).exists()) >= 2:
            return candidate

    default_win = pathlib.Path(r"D:\AttendSure_V3")
    if default_win.exists():
        return default_win.resolve()

    return script_dir


def get_comment_style(file_path: pathlib.Path) -> tuple[str, str] | None:
    name = file_path.name
    if name in EXACT_FILE_SYNTAX:
        return EXACT_FILE_SYNTAX[name]
    if name.startswith("Dockerfile."):
        return ("# ", "")
    if name.endswith((".min.js", ".min.css", ".tsbuildinfo")):
        return None
    return COMMENT_SYNTAX.get(file_path.suffix.lower())


def format_display_path(file_path: pathlib.Path, root_dir: pathlib.Path, display_root: str | None) -> str:
    rel_parts = file_path.resolve().relative_to(root_dir.resolve()).parts
    if display_root:
        base = display_root.rstrip("\\/")
        return "\\".join([base, *rel_parts]) if rel_parts else base
    return str(file_path.resolve())


def strip_comment_wrapper(line: str, c_open: str, c_close: str) -> str | None:
    stripped = line.strip()
    open_trim = c_open.strip()
    close_trim = c_close.strip()

    alt_opens = [open_trim]
    if open_trim == "@REM":
        alt_opens.extend(["REM", "::"])

    for prefix in alt_opens:
        if stripped.upper().startswith(prefix.upper()):
            inner = stripped[len(prefix):].strip()
            if close_trim and inner.endswith(close_trim):
                inner = inner[: -len(close_trim)].strip()
            elif close_trim:
                return None
            return inner
    return None


def is_preserved_preamble_line(line: str, index: int, ext: str, filename: str) -> bool:
    stripped = line.strip()
    if index == 0 and stripped.startswith("#!"):
        return True
    if index in (0, 1) and ext == ".py" and re.match(r"^#.*coding[:=]\s*[-\w.]+", stripped):
        return True
    if index == 0 and (filename == "Dockerfile" or filename.startswith("Dockerfile.")):
        if re.match(r"^#\s*(syntax|escape)\s*=", stripped, re.IGNORECASE):
            return True
    if index == 0 and ext in {".bat", ".cmd"} and re.match(r"^@?echo\s+off\b", stripped, re.IGNORECASE):
        return True
    if index == 0 and ext == ".html" and stripped.lower().startswith("<!doctype"):
        return True
    return False


def process_file(
    file_path: pathlib.Path,
    root_dir: pathlib.Path,
    style: tuple[str, str],
    display_root: str | None,
    dry_run: bool,
) -> str:
    try:
        raw_bytes = file_path.read_bytes()
    except OSError:
        return "skipped"

    if b"\x00" in raw_bytes:
        return "skipped"

    has_utf8_bom = raw_bytes.startswith(b"\xef\xbb\xbf")
    text_bytes = raw_bytes[3:] if has_utf8_bom else raw_bytes

    try:
        content = text_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return "skipped"

    newline = "\r\n" if "\r\n" in content else ("\n" if "\n" in content else os.linesep)
    lines = content.splitlines()

    c_open, c_close = style
    ext = file_path.suffix.lower()
    filename = file_path.name
    rel_posix = file_path.resolve().relative_to(root_dir.resolve()).as_posix()
    display_path = format_display_path(file_path, root_dir, display_root)

    idx = 0
    preamble: list[str] = []
    while idx < len(lines) and is_preserved_preamble_line(lines[idx], idx, ext, filename):
        preamble.append(lines[idx])
        idx += 1

    existing_desc: str | None = None
    found_header = False

    temp_idx = idx
    if temp_idx < len(lines) and lines[temp_idx].strip() == "" and preamble:
        temp_idx += 1

    consumed_until = idx
    cursor = temp_idx
    for _ in range(3):
        if cursor >= len(lines):
            break
        inner = strip_comment_wrapper(lines[cursor], c_open, c_close)
        if inner is None:
            break
        if inner.startswith("AttendSure "):
            existing_desc = inner
            found_header = True
            cursor += 1
            consumed_until = cursor
        elif re.match(r"^(File|Path)\s*:\s*", inner, re.IGNORECASE):
            found_header = True
            cursor += 1
            consumed_until = cursor
        else:
            break

    body_start = consumed_until if found_header else idx
    while body_start < len(lines) and lines[body_start].strip() == "":
        body_start += 1

    body_lines = lines[body_start:]

    description = existing_desc or build_default_description(rel_posix)
    header_line_1 = f"{c_open}{description}{c_close}"
    header_line_2 = f"{c_open}File: {display_path}{c_close}"

    new_lines: list[str] = []
    if preamble:
        new_lines.extend(preamble)
    new_lines.append(header_line_1)
    new_lines.append(header_line_2)
    if body_lines:
        new_lines.append("")
        new_lines.extend(body_lines)

    new_content = newline.join(new_lines) + newline

    if new_content == content:
        return "unchanged"

    if not dry_run:
        out_bytes = (b"\xef\xbb\xbf" if has_utf8_bom else b"") + new_content.encode("utf-8")
        file_path.write_bytes(out_bytes)

    return "updated"


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description="Add or update AttendSure header and file path comments across the project."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=None,
        help="Optional path to the AttendSure project root (auto-detected if omitted).",
    )
    parser.add_argument(
        "--display-root",
        dest="display_root",
        default=None,
        help="Optional root prefix for 'File:' comments (for example D:\\AttendSure_V3).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Preview which files will be updated without changing files on disk.",
    )
    args = parser.parse_args(argv[2:])

    self_script = pathlib.Path(argv[1]).resolve()
    root_dir = detect_project_root(self_script, args.root)

    if not root_dir.exists() or not root_dir.is_dir():
        print(f"[ERROR] Project root directory does not exist: {root_dir}")
        return 1

    mode_label = "DRY RUN (no files changed)" if args.dry_run else "APPLYING HEADERS"
    print("============================================================")
    print(f" AttendSure File Path Header Tool - {mode_label}")
    print(f" Project Root : {root_dir}")
    if args.display_root:
        print(f" Display Root : {args.display_root}")
    print("============================================================")

    counts = {"updated": 0, "unchanged": 0, "skipped": 0}

    for current_root, dirs, files in os.walk(root_dir):
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)

        for fname in sorted(files):
            fpath = pathlib.Path(current_root) / fname

            if fpath.resolve() == self_script:
                counts["skipped"] += 1
                continue

            style = get_comment_style(fpath)
            if style is None:
                counts["skipped"] += 1
                continue

            status = process_file(
                file_path=fpath,
                root_dir=root_dir,
                style=style,
                display_root=args.display_root,
                dry_run=args.dry_run,
            )
            counts[status] += 1
            if status == "updated":
                rel = fpath.resolve().relative_to(root_dir.resolve()).as_posix()
                action = "[WOULD UPDATE]" if args.dry_run else "[UPDATED]"
                print(f" {action} {rel}")

    print("------------------------------------------------------------")
    print(
        f" Done! Updated: {counts['updated']} | "
        f"Already Up-to-Date: {counts['unchanged']} | "
        f"Skipped (JSON/assets/self): {counts['skipped']}"
    )
    print("============================================================")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))