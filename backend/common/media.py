# AttendSure Backend - Common Media
# File: D:\AttendSure_V3\backend\common\media.py

import base64
import hashlib
import io
import os
import uuid
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

MAX_IMAGE_BYTES = 2 * 1024 * 1024
MAX_IMAGE_DIMENSION = 600
MAX_LOGO_DIMENSION = 800
ALLOWED_PIL_FORMATS = {"JPEG", "PNG", "WEBP"}
FORMAT_TO_EXT = {"JPEG": "jpg", "PNG": "png", "WEBP": "webp"}


def _has_alpha_channel(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA"):
        return True
    if img.mode == "P" and "transparency" in img.info:
        return True
    return False


def _trim_transparent_padding(img: Image.Image, pad_ratio: float = 0.03) -> Image.Image:
    """Auto-trims empty transparent borders around logos while keeping a clean breathing margin."""
    rgba = img if img.mode == "RGBA" else img.convert("RGBA")
    alpha = rgba.getchannel("A")
    # Treat nearly invisible pixels (alpha <= 8) as empty background
    mask = alpha.point(lambda a: 255 if a > 8 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return rgba
    left, top, right, bottom = bbox
    orig_w, orig_h = rgba.size
    crop_w = right - left
    crop_h = bottom - top
    if crop_w <= 0 or crop_h <= 0:
        return rgba
    if left == 0 and top == 0 and right == orig_w and bottom == orig_h:
        return rgba

    cropped = rgba.crop(bbox)
    pad = max(2, int(round(max(crop_w, crop_h) * pad_ratio)))
    padded = Image.new("RGBA", (crop_w + pad * 2, crop_h + pad * 2), (0, 0, 0, 0))
    padded.paste(cropped, (pad, pad), cropped)
    return padded


def _flatten_rgba_on_white(img: Image.Image) -> Image.Image:
    """Composites transparent images onto crisp white before JPEG encoding (never turns black)."""
    if not _has_alpha_channel(img):
        return img.convert("RGB")
    rgba = img.convert("RGBA")
    white_bg = Image.new("RGB", rgba.size, (255, 255, 255))
    white_bg.paste(rgba, mask=rgba.getchannel("A"))
    return white_bg


def save_base64_logo_to_disk(raw_value: str) -> str | None:
    """Converts validated Base64 logo strings into transparent-safe static files under /media/school_logos/."""
    clean = str(raw_value or "").strip()
    if not clean or clean.lower() in ("none", "null", "undefined"):
        return None

    if clean.startswith(("http://", "https://", "/media/")):
        return clean
    if clean.startswith("school_logos/"):
        return f"/media/{clean}"

    if clean.startswith("data:image") or clean.startswith(("/9j/", "iVBORw0KGgo")):
        try:
            b64_part = clean.split(";base64,", 1)[1] if ";base64," in clean else clean
            raw_bytes = base64.b64decode(b64_part, validate=True)
            if len(raw_bytes) > MAX_IMAGE_BYTES:
                return None

            optimized = validate_and_optimize_image(
                raw_bytes,
                prefix="logo",
                max_dimension=MAX_LOGO_DIMENSION,
                is_logo=True,
            )
            out_bytes = optimized.read()
            ext = getattr(optimized, "name", "logo.png").rsplit(".", 1)[-1].lower()
            digest = hashlib.sha256(out_bytes).hexdigest()[:16]
            target_dir = os.path.join(settings.MEDIA_ROOT, "school_logos")
            os.makedirs(target_dir, exist_ok=True)
            filename = f"logo_{digest}.{ext}"
            full_path = os.path.join(target_dir, filename)
            if not os.path.exists(full_path):
                with open(full_path, "wb") as fh:
                    fh.write(out_bytes)
            return f"/media/school_logos/{filename}"
        except Exception:
            return None
    return None


def build_media_url(photo_field, request=None) -> str | None:
    if not photo_field:
        return None
    if isinstance(photo_field, str):
        clean = photo_field.strip()
        if not clean or clean.lower() in ("none", "null", "undefined"):
            return None
        if clean.startswith("data:image") or clean.startswith(("/9j/", "iVBORw0KGgo")):
            disk_rel = save_base64_logo_to_disk(clean)
            if not disk_rel:
                return None
            return request.build_absolute_uri(disk_rel) if request else disk_rel
        if clean.startswith(("http://", "https://")):
            return clean
        rel = clean if clean.startswith("/") else f"/{clean}"
        return request.build_absolute_uri(rel) if request else rel

    if hasattr(photo_field, "url"):
        try:
            return request.build_absolute_uri(photo_field.url) if request else photo_field.url
        except ValueError:
            return None
    return None


def validate_and_optimize_image(
    raw_bytes: bytes,
    prefix: str = "photo",
    max_dimension: int = MAX_IMAGE_DIMENSION,
    is_logo: bool = False,
) -> ContentFile:
    """
    Verifies real image magic bytes via Pillow, restricts uploads to JPEG/PNG/WEBP <= 2 MB,
    auto-trims transparent padding and preserves RGBA transparency for logos, and generates
    safe random UUID filenames.
    """
    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("Image exceeds the 2 MB maximum size.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as probe:
            detected_format = (probe.format or "").upper()
            if detected_format not in ALLOWED_PIL_FORMATS:
                raise serializers.ValidationError("Only JPEG, PNG, and WEBP image files are allowed.")
            probe.verify()

        with Image.open(io.BytesIO(raw_bytes)) as img:
            has_alpha = _has_alpha_channel(img)
            if has_alpha:
                img = img.convert("RGBA")
                if is_logo:
                    img = _trim_transparent_padding(img)
            elif is_logo and detected_format in ("PNG", "WEBP"):
                img = img.convert("RGBA")

            if max(img.size) > max_dimension:
                img.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            if is_logo:
                if has_alpha or detected_format in ("PNG", "WEBP"):
                    if img.mode not in ("RGB", "RGBA"):
                        img = img.convert("RGBA" if has_alpha else "RGB")
                    img.save(buffer, format="PNG", optimize=True)
                    ext = "png"
                else:
                    rgb = _flatten_rgba_on_white(img)
                    rgb.save(buffer, format="JPEG", quality=90, optimize=True)
                    ext = "jpg"
            elif detected_format == "WEBP":
                img.save(buffer, format="WEBP", quality=82)
                ext = "webp"
            elif has_alpha or detected_format == "PNG":
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGBA" if has_alpha else "RGB")
                img.save(buffer, format="PNG", optimize=True)
                ext = "png"
            else:
                rgb = _flatten_rgba_on_white(img)
                rgb.save(buffer, format="JPEG", quality=82, optimize=True)
                ext = "jpg"

            safe_prefix = "".join(ch for ch in prefix if ch.isalnum() or ch == "_")[:20] or "img"
            return ContentFile(buffer.getvalue(), name=f"{safe_prefix}_{uuid.uuid4().hex}.{ext}")
    except serializers.ValidationError:
        raise
    except (UnidentifiedImageError, OSError) as exc:
        raise serializers.ValidationError("Invalid or corrupted image file.") from exc


def decode_uploaded_image(
    data,
    prefix: str = "upload",
    max_dimension: int = MAX_IMAGE_DIMENSION,
    is_logo: bool = False,
):
    if data in (None, "", "null", "undefined"):
        return None
    if hasattr(data, "read"):
        raw_bytes = data.read()
        data.seek(0)
        return validate_and_optimize_image(
            raw_bytes, prefix=prefix, max_dimension=max_dimension, is_logo=is_logo
        )
    if isinstance(data, str):
        clean = data.strip()
        if clean.startswith("data:image") and ";base64," in clean:
            _, b64_part = clean.split(";base64,", 1)
            try:
                raw_bytes = base64.b64decode(b64_part, validate=True)
            except Exception as exc:
                raise serializers.ValidationError("Invalid Base64 image data.") from exc
            return validate_and_optimize_image(
                raw_bytes, prefix=prefix, max_dimension=max_dimension, is_logo=is_logo
            )
    return serializers.SkipField()


class FlexibleImageField(serializers.Field):
    def to_representation(self, value):
        return build_media_url(value, self.context.get("request"))

    def to_internal_value(self, data):
        result = decode_uploaded_image(data, prefix="photo", max_dimension=MAX_IMAGE_DIMENSION)
        if isinstance(result, serializers.SkipField):
            raise result
        return result


class SchoolLogoField(serializers.Field):
    def to_representation(self, value):
        return build_media_url(value, self.context.get("request"))

    def to_internal_value(self, data):
        file_obj = decode_uploaded_image(
            data, prefix="logo", max_dimension=MAX_LOGO_DIMENSION, is_logo=True
        )
        if isinstance(file_obj, serializers.SkipField):
            raise file_obj
        if file_obj is None:
            return None
        raw_bytes = file_obj.read()
        ext = getattr(file_obj, "name", "logo.png").rsplit(".", 1)[-1].lower()
        target_dir = os.path.join(settings.MEDIA_ROOT, "school_logos")
        os.makedirs(target_dir, exist_ok=True)
        filename = f"logo_{uuid.uuid4().hex}.{ext}"
        with open(os.path.join(target_dir, filename), "wb") as fh:
            fh.write(raw_bytes)
        return f"/media/school_logos/{filename}"
