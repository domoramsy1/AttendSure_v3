"""
AttendSure V3 - Parent & Faculty Direct Chat API
File: backend/apps/api/views/chat.py
"""

from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academics.models import (
    Enrollment,
    FacultyProfile,
    ParentFacultyMessage,
    Schedule,
    Student,
)
from apps.api.services.push_service import send_push_to_user
from .common import (
    format_deduped_section_label,
    format_full_student_name,
    get_faculty_student_ids,
    get_user_role,
    is_leadership_role,
    resolve_faculty_for_user,
    safe_photo_url,
)


def _resolve_faculty_for_student(student: Student) -> FacultyProfile | None:
    enr = (
        Enrollment.objects.filter(student=student, status='ENROLLED')
        .select_related('section', 'section__adviser')
        .order_by('-id')
        .first()
    )
    if enr and enr.section:
        if enr.section.adviser:
            return enr.section.adviser
        sched = (
            Schedule.objects.filter(section=enr.section, is_active=True, faculty__isnull=False)
            .select_related('faculty')
            .first()
        )
        if sched and sched.faculty:
            return sched.faculty
    return FacultyProfile.objects.filter(is_active=True).order_by('id').first()


class ChatThreadsAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        threads = []

        if role == 'PARENT':
            children = list(Student.objects.filter(parent_user=user, is_active=True).order_by('first_name'))
            child_ids = [c.id for c in children]
            enrollments = {
                e.student_id: e.section
                for e in Enrollment.objects.filter(student_id__in=child_ids, status='ENROLLED')
                .select_related('section', 'section__grade_level', 'section__adviser')
            }

            for child in children:
                sec = enrollments.get(child.id)
                faculty = (sec.adviser if sec and sec.adviser else None) or _resolve_faculty_for_student(child)
                if not faculty:
                    continue

                msgs = ParentFacultyMessage.objects.filter(student=child, faculty=faculty, parent=user)
                last_msg = msgs.order_by('-created_at').first()
                unread_count = msgs.filter(is_read=False).exclude(sender=user).count()

                grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
                threads.append({
                    'thread_key': f"{child.id}-{faculty.id}",
                    'student_id': child.id,
                    'student_name': format_full_student_name(child),
                    'student_lrn': child.lrn,
                    'section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                    'faculty_id': faculty.id,
                    'faculty_name': faculty.full_name,
                    'parent_id': user.id,
                    'parent_name': user.get_full_name() or user.username,
                    'photo_url': safe_photo_url(faculty.photo, request),
                    'last_message': last_msg.body if last_msg else 'Tap to message class adviser',
                    'last_time': timezone.localtime(last_msg.created_at).strftime('%I:%M %p') if last_msg else '',
                    'unread_count': unread_count,
                })
        else:
            faculty = resolve_faculty_for_user(user)
            is_leader = bool(user.is_superuser or is_leadership_role(user))

            if is_leader and not faculty:
                students_qs = Student.objects.filter(is_active=True, parent_user__isnull=False)
            elif faculty:
                allowed_ids = get_faculty_student_ids(faculty)
                students_qs = Student.objects.filter(id__in=allowed_ids, is_active=True, parent_user__isnull=False)
            else:
                students_qs = Student.objects.none()

            students = list(students_qs.select_related('parent_user').order_by('last_name', 'first_name')[:150])
            student_ids = [s.id for s in students]
            enrollments = {
                e.student_id: e.section
                for e in Enrollment.objects.filter(student_id__in=student_ids, status='ENROLLED')
                .select_related('section', 'section__grade_level')
            }

            for st in students:
                target_fac = faculty or _resolve_faculty_for_student(st)
                if not target_fac or not st.parent_user:
                    continue

                msgs = ParentFacultyMessage.objects.filter(student=st, faculty=target_fac, parent=st.parent_user)
                last_msg = msgs.order_by('-created_at').first()
                unread_count = msgs.filter(is_read=False).exclude(sender=user).count()

                sec = enrollments.get(st.id)
                grade_name = sec.grade_level.name if (sec and sec.grade_level) else ''
                parent_label = st.guardian_name or st.mother_maiden_name or st.father_name or st.parent_user.get_full_name() or st.parent_user.username

                threads.append({
                    'thread_key': f"{st.id}-{target_fac.id}",
                    'student_id': st.id,
                    'student_name': format_full_student_name(st),
                    'student_lrn': st.lrn,
                    'section': format_deduped_section_label(grade_name, sec.name if sec else ''),
                    'faculty_id': target_fac.id,
                    'faculty_name': target_fac.full_name,
                    'parent_id': st.parent_user.id,
                    'parent_name': parent_label,
                    'photo_url': safe_photo_url(st.photo, request),
                    'last_message': last_msg.body if last_msg else 'No messages yet',
                    'last_time': timezone.localtime(last_msg.created_at).strftime('%I:%M %p') if last_msg else '',
                    'unread_count': unread_count,
                })

        threads.sort(key=lambda t: (t['unread_count'] > 0, bool(t['last_time'])), reverse=True)
        return Response({'threads': threads, 'total': len(threads)}, status=status.HTTP_200_OK)


class ChatMessagesAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def _authorize_thread(self, user, student_id, faculty_id):
        student = Student.objects.select_related('parent_user').filter(id=student_id, is_active=True).first()
        if not student:
            return None, None, None, 'Student not found.'

        faculty = FacultyProfile.objects.filter(id=faculty_id, is_active=True).first() if faculty_id else None
        if not faculty:
            faculty = _resolve_faculty_for_student(student)
        if not faculty:
            return None, None, None, 'Assigned faculty not found.'

        role = get_user_role(user)
        if role == 'PARENT':
            if student.parent_user_id != user.id:
                return None, None, None, 'Access denied: This student is not linked to your parent account.'
            return student, faculty, user, None

        if not student.parent_user:
            return None, None, None, 'This student does not have a registered parent app account yet.'

        is_leader = bool(user.is_superuser or is_leadership_role(user))
        own_fac = resolve_faculty_for_user(user)
        if not is_leader:
            if not own_fac or student.id not in get_faculty_student_ids(own_fac):
                return None, None, None, 'Access denied: Student is not in your class list.'

        return student, faculty, student.parent_user, None

    def get(self, request):
        student_id = request.query_params.get('student_id')
        faculty_id = request.query_params.get('faculty_id')
        if not student_id or not str(student_id).isdigit():
            return Response({'error': 'Valid student_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        student, faculty, parent_user, err = self._authorize_thread(request.user, int(student_id), faculty_id)
        if err:
            return Response({'error': err}, status=status.HTTP_403_FORBIDDEN)

        qs = ParentFacultyMessage.objects.filter(
            student=student,
            faculty=faculty,
            parent=parent_user,
        ).select_related('sender').order_by('created_at')

        qs.filter(is_read=False).exclude(sender=request.user).update(is_read=True)

        messages = [
            {
                'id': msg.id,
                'sender_id': msg.sender_id,
                'sender_name': msg.sender.get_full_name() or msg.sender.username,
                'is_mine': msg.sender_id == request.user.id,
                'body': msg.body,
                'is_read': msg.is_read,
                'created_at': timezone.localtime(msg.created_at).strftime('%Y-%m-%d %I:%M %p'),
                'time_only': timezone.localtime(msg.created_at).strftime('%I:%M %p'),
            }
            for msg in qs[:200]
        ]

        return Response({
            'student_id': student.id,
            'student_name': format_full_student_name(student),
            'faculty_id': faculty.id,
            'faculty_name': faculty.full_name,
            'messages': messages,
        }, status=status.HTTP_200_OK)

    @transaction.atomic
    def post(self, request):
        student_id = request.data.get('student_id')
        faculty_id = request.data.get('faculty_id')
        body = str(request.data.get('body') or request.data.get('message') or '').strip()

        if not student_id or not str(student_id).isdigit():
            return Response({'error': 'Valid student_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not body:
            return Response({'error': 'Message text cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(body) > 1000:
            return Response({'error': 'Message cannot exceed 1000 characters.'}, status=status.HTTP_400_BAD_REQUEST)

        student, faculty, parent_user, err = self._authorize_thread(request.user, int(student_id), faculty_id)
        if err:
            return Response({'error': err}, status=status.HTTP_403_FORBIDDEN)

        msg = ParentFacultyMessage.objects.create(
            student=student,
            faculty=faculty,
            parent=parent_user,
            sender=request.user,
            body=body,
        )

        recipient_user = faculty.user if request.user.id == parent_user.id else parent_user
        sender_label = request.user.get_full_name() or request.user.username

        if recipient_user:
            transaction.on_commit(
                lambda: send_push_to_user(
                    user=recipient_user,
                    title=f"New Message ({student.first_name}): {sender_label}",
                    message=body[:180],
                    category='ANNOUNCEMENT',
                    student=student,
                    extra_data={'type': 'CHAT', 'student_id': student.id, 'faculty_id': faculty.id},
                )
            )

        return Response({
            'id': msg.id,
            'sender_id': msg.sender_id,
            'sender_name': sender_label,
            'is_mine': True,
            'body': msg.body,
            'is_read': False,
            'created_at': timezone.localtime(msg.created_at).strftime('%Y-%m-%d %I:%M %p'),
            'time_only': timezone.localtime(msg.created_at).strftime('%I:%M %p'),
        }, status=status.HTTP_201_CREATED)
