"""
AttendSure - Classroom Printed QR ID Scanner & Loafing Detection Engine
File: backend/apps/api/views/classroom.py
"""

import json
import logging
from datetime import datetime, timedelta
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    DailyAttendanceSummary,
    Enrollment,
    Schedule,
    Section,
    Student,
    SubjectAttendanceLog,
)
from apps.api.serializers import ClassroomBatchScanSerializer
from apps.api.services.push_service import notify_student_parent
from .common import (
    format_deduped_section_label,
    format_full_student_name,
    get_user_role,
    is_leadership_role,
    resolve_faculty_for_user,
    safe_photo_url,
    verify_campus_gps,
)

logger = logging.getLogger(__name__)


def sanitize_qr_token(raw_token: str) -> str:
    """Cleans scanned QR ID strings and extracts LRN or token safely."""
    clean = str(raw_token or '').strip().replace('\r', '').replace('\n', '').replace('\0', '')[:64]
    if clean.startswith('{') and clean.endswith('}'):
        try:
            parsed = json.loads(clean)
            return str(
                parsed.get('lrn') or parsed.get('qr_token') or parsed.get('id') or clean
            ).strip()
        except Exception:
            pass
    return clean.split(':')[-1].strip() if ':' in clean else clean


def determine_scan_status(schedule, current_dt, grace_minutes: int = 15) -> str:
    """Returns PRESENT or LATE based on class start time plus grace minutes."""
    if not schedule or not getattr(schedule, 'start_time', None):
        return 'PRESENT'
    local_now = timezone.localtime(current_dt)
    class_start = timezone.make_aware(
        datetime.combine(local_now.date(), schedule.start_time),
        timezone.get_current_timezone(),
    )
    return 'LATE' if local_now > (class_start + timedelta(minutes=grace_minutes)) else 'PRESENT'


def serialize_class_list(students, request, subject_logs=None, daily_logs=None, schedule_id=None):
    """Formats a student class list consistently across all classroom endpoints."""
    subject_logs = subject_logs or {}
    daily_logs = daily_logs or {}
    items = []

    for st in students:
        att_status = (
            (subject_logs.get((schedule_id, st.id)) if schedule_id else subject_logs.get(st.id))
            or daily_logs.get(st.id)
            or 'UNSCANNED'
        )
        full_name = format_full_student_name(st)
        items.append({
            'id': st.id,
            'lrn': str(st.lrn).strip(),
            'full_name': full_name,
            'name': full_name,
            'gender': st.sex,
            'photo_url': safe_photo_url(st.photo, request),
            'attendance_status': att_status,
            'parent_contact': st.parent_contact or '',
            'qr_token': st.qr_token or '',
        })
    return items


