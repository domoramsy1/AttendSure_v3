"""
AttendSure - Core API ViewSets with Class Adviser & Subject Teacher Integration
File: backend/apps/api/views/viewsets.py
"""

import base64
import uuid
import re
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
    Subject,
    GradeLevel,
    SmsOutbox,
    Section,
    Enrollment,
)
from apps.api.serializers import (
    StudentSerializer,
    FacultyProfileSerializer,
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


# ============================================================================
# SECTION SERIALIZER (WITH ADVISER & SUBJECT TEACHERS BREAKDOWN)
# ============================================================================

class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source='grade_level.name', read_only=True)
    grade_level_code = serializers.CharField(source='grade_level.code', read_only=True)
    adviser_name = serializers.CharField(source='adviser.full_name', read_only=True)
    adviser_employee_id = serializers.CharField(source='adviser.employee_id', read_only=True)
    adviser_photo_url = serializers.SerializerMethodField()
    subject_teachers = serializers.SerializerMethodField()
    subject_teachers_count = serializers.SerializerMethodField()

    class Meta:
        model = Section
        fields = [
            'id', 'name', 'code', 'grade_level', 'grade_level_name', 'grade_level_code',
            'adviser', 'adviser_name', 'adviser_employee_id', 'adviser_photo_url',
            'room_name', 'room_number', 'subject_teachers', 'subject_teachers_count',
        ]

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
# 1. STUDENT VIEWSET (ROLE-ISOLATED)
# ============================================================================

