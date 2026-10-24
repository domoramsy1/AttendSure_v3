"""
AttendSure - Student Serialization & Enrollment Management
File: backend/apps/api/serializers/students.py
"""

import secrets
from datetime import date
from rest_framework import serializers
from apps.academics.models import Student, Section, Enrollment, AcademicYear
from .base import FlexibleImageField, safe_photo_url


class StudentSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    current_section = serializers.SerializerMethodField()
    section_id = serializers.SerializerMethodField()
    photo = FlexibleImageField(required=False, allow_null=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = [
            'id', 'lrn', 'first_name', 'middle_name', 'last_name', 'suffix',
            'full_name', 'sex', 'birthdate', 'mother_tongue', 'ethnic_group',
            'religion', 'house_street_sitio', 'barangay', 'municipality_city',
            'province', 'father_name', 'mother_maiden_name', 'guardian_name',
            'guardian_relationship', 'parent_contact', 'rfid_uid', 'qr_token',
            'photo', 'photo_url', 'current_section', 'section_id', 'is_active',
        ]
        extra_kwargs = {
            'lrn': {'required': False},
            'first_name': {'required': False},
            'last_name': {'required': False},
            'sex': {'required': False},
            'birthdate': {'required': False},
            'qr_token': {'required': False, 'allow_blank': True, 'allow_null': True},
            'rfid_uid': {'required': False, 'allow_blank': True, 'allow_null': True},
            'middle_name': {'required': False, 'allow_blank': True},
            'suffix': {'required': False, 'allow_blank': True},
            'parent_contact': {'required': False, 'allow_blank': True},
            'mother_tongue': {'required': False, 'allow_blank': True},
            'ethnic_group': {'required': False, 'allow_blank': True},
            'religion': {'required': False, 'allow_blank': True},
            'house_street_sitio': {'required': False, 'allow_blank': True},
            'barangay': {'required': False, 'allow_blank': True},
            'municipality_city': {'required': False, 'allow_blank': True},
            'province': {'required': False, 'allow_blank': True},
            'father_name': {'required': False, 'allow_blank': True},
            'mother_maiden_name': {'required': False, 'allow_blank': True},
            'guardian_name': {'required': False, 'allow_blank': True},
            'guardian_relationship': {'required': False, 'allow_blank': True},
        }

    def validate_lrn(self, value):
        if not value:
            return value
        clean_lrn = str(value).strip()
        if not clean_lrn.isdigit():
            raise serializers.ValidationError("LRN must contain numbers only.")
        return clean_lrn

    def validate_rfid_uid(self, value):
        if not value or not str(value).strip():
            return None
        return str(value).strip().upper()

    def get_full_name(self, obj):
        if hasattr(obj, 'full_name') and isinstance(obj.full_name, str):
            return obj.full_name
        mid = f" {obj.middle_name}" if getattr(obj, 'middle_name', None) else ""
        suf = f" {obj.suffix}" if getattr(obj, 'suffix', None) else ""
        return f"{obj.last_name}, {obj.first_name}{mid}{suf}".strip(" ,")

    def get_current_section(self, obj):
        enrollment = (
            obj.enrollments.filter(academic_year__is_active=True)
            .select_related('section', 'section__grade_level')
            .first()
        )
        if not enrollment:
            enrollment = obj.enrollments.select_related('section', 'section__grade_level').first()
        if enrollment and enrollment.section:
            sec_name = (enrollment.section.name or "").strip()
            grade_name = (enrollment.section.grade_level.name if enrollment.section.grade_level else "").strip()
            return f"{grade_name} - {sec_name}" if grade_name and sec_name and not grade_name.lower().endswith(sec_name.lower()) else (grade_name or sec_name)
        return "Unassigned"

    def get_section_id(self, obj):
        enrollment = obj.enrollments.filter(academic_year__is_active=True).first() or obj.enrollments.first()
        return enrollment.section_id if enrollment else None

    def get_photo_url(self, obj):
        request = self.context.get('request')
        return safe_photo_url(getattr(obj, 'photo', None), request)

    def _sync_section_enrollment(self, student, req_data):
        sec_id = req_data.get('section_id') or req_data.get('section')
        if sec_id and str(sec_id).isdigit():
            section = Section.objects.filter(id=int(sec_id)).first()
            if section:
                ay = section.academic_year or AcademicYear.objects.filter(is_active=True).first()
                if ay:
                    Enrollment.objects.update_or_create(
                        student=student,
                        academic_year=ay,
                        defaults={'section': section, 'status': 'ENROLLED'}
                    )

    def create(self, validated_data):
        if not validated_data.get('qr_token'):
            validated_data['qr_token'] = secrets.token_urlsafe(32)
        if not validated_data.get('birthdate'):
            validated_data['birthdate'] = date(2012, 1, 1)

        student = super().create(validated_data)
        req_data = self.context.get('request').data if self.context.get('request') else {}
        self._sync_section_enrollment(student, req_data)
        return student

    def update(self, instance, validated_data):
        student = super().update(instance, validated_data)
        req_data = self.context.get('request').data if self.context.get('request') else {}
        self._sync_section_enrollment(student, req_data)
        return student