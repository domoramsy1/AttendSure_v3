"""
AttendSure V3 - Gate Logging, Hardware Kiosk Scanner & Gate Pass API
File: backend/apps/api/views/gate.py
"""

import uuid
import logging
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers, viewsets, status, permissions
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from apps.academics.models import (
    Student,
    FacultyProfile,
    StudentGateLog,
    FacultyGateLog,
    IoTKiosk,
    SmsOutbox,
    Enrollment,
    GatePass,
)
from apps.common.utils import (
    get_user_role,
    is_regular_faculty,
    format_full_student_name,
    format_deduped_section_label,
    safe_photo_url,
    verify_hardware_secret,
)
from .common import (
    resolve_faculty_for_user,
    get_faculty_student_ids,
)

logger = logging.getLogger(__name__)

ALLOWED_DOCUMENT_EXTENSIONS = ('.pdf', '.jpg', '.jpeg', '.png', '.webp')
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024


class GatePassSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField(read_only=True)
    student_lrn = serializers.SerializerMethodField(read_only=True)
    faculty_name = serializers.SerializerMethodField(read_only=True)
    faculty_emp_id = serializers.SerializerMethodField(read_only=True)
    adviser_name = serializers.SerializerMethodField(read_only=True)
    approver_name = serializers.SerializerMethodField(read_only=True)
    attachment_url = serializers.SerializerMethodField(read_only=True)

    attachment = serializers.FileField(required=False, allow_null=True)
    pass_type = serializers.CharField(required=False, allow_blank=True, default='OFFICIAL_BUSINESS')
    reason = serializers.CharField(required=False, allow_blank=True, default='Official campus business')

    student = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(),
        required=False,
        allow_null=True
    )
    faculty = serializers.PrimaryKeyRelatedField(
        queryset=FacultyProfile.objects.all(),
        required=False,
        allow_null=True
    )

    class Meta:
        model = GatePass
        fields = [
            'id',
            'pass_number',
            'bearer_type',
            'student',
            'student_name',
            'student_lrn',
            'faculty',
            'faculty_name',
            'faculty_emp_id',
            'pass_type',
            'reason',
            'status',
            'valid_from',
            'valid_to',
            'attachment',
            'attachment_url',
            'review_notes',
            'issued_by',
            'adviser_name',
            'approved_by',
            'approver_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'pass_number',
            'status',
            'issued_by',
            'adviser_name',
            'approved_by',
            'approver_name',
            'created_at',
            'updated_at',
        ]

    def get_student_name(self, obj):
        return obj.student.full_name if obj.student else None

    def get_student_lrn(self, obj):
        return obj.student.lrn if obj.student else None

    def get_faculty_name(self, obj):
        return obj.faculty.full_name if obj.faculty else None

    def get_faculty_emp_id(self, obj):
        return obj.faculty.employee_id if obj.faculty else None

    def get_adviser_name(self, obj):
        if obj.issued_by:
            full = f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip()
            return full if full else obj.issued_by.username
        return "Adviser / Staff"

    def get_approver_name(self, obj):
        return obj.approved_by if obj.approved_by else None

    def get_attachment_url(self, obj):
        if hasattr(obj, 'attachment') and obj.attachment:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.attachment.url) if request else obj.attachment.url
        return None

    def validate(self, attrs):
        bearer_type = attrs.get('bearer_type', 'STUDENT')
        student = attrs.get('student')
        faculty = attrs.get('faculty')
        attachment = attrs.get('attachment')

        if attachment and hasattr(attachment, 'name'):
            clean_name = attachment.name.lower()
            if not clean_name.endswith(ALLOWED_DOCUMENT_EXTENSIONS):
                raise serializers.ValidationError({
                    "attachment": "Invalid file format. Only PDF, JPG, PNG, and WebP documents are permitted."
                })
            if attachment.size > MAX_DOCUMENT_SIZE_BYTES:
                raise serializers.ValidationError({
                    "attachment": "The proof document size exceeds the allowed 10 MB limit."
                })

        if bearer_type == 'STUDENT' and not student:
            raise serializers.ValidationError({"student": "Please select a student for this gate exit permit."})
        if bearer_type == 'FACULTY' and not faculty:
            raise serializers.ValidationError({"faculty": "Please select or link the faculty member requesting travel."})

        valid_from = attrs.get('valid_from') or timezone.now()
        valid_to = attrs.get('valid_to')
        if valid_to and valid_to <= valid_from:
            raise serializers.ValidationError({"valid_to": "Expiration time must be later than departure time."})

        return attrs


