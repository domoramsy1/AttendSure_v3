"""
AttendSure - Core API ViewSets (Full CRUD for Sections, Schedules, Students, Faculty, Rooms, GradeLevels)
File: backend/apps/api/views/viewsets.py
"""

import base64
import uuid
import re
import json
from pathlib import Path
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Q, Prefetch
from django.utils import timezone
from rest_framework import viewsets, filters, permissions, status, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied

from apps.academics.models import (
    Student,
    FacultyProfile,
    IoTKiosk,
    GatePass,
    Schedule,
    ScheduleDay,
    Subject,
    GradeLevel,
    SmsOutbox,
    Section,
    Enrollment,
    AcademicYear,
    FacultyGateLog,
)
from apps.api.serializers import (
    StudentSerializer,
    FacultyDropdownSerializer,
    IoTKioskSerializer,
    GatePassSerializer,
    ScheduleSerializer,
    SubjectSerializer,
    UserManagementSerializer,
    SmsOutboxSerializer,
)
from apps.api.pagination import StandardResultsSetPagination
from apps.api.permissions import IsSystemAdmin, IsAcademicManagerPermission
from .common import (
    get_user_role,
    is_regular_teacher,
    resolve_faculty_for_user,
    get_teacher_student_ids,
    get_teacher_section_ids,
    format_full_student_name,
    safe_photo_url,
)

User = get_user_model()
ROOM_STORE_PATH = Path(__file__).resolve().parent.parent.parent / 'rooms_store.json'


# ============================================================================
# SERIALIZERS
# ============================================================================

class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = '__all__'


class FacultyProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(read_only=True)
    presence_status = serializers.SerializerMethodField()
    distance_display = serializers.SerializerMethodField()
    accuracy_display = serializers.SerializerMethodField()
    battery_display = serializers.SerializerMethodField()
    last_signal_display = serializers.SerializerMethodField()
    gate_scanner_status = serializers.SerializerMethodField()
    registered_device = serializers.SerializerMethodField()

    class Meta:
        model = FacultyProfile
        fields = [
            'id', 'employee_id', 'first_name', 'last_name', 'middle_name', 'suffix',
            'full_name', 'department', 'position', 'contact_number', 'email', 'photo',
            'can_teach', 'is_active', 'bound_device_id', 'device_model', 'device_bound_at',
            'presence_status', 'distance_display', 'accuracy_display', 'battery_display',
            'last_signal_display', 'gate_scanner_status', 'registered_device',
        ]

    def _get_telemetry(self, obj):
        telemetry = cache.get(f"attendsure_faculty_telemetry_{obj.id}")
        if not telemetry:
            store_path = Path(__file__).resolve().parent.parent.parent / 'telemetry_store.json'
            if store_path.exists():
                try:
                    with open(store_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        telemetry = data.get(str(obj.id))
                except Exception:
                    pass
        return telemetry

    def get_presence_status(self, obj):
        telemetry = self._get_telemetry(obj)
        if telemetry and telemetry.get('presence_status'):
            return telemetry['presence_status']
        return "OFF CAMPUS"

    def get_distance_display(self, obj):
        telemetry = self._get_telemetry(obj)
        if telemetry:
            dist = telemetry.get('distance_display', '')
            acc = telemetry.get('accuracy', '')
            if dist:
                return f"{dist} / ±{int(acc)}m" if acc else dist
        return "No GPS Signal"

    def get_accuracy_display(self, obj):
        telemetry = self._get_telemetry(obj)
        if telemetry and telemetry.get('accuracy'):
            return f"±{int(telemetry['accuracy'])}m"
        return "—"

    def get_battery_display(self, obj):
        telemetry = self._get_telemetry(obj)
        if telemetry and telemetry.get('battery_level') is not None:
            return f"{telemetry['battery_level']}%"
        return "—"

    def get_last_signal_display(self, obj):
        telemetry = self._get_telemetry(obj)
        if telemetry and telemetry.get('timestamp'):
            return "Just now"
        return "Offline"

    def get_gate_scanner_status(self, obj):
        try:
            latest_log = FacultyGateLog.objects.filter(faculty=obj).order_by('-scan_time').first()
            if latest_log:
                direction = getattr(latest_log, 'direction', 'SCAN')
                scan_time = getattr(latest_log, 'scan_time', None)
                time_str = scan_time.strftime('%I:%M %p') if scan_time else ''
                return f"{direction} at {time_str}" if time_str else direction
        except Exception:
            pass
        return "No Gate Scan"

    def get_registered_device(self, obj):
        model = getattr(obj, 'device_model', None)
        bound_id = getattr(obj, 'bound_device_id', None)
        if model:
            return model
        if bound_id:
            return bound_id[:16]
        return "No device paired"


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source='grade_level.name', read_only=True)
    grade_level_code = serializers.CharField(source='grade_level.code', read_only=True)
    adviser_name = serializers.CharField(source='adviser.full_name', read_only=True)
    adviser_employee_id = serializers.CharField(source='adviser.employee_id', read_only=True)
    adviser_photo_url = serializers.SerializerMethodField()
    code = serializers.SerializerMethodField()
    room_name = serializers.CharField(source='room_number', required=False, allow_blank=True)
    subject_teachers = serializers.SerializerMethodField()
    subject_teachers_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            'id', 'name', 'code', 'grade_level', 'grade_level_id', 'grade_level_name', 'grade_level_code',
            'adviser', 'adviser_id', 'adviser_name', 'adviser_employee_id', 'adviser_photo_url',
            'room_name', 'room_number', 'capacity', 'subject_teachers', 'subject_teachers_count',
        ]
        extra_kwargs = {
            'academic_year': {'required': False, 'allow_null': True},
            'grade_level': {'required': False},
            'room_number': {'required': False, 'allow_blank': True},
            'capacity': {'required': False},
        }

    def get_code(self, obj):
        gl_code = obj.grade_level.code if getattr(obj, 'grade_level', None) else 'GEN'
        clean_name = re.sub(r'[^A-Za-z0-9]+', '', str(obj.name or '').upper())
        return f"SEC-{gl_code}-{clean_name}"

    def get_adviser_photo_url(self, obj):
        request = self.context.get('request')
        if obj.adviser and obj.adviser.photo:
            return safe_photo_url(obj.adviser.photo, request)
        return None

    def get_subject_teachers(self, obj):
        request = self.context.get('request')
        schedules = getattr(obj, 'prefetched_schedules', None)
        if schedules is None:
            schedules = obj.schedules.select_related('subject', 'faculty').order_by('start_time')

        teachers_map = []
        for s in schedules:
            fac = s.faculty
            sub = s.subject
            teachers_map.append({
                'schedule_id': s.id,
                'schedule_code': getattr(s, 'code', None) or getattr(s, 'schedule_code', f"SCH-{s.id}"),
                'subject_id': s.subject_id,
                'subject_code': getattr(sub, 'code', 'SUB') if sub else 'SUB',
                'subject_title': getattr(sub, 'title', getattr(sub, 'name', 'Subject')) if sub else 'Subject',
                'faculty_id': s.faculty_id,
                'faculty_name': fac.full_name if fac else 'Unassigned Teacher',
                'faculty_photo_url': safe_photo_url(fac.photo, request) if (fac and fac.photo) else None,
                'time_slot': f"{str(s.start_time)[:5]} - {str(s.end_time)[:5]}",
                'days': get_schedule_days_string(s),
            })
        return teachers_map

    def get_subject_teachers_count(self, obj):
        schedules = getattr(obj, 'prefetched_schedules', None)
        if schedules is not None:
            return len({s.faculty_id for s in schedules if s.faculty_id})
        return obj.schedules.exclude(faculty__isnull=True).values('faculty_id').distinct().count()


# ============================================================================
# HELPER FUNCTIONS: DAY & TIME OVERLAP LOGIC
# ============================================================================

def get_schedule_days_string(sched) -> str:
    if not sched:
        return 'MON-FRI'

    for attr in ('days_of_week', 'day_of_week', 'days_display', 'days_str', 'day'):
        val = getattr(sched, attr, None)
        if isinstance(val, str) and val.strip():
            return val.strip()

    days_attr = getattr(sched, 'days', None)
    if days_attr is not None:
        if isinstance(days_attr, str) and days_attr.strip():
            return days_attr.strip()
        if hasattr(days_attr, 'all'):
            try:
                days_list = [
                    str(getattr(d, 'code', None) or getattr(d, 'day', None) or getattr(d, 'name', None) or str(d)).strip()
                    for d in days_attr.all()
                ]
                if days_list:
                    return ",".join(days_list)
            except Exception:
                pass

    return 'MON-FRI'


