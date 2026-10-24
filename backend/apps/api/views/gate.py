from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import StudentGateLog, FacultyGateLog
from .common import (
    get_user_role,
    is_regular_teacher,
    resolve_faculty_for_user,
    get_teacher_student_ids,
    format_full_student_name,
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
                'scan_time': l.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
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
                    'scan_time': f_log.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'),
                    'raw_time': f_log.scan_time.isoformat(),
                })
            logs.sort(key=lambda x: x['raw_time'], reverse=True)

        return Response(logs[:100], status=status.HTTP_200_OK)


__all__ = ['GateLogsAPIView']