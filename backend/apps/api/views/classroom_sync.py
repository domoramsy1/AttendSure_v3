"""
AttendSure V3 - Offline-First USB QR Batch Sync & Signed QR ID Card Generator
File: backend/apps/api/views/classroom_sync.py
"""

from datetime import datetime
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    DailyAttendanceSummary,
    Enrollment,
    Schedule,
    Student,
    SubjectAttendanceLog,
)
from apps.api.services.push_service import notify_student_parent
from apps.api.services.qr_security import parse_and_verify_qr_payload, sign_student_qr_payload
from .classroom import determine_scan_status
from .common import (
    format_deduped_section_label,
    format_full_student_name,
    is_leadership_role,
    resolve_faculty_for_user,
    safe_photo_url,
)


class OfflineQRBatchSyncAPIView(APIView):
    """
    Syncs USB QR scans queued locally on a faculty PC or laptop while offline,
    preserving exact original scan timestamps and preventing duplicates.
    """
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def post(self, request):
        user = request.user
        faculty = resolve_faculty_for_user(user)
        is_admin = bool(user.is_superuser or is_leadership_role(user))

        if not faculty and not is_admin:
            return Response(
                {'error': 'Only verified faculty and administrators can sync attendance.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        raw_items = request.data.get('scans') or []
        if not isinstance(raw_items, list) or not raw_items:
            return Response({'error': 'No offline QR scans provided.'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_entries = []
        lookup_tokens = set()

        for entry in raw_items[:500]:
            raw_code = str(entry.get('qr_token') or entry.get('code') or '').strip()
            token, is_sig_valid = parse_and_verify_qr_payload(raw_code)
            if not token or not is_sig_valid:
                continue
            lookup_tokens.add(token)
            parsed_entries.append({
                'token': token,
                'schedule_id': entry.get('schedule_id'),
                'scanned_at': parse_datetime(str(entry.get('scanned_at', ''))) or timezone.now(),
            })

        students = Student.objects.filter(
            Q(qr_token__in=lookup_tokens) | Q(lrn__in=lookup_tokens),
            is_active=True,
        )
        student_map = {}
        for st in students:
            if st.qr_token:
                student_map[st.qr_token] = st
            if st.lrn:
                student_map[str(st.lrn).strip()] = st

        student_ids = [st.id for st in students]
        enrollments_map = {
            enr.student_id: enr.section
            for enr in Enrollment.objects.filter(student_id__in=student_ids, status='ENROLLED')
            .select_related('section', 'section__grade_level')
        }

        synced_count = 0
        duplicate_count = 0
        rejected_count = len(raw_items) - len(parsed_entries)

        for item in parsed_entries:
            st = student_map.get(item['token'])
            sec = enrollments_map.get(st.id) if st else None
            if not st or not sec:
                rejected_count += 1
                continue

            sched_id = item['schedule_id']
            target_schedule = None
            if sched_id and str(sched_id).isdigit():
                target_schedule = Schedule.objects.filter(id=int(sched_id), section=sec, is_active=True).select_related('subject').first()
            if not target_schedule and faculty:
                target_schedule = Schedule.objects.filter(faculty=faculty, section=sec, is_active=True).select_related('subject').first()
            if not target_schedule:
                target_schedule = Schedule.objects.filter(section=sec, is_active=True).select_related('subject').order_by('start_time').first()

            if not target_schedule:
                rejected_count += 1
                continue

            scan_dt = item['scanned_at']
            if timezone.is_naive(scan_dt):
                scan_dt = timezone.make_aware(scan_dt, timezone.get_current_timezone())
            scan_date = timezone.localtime(scan_dt).date()

            computed_status = determine_scan_status(target_schedule, scan_dt)
            _, created = SubjectAttendanceLog.objects.get_or_create(
                student=st,
                schedule=target_schedule,
                attendance_date=scan_date,
                defaults={
                    'faculty': target_schedule.faculty or faculty,
                    'scanned_at': scan_dt,
                    'scan_method': 'QR',
                    'status': computed_status,
                },
            )

            if not created:
                duplicate_count += 1
                continue

            DailyAttendanceSummary.objects.update_or_create(
                student=st,
                attendance_date=scan_date,
                defaults={
                    'section': sec,
                    'status': computed_status,
                    'remarks': 'Synced from offline USB QR station.',
                },
            )
            synced_count += 1

            subj_title = target_schedule.subject.title if target_schedule.subject else 'Class'
            time_label = timezone.localtime(scan_dt).strftime('%I:%M %p')
            notify_student_parent(
                student=st,
                title=f'Class Attendance: {st.first_name} ({computed_status})',
                message=f'{st.first_name} {st.last_name} scanned into {subj_title} at {time_label}.',
                category='ATTENDANCE',
            )

        return Response({
            'success': True,
            'synced_count': synced_count,
            'duplicate_count': duplicate_count,
            'rejected_count': rejected_count,
            'message': f"Successfully synced {synced_count} offline QR scan(s).",
        }, status=status.HTTP_200_OK)

class SignedStudentQRCardAPIView(APIView):
    """Generates anti-clone HMAC-signed QR ID payloads for printing student cards."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        section_id = request.query_params.get('section_id')
        qs = Enrollment.objects.filter(status='ENROLLED', student__is_active=True).select_related(
            'student', 'section', 'section__grade_level'
        )
        if section_id and str(section_id).isdigit():
            qs = qs.filter(section_id=int(section_id))

        cards = []
        for enr in qs.order_by('student__last_name', 'student__first_name')[:500]:
            st = enr.student
            sec = enr.section
            grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
            cards.append({
                'student_id': st.id,
                'lrn': st.lrn,
                'full_name': format_full_student_name(st),
                'grade_section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                'qr_token': st.qr_token,
                'qr_payload': sign_student_qr_payload(st.lrn, st.qr_token),
                'photo_url': safe_photo_url(st.photo, request),
            })

        return Response({'cards': cards, 'total': len(cards)}, status=status.HTTP_200_OK)