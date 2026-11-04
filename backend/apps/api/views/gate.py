"""
AttendSure V3 - Gate Logging & Hardware Kiosk Scanner API
File: backend/apps/api/views/gate.py
"""

from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    Student,
    FacultyProfile,
    StudentGateLog,
    FacultyGateLog,
    IoTKiosk,
    SmsOutbox,
    Enrollment,
)
from apps.common.utils import (
    get_user_role,
    is_regular_teacher,
    format_full_student_name,
    format_deduped_section_label,
    safe_photo_url,
    verify_hardware_secret,
)
from .common import (
    resolve_faculty_for_user,
    get_teacher_student_ids,
)


class GateLogsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user_role = get_user_role(request.user)
        faculty = resolve_faculty_for_user(request.user)
        is_teacher = is_regular_teacher(user_role) and not request.user.is_superuser

        stu_qs = StudentGateLog.objects.select_related('student', 'kiosk').order_by('-scan_time')
        if is_teacher:
            stu_qs = stu_qs.filter(student_id__in=get_teacher_student_ids(faculty))[:100]
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

        if not is_teacher:
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


class KioskScanAPIView(APIView):
    """
    Hardware Kiosk Scanner Endpoint:
    Processes gate taps and returns the student photo and profile info directly
    to the kiosk display with anti-bounce protection and parent SMS alerts.
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
            # Resolve student section for display
            enr = Enrollment.objects.filter(student=student, status='ENROLLED').select_related('section', 'section__grade_level').first()
            section_label = format_deduped_section_label(
                enr.section.grade_level.name if (enr and enr.section and enr.section.grade_level) else '',
                enr.section.name if (enr and enr.section) else 'Unassigned'
            )
            photo_url = safe_photo_url(student.photo, request)

            # Prevent double scans within grace period
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
                    'grade_section': section_label,
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

            # Parent SMS Notification Dispatch
            if student.parent_contact and len(student.parent_contact) >= 10:
                verb = "entered" if direction == "IN" else "left"
                time_str = timezone.localtime(log.scan_time).strftime('%I:%M %p')
                sms_body = f"AttendSure Notice: {student.first_name} {student.last_name} has {verb} the campus at {time_str} via {kiosk.location}."

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
                'grade_section': section_label,
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
            recent_fac_duplicate = FacultyGateLog.objects.filter(
                faculty=faculty,
                direction=direction,
                scan_time__gte=debounce_window
            ).first()

            if recent_fac_duplicate:
                return Response({
                    'success': True,
                    'person_type': 'FACULTY',
                    'name': faculty.full_name,
                    'full_name': faculty.full_name,
                    'identifier': faculty.employee_id,
                    'employee_id': faculty.employee_id,
                    'department': faculty.department,
                    'position': faculty.position,
                    'photo_url': fac_photo,
                    'direction': direction,
                    'timestamp': timezone.localtime(recent_fac_duplicate.scan_time).strftime('%I:%M:%S %p'),
                    'is_duplicate': True,
                    'message': 'Teacher ID card already tapped.'
                }, status=status.HTTP_200_OK)

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
                'full_name': faculty.full_name,
                'identifier': faculty.employee_id,
                'employee_id': faculty.employee_id,
                'department': faculty.department,
                'position': faculty.position,
                'photo_url': fac_photo,
                'direction': direction,
                'timestamp': timezone.localtime(log.scan_time).strftime('%I:%M:%S %p'),
                'is_duplicate': False,
            }, status=status.HTTP_201_CREATED)

        return Response({'error': 'Unregistered ID card or QR pass.'}, status=status.HTTP_404_NOT_FOUND)