def get_days_set(days_input) -> set:
    if not days_input:
        return {'MON', 'TUE', 'WED', 'THU', 'FRI'}

    if isinstance(days_input, (list, tuple, set)):
        raw_str = " ".join(str(x) for x in days_input)
    else:
        raw_str = str(days_input)

    d = raw_str.upper().strip()
    if d in ('MON-FRI', 'DAILY', 'WEEKDAYS', 'M-F'):
        return {'MON', 'TUE', 'WED', 'THU', 'FRI'}
    if d in ('MWF', 'M-W-F'):
        return {'MON', 'WED', 'FRI'}
    if d in ('TTH', 'T-TH', 'TUTH'):
        return {'TUE', 'THU'}
    if d in ('SAT', 'SATURDAY'):
        return {'SAT'}
    if d in ('SUN', 'SUNDAY'):
        return {'SUN'}

    mapping = {
        'MONDAY': 'MON', 'MON': 'MON', 'M': 'MON',
        'TUESDAY': 'TUE', 'TUE': 'TUE', 'T': 'TUE',
        'WEDNESDAY': 'WED', 'WED': 'WED', 'W': 'WED',
        'THURSDAY': 'THU', 'THU': 'THU', 'TH': 'THU',
        'FRIDAY': 'FRI', 'FRI': 'FRI', 'F': 'FRI',
        'SATURDAY': 'SAT', 'SAT': 'SAT',
        'SUNDAY': 'SUN', 'SUN': 'SUN',
    }

    parts = re.split(r'[\s,\-/&]+', d)
    matched = set()
    for p in parts:
        clean = p.strip()
        if clean in mapping:
            matched.add(mapping[clean])
        elif len(clean) >= 3 and clean[:3] in mapping:
            matched.add(mapping[clean[:3]])

    return matched if matched else {'MON', 'TUE', 'WED', 'THU', 'FRI'}


def do_day_patterns_overlap(days_a, days_b) -> bool:
    set_a = get_days_set(days_a)
    set_b = get_days_set(days_b)
    return bool(set_a.intersection(set_b))


def do_time_ranges_overlap(start_a, end_a, start_b, end_b) -> bool:
    s_a = str(start_a)[:5]
    e_a = str(end_a)[:5]
    s_b = str(start_b)[:5]
    e_b = str(end_b)[:5]
    return s_a < e_b and e_a > s_b


# ============================================================================
# 1. SECTION VIEWSET (FULL CRUD)
# ============================================================================

class SectionViewSet(viewsets.ModelViewSet):
    serializer_class = SectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'room_number', 'adviser__first_name', 'adviser__last_name']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        advisory_only = str(self.request.query_params.get('advisory_only', '')).lower() in ('true', '1')

        qs = (
            Section.objects.select_related('grade_level', 'adviser', 'academic_year')
            .prefetch_related(
                Prefetch(
                    'schedules',
                    queryset=Schedule.objects.select_related('subject', 'faculty').order_by('start_time'),
                    to_attr='prefetched_schedules'
                )
            )
            .order_by('grade_level__level_order', 'name')
        )

        if (is_regular_teacher(role) and not user.is_superuser) or advisory_only:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                return qs.filter(Q(adviser=faculty) | Q(schedules__faculty=faculty)).distinct()
            return Section.objects.none()

        return qs

    def perform_create(self, serializer):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'DEPT_HEAD')):
            raise PermissionDenied("Only administrators can create class sections.")

        ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        serializer.save(academic_year=ay)

    def perform_update(self, serializer):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'DEPT_HEAD')):
            raise PermissionDenied("Only administrators can update class sections.")
        serializer.save()

    def perform_destroy(self, instance):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can delete class sections.")
        instance.delete()


# ============================================================================
# 2. SCHEDULE VIEWSET (FULL CRUD)
# ============================================================================

class ScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ScheduleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Schedule.objects.select_related('section', 'subject', 'faculty').order_by('start_time')
        if hasattr(Schedule, 'days'):
            qs = qs.prefetch_related('days')

        user = self.request.user
        role = get_user_role(user)

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                advised_sec_ids = get_teacher_section_ids(faculty)
                qs = qs.filter(Q(faculty=faculty) | Q(section_id__in=advised_sec_ids))
            else:
                return Schedule.objects.none()

        return qs

    def _find_conflicts(self, section_id, faculty_id, room_id, room_number, days_of_week, start_time, end_time, exclude_id=None):
        conflicts = []
        if not start_time or not end_time or not days_of_week:
            return conflicts

        if str(start_time)[:5] >= str(end_time)[:5]:
            conflicts.append("Start time must be earlier than end time.")
            return conflicts

        qs = Schedule.objects.select_related('section', 'subject', 'faculty')
        if hasattr(Schedule, 'days'):
            qs = qs.prefetch_related('days')

        if exclude_id:
            qs = qs.exclude(id=exclude_id)

        for sched in list(qs):
            if not getattr(sched, 'start_time', None) or not getattr(sched, 'end_time', None):
                continue

            sched_days = get_schedule_days_string(sched)
            if not do_day_patterns_overlap(days_of_week, sched_days):
                continue

            if not do_time_ranges_overlap(start_time, end_time, sched.start_time, sched.end_time):
                continue

            time_range = f"{str(sched.start_time)[:5]} - {str(sched.end_time)[:5]}"
            sched_sub = getattr(sched.subject, 'title', getattr(sched.subject, 'code', 'Subject')) if sched.subject else 'Subject'
            sched_sec = getattr(sched.section, 'name', 'Section') if sched.section else 'Section'

            if faculty_id and sched.faculty_id == int(faculty_id):
                fac_name = getattr(sched.faculty, 'full_name', 'Teacher')
                conflicts.append(f"Subject Teacher Conflict: {fac_name} is already assigned to {sched_sub} in Section {sched_sec} ({time_range} on {sched_days}).")

            if section_id and sched.section_id == int(section_id):
                conflicts.append(f"Section Conflict: Section {sched_sec} already has {sched_sub} scheduled at this time ({time_range} on {sched_days}).")

            matched_room = False
            sched_room_id = getattr(sched, 'room_id', None)
            sched_room_num = getattr(sched, 'room_number', None) or getattr(sched, 'room_name', None)

            if room_id and sched_room_id and sched_room_id == int(room_id):
                matched_room = True
            elif room_number and sched_room_num and str(sched_room_num).strip().lower() == str(room_number).strip().lower():
                matched_room = True

            if matched_room:
                r_name = sched_room_num or (f"Room #{sched_room_id}" if sched_room_id else "Room")
                conflicts.append(f"Room Conflict: {r_name} is already occupied by Section {sched_sec} for {sched_sub} ({time_range} on {sched_days}).")

        return conflicts

    def _sync_days(self, schedule_instance, days_pattern):
        days_set = get_days_set(days_pattern)
        code_to_num = {'MON': 1, 'TUE': 2, 'WED': 3, 'THU': 4, 'FRI': 5, 'SAT': 6, 'SUN': 7}
        target_nums = {code_to_num[c] for c in days_set if c in code_to_num}

        ScheduleDay.objects.filter(schedule=schedule_instance).delete()
        new_days = [ScheduleDay(schedule=schedule_instance, day_of_week=n) for n in target_nums]
        if new_days:
            ScheduleDay.objects.bulk_create(new_days)

    @action(detail=False, methods=['post'], url_path='validate-conflict')
    def validate_conflict(self, request):
        data = request.data
        conflicts = self._find_conflicts(
            section_id=data.get('section_id'),
            faculty_id=data.get('faculty_id'),
            room_id=data.get('room_id'),
            room_number=data.get('room_number'),
            days_of_week=data.get('days_of_week', 'MON-FRI'),
            start_time=data.get('start_time'),
            end_time=data.get('end_time'),
            exclude_id=data.get('exclude_id'),
        )
        return Response({'has_conflict': len(conflicts) > 0, 'conflicts': conflicts}, status=status.HTTP_200_OK)

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'DEPT_HEAD')):
            raise PermissionDenied("Only authorized academic administrators can create class schedules.")

        data = self.request.data
        conflicts = self._find_conflicts(
            section_id=data.get('section_id') or data.get('section'),
            faculty_id=data.get('faculty_id') or data.get('faculty'),
            room_id=data.get('room_id') or data.get('room'),
            room_number=data.get('room_number'),
            days_of_week=data.get('days_of_week', 'MON-FRI'),
            start_time=data.get('start_time'),
            end_time=data.get('end_time'),
        )
        if conflicts:
            raise ValidationError({'conflict': conflicts})
        instance = serializer.save()
        self._sync_days(instance, data.get('days_of_week', 'MON-FRI'))

    def perform_update(self, serializer):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'DEPT_HEAD')):
            raise PermissionDenied("Only authorized academic administrators can update class schedules.")

        data = self.request.data
        instance = serializer.instance
        conflicts = self._find_conflicts(
            section_id=data.get('section_id') or data.get('section') or getattr(instance, 'section_id', None),
            faculty_id=data.get('faculty_id') or data.get('faculty') or getattr(instance, 'faculty_id', None),
            room_id=data.get('room_id') or data.get('room') or getattr(instance, 'room_id', None),
            room_number=data.get('room_number') or getattr(instance, 'room_number', ''),
            days_of_week=data.get('days_of_week') or get_schedule_days_string(instance),
            start_time=data.get('start_time') or getattr(instance, 'start_time', None),
            end_time=data.get('end_time') or getattr(instance, 'end_time', None),
            exclude_id=instance.id,
        )
        if conflicts:
            raise ValidationError({'conflict': conflicts})
        instance = serializer.save()
        if 'days_of_week' in data:
            self._sync_days(instance, data.get('days_of_week'))

    def perform_destroy(self, instance):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'DEPT_HEAD')):
            raise PermissionDenied("Only authorized academic administrators can delete class schedules.")
        instance.delete()


