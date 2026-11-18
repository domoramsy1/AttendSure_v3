"""
AttendSure - Student Serializer (Printed QR ID Only, Zero N+1 Queries)
File: backend/apps/api/serializers/students.py
"""

import base64
import uuid
from django.core.files.base import ContentFile
from rest_framework import serializers
from apps.academics.models import AcademicYear, Enrollment, Student
from apps.api.services.qr_security import sign_student_qr_payload
from apps.api.views.common import safe_photo_url


class StudentSerializer(serializers.ModelSerializer):
    current_section = serializers.SerializerMethodField(read_only=True)
    section_id = serializers.IntegerField(required=False, allow_null=True)
    full_name = serializers.CharField(read_only=True)
    gender = serializers.CharField(source='sex', required=False)
    qr_payload = serializers.SerializerMethodField(read_only=True)
    photo_url = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Student
        fields = [
            'id', 'lrn', 'first_name', 'middle_name', 'last_name', 'suffix',
            'full_name', 'sex', 'gender', 'birthdate', 'mother_tongue', 'ethnic_group',
            'religion', 'house_street_sitio', 'barangay', 'municipality_city',
            'province', 'father_name', 'mother_maiden_name', 'guardian_name',
            'guardian_relationship', 'parent_contact', 'photo', 'photo_url',
            'qr_token', 'qr_payload', 'is_active', 'current_section', 'section_id',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'qr_token', 'created_at', 'updated_at']
        extra_kwargs = {
            'sex': {'required': False},
        }

    def get_qr_payload(self, obj) -> str:
        return sign_student_qr_payload(obj.lrn, obj.qr_token)

    def get_photo_url(self, obj):
        return safe_photo_url(obj.photo, self.context.get('request'))

    def to_internal_value(self, data):
        data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'gender' in data and 'sex' not in data:
            data['sex'] = data['gender']

        photo_val = data.get('photo')
        if photo_val and isinstance(photo_val, str) and photo_val.startswith('data:image'):
            try:
                format_part, img_str = photo_val.split(';base64,', 1)
                ext = format_part.split('/')[-1]
                data['photo'] = ContentFile(
                    base64.b64decode(img_str),
                    name=f"student_{uuid.uuid4().hex[:8]}.{ext}",
                )
            except Exception:
                data.pop('photo', None)
        elif photo_val in ('', None) or (isinstance(photo_val, str) and photo_val.startswith(('http://', 'https://', '/media/'))):
            data.pop('photo', None)

        return super().to_internal_value(data)

    def _active_enrollment(self, obj):
        enrollments = list(obj.enrollments.all())
        if not enrollments:
            return None
        for enr in enrollments:
            if getattr(enr, 'academic_year', None) and enr.academic_year.is_active and enr.section:
                return enr
        return enrollments[0]

    def get_current_section(self, obj) -> str:
        enr = self._active_enrollment(obj)
        return enr.section.name if (enr and getattr(enr, 'section', None)) else 'Unassigned'

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        enr = self._active_enrollment(instance)
        ret['section_id'] = enr.section_id if enr else None
        return ret

    def create(self, validated_data):
        section_id = validated_data.pop('section_id', None)
        if not validated_data.get('sex'):
            validated_data['sex'] = 'Male'

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
                    status='ENROLLED',
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
                    defaults={'section_id': section_id, 'status': 'ENROLLED'},
                )
        return instance