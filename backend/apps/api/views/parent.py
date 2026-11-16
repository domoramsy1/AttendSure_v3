"""
AttendSure V3 - Parent Mobile App Portal & Push Notification Views
File: backend/apps/api/views/parent.py
"""

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    AppNotification,
    DailyAttendanceSummary,
    Enrollment,
    GatePass,
    Student,
    SubjectAttendanceLog,
)
from apps.academics.models.people import normalize_ph_phone
from .common import format_deduped_section_label, format_full_student_name, safe_photo_url


class ParentPortalAPIView(APIView):
    """
    Returns real-time classroom attendance, exit passes, and mobile push alerts
    for the children linked to the logged-in parent mobile app account.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        today = timezone.localdate()
        profile = getattr(user, 'profile', None)
        phone = normalize_ph_phone(getattr(profile, 'phone_number', '') if profile else '')

        if phone:
            Student.objects.filter(parent_contact=phone, parent_user__isnull=True).update(parent_user=user)

        children_qs = Student.objects.filter(parent_user=user, is_active=True).order_by('first_name')
        children = list(children_qs)
        child_ids = [c.id for c in children]

        enrollments_map = {
            enr.student_id: enr
            for enr in Enrollment.objects.filter(
                student_id__in=child_ids,
                status='ENROLLED',
            ).select_related('section', 'section__grade_level', 'section__adviser')
        }

        daily_map = {
            ds.student_id: ds
            for ds in DailyAttendanceSummary.objects.filter(
                student_id__in=child_ids,
                attendance_date=today,
            )
        }

        subject_logs_by_child = {}
        for log in (
            SubjectAttendanceLog.objects.filter(
                student_id__in=child_ids,
                attendance_date=today,
            )
            .select_related('schedule__subject', 'faculty')
            .order_by('-scanned_at')
        ):
            subject_logs_by_child.setdefault(log.student_id, []).append({
                'id': log.id,
                'subject_code': log.schedule.subject.code if (log.schedule and log.schedule.subject) else 'CLASS',
                'subject_title': log.schedule.subject.title if (log.schedule and log.schedule.subject) else 'Class',
                'faculty_name': log.faculty.full_name if log.faculty else '',
                'status': log.status,
                'scanned_at': timezone.localtime(log.scanned_at).strftime('%I:%M %p') if log.scanned_at else '',
            })

        active_passes_by_child = {}
        for gp in GatePass.objects.filter(
            student_id__in=child_ids,
        ).select_related('issued_by').order_by('-created_at')[:20]:
            active_passes_by_child.setdefault(gp.student_id, []).append({
                'id': gp.id,
                'pass_number': gp.pass_number,
                'pass_type': gp.pass_type,
                'reason': gp.reason,
                'status': gp.status,
                'issued_by': gp.issued_by.full_name if gp.issued_by else 'Adviser',
                'valid_from': timezone.localtime(gp.valid_from).strftime('%I:%M %p') if gp.valid_from else '',
                'valid_to': timezone.localtime(gp.valid_to).strftime('%I:%M %p') if gp.valid_to else '',
            })

        children_data = []
        for child in children:
            enr = enrollments_map.get(child.id)
            sec = enr.section if enr else None
            grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
            daily = daily_map.get(child.id)

            children_data.append({
                'id': child.id,
                'lrn': child.lrn,
                'first_name': child.first_name,
                'last_name': child.last_name,
                'full_name': format_full_student_name(child),
                'sex': child.sex,
                'photo_url': safe_photo_url(child.photo, request),
                'section': format_deduped_section_label(grade_name, sec.name if sec else 'Unassigned'),
                'adviser_name': sec.adviser.full_name if (sec and sec.adviser) else '',
                'today_status': daily.status if daily else 'UNSCANNED',
                'today_remarks': daily.remarks if daily else 'No classroom scans recorded yet today.',
                'subject_scans_today': subject_logs_by_child.get(child.id, []),
                'exit_passes': active_passes_by_child.get(child.id, []),
            })

        notifications = list(
            AppNotification.objects.filter(
                Q(recipient=user) | Q(student_id__in=child_ids)
            )
            .select_related('student')
            .order_by('-created_at')[:50]
        )
        unread_count = sum(1 for n in notifications if not n.is_read)

        return Response({
            'parent_username': user.username,
            'parent_name': user.get_full_name() or user.username,
            'phone_number': phone,
            'children_count': len(children_data),
            'children': children_data,
            'unread_notifications': unread_count,
            'notifications': [
                {
                    'id': n.id,
                    'student_id': n.student_id,
                    'student_name': n.student.full_name if n.student else '',
                    'title': n.title,
                    'message': n.message,
                    'category': n.category,
                    'is_read': n.is_read,
                    'created_at': timezone.localtime(n.created_at).strftime('%Y-%m-%d %I:%M %p'),
                }
                for n in notifications
            ],
        }, status=status.HTTP_200_OK)


class MarkNotificationsReadAPIView(APIView):
    """Marks mobile app notifications as read for the authenticated parent or faculty user."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        notif_ids = request.data.get('notification_ids') or request.data.get('ids')
        qs = AppNotification.objects.filter(recipient=request.user, is_read=False)
        if isinstance(notif_ids, list) and notif_ids:
            clean_ids = [int(i) for i in notif_ids if str(i).isdigit()]
            qs = qs.filter(id__in=clean_ids)

        updated = qs.update(is_read=True)
        return Response({'success': True, 'marked_read_count': updated}, status=status.HTTP_200_OK)