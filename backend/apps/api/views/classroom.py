"""
AttendSure V3 - Classroom Attendance & Loafing Monitoring Engine
File: backend/apps/api/views/classroom.py
"""

import json
import logging
from datetime import datetime, timedelta
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from django.apps import apps
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    Schedule,
    Student,
    Section,
    SubjectAttendanceLog,
    DailyAttendanceSummary,
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
# HELPER FUNCTIONS & SECURITY SANITIZERS
# ============================================================================

def sanitize_qr_token(raw_token: str) -> str:
    """
    Cleans raw card or QR inputs and blocks dangerous script or database characters.
    """
    clean = str(raw_token or '').strip().replace('\r', '').replace('\n', '').replace('\0', '')
    if len(clean) > 64:
        clean = clean[:64]

    if clean.startswith('{') and clean.endswith('}'):
        try:
            parsed = json.loads(clean)
            return str(
                parsed.get('lrn')
                or parsed.get('student_lrn')
                or parsed.get('qr_token')
                or parsed.get('id')
                or clean
            ).strip()
        except Exception:
            pass

    if ':' in clean:
        return clean.split(':')[-1].strip()

    return clean


def resolve_faculty_record(user):
    """
    Finds the active faculty profile linked to the signed-in user account.
    """
    faculty = resolve_faculty_for_user(user)
    if faculty:
        return faculty

    if hasattr(user, 'faculty_profile') and user.faculty_profile:
        return user.faculty_profile
    if hasattr(user, 'faculty') and user.faculty:
        return user.faculty

    faculty = FacultyProfile.objects.filter(Q(account=user) | Q(user=user)).first()
    if faculty:
        return faculty

    if user.email:
        faculty = FacultyProfile.objects.filter(email__iexact=user.email).first()
        if faculty:
            return faculty

    username = str(user.username or '').strip()
    return FacultyProfile.objects.filter(
        Q(employee_id__iexact=username) | Q(code__iexact=username)
    ).first()


def get_device_model():
    """Finds the DeviceApproval model across registered apps safely."""
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
    Safely resolves student profile photo URL across database fields.
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


def determine_scan_status(schedule, current_dt, grace_minutes: int = 15) -> str:
    """
    Determines whether a classroom scan is PRESENT or LATE based on class start time.
    """
    if not schedule or not getattr(schedule, 'start_time', None):
        return 'PRESENT'

    local_now = timezone.localtime(current_dt)
    class_start = timezone.make_aware(
        datetime.combine(local_now.date(), schedule.start_time),
        timezone.get_current_timezone()
    )
    if local_now > (class_start + timedelta(minutes=grace_minutes)):
        return 'LATE'
    return 'PRESENT'


# ============================================================================
# 1. CLASSROOM ATTENDANCE SCANNER (MOBILE CAMERA & WEB OTG GUN)
# ============================================================================

