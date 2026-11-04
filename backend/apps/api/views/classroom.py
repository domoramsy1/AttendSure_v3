"""
AttendSure V3 - Classroom API Views (Batch Aggregated Fast Queries & Gate Validation)
File: backend/apps/api/views/classroom.py
"""

from datetime import datetime
import json
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
)
from apps.common.utils import (
    is_leadership_role,
    format_full_student_name,
    safe_photo_url,
)
from .common import resolve_faculty_for_user
from apps.api.serializers import ClassroomBatchScanSerializer


def sanitize_qr_token(raw_token: str) -> str:
    """Extracts raw LRN or token from plain text, JSON, or tagged QR formats."""
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


class ClassListAPIView(APIView):
    """
    Returns teaching classes for the authenticated teacher with enrolled student lists
    and today's real attendance status pre-calculated in fast batch queries.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)
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
                    'photo_url': safe_photo_url(st.photo, request),
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
                'photo_url': safe_photo_url(s.photo, request),
                'attendance_status': subject_logs.get(s.id) or daily_logs.get(s.id, 'UNSCANNED'),
                'parent_contact': s.parent_contact or '',
                'qr_token': s.qr_token or '',
                'rfid_uid': s.rfid_uid or '',
            }
            for s in students
        ]
        return Response(data, status=status.HTTP_200_OK)


StudentListAPIView = FacultyClassroomListAPIView
FacultyClassroomRosterAPIView = FacultyClassroomListAPIView


class ClassroomBatchScanAPIView(APIView):
    """
    Records student attendance verified by a teacher inside the classroom.
    Validates Gate Attendance:
    - If the student has NO gate scan today: Flagged as UNVERIFIED (fence-jumping / bypassed gate).
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

            # 1. Update Subject Attendance Log
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

            # 2. Update Daily Attendance Summary for web portal
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

            processed_records.append({
                'student_id': st.id,
                'name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'rfid_uid': st.rfid_uid or '',
                'photo_url': safe_photo_url(st.photo, request),
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