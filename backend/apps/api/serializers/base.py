import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers
from apps.api.views.common import safe_photo_url

MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}


class FlexibleImageField(serializers.Field):
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