# ============================================================================
# 3. STUDENT VIEWSET (FULL CRUD)
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for students with section prefetching and permission checks.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = StudentSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Student.objects.none()

        # 1. Administrators and Principals have full campus visibility
        if getattr(user, 'is_superuser', False) or getattr(user, 'is_staff', False):
            return (
                Student.objects.filter(is_active=True)
                .prefetch_related('enrollments__section')
                .order_by('last_name', 'first_name')
            )

        role = getattr(user, 'role', None) or getattr(user, 'system_role', None)
        if role and str(role).strip().upper() in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR']:
            return (
                Student.objects.filter(is_active=True)
                .prefetch_related('enrollments__section')
                .order_by('last_name', 'first_name')
            )

        # 2. Resolve FacultyProfile using the 'account' field (never 'user')
        from apps.academics.models import FacultyProfile, Schedule, Section
        from .common import resolve_faculty_for_user

        faculty = resolve_faculty_for_user(user)
        if not faculty or not isinstance(faculty, FacultyProfile):
            faculty = (
                FacultyProfile.objects.filter(account=user, is_active=True).first()
                or FacultyProfile.objects.filter(employee_id__iexact=user.username, is_active=True).first()
                or FacultyProfile.objects.filter(first_name__icontains=getattr(user, 'first_name', ''), is_active=True).first()
            )

        # 3. Filter students accessible to this faculty member (both teaching loads and advised homerooms)
        if faculty and isinstance(faculty, FacultyProfile):
            teaching_section_ids = Schedule.objects.filter(faculty=faculty).values_list('section_id', flat=True)
            advising_section_ids = Section.objects.filter(adviser=faculty).values_list('id', flat=True)
            accessible_section_ids = set(teaching_section_ids) | set(advising_section_ids)

            if accessible_section_ids:
                return (
                    Student.objects.filter(
                        enrollments__section_id__in=accessible_section_ids,
                        is_active=True
                    )
                    .distinct()
                    .prefetch_related('enrollments__section')
                    .order_by('last_name', 'first_name')
                )

        # Fallback for authenticated staff
        return (
            Student.objects.filter(is_active=True)
            .prefetch_related('enrollments__section')
            .order_by('last_name', 'first_name')
        )

    @action(detail=False, methods=['get'], url_path='dropdown')
    def dropdown(self, request):
        students = self.get_queryset()
        data = []
        for s in students:
            full_name = getattr(s, 'full_name', None) or f"{s.last_name}, {s.first_name}".strip()
            enr = s.enrollments.filter(status='ENROLLED').select_related('section').first()
            sec_id = enr.section_id if enr and enr.section else None
            sec_name = enr.section.name if enr and enr.section else ''
            grade_level = str(getattr(enr.section, 'grade_level', '') or '') if enr and enr.section else ''

            data.append({
                'id': s.id,
                'full_name': full_name,
                'lrn': str(s.lrn).strip(),
                'guardian_name': getattr(s, 'guardian_name', '') or 'Parent/Guardian',
                'guardian_phone': getattr(s, 'parent_contact', '') or getattr(s, 'guardian_phone', '') or '',
                'grade_level': grade_level,
                'section': sec_id,
                'section_name': sec_name,
            })
        return Response(data, status=status.HTTP_200_OK)


