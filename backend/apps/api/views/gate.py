import hmac
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import IoTKiosk, FacultyProfile, Student, FacultyGateLog, StudentGateLog, DailyAttendanceSummary
from .common import get_user_role, is_regular_teacher, resolve_faculty_for_user, get_teacher_student_ids, format_full_student_name
from apps.api.serializers import GateScanSerializer

class GateScanAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = GateScanSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        raw_id = data['raw_identifier']
        kiosk = IoTKiosk.objects.filter(kiosk_code=data['kiosk_code'], is_active=True).first()
        if not kiosk:
            return Response({'error': 'Kiosk invalid.'}, status=status.HTTP_403_FORBIDDEN)

        is_valid = kiosk.verify_secret(data['secret_key']) if hasattr(kiosk, 'verify_secret') else hmac.compare_digest(kiosk.secret_hash, data['secret_key'])
        if not is_valid:
            return Response({'error': 'Terminal auth failed.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        faculty = FacultyProfile.objects.filter(rfid_uid__iexact=raw_id, is_active=True).first()
        if faculty:
            rec = FacultyGateLog.objects.filter(faculty=faculty, scan_time__date=now.date()).order_by('-scan_time').first()
            dir_val = 'OUT' if rec and rec.direction == 'IN' else 'IN'
            FacultyGateLog.objects.create(faculty=faculty, kiosk=kiosk, scan_time=now, direction=dir_val, raw_identifier=raw_id)
            kiosk.last_ping = now
            kiosk.save(update_fields=['last_ping'])
            return Response({'success': True, 'person_type': 'STAFF', 'name': faculty.full_name, 'direction': dir_val}, status=status.HTTP_201_CREATED)

        student = Student.objects.filter(rfid_uid__iexact=raw_id, is_active=True).first()
        if student:
            rec = StudentGateLog.objects.filter(student=student, scan_time__date=now.date()).order_by('-scan_time').first()
            dir_val = 'OUT' if rec and rec.direction == 'IN' else 'IN'
            StudentGateLog.objects.create(student=student, kiosk=kiosk, scan_time=now, direction=dir_val, raw_identifier=raw_id)
            if dir_val == 'IN':
                enr = student.enrollments.filter(academic_year__is_active=True).first()
                if enr:
                    DailyAttendanceSummary.objects.update_or_create(student=student, attendance_date=now.date(), defaults={'section': enr.section, 'status': 'PRESENT', 'remarks': 'GATE_TAP'})
            kiosk.last_ping = now
            kiosk.save(update_fields=['last_ping'])
            return Response({'success': True, 'person_type': 'STUDENT', 'name': format_full_student_name(student), 'direction': dir_val}, status=status.HTTP_201_CREATED)

        return Response({'error': 'Badge not registered.'}, status=status.HTTP_404_NOT_FOUND)

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

        logs = [{
            'log_id': f"GL-STU-{l.id}", 'person_type': 'STUDENT', 'identifier': l.student.lrn,
            'name': format_full_student_name(l.student), 'direction': l.direction,
            'scan_time': l.scan_time.strftime('%b %d, %Y - %I:%M:%S %p'), 'raw_time': l.scan_time.isoformat()
        } for l in stu_qs]
        return Response(logs, status=status.HTTP_200_OK)