class ClassroomStudentScanAPIView(APIView):
    """
    Scans a student's printed QR ID card from a faculty mobile phone or laptop,
    checks campus GPS boundaries, flags missed earlier periods, and notifies the parent app.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        user = request.user
        role = get_user_role(user)
        now = timezone.now()
        today = timezone.localdate()

        faculty = resolve_faculty_for_user(user)
        is_admin = is_leadership_role(user) or user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL')

        if not faculty and not is_admin:
            return Response(
                {'error': 'Only verified faculty, class advisers, and administrators can record attendance.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        lat = request.data.get('latitude')
        lon = request.data.get('longitude')
        if lat is not None and lon is not None and not is_admin:
            gps_check = verify_campus_gps(
                latitude=lat,
                longitude=lon,
                accuracy_meters=request.data.get('accuracy'),
                is_mock_location=bool(request.data.get('is_mock_location', False)),
            )
            if not gps_check['is_inside']:
                return Response({'error': gps_check['reason']}, status=status.HTTP_403_FORBIDDEN)

        raw_code = str(
            request.data.get('code') or request.data.get('raw_identifier') or request.data.get('qr_token') or ''
        ).strip()
        cleaned_token = sanitize_qr_token(raw_code)
        if not cleaned_token:
            return Response({'error': 'No printed QR code received.'}, status=status.HTTP_400_BAD_REQUEST)

        # Printed QR ID lookup only (qr_token or LRN)
        student = Student.objects.filter(
            Q(qr_token=cleaned_token) | Q(lrn__iexact=cleaned_token),
            is_active=True,
        ).first()

        if not student:
            return Response(
                {'error': f'Unregistered student QR ID ({cleaned_token}).'},
                status=status.HTTP_404_NOT_FOUND,
            )

        enrollment = (
            Enrollment.objects.filter(student=student, status='ENROLLED')
            .select_related('section', 'section__grade_level')
            .order_by('-id')
            .first()
        )
        student_section = enrollment.section if enrollment else None
        if not student_section:
            return Response(
                {'error': f'Student {student.full_name} is not enrolled in an active section.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        grade_name = student_section.grade_level.name if student_section.grade_level else ''
        section_display = format_deduped_section_label(grade_name, student_section.name)

        is_adviser = bool(faculty and student_section.adviser_id == faculty.id)
        requested_sched_id = request.data.get('schedule_id')

        active_schedule = None
        if faculty:
            sched_qs = Schedule.objects.filter(
                faculty=faculty,
                section=student_section,
                is_active=True,
            ).select_related('subject')
            if requested_sched_id and str(requested_sched_id).isdigit():
                active_schedule = sched_qs.filter(id=int(requested_sched_id)).first()
            if not active_schedule:
                active_schedule = sched_qs.first()

        is_subject_faculty = bool(active_schedule)
        if not (is_adviser or is_subject_faculty or is_admin):
            return Response(
                {'error': f'Access Denied: You are not assigned to {section_display}.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        role_label = 'Class Adviser' if is_adviser else ('Subject Faculty' if is_subject_faculty else 'Administrator')
        target_schedule = active_schedule or Schedule.objects.filter(
            section=student_section,
            is_active=True,
        ).order_by('start_time').first()

        if not target_schedule:
            return Response(
                {'error': f'No active subject schedule found for {section_display}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        attended_schedule_ids = set(
            SubjectAttendanceLog.objects.filter(
                student=student,
                attendance_date=today,
                status__in=['PRESENT', 'LATE'],
            ).values_list('schedule_id', flat=True)
        )
        missed_earlier_count = Schedule.objects.filter(
            section=student_section,
            is_active=True,
            start_time__lt=target_schedule.start_time,
        ).exclude(id__in=attended_schedule_ids).count()

        attendance_note = (
            f'LOAFING ALERT: Missed {missed_earlier_count} earlier subject period(s) today.'
            if missed_earlier_count > 0
            else 'Classroom QR attendance verified.'
        )
        photo_url = safe_photo_url(student.photo, request)

        existing_log = SubjectAttendanceLog.objects.filter(
            student=student,
            schedule=target_schedule,
            attendance_date=today,
        ).first()

        if existing_log:
            timestamp_str = timezone.localtime(existing_log.scanned_at or now).strftime('%I:%M:%S %p')
            return Response({
                'success': True,
                'is_duplicate': True,
                'message': 'QR ID already scanned for this class period today.',
                'authorization_role': role_label,
                'student_id': student.id,
                'student_name': format_full_student_name(student),
                'lrn': student.lrn,
                'section': section_display,
                'status': existing_log.status,
                'scanned_at': timestamp_str,
                'attendance_note': attendance_note,
                'photo_url': photo_url,
            }, status=status.HTTP_200_OK)

        computed_status = determine_scan_status(target_schedule, now)
        SubjectAttendanceLog.objects.create(
            student=student,
            schedule=target_schedule,
            faculty=target_schedule.faculty or faculty,
            attendance_date=today,
            scanned_at=now,
            scan_method='QR',
            status=computed_status,
        )

        DailyAttendanceSummary.objects.update_or_create(
            student=student,
            attendance_date=today,
            defaults={
                'section': student_section,
                'status': computed_status,
                'remarks': attendance_note[:255],
            },
        )

        subject_label = target_schedule.subject.title if target_schedule.subject else 'Class'
        time_display = timezone.localtime(now).strftime('%I:%M %p')
        alert_category = 'CUTTING_ALERT' if missed_earlier_count > 0 else 'ATTENDANCE'
        alert_title = (
            f'Cutting Class Alert: {student.first_name}'
            if missed_earlier_count > 0
            else f'Class Attendance: {student.first_name} ({computed_status})'
        )
        alert_body = (
            f'{student.first_name} {student.last_name} scanned into {subject_label} at {time_display}, '
            f'but missed {missed_earlier_count} earlier period(s) today.'
            if missed_earlier_count > 0
            else f'{student.first_name} {student.last_name} was marked {computed_status} in {subject_label} at {time_display}.'
        )

        transaction.on_commit(
            lambda: notify_student_parent(
                student=student,
                title=alert_title,
                message=alert_body,
                category=alert_category,
                extra_data={'status': computed_status, 'subject': subject_label},
            )
        )

        return Response({
            'success': True,
            'is_duplicate': False,
            'message': f'Attendance recorded ({computed_status}) by {role_label}.',
            'authorization_role': role_label,
            'student_id': student.id,
            'student_name': format_full_student_name(student),
            'lrn': student.lrn,
            'section': section_display,
            'status': computed_status,
            'scanned_at': timezone.localtime(now).strftime('%I:%M:%S %p'),
            'attendance_note': attendance_note,
            'photo_url': photo_url,
        }, status=status.HTTP_201_CREATED)


ClassroomScanAPIView = ClassroomStudentScanAPIView


class StudentQRCardAPIView(APIView):
    """Returns real student QR ID card payloads for printing PVC or paper IDs."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        section_id = request.query_params.get('section_id')
        qs = Enrollment.objects.filter(status='ENROLLED', student__is_active=True).select_related(
            'student', 'section', 'section__grade_level'
        )
        if section_id and str(section_id).isdigit():
            qs = qs.filter(section_id=int(section_id))

        cards = []
        for enr in qs.order_by('student__last_name', 'student__first_name')[:300]:
            st = enr.student
            sec = enr.section
            grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
            cards.append({
                'student_id': st.id,
                'lrn': st.lrn,
                'full_name': format_full_student_name(st),
                'grade_section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                'qr_token': st.qr_token,
                'qr_payload': f'ATTENDSURE:{st.lrn}:{st.qr_token}',
                'photo_url': safe_photo_url(st.photo, request),
            })

        return Response({'cards': cards, 'total': len(cards)}, status=status.HTTP_200_OK)


