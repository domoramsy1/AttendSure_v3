"""
AttendSure V3 - School Profile & User Management Serializer (QR ID & Mobile App Only)
File: backend/apps/api/serializers/users.py
"""

import secrets
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from apps.academics.models import FacultyProfile, SchoolProfile, Student, UserProfile
from apps.academics.models.people import normalize_ph_phone
from apps.api.views.common import get_user_role
from .base import FlexibleImageField, safe_photo_url

User = get_user_model()


class SchoolProfileSerializer(serializers.ModelSerializer):
    left_logo = FlexibleImageField(required=False, allow_null=True)
    right_logo = FlexibleImageField(required=False, allow_null=True)
    school_logo = FlexibleImageField(required=False, allow_null=True)

    principal_photo_url = serializers.SerializerMethodField()
    principal_employee_id = serializers.SerializerMethodField()
    principal_department = serializers.SerializerMethodField()
    principal_email = serializers.SerializerMethodField()
    principal_contact_number = serializers.SerializerMethodField()

    class Meta:
        model = SchoolProfile
        fields = '__all__'

    def get_principal_photo_url(self, obj):
        request = self.context.get('request')
        faculty = obj.principal_faculty
        if faculty:
            if faculty.photo:
                return safe_photo_url(faculty.photo, request)
            if hasattr(faculty, 'account') and faculty.account and faculty.account.avatar:
                return safe_photo_url(faculty.account.avatar, request)
            user = User.objects.filter(Q(username__iexact=faculty.employee_id) | Q(email__iexact=faculty.email)).first()
            if user and hasattr(user, 'profile') and user.profile.avatar:
                return safe_photo_url(user.profile.avatar, request)
        return None

    def get_principal_employee_id(self, obj):
        return obj.principal_faculty.employee_id if obj.principal_faculty else ''

    def get_principal_department(self, obj):
        return obj.principal_faculty.department if obj.principal_faculty else 'Administration'

    def get_principal_email(self, obj):
        if obj.principal_faculty:
            return obj.principal_faculty.email or (
                obj.principal_faculty.account.user.email
                if hasattr(obj.principal_faculty, 'account') and obj.principal_faculty.account
                else ''
            )
        return ''

    def get_principal_contact_number(self, obj):
        return obj.principal_faculty.contact_number if obj.principal_faculty else ''


