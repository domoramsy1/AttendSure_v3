"""
AttendSure V3 - Classroom API Views & Universal Attendance Scanner Engine
File: backend/apps/api/views/classroom.py
"""

import json
import logging
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    Schedule,
    Student,
    Section,
    SubjectAttendanceLog,
    DailyAttendanceSummary,
    StudentGateLog,
    Enrollment,
    FacultyProfile,
)
from apps.common.utils import (
    is_leadership_role,
    format_full_student_name,
    safe_photo_url,
    get_user_role,
)
from .common import resolve_faculty_for_user
from apps.api.serializers import ClassroomBatchScanSerializer

logger = logging.getLogger(__name__)


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def sanitize_qr_token(raw_token: str) -> str:
    """Extracts clean identifier from plain text, JSON, or tagged barcode formats."""
    clean = str(raw_token or '').strip().replace('\r', '').replace('\n', '')
    if clean.startswith('{') and clean.endswith('}'):
        try:
            parsed = json.loads(clean)
            return str(parsed.get('lrn') or parsed.get('student_lrn') or parsed.get('qr_token') or parsed.get('id') or clean).strip()
        except Exception:
            pass
    if ':' in clean:
        return clean.split(':')[-1].strip()
    return clean


def get_device_model():
    """Finds the DeviceApproval model across registered apps safely."""
    from django.apps import apps
    for app in ['core', 'academics', 'common', 'api']:
        try:
            m = apps.get_model(app, 'DeviceApproval')
            if m:
                return m
        except LookupError:
            continue
    return None


def format_section_label(grade_name: str, section_name: str) -> str:
    """Combines Grade Level and Section cleanly."""
    if grade_name and section_name:
        return f"{grade_name} - {section_name}" if not section_name.startswith(grade_name) else section_name
    return section_name or grade_name or "Unassigned"


def resolve_student_photo_url(student, request):
    """
    Safely resolves profile photo URL across ImageField, CharField photo_path, 
    or photo_thumbnail database fields.
    """
    photo_field = (
        getattr(student, 'photo', None)
        or getattr(student, 'photo_path', None)
        or getattr(student, 'photo_thumbnail', None)
    )
    if not photo_field:
        return None

    resolved = safe_photo_url(photo_field, request)
    if resolved:
        return resolved

    if hasattr(photo_field, 'url'):
        try:
            return photo_field.url
        except Exception:
            pass

    photo_str = str(photo_field).strip()
    if photo_str and photo_str != 'None':
        if photo_str.startswith(('http://', 'https://', '/')):
            return photo_str
        return f"/media/{photo_str}"

    return None


# ============================================================================
# 1. HARDWARE OTG / USB / CAMERA SINGLE STUDENT SCANNER
# ============================================================================

