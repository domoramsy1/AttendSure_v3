"""
AttendSure V3 - Monitoring, Geofence Immunity, DTR Lock & Activity Engine
File: backend/apps/api/views/monitoring.py
"""

import json
import logging
from datetime import datetime
from django.utils import timezone
from django.core.cache import cache
from django.db.models import Q
from django.apps import apps
from django.contrib.admin.models import LogEntry
from django.db.models.fields.json import JSONField

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions, viewsets
from rest_framework.throttling import UserRateThrottle

from apps.academics.models import (
    Schedule,
    StudentGateLog,
    SubjectAttendanceLog,
    GatePass,
    Enrollment,
    FacultyProfile,
    AuditLog,
)
from apps.common.utils import (
    get_user_role,
    format_full_student_name,
    safe_photo_url,
)
from .common import resolve_faculty_for_user

logger = logging.getLogger(__name__)

# Prevent driver TypeError on pre-parsed JSON list/dict fields
_original_from_db_value = getattr(JSONField, 'from_db_value', None)

def _safe_from_db_value(self, value, expression, connection):
    if value is None or isinstance(value, (dict, list)):
        return value
    if isinstance(value, (str, bytes, bytearray)):
        try:
            return json.loads(value, cls=self.decoder)
        except Exception:
            return value
    return value

JSONField.from_db_value = _safe_from_db_value


def get_client_ip(request) -> str:
    cf_ip = request.META.get('HTTP_CF_CONNECTING_IP')
    if cf_ip:
        return cf_ip.strip()
    x_forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded:
        return x_forwarded.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR') or '127.0.0.1'


def get_dynamic_activity_log_model():
    for app_name in ['academics', 'core', 'api', 'common']:
        try:
            m = apps.get_model(app_name, 'ActivityLog')
            if m:
                return m
        except LookupError:
            continue
    return None