class ClassroomStudentScanAPIView(APIView):
    """
    Records classroom attendance and checks for missed earlier subject periods.
    Used by:
    - Web App: Laptops with USB / Wireless OTG Barcode Scanners.
    - Mobile App: Phones using the built-in optical camera.
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
                device_uuid=str(device_uuid).strip(),
                is_active=True
            ).first()

            if device_entry and getattr(device_entry, 'approval_status', 'APPROVED') == 'REJECTED':
                return Response({
                    'error': 'This scanning device has been blocked. Contact school administration.'
                }, status=status.HTTP_403_FORBIDDEN)

        # 2. Resolve Faculty Profile
        faculty = resolve_faculty_record(user)
        is_admin = is_leadership_role(user) or user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL')

        if not faculty and not is_admin:
            return Response({
                'error': 'Only verified faculty, class advisers, and administrators can record attendance.'
            }, status=status.HTTP_403_FORBIDDEN)

        # 3. Clean Scanned Code
        raw_code = str(
            request.data.get('code')
            or request.data.get('raw_identifier')
            or request.data.get('qr_token')
            or ''
        ).strip()

        cleaned_token = sanitize_qr_token(raw_code)
        if not cleaned_token:
            return Response({'error': 'No barcode or QR code received.'}, status=status.HTTP_400_BAD_REQUEST)

        # 4. Fast Single-Trip Query to Match Student
        student = Student.objects.filter(
            Q(lrn__iexact=cleaned_token) |
            Q(qr_token=cleaned_token) |
            Q(rfid_uid__iexact=cleaned_token),
            is_active=True
        ).first()

        if not student:
            return Response({
                'error': f'Unregistered student ID or barcode ({cleaned_token}).'
            }, status=status.HTTP_404_NOT_FOUND)

        # 5. Resolve Student Active Section
        student_section = None
        enrollment = Enrollment.objects.filter(
            student=student,
            status='ENROLLED'
        ).select_related('section', 'section__grade_level').first()

        if enrollment and enrollment.section:
            student_section = enrollment.section
        elif hasattr(student, 'section') and student.section:
            student_section = student.section

        if not student_section:
            return Response({
                'error': f'Student {student.full_name} is not enrolled in an active section.'
            }, status=status.HTTP_400_BAD_REQUEST)

        grade_name = student_section.grade_level.name if student_section.grade_level else ''
        section_display = format_section_label(grade_name, student_section.name)

        # 6. Role-Based Access Control: Verify Faculty Authorization
        is_adviser = False
        if faculty:
            if student_section.adviser_id == faculty.id:
                is_adviser = True
            elif getattr(student_section, 'adviser', None) == faculty:
                is_adviser = True
            elif getattr(student_section.adviser, 'account_id', None) == user.id:
                is_adviser = True
            elif getattr(student_section.adviser, 'user_id', None) == user.id:
                is_adviser = True

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
        target_schedule = active_schedule if active_schedule else Schedule.objects.filter(section=student_section).order_by('start_time').first()

        # 7. Check Earlier Periods Today for Loafing / Cutting Alerts
        today_logs = SubjectAttendanceLog.objects.filter(
            student=student,
            attendance_date=today
        )
        attended_schedule_ids = set(
            today_logs.filter(status__in=['PRESENT', 'LATE']).values_list('schedule_id', flat=True)
        )

        missed_earlier_count = 0
        if target_schedule and getattr(target_schedule, 'start_time', None):
            earlier_schedules = Schedule.objects.filter(
                section=student_section,
                start_time__lt=target_schedule.start_time
            ).exclude(id__in=attended_schedule_ids)
            missed_earlier_count = earlier_schedules.count()

        attendance_note = "Classroom attendance verified."
        if missed_earlier_count > 0:
            attendance_note = f"LOAFING ALERT: Missed {missed_earlier_count} earlier subject period(s) today."

        photo_url = resolve_student_photo_url(student, request)

        # 8. Duplicate Scan Prevention for This Period
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
                'message': 'ID already scanned. Attendance already recorded for this class period.',
                'authorization_role': role_label,
                'student_id': student.id,
                'student_name': format_full_student_name(student),
                'lrn': student.lrn,
                'section': section_display,
                'status': getattr(existing_log, 'status', 'PRESENT'),
                'scanned_at': timestamp_str,
                'attendance_note': attendance_note,
                'photo_url': photo_url,
                'photo': photo_url,
            }, status=status.HTTP_200_OK)

        # 9. Record Verified Classroom Attendance
        computed_status = determine_scan_status(target_schedule, now)
        log_fields = {f.name for f in SubjectAttendanceLog._meta.fields}
        log_defaults = {
            'status': computed_status,
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
            logger.warning(f"[ClassroomStudentScanAPIView] update_or_create conflict caught: {e}")
            log = SubjectAttendanceLog.objects.filter(**log_filter_kwargs).first()
            created = False

        # 10. Update Daily Attendance Summary
        summary_fields = {f.name for f in DailyAttendanceSummary._meta.fields}
        summary_defaults = {
            'section': student_section,
            'status': computed_status,
        }
        if 'remarks' in summary_fields:
            summary_defaults['remarks'] = attendance_note[:255]

        DailyAttendanceSummary.objects.update_or_create(
            student=student,
            attendance_date=today,
            defaults=summary_defaults
        )

        timestamp_display = timezone.localtime(now).strftime('%I:%M:%S %p')

        return Response({
            'success': True,
            'is_duplicate': not created,
            'message': f'Attendance recorded ({computed_status}) by {role_label}.' if created else 'ID already scanned today.',
            'authorization_role': role_label,
            'student_id': student.id,
            'student_name': format_full_student_name(student),
            'lrn': student.lrn,
            'section': section_display,
            'status': computed_status,
            'scanned_at': timestamp_display,
            'attendance_note': attendance_note,
            'photo_url': photo_url,
            'photo': photo_url,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


ClassroomScanAPIView = ClassroomStudentScanAPIView


# ============================================================================
# 2. DEVICE REGISTRATION FOR GEOFENCING & CLASSROOM SCANNER APPROVAL
# ============================================================================

class UserDeviceRegisterAPIView(APIView):
    """
    Registers faculty mobile phones and laptops for GPS boundary verification.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        device_uuid = str(request.data.get('device_uuid', '')).strip()
        device_name = str(request.data.get('device_name', 'Faculty Device')).strip()
        platform = str(request.data.get('platform', 'WEB')).upper()

        if not device_uuid:
            return Response({'error': 'Device identifier is required.'}, status=status.HTTP_400_BAD_REQUEST)

        DeviceModel = get_device_model()
        if not DeviceModel:
            return Response({'success': True, 'message': 'Device registered for classroom scanning.'})

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
            'message': 'Device registered for classroom attendance scanning.'
        }, status=status.HTTP_200_OK)