class ClassroomStudentScanAPIView(APIView):
    """
    Classroom Attendance & Student Verification Endpoint.
    Used by:
    - Web App: Laptops & PCs with USB / Wireless Barcode Scanners or Webcams.
    - Mobile App: Phones with USB-C OTG Scanner Guns or built-in Cameras.
    Validates faculty role (Class Adviser vs Subject Faculty), gate status, and registered devices.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        user = request.user
        role = get_user_role(user)
        now = timezone.now()
        today = timezone.localdate()

        # 1. Device Security Verification
        device_uuid = request.headers.get('X-Device-UUID') or request.data.get('device_uuid')
        DeviceModel = get_device_model()
        if DeviceModel and device_uuid:
            device_entry = DeviceModel.objects.filter(
                device_uuid=device_uuid,
                is_active=True
            ).first()

            if device_entry and getattr(device_entry, 'approval_status', 'APPROVED') == 'REJECTED':
                return Response({
                    'error': 'This scanning device has been blocked. Contact school administration.'
                }, status=status.HTTP_403_FORBIDDEN)

        # 2. Resolve Faculty Profile safely using account reference
        faculty = resolve_faculty_for_user(user)
        if not faculty:
            faculty = FacultyProfile.objects.filter(account=user).first()

        is_admin = is_leadership_role(user) or user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL')

        if not faculty and not is_admin:
            return Response({
                'error': 'Only verified faculty, advisers, and administrators can record attendance.'
            }, status=status.HTTP_403_FORBIDDEN)

        # 3. Clean Scanned Token (Supports Barcode guns, RFID cards, and QR tokens)
        raw_code = str(
            request.data.get('code')
            or request.data.get('raw_identifier')
            or request.data.get('qr_token')
            or ''
        ).strip()

        cleaned_token = sanitize_qr_token(raw_code)
        if not cleaned_token:
            return Response({'error': 'No barcode or QR code received.'}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Fast Single-Trip Database Query to Match Student
        student = Student.objects.filter(
            Q(lrn__iexact=cleaned_token) |
            Q(qr_token=cleaned_token) |
            Q(rfid_uid__iexact=cleaned_token),
            is_active=True
        ).first()

        if not student:
            return Response({
                'error': f'Unregistered student card or barcode ({cleaned_token}).'
            }, status=status.HTTP_404_NOT_FOUND)

        # 5. Resolve Student Active Section
        enrollment = Enrollment.objects.filter(
            student=student,
            status='ENROLLED'
        ).select_related('section', 'section__grade_level').first()

        if not enrollment or not enrollment.section:
            return Response({
                'error': f'Student {student.full_name} is not enrolled in an active section.'
            }, status=status.HTTP_400_BAD_REQUEST)

        student_section = enrollment.section
        grade_name = student_section.grade_level.name if student_section.grade_level else ''
        section_display = format_section_label(grade_name, student_section.name)

        # 6. Role-Based Access Control (RBAC): Verify Faculty Authorization
        is_adviser = bool(faculty and student_section.adviser_id == faculty.id)

        active_schedule = None
        if faculty:
            active_schedule = Schedule.objects.filter(
                faculty=faculty,
                section=student_section
            ).select_related('subject').first()

        is_subject_faculty = bool(active_schedule)

        if not (is_adviser or is_subject_faculty or is_admin):
            return Response({
                'error': (
                    f'Access Denied: You are neither the Class Adviser nor a Subject Faculty '
                    f'for {section_display}.'
                )
            }, status=status.HTTP_403_FORBIDDEN)

        role_label = "Class Adviser" if is_adviser else ("Subject Faculty" if is_subject_faculty else "Administrator")

        # 7. Resolve Target Schedule
        target_schedule = active_schedule if active_schedule else Schedule.objects.filter(section=student_section).first()

        # 8. Check Campus Gate Status
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        latest_gate = StudentGateLog.objects.filter(
            student=student,
            scan_time__gte=today_start,
            scan_time__lte=today_end
        ).order_by('-scan_time').first()

        gate_remarks = "Gate entrance verified."
        if not latest_gate:
            gate_remarks = "FLAGGED: No gate entry scan recorded today."
        elif latest_gate.direction == 'OUT':
            gate_remarks = "FLAGGED: Student was previously recorded leaving campus."

        photo_url = resolve_student_photo_url(student, request)

        # 9. Duplicate Prevention: Check if already recorded for this schedule today
        existing_log_query = {
            'student': student,
            'attendance_date': today,
        }
        if target_schedule:
            existing_log_query['schedule'] = target_schedule

        existing_log = SubjectAttendanceLog.objects.filter(**existing_log_query).first()

        if existing_log:
            scanned_time = (
                getattr(existing_log, 'scanned_at', None)
                or getattr(existing_log, 'scan_time', None)
                or now
            )
            timestamp_str = timezone.localtime(scanned_time).strftime('%I:%M:%S %p')

            return Response({
                'success': True,
                'is_duplicate': True,
                'message': 'Card already tapped. Attendance already recorded for this class today.',
                'authorization_role': role_label,
                'student_id': student.id,
                'student_name': format_full_student_name(student),
                'lrn': student.lrn,
                'section': section_display,
                'status': getattr(existing_log, 'status', 'PRESENT'),
                'scanned_at': timestamp_str,
                'gate_status_note': gate_remarks,
                'photo_url': photo_url,
                'photo': photo_url,
            }, status=status.HTTP_200_OK)

        # 10. Record Verified Attendance using Safe Upsert
        log_fields = {f.name for f in SubjectAttendanceLog._meta.fields}
        log_defaults = {
            'status': 'PRESENT',
        }
        if 'faculty' in log_fields:
            log_defaults['faculty'] = target_schedule.faculty if (target_schedule and target_schedule.faculty) else faculty
        if 'scanned_at' in log_fields:
            log_defaults['scanned_at'] = now
        if 'scan_time' in log_fields:
            log_defaults['scan_time'] = now

        log_filter_kwargs = {
            'student': student,
            'attendance_date': today,
        }
        if 'schedule' in log_fields and target_schedule:
            log_filter_kwargs['schedule'] = target_schedule

        try:
            log, created = SubjectAttendanceLog.objects.update_or_create(
                **log_filter_kwargs,
                defaults=log_defaults
            )
        except Exception as e:
            logger.warning(f"[ClassroomStudentScanAPIView] update_or_create caught conflict: {e}")
            log = SubjectAttendanceLog.objects.filter(**log_filter_kwargs).first()
            created = False

        # 11. Update Daily Attendance Summary for Dashboards
        summary_fields = {f.name for f in DailyAttendanceSummary._meta.fields}
        summary_defaults = {
            'section': student_section,
            'status': 'PRESENT',
        }
        if 'remarks' in summary_fields:
            summary_defaults['remarks'] = gate_remarks[:255]

        DailyAttendanceSummary.objects.update_or_create(
            student=student,
            attendance_date=today,
            defaults=summary_defaults
        )

        timestamp_display = timezone.localtime(now).strftime('%I:%M:%S %p')

        return Response({
            'success': True,
            'is_duplicate': not created,
            'message': f'Attendance verified by {role_label}.' if created else 'Card already tapped today.',
            'authorization_role': role_label,
            'student_id': student.id,
            'student_name': format_full_student_name(student),
            'lrn': student.lrn,
            'section': section_display,
            'status': 'PRESENT',
            'scanned_at': timestamp_display,
            'gate_status_note': gate_remarks,
            'photo_url': photo_url,
            'photo': photo_url,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


ClassroomScanAPIView = ClassroomStudentScanAPIView


# ============================================================================
# 2. HARDWARE DEVICE REGISTRATION FOR GEOFENCING & SCANNER APPROVAL
# ============================================================================

class UserDeviceRegisterAPIView(APIView):
    """
    Registers staff and faculty mobile phones, laptops, and PCs for geofencing compliance.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        device_uuid = str(request.data.get('device_uuid', '')).strip()
        device_name = str(request.data.get('device_name', 'Station Device')).strip()
        platform = str(request.data.get('platform', 'WEB')).upper()

        if not device_uuid:
            return Response({'error': 'Device unique identifier required.'}, status=status.HTTP_400_BAD_REQUEST)

        DeviceModel = get_device_model()
        if not DeviceModel:
            return Response({'success': True, 'message': 'Device registered for campus presence.'})

        model_fields = {f.name for f in DeviceModel._meta.fields}
        device_defaults = {
            'device_name': device_name,
            'platform': platform,
            'approval_status': 'APPROVED' if (user.is_staff or user.is_superuser) else 'PENDING',
            'is_active': True,
        }
        if 'account' in model_fields:
            device_defaults['account'] = user
        elif 'user' in model_fields:
            device_defaults['user'] = user

        device, created = DeviceModel.objects.get_or_create(
            device_uuid=device_uuid,
            defaults=device_defaults
        )

        return Response({
            'success': True,
            'device_uuid': device.device_uuid,
            'status': getattr(device, 'approval_status', 'APPROVED'),
            'message': 'Hardware device registered for attendance scanning.'
        }, status=status.HTTP_200_OK)