class LoafingMonitoringAPIView(APIView):
    """
    Monitors campus presence. Faculty with approved gate passes are granted immunity
    from loafing penalties during active lecture hours.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user)

        if not (user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'FACULTY')):
            return Response({'error': 'Unauthorized access.'}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.localdate()
        now_time = timezone.localtime().time()
        now_dt = timezone.now()

        today_start = timezone.make_aware(datetime.combine(today, datetime.min.time()))
        today_end = timezone.make_aware(datetime.combine(today, datetime.max.time()))

        active_student_passes = set(
            GatePass.objects.filter(
                student__isnull=False,
                status='ACTIVE',
                valid_from__lte=now_dt,
                valid_to__gte=now_dt
            ).values_list('student_id', flat=True)
        )

        active_faculty_passes = set(
            GatePass.objects.filter(
                faculty__isnull=False,
                status='ACTIVE',
                valid_from__lte=now_dt,
                valid_to__gte=now_dt
            ).values_list('faculty_id', flat=True)
        )

        gate_in_set = set(
            StudentGateLog.objects.filter(scan_time__gte=today_start, scan_time__lte=today_end, direction='IN')
            .values_list('student_id', flat=True)
        )

        gate_out_set = set(
            StudentGateLog.objects.filter(scan_time__gte=today_start, scan_time__lte=today_end, direction='OUT')
            .values_list('student_id', flat=True)
        )

        current_schedules = list(
            Schedule.objects.select_related('section', 'subject', 'faculty').filter(start_time__lte=now_time)
        )
        verified_set = set(
            SubjectAttendanceLog.objects.filter(attendance_date=today, status__in=['PRESENT', 'LATE'])
            .values_list('student_id', 'schedule_id')
        )

        anomalies = []

        # Student cutting detection
        for sched in current_schedules:
            sec = sched.section
            if not sec:
                continue

            enrollments = Enrollment.objects.filter(section=sec, status='ENROLLED').select_related('student')
            for enr in enrollments:
                st = enr.student
                is_in_gate = st.id in gate_in_set
                is_out_gate = st.id in gate_out_set
                has_pass = st.id in active_student_passes
                is_scanned_in_class = (st.id, sched.id) in verified_set

                if is_in_gate and not is_out_gate and not is_scanned_in_class and not has_pass:
                    anomalies.append({
                        'category': 'STUDENT',
                        'anomaly_type': 'CUTTING_CLASS',
                        'severity': 'HIGH',
                        'person_id': st.id,
                        'name': format_full_student_name(st),
                        'section': sec.name,
                        'details': 'Student logged at gate but absent from scheduled subject without pass.',
                        'detected_at': timezone.localtime().strftime('%I:%M %p'),
                    })

                elif is_out_gate and not has_pass:
                    anomalies.append({
                        'category': 'STUDENT',
                        'anomaly_type': 'UNAUTHORIZED_EXIT',
                        'severity': 'CRITICAL',
                        'person_id': st.id,
                        'name': format_full_student_name(st),
                        'section': sec.name,
                        'details': 'Student exited school premises during class hours without gate pass.',
                        'detected_at': timezone.localtime().strftime('%I:%M %p'),
                    })

        # Faculty presence check
        active_lecture_schedules = Schedule.objects.select_related('faculty', 'subject').filter(
            start_time__lte=now_time,
            end_time__gte=now_time,
            faculty__isnull=False
        )

        for sched in active_lecture_schedules:
            fac = sched.faculty
            if not fac:
                continue

            if fac.id in active_faculty_passes:
                continue

            telemetry = cache.get(f"attendsure_faculty_telemetry_{fac.id}") or {}
            presence = telemetry.get('presence_status', 'OFF_CAMPUS')

            if presence == 'OFF_CAMPUS':
                anomalies.append({
                    'category': 'FACULTY',
                    'anomaly_type': 'LOAFING_UNEXCUSED_OFF_CAMPUS',
                    'severity': 'HIGH',
                    'person_id': fac.id,
                    'identifier': fac.employee_id,
                    'name': fac.full_name,
                    'details': f"Faculty off-campus during lecture ({sched.start_time.strftime('%I:%M %p')} - {sched.end_time.strftime('%I:%M %p')}) with no active travel pass.",
                    'detected_at': timezone.localtime().strftime('%I:%M %p'),
                    'is_reconciled': False,
                })

        return Response({
            'success': True,
            'timestamp': timezone.localtime().strftime('%I:%M:%S %p'),
            'total_anomalies': len(anomalies),
            'anomalies': anomalies,
        }, status=status.HTTP_200_OK)


class DTRLockCheckAPIView(APIView):
    """
    Blocks downloading or printing Civil Service Form No. 48 if the faculty
    member has an unresolved loafing violation for that month.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        faculty_id = request.query_params.get('faculty_id')
        month = request.query_params.get('month', timezone.now().month)
        year = request.query_params.get('year', timezone.now().year)

        fac = None
        if faculty_id:
            fac = FacultyProfile.objects.filter(id=faculty_id).first()
        else:
            fac = resolve_faculty_for_user(request.user)
            if not fac:
                fac = FacultyProfile.objects.filter(account=request.user).first()

        if not fac:
            return Response({'error': 'Faculty profile not found.'}, status=status.HTTP_404_NOT_FOUND)

        unresolved_loafing = AuditLog.objects.filter(
            table_name='FACULTY_LOAFING',
            record_id=str(fac.id),
            action='UNRESOLVED_VIOLATION',
            created_at__year=year,
            created_at__month=month
        )

        is_locked = unresolved_loafing.exists()

        return Response({
            'faculty_id': fac.id,
            'faculty_name': fac.full_name,
            'is_locked': is_locked,
            'can_print_dtr': not is_locked,
            'unresolved_count': unresolved_loafing.count(),
            'violations': [
                {
                    'id': v.id,
                    'date': v.created_at.strftime('%B %d, %Y - %I:%M %p'),
                    'details': v.details,
                    'defense_statement': v.description or 'No explanation submitted yet.',
                }
                for v in unresolved_loafing
            ],
            'lock_reason': (
                "Civil Service Form 48 is locked. You have an unresolved loafing notice. "
                "Submit your explanation so the Principal can reconcile this incident."
                if is_locked else None
            )
        }, status=status.HTTP_200_OK)


