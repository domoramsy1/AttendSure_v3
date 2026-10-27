"""
AttendSure V3 - Classroom API Views (Real Database Queries)
File: backend/apps/api/views/classroom.py
"""

from datetime import datetime
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


def get_section_enrolled_count(sec) -> int:
    if not sec:
        return 0
    try:
        return Enrollment.objects.filter(section=sec, status='ENROLLED', student__is_active=True).count()
    except Exception:
        return 0


class ClassListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)
        is_admin = is_leadership_role(user) or user.is_superuser
        view_mode = str(request.query_params.get('mode', '')).lower()

        if is_admin and view_mode == 'all':
            scheds = (
                Schedule.objects.all()
                .select_related('section', 'section__grade_level', 'subject', 'faculty')
                .order_by('start_time')
            )
        elif faculty:
            scheds = (
                Schedule.objects.filter(Q(faculty=faculty) | Q(section__adviser=faculty))
                .select_related('section', 'section__grade_level', 'subject', 'faculty')
                .distinct()
                .order_by('start_time')
            )
        elif is_admin:
            scheds = (
                Schedule.objects.all()
                .select_related('section', 'section__grade_level', 'subject', 'faculty')
                .order_by('start_time')
            )
        else:
            scheds = Schedule.objects.none()

        classes_data = []
        seen_section_ids = set()

        for s in scheds:
            sec = s.section
            if not sec:
                continue

            enrolled_count = get_section_enrolled_count(sec)
            start_str = str(s.start_time)[:5] if getattr(s, 'start_time', None) else ''
            end_str = str(s.end_time)[:5] if getattr(s, 'end_time', None) else ''
            time_display = f"{start_str} - {end_str}".strip(" -")
            room_str = getattr(sec, 'room_number', '') or getattr(s, 'room_number', '')

            is_user_adviser = bool(faculty and sec.adviser_id == faculty.id)
            subj_code = getattr(s.subject, 'code', '') if s.subject else ''
            subj_title = getattr(s.subject, 'title', '') if s.subject else ''

            grade_name = sec.grade_level.name if getattr(sec, 'grade_level', None) else ''
            grade_code = sec.grade_level.code if getattr(sec, 'grade_level', None) else ''

            classes_data.append({
                'id': s.id,
                'schedule_id': s.id,
                'section_id': sec.id,
                'name': sec.name,
                'section_name': sec.name,
                'grade_level': grade_name,
                'grade_level_code': grade_code,
                'subject_code': subj_code,
                'subject_name': subj_title,
                'subject_title': subj_title,
                'room': room_str,
                'room_number': room_str,
                'start_time': start_str,
                'end_time': end_str,
                'time_display': time_display,
                'enrolled_count': enrolled_count,
                'student_count': enrolled_count,
                'students_count': enrolled_count,
                'total_students': enrolled_count,
                'is_adviser': is_user_adviser,
            })
            seen_section_ids.add(sec.id)

        if faculty:
            extra_advisory = Section.objects.filter(adviser=faculty).exclude(id__in=seen_section_ids).select_related('grade_level')
            for sec in extra_advisory:
                enrolled_count = get_section_enrolled_count(sec)
                room_str = getattr(sec, 'room_number', '')
                grade_name = getattr(sec.grade_level, 'name', '') if getattr(sec, 'grade_level', None) else ''

                classes_data.append({
                    'id': sec.id,
                    'schedule_id': sec.id,
                    'section_id': sec.id,
                    'name': sec.name,
                    'section_name': sec.name,
                    'grade_level': grade_name,
                    'grade_level_code': getattr(sec.grade_level, 'code', '') if getattr(sec, 'grade_level', None) else '',
                    'subject_code': 'ADV',
                    'subject_name': 'Advisory Homeroom',
                    'subject_title': 'Advisory Homeroom',
                    'room': room_str,
                    'room_number': room_str,
                    'start_time': '',
                    'end_time': '',
                    'time_display': '',
                    'enrolled_count': enrolled_count,
                    'student_count': enrolled_count,
                    'students_count': enrolled_count,
                    'total_students': enrolled_count,
                    'is_adviser': True,
                })

        return Response(classes_data, status=status.HTTP_200_OK)


MyAssignedClassesAPIView = ClassListAPIView


class FacultyClassroomListAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        section_id = request.query_params.get('section_id') or request.query_params.get('section')
        today = timezone.localdate()
        user = request.user
        faculty = resolve_faculty_for_user(user)
        is_admin = is_leadership_role(user) or user.is_superuser

        if section_id:
            if not is_admin and faculty:
                is_authorized = (
                    Section.objects.filter(id=section_id, adviser=faculty).exists()
                    or Schedule.objects.filter(section_id=section_id, faculty=faculty).exists()
                )
                if not is_authorized:
                    return Response([], status=status.HTTP_200_OK)

            students = (
                Student.objects.filter(
                    enrollments__section_id=section_id,
                    enrollments__status='ENROLLED',
                    is_active=True
                )
                .distinct()
                .order_by('last_name', 'first_name')
            )

            today_logs = dict(
                SubjectAttendanceLog.objects.filter(
                    student__in=students,
                    attendance_date=today
                ).values_list('student_id', 'status')
            )

            data = [{
                'id': s.id,
                'lrn': str(s.lrn).strip(),
                'name': format_full_student_name(s),
                'full_name': format_full_student_name(s),
                'first_name': getattr(s, 'first_name', ''),
                'last_name': getattr(s, 'last_name', ''),
                'sex': getattr(s, 'gender', None) or getattr(s, 'sex', ''),
                'gender': getattr(s, 'gender', None) or getattr(s, 'sex', ''),
                'photo_url': safe_photo_url(getattr(s, 'photo', None), request),
                'attendance_status': today_logs.get(s.id, 'UNSCANNED'),
                'parent_contact': getattr(s, 'parent_contact', '') or '',
                'qr_token': str(getattr(s, 'qr_token', '') or '').strip(),
                'rfid_uid': str(getattr(s, 'rfid_uid', '') or '').strip(),
            } for s in students]
            return Response(data, status=status.HTTP_200_OK)

        if is_admin:
            schedules = Schedule.objects.all().select_related('section', 'subject', 'faculty').order_by('start_time')
        elif faculty:
            schedules = (
                Schedule.objects.filter(Q(faculty=faculty) | Q(section__adviser=faculty))
                .select_related('section', 'subject', 'faculty')
                .distinct()
                .order_by('start_time')
            )
        else:
            return Response([], status=status.HTTP_200_OK)

        student_list = []
        seen_section_ids = set()

        for sched in schedules:
            sec = sched.section
            if not sec:
                continue

            students = (
                Student.objects.filter(
                    enrollments__section=sec,
                    enrollments__status='ENROLLED',
                    is_active=True
                )
                .distinct()
                .order_by('last_name', 'first_name')
            )

            today_logs = dict(
                SubjectAttendanceLog.objects.filter(
                    schedule=sched,
                    attendance_date=today
                ).values_list('student_id', 'status')
            )

            items = [{
                'id': s.id,
                'lrn': str(s.lrn).strip(),
                'full_name': format_full_student_name(s),
                'name': format_full_student_name(s),
                'sex': getattr(s, 'gender', None) or getattr(s, 'sex', ''),
                'gender': getattr(s, 'gender', None) or getattr(s, 'sex', ''),
                'photo_url': safe_photo_url(getattr(s, 'photo', None), request),
                'attendance_status': today_logs.get(s.id, 'UNSCANNED'),
                'qr_token': str(getattr(s, 'qr_token', '') or '').strip(),
                'rfid_uid': str(getattr(s, 'rfid_uid', '') or '').strip(),
                'parent_contact': getattr(s, 'parent_contact', '') or '',
            } for s in students]

            start_str = str(sched.start_time)[:5] if getattr(sched, 'start_time', None) else ''
            end_str = str(sched.end_time)[:5] if getattr(sched, 'end_time', None) else ''
            room_str = getattr(sec, 'room_number', '') or getattr(sched, 'room_number', '')
            subj_title = getattr(sched.subject, 'title', '') if sched.subject else ''

            student_list.append({
                'schedule_id': sched.id,
                'section_id': sec.id,
                'section_name': sec.name,
                'subject_name': subj_title,
                'subject_title': subj_title,
                'subject_code': getattr(sched.subject, 'code', '') if sched.subject else '',
                'room': room_str,
                'room_number': room_str,
                'start_time': start_str,
                'end_time': end_str,
                'total_students': len(items),
                'students': items,
            })
            seen_section_ids.add(sec.id)

        return Response(student_list, status=status.HTTP_200_OK)


StudentListAPIView = FacultyClassroomListAPIView
FacultyClassroomRosterAPIView = FacultyClassroomListAPIView


class ClassroomBatchScanAPIView(APIView):
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
        processed_records = []
        now_time_str = timezone.localtime().strftime('%I:%M:%S %p')

        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        gate_in_students = set(
            StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                direction='IN'
            ).values_list('student_id', flat=True)
        )

        gate_out_students = set(
            StudentGateLog.objects.filter(
                scan_time__gte=today_start,
                scan_time__lte=today_end,
                direction='OUT'
            ).values_list('student_id', flat=True)
        )

        for item in serializer.validated_data['scans']:
            raw_token = str(item['qr_token']).strip().replace('\r', '').replace('\n', '')[:64]
            target_status = str(item.get('status', 'PRESENT')).upper()

            st = Student.objects.filter(
                Q(qr_token=raw_token) | Q(rfid_uid__iexact=raw_token) | Q(lrn=raw_token),
                is_active=True
            ).first()

            if not st:
                continue

            sec_to_check = sched.section if sched else target_section
            is_enrolled = Enrollment.objects.filter(
                student=st,
                section=sec_to_check,
                status='ENROLLED'
            ).exists()

            is_anomaly = False
            anomaly_remarks = 'Classroom attendance verified.'
            final_status = target_status

            if not is_enrolled:
                is_anomaly = True
                final_status = 'UNVERIFIED'
                anomaly_remarks = 'Student enrolled in a different class section.'
            elif st.id not in gate_in_students:
                is_anomaly = True
                final_status = 'UNVERIFIED'
                anomaly_remarks = 'No school gate entry log found for today.'
            elif st.id in gate_out_students:
                is_anomaly = True
                final_status = 'CUTTING'
                anomaly_remarks = 'Student already recorded exiting school gate.'

            if sched:
                SubjectAttendanceLog.objects.update_or_create(
                    student=st,
                    schedule=sched,
                    attendance_date=today,
                    defaults={
                        'faculty': sched.faculty or resolve_faculty_for_user(request.user),
                        'status': final_status,
                        'scanned_at': timezone.now(),
                    }
                )

            if sec_to_check and final_status in ['PRESENT', 'LATE']:
                DailyAttendanceSummary.objects.update_or_create(
                    student=st,
                    attendance_date=today,
                    defaults={
                        'section': sec_to_check,
                        'status': final_status,
                        'remarks': 'CLASSROOM_SCAN',
                    }
                )

            processed_records.append({
                'student_id': st.id,
                'name': format_full_student_name(st),
                'lrn': str(st.lrn),
                'rfid_uid': getattr(st, 'rfid_uid', '') or '',
                'photo_url': safe_photo_url(getattr(st, 'photo', None), request),
                'parent_contact': getattr(st, 'parent_contact', '') or '',
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