"""
AttendSure V3 - Image & School Emblem Serializer Fields
File: backend/apps/api/serializers/base.py
"""

import base64
import hashlib
import os
import uuid
from django.conf import settings
from django.core.files.base import ContentFile
from rest_framework import serializers
from apps.api.views.common import resolve_logo_field, safe_photo_url

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}


class FlexibleImageField(serializers.Field):
    """Handles ImageField uploads for Student, FacultyProfile, and UserProfile."""

    def to_representation(self, value):
        request = self.context.get('request')
        return safe_photo_url(value, request)

    def to_internal_value(self, data):
        if data in (None, '', 'null'):
            return None

        if hasattr(data, 'read'):
            if data.size > MAX_IMAGE_SIZE_BYTES:
                raise serializers.ValidationError("Image file size exceeds the 5 MB limit.")
            return data

        if isinstance(data, str):
            clean = data.strip()
            if not clean or clean.lower() in ('none', 'null', 'undefined'):
                return None

            if clean.startswith('data:image') and ';base64,' in clean:
                try:
                    header, img_str = clean.split(';base64,', 1)
                    raw_ext = header.split('/')[-1].split(';')[0].lower()
                    ext = 'jpg' if raw_ext in ('jpeg', 'pjpeg') else raw_ext

                    if ext not in ALLOWED_IMAGE_EXTENSIONS:
                        raise serializers.ValidationError(
                            f"Unsupported image format (.{ext}). Allowed: PNG, JPG, WEBP."
                        )

                    decoded_data = base64.b64decode(img_str, validate=True)
                    if len(decoded_data) > MAX_IMAGE_SIZE_BYTES:
                        raise serializers.ValidationError("Decoded image exceeds the 5 MB limit.")

                    file_name = f"upload_{uuid.uuid4().hex[:12]}.{ext}"
                    return ContentFile(decoded_data, name=file_name)
                except serializers.ValidationError:
                    raise
                except Exception as exc:
                    raise serializers.ValidationError(f"Invalid Base64 image: {exc}")

            if clean.startswith(('http://', 'https://', '/media/')):
                raise serializers.SkipField()

        raise serializers.SkipField()


class SchoolLogoField(serializers.Field):
    """
    Handles TextField emblem columns on SchoolProfile (school_logo, left_logo, right_logo).
    Writes uploaded files or Base64 images directly to media/school_logos/ on disk
    and stores the clean media URL path in PostgreSQL.
    """

    def to_representation(self, value):
        request = self.context.get('request')
        return resolve_logo_field(value, request)

    def _save_bytes_to_disk(self, raw_bytes: bytes, ext: str) -> str:
        if len(raw_bytes) > MAX_IMAGE_SIZE_BYTES:
            raise serializers.ValidationError("Logo image exceeds the 5 MB limit.")
        file_hash = hashlib.sha256(raw_bytes).hexdigest()[:16]
        filename = f"logo_{file_hash}.{ext}"
        target_dir = os.path.join(settings.MEDIA_ROOT, 'school_logos')
        os.makedirs(target_dir, exist_ok=True)
        target_path = os.path.join(target_dir, filename)
        with open(target_path, 'wb') as f:
            f.write(raw_bytes)
        media_prefix = settings.MEDIA_URL if settings.MEDIA_URL.startswith('/') else f"/{settings.MEDIA_URL}"
        if not media_prefix.endswith('/'):
            media_prefix += '/'
        return f"{media_prefix}school_logos/{filename}"

    def to_internal_value(self, data):
        if data in (None, '', 'null', 'None', 'undefined'):
            return None

        if hasattr(data, 'read'):
            raw_bytes = data.read()
            name = getattr(data, 'name', 'logo.png')
            ext = name.rsplit('.', 1)[-1].lower() if '.' in name else 'png'
            ext = 'jpg' if ext in ('jpeg', 'pjpeg') else ext
            if ext not in ALLOWED_IMAGE_EXTENSIONS:
                ext = 'png'
            return self._save_bytes_to_disk(raw_bytes, ext)

        if isinstance(data, str):
            clean = data.strip()
            if not clean or clean.lower() in ('none', 'null', 'undefined'):
                return None

            if clean.startswith('data:image') and ';base64,' in clean:
                try:
                    header, img_str = clean.split(';base64,', 1)
                    raw_ext = header.split('/')[-1].split(';')[0].lower()
                    ext = 'jpg' if raw_ext in ('jpeg', 'pjpeg') else raw_ext
                    if ext not in ALLOWED_IMAGE_EXTENSIONS:
                        raise serializers.ValidationError(
                            f"Unsupported logo format (.{ext}). Allowed: PNG, JPG, WEBP."
                        )
                    decoded_bytes = base64.b64decode(img_str, validate=True)
                    return self._save_bytes_to_disk(decoded_bytes, ext)
                except serializers.ValidationError:
                    raise
                except Exception as exc:
                    raise serializers.ValidationError(f"Invalid Base64 logo image: {exc}")

            if clean.startswith(('http://', 'https://', '/media/')):
                raise serializers.SkipField()

        raise serializers.SkipField()