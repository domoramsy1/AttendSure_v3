# backend/apps/api/serializers/users.py

import secrets
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from apps.academics.models import SchoolProfile, UserProfile, FacultyProfile
from .base import FlexibleImageField, safe_photo_url

User = get_user_model()


class SchoolProfileSerializer(serializers.ModelSerializer):
    left_logo = FlexibleImageField(required=False, allow_null=True)
    right_logo = FlexibleImageField(required=False, allow_null=True)
    school_logo = FlexibleImageField(required=False, allow_null=True)

    # Dynamic School Head / Principal Credentials fetched from database
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

    # Extended Faculty & Staff Fields
    employee_id = serializers.CharField(required=False, allow_blank=True)
    middle_name = serializers.CharField(required=False, allow_blank=True)
    suffix = serializers.CharField(required=False, allow_blank=True)
    full_name = serializers.SerializerMethodField()
    contact_number = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    position = serializers.CharField(required=False, allow_blank=True)
    rfid_uid = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'employee_id', 'first_name', 'middle_name', 'last_name',
            'suffix', 'full_name', 'email', 'contact_number', 'department', 'position',
            'rfid_uid', 'role', 'current_role', 'is_teaching', 'can_teach',
            'is_profile_completed', 'faculty_id', 'photo', 'photo_url', 'is_active',
            'is_staff', 'is_superuser', 'password',
        ]

    def _get_profile(self, obj):
        return getattr(obj, 'profile', None) or getattr(obj, 'userprofile', None)

    def get_full_name(self, obj):
        prof = self._get_profile(obj)
        if prof and prof.faculty and prof.faculty.full_name:
            return prof.faculty.full_name
        name_parts = filter(None, [obj.first_name, getattr(obj, 'middle_name', ''), obj.last_name])
        return " ".join(name_parts).strip() or obj.username

    def get_photo_url(self, obj):
        request = self.context.get('request')
        prof = self._get_profile(obj)
        if prof and getattr(prof, 'faculty', None) and prof.faculty.photo:
            return safe_photo_url(prof.faculty.photo, request)
        if prof and getattr(prof, 'avatar', None):
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
            raise serializers.ValidationError(f"Employee ID '{clean_id}' is already registered to another faculty member.")
        return clean_id

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        clean_rfid = str(value).strip().upper()
        qs = FacultyProfile.objects.filter(rfid_uid__iexact=clean_rfid)
        if self.instance:
            prof = self._get_profile(self.instance)
            if prof and prof.faculty_id:
                qs = qs.exclude(id=prof.faculty_id)
        if qs.exists():
            raise serializers.ValidationError(f"RFID card UID '{clean_rfid}' is already registered.")
        return clean_rfid

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        prof = self._get_profile(instance)
        faculty = getattr(prof, 'faculty', None) if prof else None

        base_role = str(prof.role).upper() if prof and getattr(prof, 'role', None) else ('ADMIN' if instance.is_superuser else 'FACULTY')
        is_teach = bool(prof.is_teaching) if prof and hasattr(prof, 'is_teaching') else (base_role in ('FACULTY', 'FACULTY_ADMIN'))

        ret['role'] = base_role
        ret['current_role'] = 'FACULTY_ADMIN' if base_role == 'ADMIN' and is_teach else base_role
        ret['is_teaching'] = is_teach
        ret['can_teach'] = is_teach
        ret['is_profile_completed'] = (
            bool(prof.is_profile_completed)
            if prof and hasattr(prof, 'is_profile_completed')
            else bool(instance.first_name and instance.last_name)
        )
        ret['faculty_id'] = getattr(prof, 'faculty_id', None) if prof else None

        ret['employee_id'] = getattr(faculty, 'employee_id', instance.username) if faculty else instance.username
        ret['middle_name'] = getattr(faculty, 'middle_name', '') if faculty else ''
        ret['suffix'] = getattr(faculty, 'suffix', '') if faculty else ''
        ret['contact_number'] = getattr(faculty, 'contact_number', '') if faculty else ''
        ret['department'] = getattr(faculty, 'department', '') if faculty else ''
        ret['position'] = getattr(faculty, 'position', '') if faculty else base_role.replace('_', ' ').title()
        ret['rfid_uid'] = getattr(faculty, 'rfid_uid', '') if faculty else ''

        photo_url = self.get_photo_url(instance)
        ret['photo'] = photo_url
        ret['photo_url'] = photo_url
        return ret

    def _sync_school_principal_settings(self, faculty):
        """
        Automatically updates SchoolProfile when a Principal user is created or updated.
        """
        if not faculty:
            return
        try:
            school = SchoolProfile.objects.first()
            if not school:
                school = SchoolProfile.objects.create(
                    school_id="",
                    school_name=""
                )
            school.principal_faculty = faculty
            school.principal_name = faculty.full_name
            school.principal_title = faculty.position or 'Secondary School Principal IV'
            school.save()
            cache.delete("attendsure_school_settings_fast_payload")
        except Exception:
            pass

    @transaction.atomic
    def create(self, validated_data):
        password = validated_data.pop('password', None)
        raw_role = validated_data.pop('role', None) or self.initial_data.get('role', 'FACULTY')
        is_teaching_param = validated_data.pop('is_teaching', None)
        photo = validated_data.pop('photo', None)

        employee_id_val = validated_data.pop('employee_id', None)
        employee_id = str(employee_id_val or self.initial_data.get('employee_id') or validated_data.get('username') or '').strip().upper()

        middle_name_val = validated_data.pop('middle_name', None)
        middle_name = str(middle_name_val if middle_name_val is not None else self.initial_data.get('middle_name') or '').strip()

        suffix_val = validated_data.pop('suffix', None)
        suffix = str(suffix_val if suffix_val is not None else self.initial_data.get('suffix') or '').strip()

        contact_val = validated_data.pop('contact_number', None)
        contact_number = str(contact_val if contact_val is not None else self.initial_data.get('contact_number') or '').strip()

        dept_val = validated_data.pop('department', None)
        department = str(dept_val if dept_val is not None else self.initial_data.get('department') or 'Junior High School').strip()

        pos_val = validated_data.pop('position', None)
        default_pos = 'Secondary School Principal IV' if str(raw_role).upper() == 'PRINCIPAL' else 'Faculty I'
        position = str(pos_val if pos_val is not None else self.initial_data.get('position') or default_pos).strip()

        raw_rfid = validated_data.pop('rfid_uid', None)
        if raw_rfid is None:
            raw_rfid = self.initial_data.get('rfid_uid')
        rfid_uid = str(raw_rfid).strip().upper() if raw_rfid and str(raw_rfid).strip() else None

        clean_role_str = str(raw_role).upper()
        if clean_role_str == 'FACULTY_ADMIN':
            final_role = 'ADMIN'
            final_is_teaching = True
        elif clean_role_str == 'FACULTY':
            final_role = 'FACULTY'
            final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else True
        elif clean_role_str == 'GUARD':
            final_role = 'GUARD'
            final_is_teaching = False
        elif clean_role_str == 'PRINCIPAL':
            final_role = 'PRINCIPAL'
            final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else True
        else:
            final_role = clean_role_str
            final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else False

        is_admin = (final_role == 'ADMIN')
        validated_data['is_staff'] = is_admin
        validated_data['is_superuser'] = is_admin

        # 1. Create User
        user = User(**validated_data)
        if password and str(password).strip():
            user.set_password(str(password).strip())
        else:
            user.set_unusable_password()
        user.save()

        # 2. Duplicate ContentFile stream so both profile.avatar and faculty.photo persist
        photo_bytes = None
        photo_name = getattr(photo, 'name', 'avatar.jpg') if photo else 'avatar.jpg'
        if photo and hasattr(photo, 'read'):
            try:
                photo_bytes = photo.read()
                photo.seek(0)
            except Exception:
                pass

        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = final_role
        profile.is_teaching = final_is_teaching
        profile.is_profile_completed = bool(user.first_name and user.last_name)
        if photo_bytes:
            profile.avatar = ContentFile(photo_bytes, name=photo_name)
        elif photo:
            profile.avatar = photo
        profile.save()

        # 3. Synchronize FacultyProfile
        clean_emp_id = employee_id or user.username.upper()[:50]
        faculty = (
            FacultyProfile.objects.filter(employee_id__iexact=clean_emp_id).first()
            or (FacultyProfile.objects.filter(email__iexact=user.email).first() if user.email else None)
        )

        faculty_photo = ContentFile(photo_bytes, name=photo_name) if photo_bytes else (photo if photo else None)

        if not faculty:
            faculty = FacultyProfile.objects.create(
                employee_id=clean_emp_id,
                first_name=user.first_name or user.username,
                middle_name=middle_name,
                last_name=user.last_name or 'Staff',
                suffix=suffix,
                email=user.email or '',
                contact_number=contact_number,
                department=department,
                position=position,
                rfid_uid=rfid_uid,
                photo=faculty_photo,
                can_teach=final_is_teaching,
                is_active=user.is_active,
                qr_token=secrets.token_urlsafe(32),
            )
        else:
            faculty.first_name = user.first_name or faculty.first_name
            faculty.middle_name = middle_name or faculty.middle_name
            faculty.last_name = user.last_name or faculty.last_name
            faculty.suffix = suffix or faculty.suffix
            faculty.email = user.email or faculty.email
            faculty.contact_number = contact_number or faculty.contact_number
            faculty.department = department or faculty.department
            faculty.position = position or faculty.position
            if rfid_uid is not None:
                faculty.rfid_uid = rfid_uid
            if faculty_photo:
                faculty.photo = faculty_photo
            faculty.can_teach = final_is_teaching
            faculty.is_active = user.is_active
            faculty.save()

        profile.faculty = faculty
        profile.save(update_fields=['faculty'])

        if final_role == 'PRINCIPAL':
            self._sync_school_principal_settings(faculty)

        return user

    @transaction.atomic
    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        raw_role = validated_data.pop('role', None) or self.initial_data.get('role', None)
        is_teaching_param = validated_data.pop('is_teaching', None)
        photo = validated_data.pop('photo', None)

        employee_id_val = validated_data.pop('employee_id', None)
        employee_id = employee_id_val if employee_id_val is not None else self.initial_data.get('employee_id')

        middle_name_val = validated_data.pop('middle_name', None)
        middle_name = middle_name_val if middle_name_val is not None else self.initial_data.get('middle_name')

        suffix_val = validated_data.pop('suffix', None)
        suffix = suffix_val if suffix_val is not None else self.initial_data.get('suffix')

        contact_val = validated_data.pop('contact_number', None)
        contact_number = contact_val if contact_val is not None else self.initial_data.get('contact_number')

        dept_val = validated_data.pop('department', None)
        department = dept_val if dept_val is not None else self.initial_data.get('department')

        pos_val = validated_data.pop('position', None)
        position = pos_val if pos_val is not None else self.initial_data.get('position')

        raw_rfid = validated_data.pop('rfid_uid', None)
        if raw_rfid is None:
            raw_rfid = self.initial_data.get('rfid_uid')
        rfid_uid = str(raw_rfid).strip().upper() if raw_rfid and str(raw_rfid).strip() else (None if raw_rfid == '' else None)

        if password and str(password).strip():
            instance.set_password(str(password).strip())

        if raw_role:
            clean_role_str = str(raw_role).upper()
            if clean_role_str == 'FACULTY_ADMIN':
                final_role = 'ADMIN'
                final_is_teaching = True
            elif clean_role_str == 'FACULTY':
                final_role = 'FACULTY'
                final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else True
            elif clean_role_str == 'GUARD':
                final_role = 'GUARD'
                final_is_teaching = False
            elif clean_role_str == 'PRINCIPAL':
                final_role = 'PRINCIPAL'
                final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else True
            else:
                final_role = clean_role_str
                final_is_teaching = bool(is_teaching_param) if is_teaching_param is not None else False

            is_admin = (final_role == 'ADMIN')
            instance.is_staff = is_admin
            instance.is_superuser = is_admin
        else:
            final_role = None
            final_is_teaching = is_teaching_param

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        # Stream cloning for photo update
        photo_bytes = None
        photo_name = getattr(photo, 'name', 'avatar.jpg') if photo else 'avatar.jpg'
        if photo and hasattr(photo, 'read'):
            try:
                photo_bytes = photo.read()
                photo.seek(0)
            except Exception:
                pass

        profile, _ = UserProfile.objects.get_or_create(user=instance)
        if final_role:
            profile.role = final_role
        if final_is_teaching is not None:
            profile.is_teaching = bool(final_is_teaching)
        profile.is_profile_completed = bool(instance.first_name and instance.last_name)
        if photo_bytes:
            profile.avatar = ContentFile(photo_bytes, name=photo_name)
        elif photo is not None:
            profile.avatar = photo
        profile.save()

        faculty = profile.faculty
        if not faculty:
            clean_emp_id = (employee_id or instance.username).strip().upper()[:50]
            faculty = FacultyProfile.objects.filter(
                Q(employee_id__iexact=clean_emp_id) | Q(email__iexact=instance.email)
            ).first()
            if faculty:
                profile.faculty = faculty
                profile.save(update_fields=['faculty'])

        faculty_photo = ContentFile(photo_bytes, name=photo_name) if photo_bytes else photo

        if faculty:
            if employee_id is not None and str(employee_id).strip():
                faculty.employee_id = str(employee_id).strip().upper()[:50]
            faculty.first_name = instance.first_name or faculty.first_name
            if middle_name is not None:
                faculty.middle_name = str(middle_name).strip()
            faculty.last_name = instance.last_name or faculty.last_name
            if suffix is not None:
                faculty.suffix = str(suffix).strip()
            faculty.email = instance.email or faculty.email
            if contact_number is not None:
                faculty.contact_number = str(contact_number).strip()
            if department is not None:
                faculty.department = str(department).strip()
            if position is not None:
                faculty.position = str(position).strip()
            if raw_rfid is not None:
                faculty.rfid_uid = rfid_uid
            if faculty_photo is not None:
                faculty.photo = faculty_photo
            elif profile.avatar and not faculty.photo:
                faculty.photo = profile.avatar
            if final_is_teaching is not None:
                faculty.can_teach = bool(final_is_teaching)
            faculty.is_active = instance.is_active
            faculty.save()
        else:
            clean_emp_id = (employee_id or instance.username).strip().upper()[:50]
            new_faculty = FacultyProfile.objects.create(
                employee_id=clean_emp_id,
                first_name=instance.first_name or instance.username,
                middle_name=str(middle_name or '').strip(),
                last_name=instance.last_name or 'Staff',
                suffix=str(suffix or '').strip(),
                email=instance.email or '',
                contact_number=str(contact_number or '').strip(),
                department=str(department or 'Junior High School').strip(),
                position=str(position or 'Faculty I').strip(),
                rfid_uid=rfid_uid,
                photo=faculty_photo if faculty_photo else profile.avatar,
                can_teach=bool(final_is_teaching) if final_is_teaching is not None else False,
                is_active=instance.is_active,
                qr_token=secrets.token_urlsafe(32),
            )
            profile.faculty = new_faculty
            profile.save(update_fields=['faculty'])
            faculty = new_faculty

        if profile.role == 'PRINCIPAL':
            self._sync_school_principal_settings(faculty)

        return instance