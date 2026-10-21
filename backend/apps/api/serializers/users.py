import secrets
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from apps.academics.models import SchoolProfile, UserProfile, FacultyProfile
from .base import FlexibleImageField, safe_photo_url

User = get_user_model()

class SchoolProfileSerializer(serializers.ModelSerializer):
    left_logo = FlexibleImageField(required=False, allow_null=True)
    right_logo = FlexibleImageField(required=False, allow_null=True)
    school_logo = FlexibleImageField(required=False, allow_null=True)

    class Meta:
        model = SchoolProfile
        fields = '__all__'


class UserManagementSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()
    current_role = serializers.SerializerMethodField()
    is_teaching = serializers.SerializerMethodField()
    can_teach = serializers.SerializerMethodField()
    is_profile_completed = serializers.SerializerMethodField()
    faculty_id = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email', 'role',
            'current_role', 'is_teaching', 'can_teach', 'is_profile_completed',
            'faculty_id', 'photo', 'photo_url', 'is_active', 'is_staff',
            'is_superuser', 'password',
        ]

    def _get_profile(self, obj):
        return getattr(obj, 'profile', None) or getattr(obj, 'userprofile', None)

    def get_role(self, obj):
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'role', None):
            return str(prof.role).upper()
        return 'ADMIN' if obj.is_superuser else 'FACULTY'

    def get_current_role(self, obj):
        role = self.get_role(obj)
        return 'FACULTY_ADMIN' if role == 'ADMIN' and self.get_is_teaching(obj) else role

    def get_is_teaching(self, obj):
        prof = self._get_profile(obj)
        return bool(prof.is_teaching) if prof and hasattr(prof, 'is_teaching') else (self.get_role(obj) == 'FACULTY')

    def get_can_teach(self, obj):
        return self.get_is_teaching(obj)

    def get_is_profile_completed(self, obj):
        prof = self._get_profile(obj)
        return bool(prof.is_profile_completed) if prof and hasattr(prof, 'is_profile_completed') else bool(obj.first_name and obj.last_name)

    def get_faculty_id(self, obj):
        prof = self._get_profile(obj)
        return getattr(prof, 'faculty_id', None) if prof else None

    def get_photo(self, obj):
        return self.get_photo_url(obj)

    def get_photo_url(self, obj):
        request = self.context.get('request')
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'faculty', None) and prof.faculty.photo:
            return safe_photo_url(prof.faculty.photo, request)
        if prof and getattr(prof, 'avatar', None):
            return safe_photo_url(prof.avatar, request)
        return None