DeviceRegisterAPIView = UserDeviceRegisterAPIView


# ============================================================================
# 3. CLASS & CLASS LIST VIEWS (FAST BATCH QUERIES)
# ============================================================================

class ClassListAPIView(APIView):
    """
    Returns teaching classes for the authenticated faculty with enrolled student lists
    and today's real attendance status pre-calculated in fast batch queries.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)
        if not faculty:
            faculty = FacultyProfile.objects.filter(account=user).first()

        is_admin = is_leadership_role(user) or user.is_superuser
        view_mode = str(request.query_params.get('mode', '')).lower()
        today = timezone.localdate()

        if is_admin and view_mode == 'all':
            scheds = Schedule.objects.all()
        elif faculty:
            scheds = Schedule.objects.filter(Q(faculty=faculty) | Q(section__adviser=faculty)).distinct()
        elif is_admin:
            scheds = Schedule.objects.all()
        else:
            scheds = Schedule.objects.none()

        scheds = scheds.select_related('section', 'section__grade_level', 'subject', 'faculty').order_by('start_time')
        scheds_list = list(scheds)
        section_ids = [s.section_id for s in scheds_list if s.section_id]

        if faculty:
            extra_advisory = Section.objects.filter(adviser=faculty).exclude(id__in=section_ids).select_related('grade_level')
            for sec in extra_advisory:
                section_ids.append(sec.id)
        else:
            extra_advisory = []

        enrollments_qs = (
            Enrollment.objects.filter(section_id__in=section_ids, status='ENROLLED', student__is_active=True)
            .select_related('student')
            .order_by('student__last_name', 'student__first_name')
        )

        students_by_section = {}
        all_student_ids = []
        for enr in enrollments_qs:
            if enr.student:
                students_by_section.setdefault(enr.section_id, []).append(enr.student)
                all_student_ids.append(enr.student_id)

        subject_logs = {
            (log['schedule_id'], log['student_id']): log['status']
            for log in SubjectAttendanceLog.objects.filter(
                attendance_date=today,
                student_id__in=all_student_ids
            ).values('schedule_id', 'student_id', 'status')
        }
        daily_logs = dict(
            DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                student_id__in=all_student_ids
            ).values_list('student_id', 'status')
        )

        classes_data = []
        seen_section_ids = set()

        def build_student_items(students_list, schedule_id=None):
            items = []
            for st in students_list:
                status_val = (
                    (subject_logs.get((schedule_id, st.id)) if schedule_id else None)
                    or daily_logs.get(st.id)
                    or 'UNSCANNED'
                )
                items.append({
                    'id': st.id,
                    'lrn': str(st.lrn).strip(),
                    'full_name': format_full_student_name(st),
                    'name': format_full_student_name(st),
                    'gender': getattr(st, 'sex', ''),
                    'photo_url': resolve_student_photo_url(st, request),
                    'attendance_status': status_val,
                    'parent_contact': st.parent_contact or '',
                    'qr_token': st.qr_token or '',
                    'rfid_uid': st.rfid_uid or '',
                })
            return items

        for s in scheds_list:
            sec = s.section
            if not sec:
                continue

            sec_students = students_by_section.get(sec.id, [])
            student_items = build_student_items(sec_students, s.id)
            start_str = str(s.start_time)[:5] if s.start_time else ''
            end_str = str(s.end_time)[:5] if s.end_time else ''

            classes_data.append({
                'id': s.id,
                'schedule_id': s.id,
                'section_id': sec.id,
                'name': sec.name,
                'section_name': sec.name,
                'grade_level': sec.grade_level.name if sec.grade_level else '',
                'grade_level_code': sec.grade_level.code if sec.grade_level else '',
                'subject_code': s.subject.code if s.subject else '',
                'subject_name': s.subject.title if s.subject else '',
                'subject_title': s.subject.title if s.subject else '',
                'room': getattr(sec, 'room_number', '') or getattr(s, 'room_number', ''),
                'start_time': start_str,
                'end_time': end_str,
                'time_display': f"{start_str} - {end_str}".strip(" -"),
                'total_students': len(student_items),
                'enrolled_count': len(student_items),
                'student_count': len(student_items),
                'students': student_items,
                'is_adviser': bool(faculty and sec.adviser_id == faculty.id),
            })
            seen_section_ids.add(sec.id)

        for sec in extra_advisory:
            if sec.id in seen_section_ids:
                continue
            sec_students = students_by_section.get(sec.id, [])
            student_items = build_student_items(sec_students)

            classes_data.append({
                'id': sec.id,
                'schedule_id': sec.id,
                'section_id': sec.id,
                'name': sec.name,
                'section_name': sec.name,
                'grade_level': sec.grade_level.name if sec.grade_level else '',
                'grade_level_code': sec.grade_level.code if sec.grade_level else '',
                'subject_code': 'ADV',
                'subject_name': 'Advisory Homeroom',
                'subject_title': 'Advisory Homeroom',
                'room': getattr(sec, 'room_number', ''),
                'start_time': '07:30',
                'end_time': '16:30',
                'time_display': 'All Day',
                'total_students': len(student_items),
                'enrolled_count': len(student_items),
                'student_count': len(student_items),
                'students': student_items,
                'is_adviser': True,
            })

        return Response(classes_data, status=status.HTTP_200_OK)


MyAssignedClassesAPIView = ClassListAPIView


class FacultyClassroomListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        section_id = request.query_params.get('section_id') or request.query_params.get('section')
        if not section_id:
            return ClassListAPIView().get(request)

        today = timezone.localdate()
        students = (
            Student.objects.filter(enrollments__section_id=section_id, enrollments__status='ENROLLED', is_active=True)
            .distinct()
            .order_by('last_name', 'first_name')
        )

        subject_logs = dict(
            SubjectAttendanceLog.objects.filter(student__in=students, attendance_date=today).values_list('student_id', 'status')
        )
        daily_logs = dict(
            DailyAttendanceSummary.objects.filter(student__in=students, attendance_date=today).values_list('student_id', 'status')
        )

        data = [
            {
                'id': s.id,
                'lrn': str(s.lrn).strip(),
                'name': format_full_student_name(s),
                'full_name': format_full_student_name(s),
                'gender': getattr(s, 'sex', ''),
                'photo_url': resolve_student_photo_url(s, request),
                'attendance_status': subject_logs.get(s.id) or daily_logs.get(s.id, 'UNSCANNED'),
                'parent_contact': s.parent_contact or '',
                'qr_token': s.qr_token or '',
                'rfid_uid': s.rfid_uid or '',
            }
            for s in students
        ]
        return Response(data, status=status.HTTP_200_OK)


StudentListAPIView = FacultyClassroomListAPIView
FacultyClassroomClassListAPIView = FacultyClassroomListAPIView


# ============================================================================
# 4. BATCH CLASSROOM SCANNING (BULK IMPORT / MULTI-SCAN)
# ============================================================================

class ClassroomBatchScanAPIView(APIView):
    """
    Records student attendance verified by a faculty inside the classroom.
    Validates Gate Attendance:
    - If the student has NO gate scan today: Flagged as UNVERIFIED.
    - If the student's last gate scan was OUT: Flagged as CUTTING.
    - If verified inside campus via Gate scan: Confirmed as PRESENT or LATE.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        sched_id = serializer.validated_data['schedule_id']
        sched = Schedule.objects.select_related('section', 'subject', 'faculty').filter(id=sched_id).first()
        target_section = sched.section if sched else Section.objects.filter(id=sched_id).first()

        if not target_section and not sched:
            return Response({'error': 'Active class section not found.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        sec_to_check = sched.section if sched else target_section
        enrolled_student_ids = set(
            Enrollment.objects.filter(section=sec_to_check, status='ENROLLED').values_list('student_id', flat=True)
        )

        today_gate_logs = (
            StudentGateLog.objects.filter(scan_time__gte=today_start, scan_time__lte=today_end)
            .order_by('student_id', '-scan_time')
            .values('student_id', 'direction')
        )
        latest_gate_dir = {}
        for gl in today_gate_logs:
            if gl['student_id'] not in latest_gate_dir:
                latest_gate_dir[gl['student_id']] = gl['direction']

        scans_data = serializer.validated_data['scans']
        clean_tokens = [sanitize_qr_token(item['qr_token']) for item in scans_data]

        matched_students = Student.objects.filter(
            Q(qr_token__in=clean_tokens) | Q(rfid_uid__in=clean_tokens) | Q(lrn__in=clean_tokens),
            is_active=True
        )

        token_to_student = {}
        for st in matched_students:
            if st.qr_token: token_to_student[st.qr_token] = st
            if st.rfid_uid: token_to_student[st.rfid_uid.upper()] = st
            if st.lrn: token_to_student[str(st.lrn).strip()] = st

        processed_records = []
        now_dt = timezone.now()
        now_time_str = timezone.localtime(now_dt).strftime('%I:%M:%S %p')
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            faculty = FacultyProfile.objects.filter(account=request.user).first()

        for item in scans_data:
            token = sanitize_qr_token(item['qr_token'])
            target_status = str(item.get('status', 'PRESENT')).upper()
            st = token_to_student.get(token) or token_to_student.get(token.upper())

            if not st:
                continue

            is_enrolled = st.id in enrolled_student_ids
            last_gate_scan = latest_gate_dir.get(st.id)

            if not is_enrolled:
                is_anomaly = True
                final_status = 'UNVERIFIED'
                anomaly_remarks = 'Student is enrolled in a different class section.'
            elif last_gate_scan is None:
                is_anomaly = True
                final_status = 'UNVERIFIED'
                anomaly_remarks = 'FLAGGED: No gate entry recorded today. Possible fence jump or unscanned entrance.'
            elif last_gate_scan == 'OUT':
                is_anomaly = True
                final_status = 'CUTTING'
                anomaly_remarks = 'FLAGGED: Student was previously recorded exiting the campus gate.'
            else:
                is_anomaly = False
                final_status = target_status
                anomaly_remarks = 'Classroom attendance verified. Gate entry confirmed.'

            # Safe update or create Subject Attendance Log
            if sched:
                SubjectAttendanceLog.objects.update_or_create(
                    student=st,
                    schedule=sched,
                    attendance_date=today,
                    defaults={
                        'faculty': sched.faculty or faculty,
                        'status': final_status,
                        'scanned_at': now_dt,
                    }
                )

            # Update Daily Attendance Summary for web portal
            if sec_to_check:
                summary_status = final_status if final_status in ['PRESENT', 'LATE', 'CUTTING'] else 'ABSENT'
                DailyAttendanceSummary.objects.update_or_create(
                    student=st,
                    attendance_date=today,
                    defaults={
                        'section': sec_to_check,
                        'status': summary_status,
                        'remarks': anomaly_remarks[:255],
                    }
                )

            student_photo = resolve_student_photo_url(st, request)

            processed_records.append({
                'student_id': st.id,
                'name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'rfid_uid': st.rfid_uid or '',
                'photo_url': student_photo,
                'photo': student_photo,
                'parent_contact': st.parent_contact or '',
                'section': sec_to_check.name if sec_to_check else '',
                'status': final_status,
                'is_anomaly': is_anomaly,
                'remarks': anomaly_remarks,
                'scan_time': now_time_str,
            })

        return Response({
            'success': True,
            'message': f"Classroom attendance recorded for {len(processed_records)} student(s).",
            'scanned_count': len(processed_records),
            'processed_records': processed_records,
        }, status=status.HTTP_201_CREATED)


# ============================================================================
# 5. ADVISER SUBJECT ATTENDANCE MATRIX
# ============================================================================

class AdviserSectionMatrixAPIView(APIView):
    """
    Returns a comprehensive subject attendance matrix for the Class Adviser.
    Shows student-by-student attendance status across all subjects today.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        faculty = resolve_faculty_for_user(user)
        if not faculty:
            faculty = FacultyProfile.objects.filter(account=user).first()

        is_admin = is_leadership_role(user) or user.is_superuser

        section_id = request.query_params.get('section_id')
        if section_id and is_admin:
            section = Section.objects.filter(id=section_id).first()
        elif faculty:
            section = Section.objects.filter(adviser=faculty).first()
            if not section and is_admin:
                section = Section.objects.first()
        else:
            section = None

        if not section:
            return Response({
                'has_advisory_class': False,
                'message': 'No advisory class section linked to this account.',
                'schedules': [],
                'matrix': []
            }, status=status.HTTP_200_OK)

        schedules = Schedule.objects.filter(
            section=section
        ).select_related('subject', 'faculty').order_by('start_time')

        schedule_headers = [
            {
                'schedule_id': s.id,
                'subject_code': s.subject.code if s.subject else 'HOMEROOM',
                'subject_name': s.subject.title if s.subject else 'Advisory Homeroom',
                'faculty_name': s.faculty.full_name if s.faculty else 'Unassigned',
                'time_window': f"{str(s.start_time)[:5]} - {str(s.end_time)[:5]}" if s.start_time else 'All Day',
            }
            for s in schedules
        ]

        enrollments = Enrollment.objects.filter(
            section=section,
            status='ENROLLED',
            student__is_active=True
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        students = [e.student for e in enrollments if e.student]
        student_ids = [s.id for s in students]

        subject_logs = SubjectAttendanceLog.objects.filter(
            attendance_date=today,
            student_id__in=student_ids
        ).values('student_id', 'schedule_id', 'status', 'scan_time')

        log_map = {}
        for entry in subject_logs:
            key = (entry['student_id'], entry['schedule_id'])
            log_map[key] = {
                'status': entry['status'],
                'scan_time': entry['scan_time'].strftime('%I:%M %p') if entry['scan_time'] else ''
            }

        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        gate_logs = StudentGateLog.objects.filter(
            student_id__in=student_ids,
            scan_time__gte=today_start,
            scan_time__lte=today_end
        ).order_by('student_id', '-scan_time').values('student_id', 'direction', 'scan_time')

        latest_gate = {}
        for gl in gate_logs:
            if gl['student_id'] not in latest_gate:
                latest_gate[gl['student_id']] = {
                    'direction': gl['direction'],
                    'time': gl['scan_time'].strftime('%I:%M %p')
                }

        matrix_rows = []
        for idx, st in enumerate(students, start=1):
            subjects_attended = 0
            subjects_cutting = 0
            subject_details = []

            for s in schedules:
                record = log_map.get((st.id, s.id))
                if record:
                    st_status = record['status']
                    scan_t = record['scan_time']
                    if st_status in ['PRESENT', 'LATE']:
                        subjects_attended += 1
                    elif st_status == 'CUTTING':
                        subjects_cutting += 1
                else:
                    st_status = 'UNSCANNED'
                    scan_t = ''

                subject_details.append({
                    'schedule_id': s.id,
                    'subject_code': s.subject.code if s.subject else 'HOMEROOM',
                    'status': st_status,
                    'time': scan_t,
                })

            gate_info = latest_gate.get(st.id)
            gate_display = (
                f"Entered at {gate_info['time']}" if gate_info and gate_info['direction'] == 'IN'
                else (f"Exited at {gate_info['time']}" if gate_info and gate_info['direction'] == 'OUT' else "No Gate Scan")
            )

            total_subjects = len(schedules)
            compliance_rate = round((subjects_attended / total_subjects) * 100) if total_subjects > 0 else 0

            matrix_rows.append({
                'number': idx,
                'student_id': st.id,
                'student_name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'photo_url': resolve_student_photo_url(st, request),
                'gate_status': gate_display,
                'gate_direction': gate_info['direction'] if gate_info else 'NONE',
                'attended_count': subjects_attended,
                'cutting_count': subjects_cutting,
                'total_subjects': total_subjects,
                'compliance_rate': compliance_rate,
                'subjects': subject_details,
            })

        return Response({
            'has_advisory_class': True,
            'section_id': section.id,
            'section_name': section.name,
            'grade_level': section.grade_level.name if section.grade_level else '',
            'total_students': len(students),
            'schedules': schedule_headers,
            'matrix': matrix_rows,
        }, status=status.HTTP_200_OK)