class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['lrn', 'first_name', 'last_name', 'rfid_uid', 'qr_token']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        faculty = resolve_faculty_for_user(user)
        is_admin = user.is_superuser or role in ('ADMIN', 'PRINCIPAL')
        my_advisees_only = str(self.request.query_params.get('my_advisees_only', '')).lower() in ('true', '1')

        qs = (
            Student.objects.filter(is_active=True)
            .prefetch_related(
                Prefetch(
                    'enrollments',
                    queryset=Enrollment.objects.select_related('section', 'section__grade_level', 'academic_year')
                )
            )
            .order_by('last_name', 'first_name')
        )

        if not is_admin or my_advisees_only:
            if faculty:
                allowed_student_ids = get_teacher_student_ids(faculty)
                qs = qs.filter(id__in=allowed_student_ids)
            else:
                return Student.objects.none()

        params = self.request.query_params

        sec_id = params.get('section_id') or params.get('section')
        if sec_id:
            clean_sec = str(sec_id).strip().lower()
            if clean_sec in ('unassigned', 'none', 'null', '0'):
                qs = qs.exclude(enrollments__status='ENROLLED', enrollments__section__isnull=False)
            elif clean_sec.isdigit():
                qs = qs.filter(enrollments__section_id=int(clean_sec), enrollments__status='ENROLLED')

        grade_id = params.get('grade_level_id') or params.get('grade_level')
        if grade_id and str(grade_id).isdigit():
            qs = qs.filter(enrollments__section__grade_level_id=int(grade_id), enrollments__status='ENROLLED')

        sex_filter = params.get('sex')
        if sex_filter:
            clean_sex = str(sex_filter).strip().capitalize()
            if clean_sex in ('Male', 'Female'):
                qs = qs.filter(sex=clean_sex)

        rfid_status = params.get('rfid_status')
        if rfid_status:
            clean_rfid = str(rfid_status).strip().upper()
            if clean_rfid in ('PAIRED', 'WITH_RFID', 'LINKED'):
                qs = qs.exclude(Q(rfid_uid__isnull=True) | Q(rfid_uid=''))
            elif clean_rfid in ('UNPAIRED', 'NEEDS_RFID', 'UNLINKED'):
                qs = qs.filter(Q(rfid_uid__isnull=True) | Q(rfid_uid=''))

        search_term = params.get('search')
        if search_term:
            term = str(search_term).strip()
            qs = qs.filter(
                Q(lrn__icontains=term) |
                Q(first_name__icontains=term) |
                Q(last_name__icontains=term) |
                Q(rfid_uid__icontains=term) |
                Q(qr_token__icontains=term) |
                Q(enrollments__section__name__icontains=term)
            )

        return qs.distinct()

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        user = request.user
        role = get_user_role(user)
        if not (user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators and principals can delete student records.")
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], pagination_class=None)
    def dropdown(self, request):
        qs = self.get_queryset().only(
            'id', 'lrn', 'first_name', 'middle_name', 'last_name', 'suffix', 'parent_contact'
        )
        data = [
            {
                'id': s.id,
                'lrn': s.lrn,
                'name': format_full_student_name(s),
                'full_name': format_full_student_name(s),
                'label': f"{s.lrn} - {format_full_student_name(s)}",
                'parent_contact': s.parent_contact or '',
            }
            for s in qs
        ]
        return Response(data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post', 'patch', 'put'], url_path='upload-photo')
    def upload_photo(self, request, pk=None):
        student = self.get_object()
        photo_file = request.FILES.get('photo')
        base64_data = request.data.get('photo_base64') or request.data.get('photo')

        if not photo_file and not (isinstance(base64_data, str) and base64_data.startswith('data:image')):
            return Response({'error': 'No image file or base64 data provided.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if photo_file:
                if photo_file.size > 5 * 1024 * 1024:
                    return Response({'error': 'Image exceeds 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)
                ext = photo_file.name.split('.')[-1].lower() if '.' in photo_file.name else 'jpg'
                if ext not in ['jpg', 'jpeg', 'png', 'webp']:
                    return Response({'error': 'Only JPG, PNG, and WEBP allowed.'}, status=status.HTTP_400_BAD_REQUEST)
                safe_filename = f"student_{student.lrn}_{uuid.uuid4().hex[:8]}.{ext}"
                student.photo.save(safe_filename, photo_file, save=False)

            elif isinstance(base64_data, str) and base64_data.startswith('data:image'):
                header, img_str = base64_data.split(';base64,', 1)
                ext = 'jpg' if 'jpeg' in header else header.split('/')[-1].split(';')[0].lower()
                if ext not in ['jpg', 'jpeg', 'png', 'webp']:
                    ext = 'jpg'
                decoded_bytes = base64.b64decode(img_str, validate=True)
                if len(decoded_bytes) > 5 * 1024 * 1024:
                    return Response({'error': 'Image exceeds 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)
                safe_filename = f"student_{student.lrn}_{uuid.uuid4().hex[:8]}.{ext}"
                student.photo.save(safe_filename, ContentFile(decoded_bytes), save=False)

            student.photo_updated_at = timezone.now()
            student.save(update_fields=['photo', 'photo_updated_at'])

            return Response({
                'success': True,
                'message': 'Student photo updated successfully.',
                'photo_url': safe_photo_url(student.photo, request),
            }, status=status.HTTP_200_OK)

        except Exception as exc:
            return Response({'error': f'Failed to process image: {str(exc)}'}, status=status.HTTP_400_BAD_REQUEST)


# ============================================================================
# 2. FACULTY VIEWSET
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
# 3. SCHEDULE VIEWSET (SUBJECT TEACHERS & ZERO CONFLICT ENGINE)
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

        existing_schedules = list(qs)

        for sched in existing_schedules:
            if not getattr(sched, 'start_time', None) or not getattr(sched, 'end_time', None):
                continue

            sched_days = get_schedule_days_string(sched)
            if not do_day_patterns_overlap(days_of_week, sched_days):
                continue

            if not do_time_ranges_overlap(start_time, end_time, sched.start_time, sched.end_time):
                continue

            time_range = f"{str(sched.start_time)[:5]} - {str(sched.end_time)[:5]}"
            sched_sub = (
                getattr(sched.subject, 'title', None) or 
                getattr(sched.subject, 'code', None) or 
                'Subject'
            ) if sched.subject else 'Subject'
            sched_sec = getattr(sched.section, 'name', 'Section') if sched.section else 'Section'

            # 1. Subject Teacher Conflict
            if faculty_id and sched.faculty_id == int(faculty_id):
                fac_name = getattr(sched.faculty, 'full_name', None) or (
                    f"{sched.faculty.first_name} {sched.faculty.last_name}" if sched.faculty else "Teacher"
                )
                conflicts.append(
                    f"Subject Teacher Conflict: {fac_name} is already assigned to {sched_sub} in Section {sched_sec} ({time_range} on {sched_days})."
                )

            # 2. Section Conflict
            if section_id and sched.section_id == int(section_id):
                conflicts.append(
                    f"Section Conflict: Section {sched_sec} already has {sched_sub} scheduled at this time ({time_range} on {sched_days})."
                )

            # 3. Room Conflict
            matched_room = False
            sched_room_id = getattr(sched, 'room_id', None)
            sched_room_num = getattr(sched, 'room_number', None) or getattr(sched, 'room_name', None)

            if room_id and sched_room_id and sched_room_id == int(room_id):
                matched_room = True
            elif room_number and sched_room_num and str(sched_room_num).strip().lower() == str(room_number).strip().lower():
                matched_room = True

            if matched_room:
                r_name = sched_room_num or (f"Room #{sched_room_id}" if sched_room_id else "Room")
                conflicts.append(
                    f"Room Conflict: {r_name} is already occupied by Section {sched_sec} for {sched_sub} ({time_range} on {sched_days})."
                )

        return conflicts

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
            raise PermissionDenied("Only authorized academic administrators can schedule class periods.")

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
        serializer.save()

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
        serializer.save()

    def perform_destroy(self, instance):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL', 'DEPT_HEAD')):
            raise PermissionDenied("Only authorized academic administrators can delete class schedules.")
        instance.delete()


# ============================================================================
# 4. SECTION VIEWSET (CLASS ADVISER & AUTO-CODES)
# ============================================================================

class SectionViewSet(viewsets.ModelViewSet):
    serializer_class = SectionSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code', 'room_number', 'adviser__first_name', 'adviser__last_name']

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)

        qs = (
            Section.objects.select_related('grade_level', 'adviser')
            .prefetch_related(
                Prefetch(
                    'schedules',
                    queryset=Schedule.objects.select_related('subject', 'faculty').order_by('start_time'),
                    to_attr='prefetched_schedules'
                )
            )
            .order_by('grade_level__level_order', 'name')
        )

        if is_regular_teacher(role) and not user.is_superuser:
            faculty = resolve_faculty_for_user(user)
            if faculty:
                return qs.filter(Q(adviser=faculty) | Q(schedules__faculty=faculty)).distinct()
            return Section.objects.none()

        return qs

    def _generate_section_code(self, name: str, grade_level_id: int = None) -> str:
        clean_name = re.sub(r'[^A-Za-z0-9]+', '', str(name or '').upper())
        grade_tag = "GEN"

        if grade_level_id:
            gl = GradeLevel.objects.filter(id=grade_level_id).first()
            if gl:
                nums = re.findall(r'\d+', gl.name or gl.code or '')
                grade_tag = f"G{nums[0]}" if nums else str(getattr(gl, 'code', 'GL'))[:4].upper()

        base_code = f"SEC-{grade_tag}-{clean_name}"
        unique_code = base_code
        counter = 1

        if hasattr(Section, 'code'):
            while Section.objects.filter(code__iexact=unique_code).exists():
                unique_code = f"{base_code}-{counter:02d}"
                counter += 1

        return unique_code

    def perform_create(self, serializer):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can create sections.")

        if hasattr(Section, 'code'):
            name = self.request.data.get('name', '')
            grade_level_id = self.request.data.get('grade_level_id') or self.request.data.get('grade_level')
            provided_code = self.request.data.get('code')

            if not provided_code or not str(provided_code).strip():
                auto_code = self._generate_section_code(name, grade_level_id)
                serializer.save(code=auto_code)
                return

        serializer.save()

    def perform_update(self, serializer):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can update sections.")
        serializer.save()

    def perform_destroy(self, instance):
        role = get_user_role(self.request.user)
        if not (self.request.user.is_superuser or role in ('ADMIN', 'PRINCIPAL')):
            raise PermissionDenied("Only administrators can delete sections.")
        instance.delete()


# ============================================================================
# 5. GATE PASS VIEWSET (ROLE-ISOLATED)
# ============================================================================

class GatePassViewSet(viewsets.ModelViewSet):
    serializer_class = GatePassSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        is_admin = user.is_superuser or role in ('ADMIN', 'PRINCIPAL')

        qs = GatePass.objects.select_related('faculty', 'student', 'issued_by').order_by('-valid_from')
        if is_admin:
            return qs

        if role == 'GUARD':
            return qs.filter(status='ACTIVE')

        faculty = resolve_faculty_for_user(user)
        if faculty:
            advised_student_ids = get_teacher_student_ids(faculty)
            return qs.filter(
                Q(faculty=faculty) |
                Q(student_id__in=advised_student_ids) |
                Q(issued_by=user)
            ).distinct()

        return GatePass.objects.none()


# ============================================================================
# 6. SUBJECT & ROOM VIEWSETS
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


class RoomViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        rooms = (
            Section.objects.exclude(room_number='')
            .values_list('room_number', flat=True)
            .distinct()
            .order_by('room_number')
        )
        room_list = list(rooms) or [f"Room {i}" for i in range(101, 110)]
        return Response(
            [{'id': idx + 1, 'room_number': r, 'name': r} for idx, r in enumerate(room_list)],
            status=status.HTTP_200_OK,
        )


class GradeLevelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GradeLevel.objects.all().order_by('level_order')
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request, *args, **kwargs):
        levels = self.get_queryset()
        return Response(
            [{'id': g.id, 'code': g.code, 'name': g.name, 'stage': g.stage, 'level_order': g.level_order} for g in levels],
            status=status.HTTP_200_OK,
        )


# ============================================================================
# 7. USER MANAGEMENT & SCANNER VIEWSETS (ADMIN-ONLY)
# ============================================================================

class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.select_related('profile', 'profile__faculty').order_by('username')
    serializer_class = UserManagementSerializer
    permission_classes = [IsSystemAdmin]

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.id == request.user.id or instance.username.lower() == request.user.username.lower():
            return Response(
                {'error': 'You cannot delete your own active administrator account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = getattr(instance, 'profile', None)
        if profile and profile.faculty:
            profile.faculty.delete()

        return super().destroy(request, *args, **kwargs)


class ScannerViewSet(viewsets.ModelViewSet):
    queryset = IoTKiosk.objects.all().order_by('kiosk_code')
    serializer_class = IoTKioskSerializer
    permission_classes = [IsSystemAdmin]


# ============================================================================
# 8. SMS OUTBOX VIEWSET (DATA-ISOLATED)
# ============================================================================

class SmsOutboxViewSet(viewsets.ModelViewSet):
    serializer_class = SmsOutboxSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        role = get_user_role(user)
        is_admin = user.is_superuser or role in ('ADMIN', 'PRINCIPAL')

        if is_admin:
            return SmsOutbox.objects.all().order_by('-created_at')

        faculty = resolve_faculty_for_user(user)
        if faculty:
            student_contacts = (
                Student.objects.filter(id__in=get_teacher_student_ids(faculty))
                .exclude(parent_contact='')
                .values_list('parent_contact', flat=True)
            )
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