class UserManagementSerializer(serializers.ModelSerializer):
    role = serializers.CharField(required=False, allow_blank=True)
    current_role = serializers.CharField(required=False, allow_blank=True, read_only=True)
    is_teaching = serializers.BooleanField(required=False, default=True)
    can_teach = serializers.BooleanField(required=False, read_only=True)
    is_profile_completed = serializers.BooleanField(required=False, read_only=True)
    faculty_id = serializers.IntegerField(required=False, read_only=True, allow_null=True)

    employee_id = serializers.CharField(required=False, allow_blank=True)
    middle_name = serializers.CharField(required=False, allow_blank=True)
    suffix = serializers.CharField(required=False, allow_blank=True)
    full_name = serializers.SerializerMethodField()
    contact_number = serializers.CharField(required=False, allow_blank=True)
    phone_number = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    position = serializers.CharField(required=False, allow_blank=True)

    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'employee_id', 'first_name', 'middle_name', 'last_name',
            'suffix', 'full_name', 'email', 'contact_number', 'phone_number',
            'department', 'position', 'role', 'current_role', 'is_teaching',
            'can_teach', 'is_profile_completed', 'faculty_id', 'photo',
            'photo_url', 'is_active', 'is_staff', 'is_superuser', 'password',
        ]

    def _get_profile(self, obj):
        return getattr(obj, 'profile', None)

    def get_full_name(self, obj):
        prof = self._get_profile(obj)
        if prof and prof.faculty and prof.faculty.full_name:
            return prof.faculty.full_name
        return ' '.join(filter(None, [obj.first_name, obj.last_name])).strip() or obj.username

    def get_photo_url(self, obj):
        request = self.context.get('request')
        prof = self._get_profile(obj)
        if prof and prof.faculty and prof.faculty.photo:
            return safe_photo_url(prof.faculty.photo, request)
        if prof and prof.avatar:
            return safe_photo_url(prof.avatar, request)
        return None

    def validate_employee_id(self, value):
        if not value or not str(value).strip():
            return ''
        clean_id = str(value).strip().upper()
        qs = FacultyProfile.objects.filter(employee_id__iexact=clean_id)
        if self.instance:
            prof = self._get_profile(self.instance)
            if prof and prof.faculty_id:
                qs = qs.exclude(id=prof.faculty_id)
        if qs.exists():
            raise serializers.ValidationError(f"Employee ID '{clean_id}' is already registered.")
        return clean_id

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        prof = self._get_profile(instance)
        faculty = prof.faculty if prof else None

        base_role = str(prof.role).upper() if (prof and prof.role) else ('ADMIN' if instance.is_superuser else 'FACULTY')
        is_teach = False if base_role == 'PARENT' else (bool(prof.is_teaching) if prof else base_role == 'FACULTY')

        ret['role'] = base_role
        ret['current_role'] = 'FACULTY_ADMIN' if (base_role == 'ADMIN' and is_teach) else base_role
        ret['is_teaching'] = is_teach
        ret['can_teach'] = is_teach
        ret['is_profile_completed'] = bool(prof.is_profile_completed) if prof else bool(instance.first_name and instance.last_name)
        ret['faculty_id'] = prof.faculty_id if prof else None
        ret['employee_id'] = faculty.employee_id if faculty else instance.username
        ret['middle_name'] = faculty.middle_name if faculty else ''
        ret['suffix'] = faculty.suffix if faculty else ''
        phone = (prof.phone_number if prof and prof.phone_number else '') or (faculty.contact_number if faculty else '')
        ret['contact_number'] = phone
        ret['phone_number'] = phone
        ret['department'] = faculty.department if faculty else ('Parent / Guardian' if base_role == 'PARENT' else '')
        ret['position'] = faculty.position if faculty else base_role.replace('_', ' ').title()
        photo_url = self.get_photo_url(instance)
        ret['photo'] = photo_url
        ret['photo_url'] = photo_url
        return ret

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop('password', None)
        raw_role = validated_data.pop('role', None) or self.initial_data.get('role', 'FACULTY')
        is_teaching_param = validated_data.pop('is_teaching', None)
        photo = validated_data.pop('photo', None)

        employee_id = str(
            validated_data.pop('employee_id', None) or self.initial_data.get('employee_id') or validated_data.get('username') or ''
        ).strip().upper()
        middle_name = str(validated_data.pop('middle_name', None) or self.initial_data.get('middle_name') or '').strip()
        suffix = str(validated_data.pop('suffix', None) or self.initial_data.get('suffix') or '').strip()
        raw_contact = (
            validated_data.pop('contact_number', None)
            or validated_data.pop('phone_number', None)
            or self.initial_data.get('contact_number')
            or self.initial_data.get('phone_number')
            or ''
        )
        contact_number = normalize_ph_phone(raw_contact)
        department = str(validated_data.pop('department', None) or self.initial_data.get('department') or 'Junior High School').strip()
        position = str(validated_data.pop('position', None) or self.initial_data.get('position') or 'Faculty I').strip()

        clean_role = str(raw_role).upper()
        if clean_role == 'FACULTY_ADMIN':
            final_role, final_is_teaching = 'ADMIN', True
        elif clean_role == 'PARENT':
            final_role, final_is_teaching = 'PARENT', False
        elif clean_role == 'FACULTY':
            final_role = 'FACULTY'
            final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else True
        else:
            final_role = clean_role
            final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else False

        is_admin = final_role == 'ADMIN'
        validated_data['is_staff'] = is_admin
        validated_data['is_superuser'] = is_admin

        user = User(**validated_data)
        if password and str(password).strip():
            user.set_password(str(password).strip())
        else:
            user.set_unusable_password()
        user.save()

        photo_bytes = None
        photo_name = getattr(photo, 'name', 'avatar.jpg') if photo else 'avatar.jpg'
        if photo and hasattr(photo, 'read'):
            photo_bytes = photo.read()
            photo.seek(0)

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = final_role
        profile.phone_number = contact_number
        profile.is_teaching = final_is_teaching
        profile.is_profile_completed = bool(user.first_name and user.last_name)
        if photo_bytes:
            profile.avatar = ContentFile(photo_bytes, name=photo_name)
        profile.save()

        # Parent accounts do not create FacultyProfile records; instead link matching students
        if final_role == 'PARENT':
            if contact_number:
                Student.objects.filter(parent_contact=contact_number, parent_user__isnull=True).update(parent_user=user)
            return user

        clean_emp_id = employee_id or user.username.upper()[:50]
        faculty_photo = ContentFile(photo_bytes, name=photo_name) if photo_bytes else None
        faculty, _ = FacultyProfile.objects.update_or_create(
            employee_id=clean_emp_id,
            defaults={
                'first_name': user.first_name or user.username,
                'middle_name': middle_name,
                'last_name': user.last_name or 'Staff',
                'suffix': suffix,
                'email': user.email or '',
                'contact_number': contact_number,
                'department': department,
                'position': position,
                'can_teach': final_is_teaching,
                'is_active': user.is_active,
                'qr_token': secrets.token_urlsafe(24),
                **({'photo': faculty_photo} if faculty_photo else {}),
            },
        )
        profile.faculty = faculty
        profile.save(update_fields=['faculty'])
        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        request = self.context.get('request')
        is_admin_req = bool(
            request and request.user and request.user.is_authenticated
            and (request.user.is_superuser or get_user_role(request.user) == 'ADMIN')
        )

        password = validated_data.pop('password', None)
        raw_role = validated_data.pop('role', None) or self.initial_data.get('role')
        is_teaching_param = validated_data.pop('is_teaching', None)
        photo = validated_data.pop('photo', None)

        if not is_admin_req:
            raw_role = None
            is_teaching_param = None
            validated_data.pop('is_staff', None)
            validated_data.pop('is_superuser', None)
            validated_data.pop('is_active', None)

        raw_contact = (
            validated_data.pop('contact_number', None)
            or validated_data.pop('phone_number', None)
            or self.initial_data.get('contact_number')
            or self.initial_data.get('phone_number')
        )
        contact_number = normalize_ph_phone(raw_contact) if raw_contact is not None else None

        if password and str(password).strip():
            instance.set_password(str(password).strip())

        for attr, value in validated_data.items():
            if hasattr(instance, attr):
                setattr(instance, attr, value)
        instance.save()

        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if raw_role and is_admin_req:
            clean_role = str(raw_role).upper()
            profile.role = 'ADMIN' if clean_role == 'FACULTY_ADMIN' else clean_role
            instance.is_staff = profile.role == 'ADMIN'
            instance.is_superuser = profile.role == 'ADMIN'
            instance.save(update_fields=['is_staff', 'is_superuser'])
        if is_teaching_param is not None and is_admin_req:
            profile.is_teaching = False if profile.role == 'PARENT' else bool(is_teaching_param)
        if contact_number is not None:
            profile.phone_number = contact_number
        if photo and hasattr(photo, 'read'):
            profile.avatar = ContentFile(photo.read(), name=getattr(photo, 'name', 'avatar.jpg'))
        profile.is_profile_completed = bool(instance.first_name and instance.last_name)
        profile.save()

        if profile.role == 'PARENT' and profile.phone_number:
            Student.objects.filter(parent_contact=profile.phone_number, parent_user__isnull=True).update(parent_user=instance)
        elif profile.faculty:
            fac = profile.faculty
            fac.first_name = instance.first_name or fac.first_name
            fac.last_name = instance.last_name or fac.last_name
            fac.email = instance.email or fac.email
            if contact_number is not None:
                fac.contact_number = contact_number
            fac.can_teach = profile.is_teaching
            fac.is_active = instance.is_active
            fac.save()

        cache.clear()
        return instance