DeviceRegisterAPIView = UserDeviceRegisterAPIView


# ============================================================================
# 3. CLASS & CLASS LIST VIEWS (FAST BATCH QUERIES)
# ============================================================================

class ClassListAPIView(APIView):
    """
    Returns assigned classes for the signed-in faculty with enrolled class lists
    and today's real attendance status pre-calculated in fast batch queries.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty = resolve_faculty_record(user)
        is_admin = is_leadership_role(user) or user.is_superuser
        view_mode = str(request.query_params.get('mode', '')).lower()
        today = timezone.localdate()

        if is_admin and view_mode == 'all':
            scheds = Schedule.objects.all()
        elif faculty:
            advisory_q = Q(section__adviser=faculty)
            if hasattr(faculty, 'account_id'):
                advisory_q |= Q(section__adviser__account_id=faculty.account_id)
            scheds = Schedule.objects.filter(Q(faculty=faculty) | advisory_q).distinct()
        elif is_admin:
            scheds = Schedule.objects.all()
        else:
            scheds = Schedule.objects.none()

        scheds = scheds.select_related('section', 'section__grade_level', 'subject', 'faculty').order_by('start_time')
        scheds_list = list(scheds)
        section_ids = [s.section_id for s in scheds_list if s.section_id]

        extra_advisory = []
        if faculty:
            adv_filter = Q(adviser=faculty)
            if hasattr(faculty, 'account_id'):
                adv_filter |= Q(adviser__account_id=faculty.account_id)
            extra_advisory = Section.objects.filter(adv_filter).exclude(id__in=section_ids).select_related('grade_level')
            for sec in extra_advisory:
                section_ids.append(sec.id)

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

        for sec_id in section_ids:
            if sec_id not in students_by_section:
                direct_students = list(
                    Student.objects.filter(section_id=sec_id, is_active=True).order_by('last_name', 'first_name')
                )
                if direct_students:
                    students_by_section[sec_id] = direct_students
                    all_student_ids.extend([st.id for st in direct_students])

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

            is_adv = bool(
                faculty and (
                    sec.adviser_id == faculty.id
                    or getattr(sec, 'adviser', None) == faculty
                    or getattr(sec.adviser, 'account_id', None) == getattr(user, 'id', None)
                )
            )

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
                'is_adviser': is_adv,
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
            Student.objects.filter(
                Q(enrollments__section_id=section_id, enrollments__status='ENROLLED') |
                Q(section_id=section_id),
                is_active=True
            )
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
# 4. BATCH CLASSROOM SCANNING (MULTI-SCAN SUBMISSION)
# ============================================================================

class ClassroomBatchScanAPIView(APIView):
    """
    Records batch classroom attendance verified by faculty.
    Flags students who belong to a different section.
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
        sec_to_check = sched.section if sched else target_section

        enrolled_student_ids = set(
            Enrollment.objects.filter(section=sec_to_check, status='ENROLLED').values_list('student_id', flat=True)
        )
        if not enrolled_student_ids:
            enrolled_student_ids = set(
                Student.objects.filter(section=sec_to_check, is_active=True).values_list('id', flat=True)
            )

        scans_data = serializer.validated_data['scans']
        clean_tokens = [sanitize_qr_token(item['qr_token']) for item in scans_data]

        matched_students = Student.objects.filter(
            Q(qr_token__in=clean_tokens) | Q(rfid_uid__in=clean_tokens) | Q(lrn__in=clean_tokens),
            is_active=True
        )

        token_to_student = {}
        for st in matched_students:
            if st.qr_token:
                token_to_student[st.qr_token] = st
            if st.rfid_uid:
                token_to_student[st.rfid_uid.upper()] = st
            if st.lrn:
                token_to_student[str(st.lrn).strip()] = st

        processed_records = []
        now_dt = timezone.now()
        now_time_str = timezone.localtime(now_dt).strftime('%I:%M:%S %p')
        faculty = resolve_faculty_record(request.user)

        for item in scans_data:
            token = sanitize_qr_token(item['qr_token'])
            target_status = str(item.get('status', 'PRESENT')).upper()
            st = token_to_student.get(token) or token_to_student.get(token.upper())

            if not st:
                continue

            is_enrolled = st.id in enrolled_student_ids

            if not is_enrolled:
                is_anomaly = True
                final_status = 'UNVERIFIED'
                remarks_text = 'Student belongs to a different class section.'
            else:
                is_anomaly = False
                final_status = target_status
                remarks_text = 'Classroom attendance verified.'

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

            if sec_to_check:
                summary_status = final_status if final_status in ['PRESENT', 'LATE', 'CUTTING'] else 'ABSENT'
                DailyAttendanceSummary.objects.update_or_create(
                    student=st,
                    attendance_date=today,
                    defaults={
                        'section': sec_to_check,
                        'status': summary_status,
                        'remarks': remarks_text[:255],
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
                'remarks': remarks_text,
                'scan_time': now_time_str,
            })

        return Response({
            'success': True,
            'message': f"Classroom attendance recorded for {len(processed_records)} student(s).",
            'scanned_count': len(processed_records),
            'processed_records': processed_records,
        }, status=status.HTTP_201_CREATED)