class LoafingReconciliationAPIView(APIView):
    """
    Allows faculty to submit defense statements, and allows the Principal/Admin
    to reconcile the incident as False Alarm, System Error, or Official Duty.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        role = get_user_role(user)
        action_type = request.data.get('action')
        violation_id = request.data.get('violation_id')

        log_entry = AuditLog.objects.filter(id=violation_id, table_name='FACULTY_LOAFING').first()
        if not log_entry:
            return Response({'error': 'Violation record not found.'}, status=status.HTTP_404_NOT_FOUND)

        if action_type == 'SUBMIT_DEFENSE':
            statement = request.data.get('defense_statement', '').strip()
            if not statement:
                return Response({'error': 'Please provide an explanation.'}, status=status.HTTP_400_BAD_REQUEST)

            log_entry.description = statement
            log_entry.save(update_fields=['description'])
            return Response({'success': True, 'message': 'Defense statement submitted to administration.'}, status=status.HTTP_200_OK)

        if action_type == 'RESOLVE_FLAG':
            if not (user.is_superuser or role in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL']):
                return Response({'error': 'Only the School Principal can reconcile loafing violations.'}, status=status.HTTP_403_FORBIDDEN)

            resolution = request.data.get('resolution')
            admin_notes = request.data.get('notes', 'Reviewed and reconciled by Principal.')

            if resolution in ['FALSE_ALARM', 'SYSTEM_ERROR', 'OFFICIAL_EXCUSED']:
                log_entry.action = f'RESOLVED_{resolution}'
                log_entry.details = f"Reconciled by {user.get_full_name()}: {admin_notes}"
                log_entry.save()
                return Response({'success': True, 'message': f'Violation resolved as {resolution}. DTR unlocked.'}, status=status.HTTP_200_OK)

            elif resolution == 'CONFIRMED':
                log_entry.action = 'CONFIRMED_LOAFING'
                log_entry.details = f"Confirmed violation by {user.get_full_name()}: {admin_notes}"
                log_entry.save()
                return Response({'success': True, 'message': 'Violation confirmed on record.'}, status=status.HTTP_200_OK)

        return Response({'error': 'Invalid action requested.'}, status=status.HTTP_400_BAD_REQUEST)


class ActivityLogAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def get(self, request):
        user = request.user
        role = get_user_role(user)
        is_admin = bool(user.is_superuser or role in ('ADMIN', 'SUPERADMIN', 'PRINCIPAL'))

        search_query = request.query_params.get('search', '').strip()
        action_filter = request.query_params.get('action', 'ALL').strip().upper()
        date_filter = request.query_params.get('date', '').strip()

        records = []
        log_model = get_dynamic_activity_log_model()

        if log_model:
            try:
                model_fields = {f.name for f in log_model._meta.fields}
                order_col = '-timestamp' if 'timestamp' in model_fields else ('-created_at' if 'created_at' in model_fields else '-id')

                qs = log_model.objects.all()
                if 'account' in model_fields and not is_admin:
                    qs = qs.filter(account=user)
                elif 'user' in model_fields and not is_admin:
                    qs = qs.filter(user=user)

                if action_filter != 'ALL' and 'action' in model_fields:
                    qs = qs.filter(action__iexact=action_filter)

                if date_filter:
                    try:
                        d_obj = datetime.strptime(date_filter, '%Y-%m-%d').date()
                        date_field = 'timestamp__date' if 'timestamp' in model_fields else ('created_at__date' if 'created_at' in model_fields else None)
                        if date_field:
                            qs = qs.filter(**{date_field: d_obj})
                    except ValueError:
                        pass

                if search_query:
                    search_q = Q()
                    if 'details' in model_fields:
                        search_q |= Q(details__icontains=search_query)
                    if 'description' in model_fields:
                        search_q |= Q(description__icontains=search_query)
                    if 'action' in model_fields:
                        search_q |= Q(action__icontains=search_query)
                    qs = qs.filter(search_q)

                for item in list(qs.order_by(order_col)[:250]):
                    actor_name = "System Automated"
                    item_user = getattr(item, 'account', None) or getattr(item, 'user', None)
                    if item_user:
                        full = f"{item_user.first_name} {item_user.last_name}".strip()
                        actor_name = full if full else item_user.username
                    elif hasattr(item, 'user_name') and item.user_name:
                        actor_name = str(item.user_name)

                    act = getattr(item, 'action', 'SYSTEM_EVENT') or 'SYSTEM_EVENT'
                    mod = getattr(item, 'module', 'CORE') or getattr(item, 'category', 'CORE') or 'CORE'
                    det = getattr(item, 'details', '') or getattr(item, 'description', '') or 'System operation recorded.'
                    ip_addr = getattr(item, 'ip_address', '—') or '—'
                    st = getattr(item, 'status', 'SUCCESS') or 'SUCCESS'
                    dt = getattr(item, 'timestamp', None) or getattr(item, 'created_at', None) or timezone.now()
                    local_dt = timezone.localtime(dt)

                    records.append({
                        'id': item.id,
                        'timestamp': local_dt.strftime('%Y-%m-%d %I:%M:%S %p'),
                        'time_only': local_dt.strftime('%I:%M:%S %p'),
                        'date_only': local_dt.strftime('%Y-%m-%d'),
                        'user': actor_name,
                        'action': str(act).upper(),
                        'module': str(mod).upper(),
                        'details': str(det),
                        'ip_address': str(ip_addr),
                        'status': str(st).upper(),
                    })
            except Exception as e:
                logger.error(f"[ActivityLogAPIView] Query error: {e}")

        if not records:
            try:
                log_entries = LogEntry.objects.select_related('user', 'content_type').order_by('-action_time')
                if not is_admin:
                    log_entries = log_entries.filter(user=user)

                if date_filter:
                    try:
                        d_obj = datetime.strptime(date_filter, '%Y-%m-%d').date()
                        log_entries = log_entries.filter(action_time__date=d_obj)
                    except ValueError:
                        pass

                action_map = {1: 'ADD', 2: 'CHANGE', 3: 'DELETE'}

                for entry in list(log_entries[:250]):
                    local_dt = timezone.localtime(entry.action_time)
                    action_name = action_map.get(entry.action_flag, 'UPDATE')

                    if action_filter != 'ALL' and action_filter not in action_name:
                        continue

                    user_name = entry.user.get_full_name() or entry.user.username if entry.user else "System Admin"
                    model_name = entry.content_type.model.upper() if entry.content_type else "SYSTEM"
                    details_text = entry.change_message or f"Modified {entry.object_repr}"

                    if search_query:
                        if (
                            search_query.lower() not in user_name.lower()
                            and search_query.lower() not in model_name.lower()
                            and search_query.lower() not in details_text.lower()
                        ):
                            continue

                    records.append({
                        'id': entry.id,
                        'timestamp': local_dt.strftime('%Y-%m-%d %I:%M:%S %p'),
                        'time_only': local_dt.strftime('%I:%M:%S %p'),
                        'date_only': local_dt.strftime('%Y-%m-%d'),
                        'user': user_name,
                        'action': action_name,
                        'module': model_name,
                        'details': details_text,
                        'ip_address': 'Internal System',
                        'status': 'SUCCESS',
                    })
            except Exception as e:
                logger.error(f"[ActivityLogAPIView] Native log fallback notice: {e}")

        return Response({
            'success': True,
            'is_admin': is_admin,
            'total': len(records),
            'records': records,
            'results': records,
        }, status=status.HTTP_200_OK)

    def post(self, request):
        data = request.data or {}
        user = request.user
        log_model = get_dynamic_activity_log_model()

        action = str(data.get('action') or 'USER_OPERATION').strip().upper()
        module = str(data.get('module') or 'CORE').strip().upper()
        details = str(data.get('details') or '').strip()
        client_ip = get_client_ip(request)

        if log_model:
            try:
                model_fields = {f.name for f in log_model._meta.fields}
                kwargs = {}
                if 'account' in model_fields:
                    kwargs['account'] = user
                elif 'user' in model_fields:
                    kwargs['user'] = user

                if 'action' in model_fields:
                    kwargs['action'] = action
                if 'module' in model_fields:
                    kwargs['module'] = module
                if 'details' in model_fields:
                    kwargs['details'] = details
                elif 'description' in model_fields:
                    kwargs['description'] = details
                if 'ip_address' in model_fields:
                    kwargs['ip_address'] = client_ip
                if 'status' in model_fields:
                    kwargs['status'] = 'SUCCESS'

                log_model.objects.create(**kwargs)
            except Exception as e:
                logger.error(f"[ActivityLogAPIView] Create log error: {e}")

        return Response({'success': True, 'message': 'Activity recorded.'}, status=status.HTTP_201_CREATED)


class ActivityLogViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        view = ActivityLogAPIView()
        return view.get(request)

    def create(self, request):
        view = ActivityLogAPIView()
        return view.post(request)


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

        # 1. Resolve Advisory Section
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

        # 2. Fetch all scheduled subjects for this section today
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

        # 3. Fetch all enrolled students
        enrollments = Enrollment.objects.filter(
            section=section,
            status='ENROLLED',
            student__is_active=True
        ).select_related('student').order_by('student__last_name', 'student__first_name')

        students = [e.student for e in enrollments if e.student]
        student_ids = [s.id for s in students]

        # 4. Fetch today's subject attendance logs in one fast query
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

        # 5. Fetch gate logs to check physical campus presence
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

        # 6. Build the Student Attendance Matrix
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