class ClassListAPIView(APIView):
    """Returns assigned subject classes and enrolled class lists in fast batch queries."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)
        is_admin = is_leadership_role(user) or user.is_superuser
        view_mode = str(request.query_params.get('mode', '')).lower()
        today = timezone.localdate()

        if is_admin and view_mode == 'all':
            scheds = Schedule.objects.filter(is_active=True)
        elif faculty:
            scheds = Schedule.objects.filter(
                Q(faculty=faculty) | Q(section__adviser=faculty),
                is_active=True,
            ).distinct()
        elif is_admin:
            scheds = Schedule.objects.filter(is_active=True)
        else:
            scheds = Schedule.objects.none()

        scheds_list = list(
            scheds.select_related('section', 'section__grade_level', 'subject', 'faculty').order_by('start_time')
        )
        section_ids = {s.section_id for s in scheds_list if s.section_id}

        extra_advisory = []
        if faculty:
            extra_advisory = list(
                Section.objects.filter(adviser=faculty, is_active=True)
                .exclude(id__in=section_ids)
                .select_related('grade_level')
            )
            section_ids.update(sec.id for sec in extra_advisory)

        enrollments = (
            Enrollment.objects.filter(section_id__in=section_ids, status='ENROLLED', student__is_active=True)
            .select_related('student')
            .order_by('student__last_name', 'student__first_name')
        )

        students_by_section = {}
        all_student_ids = []
        for enr in enrollments:
            if enr.student:
                students_by_section.setdefault(enr.section_id, []).append(enr.student)
                all_student_ids.append(enr.student_id)

        subject_logs = {
            (row['schedule_id'], row['student_id']): row['status']
            for row in SubjectAttendanceLog.objects.filter(
                attendance_date=today,
                student_id__in=all_student_ids,
            ).values('schedule_id', 'student_id', 'status')
        }
        daily_logs = dict(
            DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                student_id__in=all_student_ids,
            ).values_list('student_id', 'status')
        )

        classes_data = []
        seen_sections = set()

        for s in scheds_list:
            sec = s.section
            if not sec:
                continue
            student_items = serialize_class_list(
                students_by_section.get(sec.id, []),
                request,
                subject_logs=subject_logs,
                daily_logs=daily_logs,
                schedule_id=s.id,
            )
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
                'room': sec.room_number or s.room_number or '',
                'start_time': start_str,
                'end_time': end_str,
                'time_display': f'{start_str} - {end_str}'.strip(' -'),
                'total_students': len(student_items),
                'enrolled_count': len(student_items),
                'student_count': len(student_items),
                'students': student_items,
                'is_adviser': bool(faculty and sec.adviser_id == faculty.id),
            })
            seen_sections.add(sec.id)

        for sec in extra_advisory:
            if sec.id in seen_sections:
                continue
            student_items = serialize_class_list(
                students_by_section.get(sec.id, []),
                request,
                daily_logs=daily_logs,
            )
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
                'room': sec.room_number or '',
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
    """Returns the enrolled class list for a specific section."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        section_id = request.query_params.get('section_id') or request.query_params.get('section')
        if not section_id or not str(section_id).isdigit():
            return ClassListAPIView().get(request)

        today = timezone.localdate()
        students = list(
            Student.objects.filter(
                enrollments__section_id=int(section_id),
                enrollments__status='ENROLLED',
                is_active=True,
            )
            .distinct()
            .order_by('last_name', 'first_name')
        )

        subject_logs = dict(
            SubjectAttendanceLog.objects.filter(
                student__in=students,
                attendance_date=today,
            ).values_list('student_id', 'status')
        )
        daily_logs = dict(
            DailyAttendanceSummary.objects.filter(
                student__in=students,
                attendance_date=today,
            ).values_list('student_id', 'status')
        )

        return Response(
            serialize_class_list(students, request, subject_logs=subject_logs, daily_logs=daily_logs),
            status=status.HTTP_200_OK,
        )


