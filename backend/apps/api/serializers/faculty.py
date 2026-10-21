import secrets
from rest_framework import serializers
from apps.academics.models import FacultyProfile
from .base import FlexibleImageField, safe_photo_url

class FacultyDropdownSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            'id', 'employee_id', 'first_name', 'last_name', 'suffix',
            'full_name', 'department', 'position', 'can_teach', 'is_active', 'photo_url',
        ]

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)


class FacultyProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            'id', 'employee_id', 'first_name', 'middle_name', 'last_name', 'suffix',
            'full_name', 'email', 'contact_number', 'position', 'department',
            'can_teach', 'is_active', 'rfid_uid', 'qr_token', 'bound_device_id',
            'device_model', 'device_bound_at', 'photo', 'photo_url',
        ]
        extra_kwargs = {
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'bound_device_id': {'required': False, 'allow_blank': True, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
        }

    def validate_employee_id(self, value):
        return value.strip().upper()

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip().upper()

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)

    def create(self, validated_data):
        if not validated_data.get('qr_token'):
            validated_data['qr_token'] = secrets.token_urlsafe(32)
        if 'can_teach' not in validated_data:
            validated_data['can_teach'] = True
        return super().create(validated_data)
