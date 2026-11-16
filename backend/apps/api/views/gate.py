"""
AttendSure V3 - Digital Exit Pass Management (Mobile Push Enabled, No Hardware/push)
File: backend/apps/api/views/gate.py
"""

import uuid
from datetime import timedelta
from django.utils import timezone
from django.db.models import Q
from rest_framework import serializers, viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.academics.models import Student, FacultyProfile, GatePass
from apps.api.services.push_service import notify_student_parent
from .common import (
    get_user_role,
    is_leadership_role,
    resolve_faculty_for_user,
    get_faculty_student_ids,
)

ALLOWED_DOCUMENT_EXTENSIONS = ('.pdf', '.jpg', '.jpeg', '.png', '.webp')
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024


class GatePassSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField(read_only=True)
    student_lrn = serializers.SerializerMethodField(read_only=True)
    faculty_name = serializers.SerializerMethodField(read_only=True)
    adviser_name = serializers.SerializerMethodField(read_only=True)

    attachment = serializers.FileField(required=False, allow_null=True)
    pass_type = serializers.CharField(required=False, allow_blank=True, default='OFFICIAL_BUSINESS')
    reason = serializers.CharField(required=False, allow_blank=True, default='Official campus business')

    student = serializers.PrimaryKeyRelatedField(queryset=Student.objects.all(), required=False, allow_null=True)
    faculty = serializers.PrimaryKeyRelatedField(queryset=FacultyProfile.objects.all(), required=False, allow_null=True)

    class Meta:
        model = GatePass
        fields = [
            'id', 'pass_number', 'student', 'student_name', 'student_lrn',
            'faculty', 'faculty_name', 'pass_type', 'reason',
            'status', 'valid_from', 'valid_to', 'attachment',
            'issued_by', 'adviser_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'pass_number', 'status', 'issued_by', 'adviser_name', 'created_at', 'updated_at']

    def get_student_name(self, obj):
        return obj.student.full_name if getattr(obj, 'student', None) else None

    def get_student_lrn(self, obj):
        return obj.student.lrn if getattr(obj, 'student', None) else None

    def get_faculty_name(self, obj):
        return obj.faculty.full_name if getattr(obj, 'faculty', None) else None

    def get_adviser_name(self, obj):
        return obj.issued_by.full_name if getattr(obj, 'issued_by', None) else 'Adviser / Faculty'

    def validate(self, attrs):
        if self.instance is None and not attrs.get('student') and not attrs.get('faculty'):
            raise serializers.ValidationError({'detail': 'Please select a student or faculty member for this pass.'})

        attachment = attrs.get('attachment')
        if attachment and hasattr(attachment, 'name'):
            if not attachment.name.lower().endswith(ALLOWED_DOCUMENT_EXTENSIONS):
                raise serializers.ValidationError({'attachment': 'Only PDF, JPG, PNG, and WebP files are allowed.'})
            if attachment.size > MAX_DOCUMENT_SIZE_BYTES:
                raise serializers.ValidationError({'attachment': 'Document size exceeds the 10 MB limit.'})

        valid_from = attrs.get('valid_from') or (self.instance.valid_from if self.instance else timezone.now())
        valid_to = attrs.get('valid_to') or (self.instance.valid_to if self.instance else None)
        if valid_to and valid_to <= valid_from:
            raise serializers.ValidationError({'valid_to': 'Expiration time must be later than departure time.'})

        return attrs


class GatePassViewSet(viewsets.ModelViewSet):
    """Manages official campus exit passes and notifies parent mobile apps."""
    queryset = GatePass.objects.select_related('student', 'faculty', 'issued_by').all().order_by('-created_at')
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        qs = self.queryset

        status_param = self.request.query_params.get('status', 'ALL').strip().upper()
        if status_param != 'ALL':
            qs = qs.filter(status=status_param)

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(pass_number__icontains=search) |
                Q(student__first_name__icontains=search) |
                Q(student__last_name__icontains=search) |
                Q(student__lrn__icontains=search) |
                Q(faculty__first_name__icontains=search) |
                Q(faculty__last_name__icontains=search) |
                Q(reason__icontains=search)
            )

        if role == 'PARENT':
            qs = qs.filter(student__parent_user=user)
        elif role == 'FACULTY' and not (user.is_superuser or user.is_staff):
            fac = resolve_faculty_for_user(user)
            if fac:
                allowed_student_ids = get_faculty_student_ids(fac)
                qs = qs.filter(
                    Q(faculty_id=fac.id) |
                    Q(issued_by_id=fac.id) |
                    Q(student_id__in=allowed_student_ids)
                )
            else:
                qs = qs.none()

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())[:300]
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def _can_modify_pass(self, user, gate_pass) -> bool:
        if user.is_superuser or user.is_staff or is_leadership_role(user):
            return True
        fac = resolve_faculty_for_user(user)
        if not fac:
            return False
        return gate_pass.faculty_id == fac.id or gate_pass.issued_by_id == fac.id

    def perform_update(self, serializer):
        if not self._can_modify_pass(self.request.user, serializer.instance):
            raise permissions.PermissionDenied('You do not have permission to edit this exit pass.')
        serializer.save()

    def perform_destroy(self, instance):
        if not self._can_modify_pass(self.request.user, instance):
            raise permissions.PermissionDenied('You do not have permission to delete this exit pass.')
        instance.delete()

    def create(self, request, *args, **kwargs):
        data = request.data.dict() if hasattr(request.data, 'dict') else dict(request.data)
        if request.FILES.get('attachment'):
            data['attachment'] = request.FILES.get('attachment')

        user = request.user
        is_leader = is_leadership_role(user) or user.is_superuser

        data.setdefault('pass_type', data.get('type') or 'OFFICIAL_BUSINESS')
        data.setdefault('reason', data.get('details') or data['pass_type'])
        if 'student_id' in data and not data.get('student'):
            data['student'] = data.get('student_id')
        if 'faculty_id' in data and not data.get('faculty'):
            data['faculty'] = data.get('faculty_id')

        now = timezone.now()
        data.setdefault('valid_from', now.isoformat())
        data.setdefault('valid_to', (now + timedelta(hours=4)).isoformat())

        fac = resolve_faculty_for_user(user)
        if not fac:
            fac = FacultyProfile.objects.filter(is_active=True).order_by('id').first()

        is_student_pass = bool(data.get('student'))
        if not is_student_pass and not data.get('faculty') and fac:
            data['faculty'] = fac.id

        initial_status = 'ACTIVE' if (is_leader or is_student_pass) else 'PENDING'
        pass_code = f"GP-{timezone.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
        data['pass_number'] = pass_code

        serializer = self.get_serializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pass_obj = serializer.save(pass_number=pass_code, status=initial_status, issued_by=fac)

        if is_student_pass and pass_obj.student:
            adviser_name = fac.full_name if fac else (user.get_full_name() or user.username)
            notify_student_parent(
                student=pass_obj.student,
                title=f'Campus Exit Pass Issued: {pass_obj.student.first_name}',
                message=(
                    f'Adviser {adviser_name} issued exit pass #{pass_code} for '
                    f'{pass_obj.student.full_name}. Reason: {pass_obj.reason}.'
                ),
                category='GATE_PASS',
                extra_data={'pass_number': pass_code},
            )

        return Response(GatePassSerializer(pass_obj, context={'request': request}).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_pass(self, request, pk=None):
        if not (self.request.user.is_superuser or is_leadership_role(self.request.user)):
            return Response({'error': 'Only school leadership can approve passes.'}, status=status.HTTP_403_FORBIDDEN)
        gate_pass = self.get_object()
        gate_pass.status = 'ACTIVE'
        gate_pass.save(update_fields=['status', 'updated_at'])
        return Response({'success': True, 'status': 'ACTIVE'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='decline')
    def decline_pass(self, request, pk=None):
        if not (self.request.user.is_superuser or is_leadership_role(self.request.user)):
            return Response({'error': 'Only school leadership can decline passes.'}, status=status.HTTP_403_FORBIDDEN)
        gate_pass = self.get_object()
        gate_pass.status = 'REVOKED'
        gate_pass.save(update_fields=['status', 'updated_at'])
        return Response({'success': True, 'status': 'REVOKED'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='mark-used')
    def mark_used(self, request, pk=None):
        gate_pass = self.get_object()
        if gate_pass.status != 'ACTIVE':
            return Response({'error': f'Pass status is {gate_pass.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if now > gate_pass.valid_to:
            gate_pass.status = 'EXPIRED'
            gate_pass.save(update_fields=['status', 'updated_at'])
            return Response({'error': 'Exit pass has expired.'}, status=status.HTTP_400_BAD_REQUEST)

        gate_pass.status = 'USED'
        gate_pass.save(update_fields=['status', 'updated_at'])

        if gate_pass.student:
            time_str = timezone.localtime(now).strftime('%I:%M %p')
            notify_student_parent(
                student=gate_pass.student,
                title=f'Authorized Campus Departure: {gate_pass.student.first_name}',
                message=f'{gate_pass.student.full_name} departed campus on an approved exit pass ({gate_pass.reason}) at {time_str}.',
                category='GATE_PASS',
            )

        return Response({'success': True, 'status': 'USED'}, status=status.HTTP_200_OK)