StudentListAPIView = FacultyClassroomListAPIView
FacultyClassroomClassListAPIView = FacultyClassroomListAPIView


class ClassroomBatchScanAPIView(APIView):
    """Records multiple printed QR ID scans for a scheduled subject period."""
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        serializer = ClassroomBatchScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        sched_id = serializer.validated_data['schedule_id']
        sched = Schedule.objects.select_related('section', 'subject', 'faculty').filter(id=sched_id).first()
        if not sched:
            return Response({'error': 'Active class schedule not found.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        sec = sched.section
        enrolled_ids = set(
            Enrollment.objects.filter(section=sec, status='ENROLLED').values_list('student_id', flat=True)
        )

        scans_data = serializer.validated_data['scans']
        clean_tokens = [sanitize_qr_token(item['qr_token']) for item in scans_data]

        matched_students = Student.objects.filter(
            Q(qr_token__in=clean_tokens) | Q(lrn__in=clean_tokens),
            is_active=True,
        )

        token_map = {}
        for st in matched_students:
            if st.qr_token:
                token_map[st.qr_token] = st
            if st.lrn:
                token_map[str(st.lrn).strip()] = st

        now_dt = timezone.now()
        now_time_str = timezone.localtime(now_dt).strftime('%I:%M:%S %p')
        faculty = resolve_faculty_for_user(request.user)
        processed_records = []

        for item in scans_data:
            token = sanitize_qr_token(item['qr_token'])
            st = token_map.get(token)
            if not st:
                continue

            is_enrolled = st.id in enrolled_ids
            final_status = str(item.get('status', 'PRESENT')).upper() if is_enrolled else 'UNVERIFIED'
            remarks_text = 'Classroom QR attendance verified.' if is_enrolled else 'Student belongs to a different section.'

            SubjectAttendanceLog.objects.update_or_create(
                student=st,
                schedule=sched,
                attendance_date=today,
                defaults={
                    'faculty': sched.faculty or faculty,
                    'status': final_status if final_status in ['PRESENT', 'LATE', 'CUTTING', 'ABSENT', 'EXCUSED'] else 'ABSENT',
                    'scanned_at': now_dt,
                    'scan_method': 'QR',
                },
            )

            if is_enrolled:
                DailyAttendanceSummary.objects.update_or_create(
                    student=st,
                    attendance_date=today,
                    defaults={
                        'section': sec,
                        'status': final_status if final_status in ['PRESENT', 'LATE', 'CUTTING', 'EXCUSED'] else 'ABSENT',
                        'remarks': remarks_text,
                    },
                )

            photo_url = safe_photo_url(st.photo, request)
            processed_records.append({
                'student_id': st.id,
                'name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'photo_url': photo_url,
                'section': sec.name,
                'status': final_status,
                'is_anomaly': not is_enrolled,
                'remarks': remarks_text,
                'scan_time': now_time_str,
            })

        return Response({
            'success': True,
            'message': f'Classroom QR attendance recorded for {len(processed_records)} student(s).',
            'scanned_count': len(processed_records),
            'processed_records': processed_records,
        }, status=status.HTTP_201_CREATED)


class AdviserSectionMatrixAPIView(APIView):
    """Cross-period attendance and cutting-class matrix for Class Advisers."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        current_time = timezone.localtime(timezone.now()).time()
        faculty = resolve_faculty_for_user(user)
        is_admin = is_leadership_role(user) or user.is_superuser

        if is_admin:
            sections_qs = Section.objects.filter(is_active=True).select_related('grade_level').order_by('grade_level__level_order', 'name')
            advisory_ids = set()
        elif faculty:
            advisory_ids = set(Section.objects.filter(adviser=faculty, is_active=True).values_list('id', flat=True))
            teaching_ids = set(Schedule.objects.filter(faculty=faculty, is_active=True).values_list('section_id', flat=True))
            sections_qs = Section.objects.filter(id__in=(advisory_ids | teaching_ids), is_active=True).select_related('grade_level').order_by('grade_level__level_order', 'name')
        else:
            sections_qs = Section.objects.none()
            advisory_ids = set()

        available_sections = [
            {
                'id': s.id,
                'name': s.name,
                'grade_level': s.grade_level.name if s.grade_level else '',
                'is_adviser': s.id in advisory_ids,
            }
            for s in sections_qs
        ]

        raw_section_id = request.query_params.get('section_id')
        target_section = None
        if raw_section_id and str(raw_section_id).isdigit():
            target_section = sections_qs.filter(id=int(raw_section_id)).first()
        if not target_section and advisory_ids:
            target_section = sections_qs.filter(id=next(iter(advisory_ids))).first()
        if not target_section:
            target_section = sections_qs.first()

        if not target_section:
            return Response({
                'has_advisory_class': False,
                'message': 'No advisory or assigned teaching class found.',
                'available_sections': available_sections,
                'schedules': [],
                'matrix': [],
            }, status=status.HTTP_200_OK)

        schedules = list(
            Schedule.objects.filter(section=target_section, is_active=True)
            .select_related('subject', 'faculty')
            .order_by('start_time')
        )

        enrollments = (
            Enrollment.objects.filter(section=target_section, status='ENROLLED', student__is_active=True)
            .select_related('student')
            .order_by('student__last_name', 'student__first_name')
        )
        students = [e.student for e in enrollments if e.student]
        student_ids = [s.id for s in students]

        logs = SubjectAttendanceLog.objects.filter(
            attendance_date=today,
            student_id__in=student_ids,
        ).values('student_id', 'schedule_id', 'status', 'scanned_at')

        daily_present_ids = set(
            DailyAttendanceSummary.objects.filter(
                attendance_date=today,
                student_id__in=student_ids,
                status__in=['PRESENT', 'LATE'],
            ).values_list('student_id', flat=True)
        )

        log_map = {}
        active_schedule_ids = set()
        first_seen_map = {}

        for entry in logs:
            st_id = entry['student_id']
            sc_id = entry['schedule_id']
            st_status = str(entry['status'] or '').upper()
            raw_dt = entry['scanned_at']

            active_schedule_ids.add(sc_id)
            time_label = timezone.localtime(raw_dt).strftime('%I:%M %p') if raw_dt else ''
            log_map[(st_id, sc_id)] = {'status': st_status, 'scan_time': time_label}

            if st_status in ['PRESENT', 'LATE']:
                daily_present_ids.add(st_id)
                if raw_dt and (st_id not in first_seen_map or raw_dt < first_seen_map[st_id]['dt']):
                    first_seen_map[st_id] = {'dt': raw_dt, 'time_label': time_label}

        matrix_rows = []
        for idx, st in enumerate(students, start=1):
            attended = 0
            cutting = 0
            subject_details = []
            in_campus_today = st.id in daily_present_ids

            for s in schedules:
                rec = log_map.get((st.id, s.id))
                if rec:
                    st_status = rec['status']
                    scan_t = rec['scan_time']
                    if st_status in ['PRESENT', 'LATE']:
                        attended += 1
                    elif st_status in ['ABSENT', 'CUTTING'] and in_campus_today:
                        st_status = 'CUTTING'
                        cutting += 1
                else:
                    period_started = bool(s.start_time and current_time >= s.start_time)
                    if in_campus_today and (s.id in active_schedule_ids or period_started):
                        st_status = 'CUTTING'
                        scan_t = ''
                        cutting += 1
                    else:
                        st_status = 'UNSCANNED'
                        scan_t = ''

                subject_details.append({
                    'schedule_id': s.id,
                    'subject_code': s.subject.code if s.subject else 'SUB',
                    'status': st_status,
                    'time': scan_t,
                })

            first_seen = first_seen_map.get(st.id)
            campus_status = f"First seen at {first_seen['time_label']}" if first_seen else (
                'Present in Class' if in_campus_today else 'No Class Scans Yet'
            )
            total_subjects = len(schedules)

            matrix_rows.append({
                'number': idx,
                'student_id': st.id,
                'student_name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'photo_url': safe_photo_url(st.photo, request),
                'campus_status': campus_status,
                'presence_state': 'ACTIVE' if in_campus_today else 'NONE',
                'attended_count': attended,
                'cutting_count': cutting,
                'total_subjects': total_subjects,
                'compliance_rate': round((attended / total_subjects) * 100) if total_subjects > 0 else 0,
                'subjects': subject_details,
            })

        return Response({
            'has_advisory_class': True,
            'is_adviser': target_section.id in advisory_ids,
            'section_id': target_section.id,
            'section_name': target_section.name,
            'grade_level': target_section.grade_level.name if target_section.grade_level else '',
            'total_students': len(students),
            'available_sections': available_sections,
            'schedules': [
                {
                    'schedule_id': s.id,
                    'subject_code': s.subject.code if s.subject else 'SUB',
                    'subject_name': s.subject.title if s.subject else 'Subject',
                    'faculty_name': s.faculty.full_name if s.faculty else 'Unassigned',
                    'time_window': f'{str(s.start_time)[:5]} - {str(s.end_time)[:5]}' if s.start_time else '',
                }
                for s in schedules
            ],
            'matrix': matrix_rows,
        }, status=status.HTTP_200_OK)


AdviserMatrixAPIView = AdviserSectionMatrixAPIView