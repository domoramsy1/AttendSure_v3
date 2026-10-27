"""
AttendSure V3 - Student Serializer (Full DepEd SF1 30-Column Schema with Photo Support)
File: backend/apps/api/serializers/students.py
"""

import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers
from apps.academics.models import Student, Section, Enrollment, AcademicYear


class StudentSerializer(serializers.ModelSerializer):
    current_section = serializers.SerializerMethodField(read_only=True)
    section_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = Student
        fields = [
            'id',
            'lrn',
            'first_name',
            'middle_name',
            'last_name',
            'suffix',
            'full_name',
            'sex',
            'birthdate',
            'mother_tongue',
            'ethnic_group',
            'religion',
            'house_street_sitio',
            'barangay',
            'municipality_city',
            'province',
            'father_name',
            'mother_maiden_name',
            'guardian_name',
            'guardian_relationship',
            'parent_contact',
            'photo',
            'rfid_uid',
            'qr_token',
            'is_active',
            'current_section',
            'section_id',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'qr_token', 'created_at', 'updated_at']

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        photo_val = data.get('photo')
        
        # Safely convert base64 image data to an uploadable file
        if photo_val and isinstance(photo_val, str) and photo_val.startswith('data:image'):
            try:
                format_part, img_str = photo_val.split(';base64,')
                ext = format_part.split('/')[-1]
                data['photo'] = ContentFile(
                    base64.b64decode(img_str),
                    name=f"student_{uuid.uuid4().hex[:8]}.{ext}"
                )
            except Exception:
                data.pop('photo', None)
        elif photo_val == '' or photo_val is None:
            data.pop('photo', None)

        return super().to_internal_value(data)

    def get_current_section(self, obj):
        enrollment = obj.enrollments.select_related('section').filter(academic_year__is_active=True).first()
        if not enrollment:
            enrollment = obj.enrollments.select_related('section').first()
        return enrollment.section.name if enrollment and enrollment.section else 'Unassigned'

    def create(self, validated_data):
        section_id = validated_data.pop('section_id', None)
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['created_by'] = request.user
            validated_data['updated_by'] = request.user

        student = Student.objects.create(**validated_data)

        if section_id:
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
            if ay:
                Enrollment.objects.create(
                    student=student,
                    section_id=section_id,
                    academic_year=ay,
                    status='ENROLLED'
                )
        return student

    def update(self, instance, validated_data):
        section_id = validated_data.pop('section_id', None)
        request = self.context.get('request')
        if request and request.user and request.user.is_authenticated:
            validated_data['updated_by'] = request.user

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if section_id:
            ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
            if ay:
                Enrollment.objects.update_or_create(
                    student=instance,
                    academic_year=ay,
                    defaults={'section_id': section_id, 'status': 'ENROLLED'}
                )
        return instance