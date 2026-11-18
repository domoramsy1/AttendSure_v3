import base64
import hashlib
import io
import os
import uuid
from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers

MAX_IMAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_DIMENSION = 1024
ALLOWED_IMAGE_EXTS = {"png", "jpg", "jpeg", "webp"}


def save_base64_logo_to_disk(raw_value: str) -> str | None:
    """Converts raw Base64 logo strings into small static files under /media/school_logos/."""
    clean = str(raw_value or "").strip()
    if not clean or clean.lower() in ("none", "null", "undefined"):
        return None

    if clean.startswith(("http://", "https://", "/media/")):
        return clean
    if clean.startswith("school_logos/"):
        return f"/media/{clean}"

    if clean.startswith("data:image") or clean.startswith(("/9j/", "iVBORw0KGgo")):
        try:
            if ";base64," in clean:
                header, b64_part = clean.split(";base64,", 1)
                raw_ext = header.split("/")[-1].split(";")[0].lower()
                ext = "jpg" if raw_ext in ("jpeg", "pjpeg") else raw_ext
            else:
                b64_part = clean
                ext = "jpg" if clean.startswith("/9j/") else "png"

            if ext not in ALLOWED_IMAGE_EXTS:
                ext = "png"

            raw_bytes = base64.b64decode(b64_part, validate=True)
            if len(raw_bytes) > MAX_IMAGE_BYTES:
                return None

            with Image.open(io.BytesIO(raw_bytes)) as img:
                img.verify()

            digest = hashlib.sha256(raw_bytes).hexdigest()[:16]
            target_dir = os.path.join(settings.MEDIA_ROOT, "school_logos")
            os.makedirs(target_dir, exist_ok=True)
            filename = f"logo_{digest}.{ext}"
            full_path = os.path.join(target_dir, filename)
            if not os.path.exists(full_path):
                with open(full_path, "wb") as fh:
                    fh.write(raw_bytes)
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


def validate_and_optimize_image(raw_bytes: bytes, prefix: str = "photo") -> ContentFile:
    """Verifies real image magic bytes via Pillow and compresses oversized uploads."""
    if len(raw_bytes) > MAX_IMAGE_BYTES:
        raise serializers.ValidationError("Image exceeds the 5 MB maximum size.")

    try:
        with Image.open(io.BytesIO(raw_bytes)) as probe:
            probe.verify()

        with Image.open(io.BytesIO(raw_bytes)) as img:
            has_alpha = img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info)
            if max(img.size) > MAX_IMAGE_DIMENSION:
                img.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), Image.Resampling.LANCZOS)

            buffer = io.BytesIO()
            if has_alpha:
                img.save(buffer, format="PNG", optimize=True)
                ext = "png"
            else:
                rgb = img.convert("RGB")
                rgb.save(buffer, format="JPEG", quality=82, optimize=True)
                ext = "jpg"
            return ContentFile(buffer.getvalue(), name=f"{prefix}_{uuid.uuid4().hex[:12]}.{ext}")
    except (UnidentifiedImageError, OSError) as exc:
        raise serializers.ValidationError("Invalid or corrupted image file.") from exc


def decode_uploaded_image(data, prefix: str = "upload"):
    if data in (None, "", "null", "undefined"):
        return None
    if hasattr(data, "read"):
        raw_bytes = data.read()
        data.seek(0)
        return validate_and_optimize_image(raw_bytes, prefix=prefix)
    if isinstance(data, str):
        clean = data.strip()
        if clean.startswith("data:image") and ";base64," in clean:
            _, b64_part = clean.split(";base64,", 1)
            try:
                raw_bytes = base64.b64decode(b64_part, validate=True)
            except Exception as exc:
                raise serializers.ValidationError("Invalid Base64 image data.") from exc
            return validate_and_optimize_image(raw_bytes, prefix=prefix)
    return serializers.SkipField()


class FlexibleImageField(serializers.Field):
    def to_representation(self, value):
        return build_media_url(value, self.context.get("request"))

    def to_internal_value(self, data):
        result = decode_uploaded_image(data, prefix="photo")
        if isinstance(result, serializers.SkipField):
            raise result
        return result


class SchoolLogoField(serializers.Field):
    def to_representation(self, value):
        return build_media_url(value, self.context.get("request"))

    def to_internal_value(self, data):
        file_obj = decode_uploaded_image(data, prefix="logo")
        if isinstance(file_obj, serializers.SkipField):
            raise file_obj
        if file_obj is None:
            return None
        raw_bytes = file_obj.read()
        ext = getattr(file_obj, "name", "logo.png").rsplit(".", 1)[-1].lower()
        digest = hashlib.sha256(raw_bytes).hexdigest()[:16]
        target_dir = os.path.join(settings.MEDIA_ROOT, "school_logos")
        os.makedirs(target_dir, exist_ok=True)
        filename = f"logo_{digest}.{ext}"
        with open(os.path.join(target_dir, filename), "wb") as fh:
            fh.write(raw_bytes)
        return f"/media/school_logos/{filename}"