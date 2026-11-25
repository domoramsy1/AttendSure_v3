# AttendSure Scripts - Optimize Web Assets
# File: D:\AttendSure_V3\scripts\optimize_web_assets.py

r"""
AttendSure - Web Brand Asset Optimizer
Downscales high-DPI embedded Base64 rasters (including >89MP exports inside techblazer.svg).
"""

import base64
import io
import re
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VENV_PYTHON = PROJECT_ROOT / "backend" / "venv" / "Scripts" / "python.exe"

if VENV_PYTHON.is_file() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
    sys.exit(subprocess.call([str(VENV_PYTHON), str(Path(__file__).resolve()), *sys.argv[1:]]))

from PIL import Image  # noqa: E402

Image.MAX_IMAGE_PIXELS = None  # Allow downscaling high-DPI local Illustrator/Canva exports

ASSETS_DIR = PROJECT_ROOT / "web" / "src" / "assets"
BACKUP_DIR = PROJECT_ROOT / "web" / "_archived_legacy" / "original_assets"

DATA_URI_RE = re.compile(
    r"(data:[^;\"'\s]+;base64,)([A-Za-z0-9+/=\s&#0-9;]+)",
    re.IGNORECASE,
)


def _resize_raster_bytes(raw_bytes: bytes, max_dim: int = 256) -> bytes:
    with Image.open(io.BytesIO(raw_bytes)) as img:
        img = img.convert("RGBA")
        img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True)
        return out.getvalue()


def optimize_svg(svg_path: Path) -> None:
    original_size = svg_path.stat().st_size
    if original_size < 60 * 1024:
        return

    text = svg_path.read_text(encoding="utf-8", errors="ignore")

    def _replace_match(match: re.Match) -> str:
        raw_b64 = re.sub(r"&#\d+;|&#x[0-9a-fA-F]+;|\s+", "", match.group(2))
        if len(raw_b64) < 16_384:
            return match.group(0)
        try:
            decoded = base64.b64decode(raw_b64 + "===")
            shrunk = _resize_raster_bytes(decoded, max_dim=256)
            if len(shrunk) < len(decoded):
                return f"data:image/png;base64,{base64.b64encode(shrunk).decode('ascii')}"
        except Exception as exc:
            print(f"  [NOTICE] Skipped non-image block in {svg_path.name}: {exc}")
        return match.group(0)

    updated = DATA_URI_RE.sub(_replace_match, text)
    if len(updated) < len(text):
        svg_path.write_text(updated, encoding="utf-8")
        print(f"[OPTIMIZED SVG] {svg_path.name}: {original_size // 1024} KB -> {svg_path.stat().st_size // 1024} KB")


def main() -> None:
    if not ASSETS_DIR.is_dir():
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for asset in ASSETS_DIR.iterdir():
        if not asset.is_file():
            continue
        backup_target = BACKUP_DIR / asset.name
        if not backup_target.exists():
            shutil.copy2(asset, backup_target)
        if asset.suffix.lower() == ".svg":
            optimize_svg(asset)


if __name__ == "__main__":
    main()