class GatePassViewSet(viewsets.ModelViewSet):
    """
    Manages official campus exit passes.
    Handles field name normalization, RBAC, document verification, and admin alerts.
    """
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

        bearer_type = self.request.query_params.get('bearer_type', '').strip().upper()
        if bearer_type in ['STUDENT', 'FACULTY']:
            qs = qs.filter(bearer_type=bearer_type)

        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(pass_number__icontains=search) |
                Q(student__full_name__icontains=search) |
                Q(student__lrn__icontains=search) |
                Q(faculty__full_name__icontains=search) |
                Q(reason__icontains=search)
            )

        if role in ['FACULTY'] and not (user.is_superuser or user.is_staff):
            fac = resolve_faculty_for_user(user)
            if not fac:
                fac = FacultyProfile.objects.filter(account=user).first()
            if fac:
                qs = qs.filter(Q(faculty=fac) | Q(issued_by=user))

        return qs[:300]

    def create(self, request, *args, **kwargs):
        if hasattr(request.data, 'dict'):
            data = request.data.dict()
        else:
            data = dict(request.data)

        if request.FILES.get('attachment'):
            data['attachment'] = request.FILES.get('attachment')

        user = request.user
        role = get_user_role(user)
        is_admin_or_principal = user.is_superuser or role in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL']

        if not data.get('pass_type'):
            data['pass_type'] = data.get('type') or data.get('reason_preset') or 'OFFICIAL_BUSINESS'
        if not data.get('reason'):
            data['reason'] = data.get('details') or data.get('custom_reason') or data['pass_type']

        if 'student_id' in data and not data.get('student'):
            data['student'] = data.get('student_id')
        if 'faculty_id' in data and not data.get('faculty'):
            data['faculty'] = data.get('faculty_id')

        now = timezone.now()
        if not data.get('valid_from'):
            data['valid_from'] = now.isoformat()
        if not data.get('valid_to'):
            data['valid_to'] = (now + timedelta(hours=4)).isoformat()

        bearer_type = str(data.get('bearer_type', 'STUDENT')).upper()
        data['bearer_type'] = bearer_type

        if bearer_type == 'FACULTY':
            fac = resolve_faculty_for_user(user)
            if not fac:
                fac = FacultyProfile.objects.filter(account=user).first()

            if not data.get('faculty') and fac:
                data['faculty'] = fac.id

            if not data.get('faculty') and not is_admin_or_principal:
                return Response(
                    {'error': 'No linked faculty profile found for this account.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            initial_status = 'ACTIVE' if is_admin_or_principal else 'PENDING'
        else:
            bearer_type = 'STUDENT'
            initial_status = 'ACTIVE'

        date_stamp = timezone.now().strftime('%Y%m%d')
        unique_token = uuid.uuid4().hex[:6].upper()
        pass_code = f"GP-{date_stamp}-{unique_token}"
        data['pass_number'] = pass_code

        serializer = self.get_serializer(data=data)
        if not serializer.is_valid():
            logger.warning(f"[GatePassViewSet.create] Validation failure: {serializer.errors}")
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        pass_obj = serializer.save(
            pass_number=pass_code,
            bearer_type=bearer_type,
            status=initial_status,
            issued_by=user,
            approved_by=user.get_full_name() if initial_status == 'ACTIVE' else None
        )

        if bearer_type == 'STUDENT':
            adviser_name = user.get_full_name() or user.username
            student_name = pass_obj.student.full_name if pass_obj.student else 'Student'
            reason_text = pass_obj.reason

            SmsOutbox.objects.create(
                recipient_name="School Administration",
                recipient_number="INTERNAL_LOG",
                message_body=(
                    f"Student Exit Alert: Adviser {adviser_name} permitted {student_name} to leave campus. "
                    f"Reason: {reason_text}. Pass #{pass_code} generated."
                ),
                trigger_event="STUDENT_PASS_ISSUED",
                category="ADMIN_ALERT",
                priority="HIGH",
                status="DELIVERED"
            )

        return Response(
            GatePassSerializer(pass_obj, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_pass(self, request, pk=None):
        """School Principal / Administrator verifies document authenticity and approves the pass."""
        user = request.user
        role = get_user_role(user)
        if not (user.is_superuser or role in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL']):
            return Response({'error': 'Only the School Principal or Administrator can approve official passes.'}, status=status.HTTP_403_FORBIDDEN)

        gate_pass = self.get_object()
        if gate_pass.status != 'PENDING':
            return Response({'error': f'Pass cannot be approved because status is {gate_pass.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        gate_pass.status = 'ACTIVE'
        gate_pass.approved_by = user.get_full_name() or user.username
        gate_pass.review_notes = request.data.get('notes', 'Travel document verified authentic by administration.')
        gate_pass.save()

        return Response({'success': True, 'message': 'Gate pass approved and activated.', 'status': 'ACTIVE'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='decline')
    def decline_pass(self, request, pk=None):
        """School Principal / Administrator declines a pass if proof is unverified or invalid."""
        user = request.user
        role = get_user_role(user)
        if not (user.is_superuser or role in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL']):
            return Response({'error': 'Only the School Principal or Administrator can decline passes.'}, status=status.HTTP_403_FORBIDDEN)

        gate_pass = self.get_object()
        gate_pass.status = 'DECLINED'
        gate_pass.approved_by = user.get_full_name() or user.username
        gate_pass.review_notes = request.data.get('reason', 'Document proof unverified or unapproved travel order.')
        gate_pass.save()

        return Response({'success': True, 'message': 'Gate pass declined.', 'status': 'DECLINED'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='mark-used')
    def mark_used(self, request, pk=None):
        """Campus Gate Guard verifies pass and confirms bearer departure."""
        gate_pass = self.get_object()
        if gate_pass.status != 'ACTIVE':
            return Response({'error': f'Cannot clear exit. Pass status is {gate_pass.status}.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        if now > gate_pass.valid_to:
            gate_pass.status = 'EXPIRED'
            gate_pass.save()
            return Response({'error': 'Gate clearance has expired. New permit required.'}, status=status.HTTP_400_BAD_REQUEST)

        gate_pass.status = 'USED'
        gate_pass.save()

        if gate_pass.bearer_type == 'STUDENT' and gate_pass.student:
            student = gate_pass.student
            if student.parent_contact and len(student.parent_contact) >= 10:
                time_str = timezone.localtime(now).strftime('%I:%M %p')
                SmsOutbox.objects.create(
                    recipient_name=f"{student.first_name}'s Parent",
                    recipient_number=student.parent_contact,
                    message_body=(
                        f"AttendSure Notice: {student.full_name} has departed campus on an authorized "
                        f"adviser gate pass ({gate_pass.reason}) at {time_str}."
                    ),
                    trigger_event="GATE_PASS_EXIT",
                    category="GATE_PASS",
                    priority="HIGH",
                    status="PENDING"
                )

        return Response({'success': True, 'message': 'Exit confirmed. Pass marked as USED.', 'status': 'USED'}, status=status.HTTP_200_OK)


# ============================================================================
# 2. HARDWARE SCANNER KIOSK API (CHECKS PASS STATUS AUTOMATICALLY)
# ============================================================================

class KioskScanAPIView(APIView):
    """
    Hardware Kiosk Scanner Endpoint:
    Automatically checks gate pass clearance status when an ID card or QR code is scanned.
    """
    permission_classes = [permissions.AllowAny]

    @transaction.atomic
    def post(self, request):
        kiosk_code = str(request.data.get('kiosk_code') or request.headers.get('X-Kiosk-Code') or '').strip()
        secret_key = str(request.data.get('secret_key') or request.headers.get('X-Kiosk-Key') or '').strip()

        kiosk = IoTKiosk.objects.filter(kiosk_code=kiosk_code, is_active=True).first()
        if not kiosk or not verify_hardware_secret(kiosk, secret_key):
            return Response({'error': 'Unauthorized kiosk terminal credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        kiosk.last_ping = timezone.now()
        kiosk.save(update_fields=['last_ping'])

        raw_id = str(request.data.get('raw_identifier') or request.data.get('token') or '').strip()
        scan_method = str(request.data.get('scan_method', 'RFID')).upper()
        direction = str(request.data.get('direction', 'IN')).upper()
        snapshot_file = request.FILES.get('snapshot')

        if not raw_id:
            return Response({'error': 'Card serial or QR token required.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.now()
        debounce_window = now - timedelta(seconds=45)

        # 1. Match Student Record
        student = Student.objects.filter(
            Q(rfid_uid__iexact=raw_id) | Q(qr_token=raw_id) | Q(lrn=raw_id),
            is_active=True
        ).first()

        if student:
            enr = Enrollment.objects.filter(student=student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = format_deduped_section_label(
                enr.section.grade_level.name if (enr and enr.section and enr.section.grade_level) else '',
                enr.section.name if (enr and enr.section) else 'Unassigned'
            )
            photo_url = safe_photo_url(student.photo, request)

            if direction == 'OUT':
                active_pass = GatePass.objects.filter(
                    student=student,
                    status='ACTIVE',
                    valid_from__lte=now,
                    valid_to__gte=now
                ).first()

                if not active_pass:
                    return Response({
                        'success': False,
                        'person_type': 'STUDENT',
                        'name': student.full_name,
                        'identifier': student.lrn,
                        'photo_url': photo_url,
                        'direction': 'OUT',
                        'is_allowed': False,
                        'message': 'EXIT DENIED: No active adviser gate pass found for this student.'
                    }, status=status.HTTP_403_FORBIDDEN)

                active_pass.status = 'USED'
                active_pass.save()

            recent_duplicate = StudentGateLog.objects.filter(
                student=student,
                direction=direction,
                scan_time__gte=debounce_window
            ).first()

            if recent_duplicate:
                return Response({
                    'success': True,
                    'person_type': 'STUDENT',
                    'name': student.full_name,
                    'full_name': student.full_name,
                    'identifier': student.lrn,
                    'lrn': student.lrn,
                    'photo_url': photo_url,
                    'section': section_label,
                    'direction': direction,
                    'timestamp': timezone.localtime(recent_duplicate.scan_time).strftime('%I:%M:%S %p'),
                    'is_duplicate': True,
                    'message': 'Card already tapped. Verified on screen.'
                }, status=status.HTTP_200_OK)

            log = StudentGateLog.objects.create(
                student=student,
                kiosk=kiosk,
                direction=direction,
                scan_method=scan_method,
                raw_identifier=raw_id,
                snapshot=snapshot_file,
                scan_time=now
            )

            if student.parent_contact and len(student.parent_contact) >= 10:
                verb = "entered" if direction == "IN" else "departed"
                time_str = timezone.localtime(log.scan_time).strftime('%I:%M %p')
                sms_body = f"AttendSure Notice: {student.first_name} {student.last_name} has {verb} campus at {time_str} via {kiosk.location}."

                SmsOutbox.objects.create(
                    recipient_name=f"{student.first_name}'s Parent",
                    recipient_number=student.parent_contact,
                    message_body=sms_body,
                    trigger_event=f"GATE_{direction}",
                    category=f"GATE_{direction}",
                    priority='HIGH',
                    status='PENDING'
                )

            return Response({
                'success': True,
                'person_type': 'STUDENT',
                'name': student.full_name,
                'full_name': student.full_name,
                'identifier': student.lrn,
                'lrn': student.lrn,
                'photo_url': photo_url,
                'section': section_label,
                'direction': direction,
                'timestamp': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'is_duplicate': False,
                'message': f"Gate {direction} entry logged successfully."
            }, status=status.HTTP_201_CREATED)

        # 2. Match Faculty Record
        faculty = FacultyProfile.objects.filter(
            Q(rfid_uid__iexact=raw_id) | Q(qr_token=raw_id) | Q(employee_id__iexact=raw_id),
            is_active=True
        ).first()

        if faculty:
            fac_photo = safe_photo_url(faculty.photo, request)

            if direction == 'OUT':
                active_pass = GatePass.objects.filter(
                    faculty=faculty,
                    status='ACTIVE',
                    valid_from__lte=now,
                    valid_to__gte=now
                ).first()

                if active_pass:
                    active_pass.status = 'USED'
                    active_pass.save()

            log = FacultyGateLog.objects.create(
                faculty=faculty,
                kiosk=kiosk,
                direction=direction,
                scan_method=scan_method,
                raw_identifier=raw_id,
                snapshot=snapshot_file,
                scan_time=now
            )

            return Response({
                'success': True,
                'person_type': 'FACULTY',
                'name': faculty.full_name,
                'identifier': faculty.employee_id,
                'photo_url': fac_photo,
                'direction': direction,
                'timestamp': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'is_duplicate': False,
            }, status=status.HTTP_201_CREATED)

        return Response({'error': 'Unregistered ID card or QR pass.'}, status=status.HTTP_404_NOT_FOUND)


class GateLogsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            faculty = FacultyProfile.objects.filter(account=request.user).first()

        is_faculty = is_regular_faculty(user_role) and not request.user.is_superuser

        stu_qs = StudentGateLog.objects.select_related('student', 'kiosk').order_by('-scan_time')
        if is_faculty:
            stu_qs = stu_qs.filter(student_id__in=get_faculty_student_ids(faculty))[:100]
        else:
            stu_qs = stu_qs[:100]

        logs = [
            {
                'log_id': f"GL-STU-{l.id}",
                'person_type': 'STUDENT',
                'identifier': l.student.lrn,
                'name': format_full_student_name(l.student),
                'direction': l.direction,
                'scan_method': l.scan_method,
                'kiosk': l.kiosk.terminal_name if l.kiosk else 'Main Gate',
                'scan_time': timezone.localtime(l.scan_time).strftime('%b %d, %Y - %I:%M:%S %p'),
                'snapshot_url': l.snapshot.url if l.snapshot else None,
                'photo_url': safe_photo_url(l.student.photo, request),
                'raw_time': l.scan_time.isoformat(),
            }
            for l in stu_qs
        ]

        if not is_faculty:
            fac_qs = FacultyGateLog.objects.select_related('faculty', 'kiosk').order_by('-scan_time')[:50]
            for f_log in fac_qs:
                logs.append({
                    'log_id': f"GL-FAC-{f_log.id}",
                    'person_type': 'FACULTY',
                    'identifier': f_log.faculty.employee_id,
                    'name': f_log.faculty.full_name,
                    'direction': f_log.direction,
                    'scan_method': f_log.scan_method,
                    'kiosk': f_log.kiosk.terminal_name if f_log.kiosk else 'Main Gate',
                    'scan_time': timezone.localtime(f_log.scan_time).strftime('%b %d, %Y - %I:%M:%S %p'),
                    'snapshot_url': f_log.snapshot.url if f_log.snapshot else None,
                    'photo_url': safe_photo_url(f_log.faculty.photo, request),
                    'raw_time': f_log.scan_time.isoformat(),
                })
            logs.sort(key=lambda x: x['raw_time'], reverse=True)

        return Response(logs[:100], status=status.HTTP_200_OK)