# ============================================================================
# 5. ADVISER SUBJECT ATTENDANCE & LOAFING MATRIX
# ============================================================================

class AdviserSectionMatrixAPIView(APIView):
    """
    Builds the cross-subject attendance matrix for the Class Adviser.
    Loafing Rule (No Gate Scanner):
    - If a student is PRESENT or LATE in at least one subject class today,
      any other subject period where they are missing is flagged as CUTTING (Loafing).
    - If a student has zero subject scans all day, they remain UNSCANNED (Absent).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        faculty = resolve_faculty_record(user)
        is_admin = is_leadership_role(user) or user.is_superuser

        # 1. Identify permitted sections
        if is_admin:
            available_sections_qs = Section.objects.filter(is_active=True).select_related('grade_level').order_by('grade_level__name', 'name')
        elif faculty:
            advisory_q = Q(adviser=faculty)
            if hasattr(faculty, 'account_id'):
                advisory_q |= Q(adviser__account_id=faculty.account_id)
            if hasattr(faculty, 'user_id'):
                advisory_q |= Q(adviser__user_id=faculty.user_id)

            advisory_ids = set(Section.objects.filter(advisory_q, is_active=True).values_list('id', flat=True))
            teaching_ids = set(Schedule.objects.filter(faculty=faculty, is_active=True).values_list('section_id', flat=True))
            allowed_ids = advisory_ids | teaching_ids

            available_sections_qs = Section.objects.filter(id__in=allowed_ids, is_active=True).select_related('grade_level').order_by('grade_level__name', 'name')
        else:
            available_sections_qs = Section.objects.none()

        advisory_section_ids = set()
        if faculty:
            adv_filter = Q(adviser=faculty)
            if hasattr(faculty, 'account_id'):
                adv_filter |= Q(adviser__account_id=faculty.account_id)
            if hasattr(faculty, 'user_id'):
                adv_filter |= Q(adviser__user_id=faculty.user_id)
            advisory_section_ids = set(Section.objects.filter(adv_filter, is_active=True).values_list('id', flat=True))

        available_sections = [
            {
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'is_adviser': s.id in advisory_section_ids,
            }
            for s in available_sections_qs
        ]

        # 2. Pick target section
        target_section = None
        raw_section_id = request.query_params.get('section_id')

        if raw_section_id and str(raw_section_id).isdigit():
            target_id = int(raw_section_id)
            if is_admin:
                target_section = Section.objects.filter(id=target_id, is_active=True).select_related('grade_level').first()
            else:
                target_section = available_sections_qs.filter(id=target_id).first()

        if not target_section and advisory_section_ids:
            first_adv_id = next(iter(advisory_section_ids))
            target_section = available_sections_qs.filter(id=first_adv_id).first()

        if not target_section and available_sections_qs.exists():
            target_section = available_sections_qs.first()

        if not target_section:
            return Response({
                'has_advisory_class': False,
                'message': 'No advisory or assigned teaching class found for this account.',
                'available_sections': available_sections,
                'schedules': [],
                'matrix': []
            }, status=status.HTTP_200_OK)

        # 3. Retrieve Scheduled Subjects ordered chronologically
        schedules = Schedule.objects.filter(
            section=target_section,
            is_active=True
        ).select_related('subject', 'faculty').order_by('start_time')

        schedules_list = list(schedules)

        schedule_headers = [
            {
                'schedule_id': s.id,
                'subject_code': s.subject.code if s.subject else 'HOMEROOM',
                'subject_name': s.subject.title if s.subject else 'Advisory Homeroom',
                'faculty_name': s.faculty.full_name if s.faculty else 'Unassigned',
                'time_window': f"{str(s.start_time)[:5]} - {str(s.end_time)[:5]}" if s.start_time else 'All Day',
            }
            for s in schedules_list
        ]

        # 4. Retrieve Enrolled Class List
        enrollments = Enrollment.objects.filter(
            section=target_section,
            status='ENROLLED',
            student__is_active=True
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        students = [e.student for e in enrollments if e.student]
        if not students:
            students = list(
                Student.objects.filter(section=target_section, is_active=True).order_by('last_name', 'first_name')
            )

        student_ids = [s.id for s in students]

        # 5. Fetch All Subject Logs for Today in Single Fast Query
        subject_logs = SubjectAttendanceLog.objects.filter(
            attendance_date=today,
            student_id__in=student_ids
        ).values('student_id', 'schedule_id', 'status', 'scanned_at')

        log_map = {}
        first_seen_map = {}

        for entry in subject_logs:
            st_id = entry['student_id']
            sched_id = entry['schedule_id']
            st_status = str(entry['status'] or '').upper()
            raw_dt = entry['scanned_at']

            time_label = timezone.localtime(raw_dt).strftime('%I:%M %p') if raw_dt else ''
            log_map[(st_id, sched_id)] = {
                'status': st_status,
                'scan_time': time_label,
            }

            if st_status in ['PRESENT', 'LATE'] and raw_dt:
                if st_id not in first_seen_map or raw_dt < first_seen_map[st_id]['dt']:
                    first_seen_map[st_id] = {
                        'dt': raw_dt,
                        'time_label': time_label,
                    }

        # 6. Build Matrix Rows with Cross-Period Loafing Detection
        matrix_rows = []
        for idx, st in enumerate(students, start=1):
            subjects_attended = 0
            subjects_cutting = 0
            subject_details = []

            # Check if student was seen in at least one subject class today
            attended_any_today = any(
                (log_map.get((st.id, s.id), {}).get('status') in ['PRESENT', 'LATE'])
                for s in schedules_list
            )

            for s in schedules_list:
                record = log_map.get((st.id, s.id))
                if record:
                    st_status = record['status']
                    scan_t = record['scan_time']
                    if st_status in ['PRESENT', 'LATE']:
                        subjects_attended += 1
                    elif st_status == 'CUTTING':
                        subjects_cutting += 1
                else:
                    # Student was present in another class today but skipped this subject -> Loafing!
                    if attended_any_today:
                        st_status = 'CUTTING'
                        scan_t = ''
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

            first_seen = first_seen_map.get(st.id)
            if first_seen:
                campus_status = f"First seen at {first_seen['time_label']}"
                presence_state = 'ACTIVE'
            elif attended_any_today:
                campus_status = "Present in Class"
                presence_state = 'ACTIVE'
            else:
                campus_status = "No Class Scans Yet"
                presence_state = 'NONE'

            total_subjects = len(schedules_list)
            compliance_rate = round((subjects_attended / total_subjects) * 100) if total_subjects > 0 else 0

            matrix_rows.append({
                'number': idx,
                'student_id': st.id,
                'student_name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'photo_url': resolve_student_photo_url(st, request),
                'campus_status': campus_status,
                'presence_state': presence_state,
                'attended_count': subjects_attended,
                'cutting_count': subjects_cutting,
                'total_subjects': total_subjects,
                'compliance_rate': compliance_rate,
                'subjects': subject_details,
            })

        is_adv_of_target = target_section.id in advisory_section_ids

        return Response({
            'has_advisory_class': True,
            'is_adviser': is_adv_of_target,
            'section_id': target_section.id,
            'section_name': target_section.name,
            'grade_level': target_section.grade_level.name if target_section.grade_level else '',
            'total_students': len(students),
            'available_sections': available_sections,
            'schedules': schedule_headers,
            'matrix': matrix_rows,
        }, status=status.HTTP_200_OK)


AdviserMatrixAPIView = AdviserSectionMatrixAPIView