from django.core.cache import cache
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from common.audit import AuditedModelViewSet, record_audit_log
from common.permissions import IsLeadershipOrReadOnly
from apps.campus.models import CampusBoundary
from .models import GradeLevel, Room, SchoolHoliday, SchoolSettings, SchoolYear, Subject
from .selectors import (
    SCHOOL_META_CACHE_KEY,
    get_class_periods_for_user,
    get_school_metadata,
    get_sections_for_user,
    migrate_inline_logos_to_files,
)
from .serializers import (
    ClassPeriodSerializer,
    GradeLevelSerializer,
    RoomSerializer,
    SchoolHolidaySerializer,
    SchoolSettingsSerializer,
    SchoolYearSerializer,
    SectionSerializer,
    SubjectSerializer,
)


class SchoolSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get(self, request):
        school = SchoolSettings.objects.select_related("principal_teacher").first()
        if not school:
            return Response(get_school_metadata(request))
        school = migrate_inline_logos_to_files(school)
        data = dict(SchoolSettingsSerializer(school, context={"request": request}).data)
        data.update(get_school_metadata(request))
        return Response(data)

    @transaction.atomic
    def put(self, request):
        school = SchoolSettings.objects.first()
        if school:
            serializer = SchoolSettingsSerializer(
                school, data=request.data, partial=True, context={"request": request}
            )
        else:
            payload = {k: request.data.get(k) for k in request.data.keys()} if hasattr(request.data, "keys") else dict(request.data)
            payload.setdefault("school_id", "000000")
            payload.setdefault("school_name", "AttendSure School")
            serializer = SchoolSettingsSerializer(data=payload, context={"request": request})

        serializer.is_valid(raise_exception=True)
        saved = migrate_inline_logos_to_files(serializer.save())
        cache.delete_many([SCHOOL_META_CACHE_KEY, "reports:system_status"])

        radius_val = max(20, int(saved.geofence_radius_meters or 150))
        boundary = CampusBoundary.objects.filter(is_active=True).first() or CampusBoundary.objects.first()
        if boundary:
            boundary.name = saved.school_name or boundary.name or "Campus Boundary"
            boundary.latitude = saved.latitude
            boundary.longitude = saved.longitude
            boundary.radius_meters = radius_val
            boundary.is_active = True
            boundary.save()
        else:
            CampusBoundary.objects.create(
                name=saved.school_name or "Campus Boundary",
                latitude=saved.latitude,
                longitude=saved.longitude,
                radius_meters=radius_val,
                is_active=True,
            )

        record_audit_log(
            request=request,
            table_name=saved._meta.db_table,
            record_id=saved.pk,
            action="UPDATE",
            changed_fields=list(serializer.validated_data.keys()),
        )
        data = dict(SchoolSettingsSerializer(saved, context={"request": request}).data)
        data.update(get_school_metadata(request))
        return Response(data)

    def post(self, request):
        return self.put(request)

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        school = SchoolSettings.objects.first()
        field = request.query_params.get("field") or request.data.get("field")
        if school and field in ("school_logo", "left_logo", "right_logo"):
            setattr(school, field, None)
            school.save(update_fields=[field, "updated_at"])
            cache.delete(SCHOOL_META_CACHE_KEY)
            record_audit_log(
                request=request,
                table_name=school._meta.db_table,
                record_id=school.pk,
                action="DELETE",
                changed_fields=[field],
            )
            return self.get(request)
        return Response({"error": "Specify school_logo, left_logo, or right_logo."}, status=status.HTTP_400_BAD_REQUEST)


class SchoolHolidayViewSet(AuditedModelViewSet):
    queryset = SchoolHoliday.objects.order_by("holiday_date")
    serializer_class = SchoolHolidaySerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class RoomViewSet(AuditedModelViewSet):
    queryset = Room.objects.order_by("name")
    serializer_class = RoomSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class GradeLevelViewSet(AuditedModelViewSet):
    queryset = GradeLevel.objects.order_by("level_order")
    serializer_class = GradeLevelSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class SchoolYearViewSet(AuditedModelViewSet):
    queryset = SchoolYear.objects.order_by("-start_date")
    serializer_class = SchoolYearSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class SubjectViewSet(AuditedModelViewSet):
    queryset = Subject.objects.select_related("grade_level").order_by("code")
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]


class SectionViewSet(AuditedModelViewSet):
    serializer_class = SectionSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get_queryset(self):
        return get_sections_for_user(self.request.user)


class ClassPeriodViewSet(AuditedModelViewSet):
    serializer_class = ClassPeriodSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get_queryset(self):
        sec_id = self.request.query_params.get("section_id") or self.request.query_params.get("section")
        return get_class_periods_for_user(
            self.request.user, int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        )