# ============================================================================
# 4. FACULTY VIEWSET (FULL CRUD)
# ============================================================================

class FacultyViewSet(viewsets.ModelViewSet):
    serializer_class = FacultyProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['employee_id', 'first_name', 'last_name', 'rfid_uid']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        if user.is_superuser or role in ('ADMIN', 'PRINCIPAL'):
            return FacultyProfile.objects.all().order_by('last_name', 'first_name')
        return FacultyProfile.objects.filter(is_active=True, can_teach=True).order_by('last_name', 'first_name')

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS:
            role = get_user_role(request.user)
            if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
                raise PermissionDenied("Only administrators can modify faculty accounts.")

    @action(detail=False, methods=['get'])
    def dropdown(self, request):
        include_all = str(request.query_params.get('include_all', '')).lower() in ('true', '1')
        user = request.user
        role = get_user_role(user)
        is_admin = user.is_superuser or role in ('ADMIN', 'PRINCIPAL')

        qs = FacultyProfile.objects.filter(is_active=True)
        if not include_all or not is_admin:
            qs = qs.filter(can_teach=True)

        faculty = qs.only(
            'id', 'employee_id', 'first_name', 'last_name', 'suffix',
            'department', 'position', 'contact_number', 'email', 'can_teach', 'is_active', 'photo'
        ).order_by('last_name', 'first_name')
        serializer = FacultyDropdownSerializer(faculty, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reset-device')
    def reset_device(self, request, pk=None):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can reset hardware device locks.")

        faculty = self.get_object()
        fields = []
        if hasattr(faculty, 'bound_device_id'):
            faculty.bound_device_id = None
            fields.append('bound_device_id')
        if hasattr(faculty, 'device_model'):
            faculty.device_model = None
            fields.append('device_model')
        if hasattr(faculty, 'device_bound_at'):
            faculty.device_bound_at = None
            fields.append('device_bound_at')

        if fields:
            faculty.save(update_fields=fields)
        else:
            faculty.save()

        cache.delete(f"attendsure_device_binding_{faculty.id}")
        cache.delete(f"attendsure_faculty_telemetry_{faculty.id}")

        return Response({
            'success': True,
            'message': f"Device lock for {faculty.first_name} {faculty.last_name} has been cleared."
        }, status=status.HTTP_200_OK)


# ============================================================================
# 5. GRADE LEVEL VIEWSET (FULL CRUD)
# ============================================================================

class GradeLevelViewSet(viewsets.ModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    serializer_class = GradeLevelSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS:
            role = get_user_role(request.user)
            if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
                raise PermissionDenied("Only administrators can modify grade levels.")


# ============================================================================
# 6. ROOM VIEWSET (FULL CRUD)
# ============================================================================

def load_rooms_store():
    rooms = []
    if ROOM_STORE_PATH.exists():
        try:
            with open(ROOM_STORE_PATH, 'r', encoding='utf-8') as f:
                rooms = json.load(f)
        except Exception:
            pass
    if not rooms:
        db_rooms = Section.objects.exclude(room_number='').values_list('room_number', flat=True).distinct()
        names = list(db_rooms) or [f"Room {i}" for i in range(101, 108)]
        for idx, r in enumerate(names):
            rooms.append({
                'id': idx + 1,
                'name': r,
                'room_number': r,
                'building': 'Main Building',
                'capacity': 45,
                'room_type': 'LECTURE'
            })
        save_rooms_store(rooms)
    return rooms


def save_rooms_store(rooms):
    try:
        with open(ROOM_STORE_PATH, 'w', encoding='utf-8') as f:
            json.dump(rooms, f, indent=2)
    except Exception as e:
        print(f"[WARN] Failed to write room store: {e}")


class RoomViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        return Response(load_rooms_store(), status=status.HTTP_200_OK)

    def retrieve(self, request, pk=None):
        rooms = load_rooms_store()
        item = next((r for r in rooms if str(r['id']) == str(pk)), None)
        if not item:
            return Response({'error': 'Room not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(item, status=status.HTTP_200_OK)

    def create(self, request):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can create rooms.")

        data = request.data
        name = str(data.get('name') or data.get('room_number') or '').strip()
        if not name:
            return Response({'error': 'Room name or number is required.'}, status=status.HTTP_400_BAD_REQUEST)

        rooms = load_rooms_store()
        new_id = max([r.get('id', 0) for r in rooms] + [0]) + 1
        new_room = {
            'id': new_id,
            'name': name,
            'room_number': name,
            'building': str(data.get('building') or 'Main Building').strip(),
            'capacity': int(data.get('capacity', 45)),
            'room_type': str(data.get('room_type', 'LECTURE')).strip(),
        }
        rooms.append(new_room)
        save_rooms_store(rooms)
        return Response(new_room, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can update rooms.")

        rooms = load_rooms_store()
        item = next((r for r in rooms if str(r['id']) == str(pk)), None)
        if not item:
            return Response({'error': 'Room not found.'}, status=status.HTTP_404_NOT_FOUND)

        data = request.data
        item['name'] = str(data.get('name') or item['name']).strip()
        item['room_number'] = str(data.get('room_number') or item['name']).strip()
        if 'building' in data:
            item['building'] = str(data.get('building')).strip()
        if 'capacity' in data:
            item['capacity'] = int(data.get('capacity', 45))
        if 'room_type' in data:
            item['room_type'] = str(data.get('room_type')).strip()

        save_rooms_store(rooms)
        return Response(item, status=status.HTTP_200_OK)

    def partial_update(self, request, pk=None):
        return self.update(request, pk)

    def destroy(self, request, pk=None):
        role = get_user_role(request.user)
        if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can delete rooms.")

        rooms = load_rooms_store()
        filtered = [r for r in rooms if str(r['id']) != str(pk)]
        save_rooms_store(filtered)
        return Response({'success': True}, status=status.HTTP_204_NO_CONTENT)


# ============================================================================
# 7. SUBJECT, USER, SCANNER, GATE PASS & SMS VIEWSETS
# ============================================================================

class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in permissions.SAFE_METHODS:
            role = get_user_role(request.user)
            if not (request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
                raise PermissionDenied("Only administrators can manage academic subjects.")


class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('profile', 'profile__faculty').order_by('username')
    serializer_class = UserManagementSerializer
    permission_classes = [IsSystemAdmin]

    def perform_create(self, serializer):
        user = serializer.save()
        password = self.request.data.get('password')
        if password:
            user.set_password(str(password).strip())
            user.save(update_fields=['password'])

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id or instance.username.lower() == request.user.username.lower():
            return Response({'error': 'You cannot delete your own active administrator account.'}, status=status.HTTP_400_BAD_REQUEST)
        profile = getattr(instance, 'profile', None)
        if profile and profile.faculty:
            profile.faculty.delete()
        return super().destroy(request, *args, **kwargs)


class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsSystemAdmin]


class GatePassViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing and auditing student and faculty gate passes.
    Cybersecurity & Type Safety:
    - Inspects model metadata to dynamically link UserProfile or FacultyProfile.
    - Uses exact ID queries to eliminate ORM ValueError crashes.
    - Applies strict RBAC: teachers only see their own passes and advisees.
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = GatePassSerializer

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return GatePass.objects.none()

        from .common import get_user_role, resolve_faculty_for_user, get_teacher_student_ids
        from apps.academics.models import GatePass, FacultyProfile, UserProfile

        role = get_user_role(user)
        # Administrators, Principals, and Security Guards have full visibility
        if getattr(user, 'is_superuser', False) or role in ['ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'GUARD', 'SECURITY']:
            return (
                GatePass.objects.all()
                .select_related('faculty', 'student')
                .order_by('-created_at')
            )

        # 1. Resolve UserProfile and FacultyProfile for the current user
        user_profile = getattr(user, 'profile', None)
        if not user_profile:
            try:
                user_profile = UserProfile.objects.filter(user=user).first()
            except Exception:
                user_profile = None

        faculty = resolve_faculty_for_user(user)

        # 2. Inspect GatePass foreign key targets to pass the correct ID
        gatepass_fields = {f.name: f for f in GatePass._meta.get_fields()}

        filter_query = Q()

        # Handle 'faculty' field
        if 'faculty' in gatepass_fields:
            target_model = gatepass_fields['faculty'].related_model
            if target_model == UserProfile and user_profile:
                filter_query |= Q(faculty_id=user_profile.id)
            elif target_model == FacultyProfile and faculty:
                filter_query |= Q(faculty_id=faculty.id)
            elif target_model == type(user):
                filter_query |= Q(faculty_id=user.id)
            else:
                # Fallback: check across related IDs
                if user_profile:
                    filter_query |= Q(faculty_id=user_profile.id)
                if faculty:
                    filter_query |= Q(faculty_id=faculty.id)

        # Handle 'issued_by' field
        if 'issued_by' in gatepass_fields:
            issued_target = gatepass_fields['issued_by'].related_model
            if issued_target == type(user):
                filter_query |= Q(issued_by_id=user.id)
            elif issued_target == UserProfile and user_profile:
                filter_query |= Q(issued_by_id=user_profile.id)
            elif issued_target == FacultyProfile and faculty:
                filter_query |= Q(issued_by_id=faculty.id)

        # Handle 'created_by' field if present
        if 'created_by' in gatepass_fields:
            created_target = gatepass_fields['created_by'].related_model
            if created_target == type(user):
                filter_query |= Q(created_by_id=user.id)

        # 3. Add student passes for advisees / taught students
        if faculty:
            advised_student_ids = get_teacher_student_ids(faculty)
            if advised_student_ids:
                filter_query |= Q(student_id__in=advised_student_ids)

        if not filter_query:
            return GatePass.objects.none()

        return (
            GatePass.objects.filter(filter_query)
            .select_related('faculty', 'student')
            .distinct()
            .order_by('-created_at')
        )


class SmsOutboxViewSet(viewsets.ModelViewSet):
    serializer_class = SmsOutboxSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        if user.is_superuser or role in ('ADMIN', 'PRINCIPAL'):
            return SmsOutbox.objects.all().order_by('-created_at')
        faculty = resolve_faculty_for_user(user)
        if faculty:
            student_contacts = Student.objects.filter(id__in=get_teacher_student_ids(faculty)).exclude(parent_contact='').values_list('parent_contact', flat=True)
            return SmsOutbox.objects.filter(recipient_number__in=student_contacts).order_by('-created_at')
        return SmsOutbox.objects.none()

    def get_permissions(self):
        if self.action in ['broadcast', 'delete_delivered', 'clear_pending', 'retry_all_failed', 'destroy']:
            return [IsSystemAdmin()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['delete', 'post'])
    def delete_delivered(self, request):
        SmsOutbox.objects.filter(status='SENT').delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete', 'post'])
    def clear_pending(self, request):
        SmsOutbox.objects.filter(status='PENDING').delete()
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def retry_all_failed(self, request):
        SmsOutbox.objects.filter(status='FAILED').update(status='PENDING', retry_count=0)
        return Response({'success': True}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def broadcast(self, request):
        message_body = str(request.data.get('message_body') or request.data.get('message') or '').strip()
        if not message_body:
            return Response({'error': 'Broadcast message body is required.'}, status=status.HTTP_400_BAD_REQUEST)

        students = Student.objects.filter(is_active=True).exclude(parent_contact='')
        outbox_items = [
            SmsOutbox(
                recipient_name=s.full_name,
                recipient_number=s.parent_contact,
                message_body=message_body,
                trigger_event='EMERGENCY',
                category='EMERGENCY',
                priority='LOW',
                status='PENDING',
            )
            for s in students
        ]
        if outbox_items:
            SmsOutbox.objects.bulk_create(outbox_items, batch_size=500)
        return Response({'success': True, 'queued_count': len(outbox_items)}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='metrics')
    def get_metrics(self, request):
        qs = self.get_queryset()
        return Response({
            'total': qs.count(),
            'pending': qs.filter(status='PENDING').count(),
            'sent': qs.filter(status='SENT').count(),
            'failed': qs.filter(status='FAILED').count(),
        }, status=status.HTTP_200_OK)