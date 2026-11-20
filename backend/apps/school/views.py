# D:\AttendSure_V3\backend\apps\school\views.py

from django.core.cache import cache
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.campus.models import CampusBoundary
from common.audit import AuditedModelViewSet, record_audit_log
from common.permissions import IsLeadershipOrReadOnly, is_school_leader
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


class PublicSchoolBrandingView(APIView):
    """Returns non-sensitive public school letterhead info for Web & Mobile Sign-In screens."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        meta = get_school_metadata(request)
        return Response(
            {
                "school_id": meta.get("school_id", ""),
                "school_name": meta.get("school_name", ""),
                "region": meta.get("region", ""),
                "division": meta.get("division", ""),
                "district": meta.get("district", ""),
                "academic_year": meta.get("academic_year", ""),
                "school_logo": meta.get("school_logo"),
                "left_logo": meta.get("left_logo"),
                "right_logo": meta.get("right_logo"),
                "is_configured": meta.get("is_configured", False),
            }
        )


class SchoolSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get(self, request):
        school = SchoolSettings.objects.select_related("principal_teacher").first()
        if not school:
            return Response(get_school_metadata(request))
        school = migrate_inline_logos_to_files(school)
        data = dict(SchoolSettingsSerializer(school, context={"request": request}).data)
        data.update(get_school_metadata(request, school=school))
        return Response(data)

    @transaction.atomic
    def put(self, request):
        school = SchoolSettings.objects.first()
        if school:
            serializer = SchoolSettingsSerializer(
                school, data=request.data, partial=True, context={"request": request}
            )
        else:
            payload = (
                {k: request.data.get(k) for k in request.data.keys()}
                if hasattr(request.data, "keys")
                else dict(request.data)
            )
            payload.setdefault("school_id", "000000")
            payload.setdefault("school_name", "AttendSure School")
            serializer = SchoolSettingsSerializer(data=payload, context={"request": request})

        serializer.is_valid(raise_exception=True)
        saved = migrate_inline_logos_to_files(serializer.save())
        cache.delete_many([SCHOOL_META_CACHE_KEY, "reports:system_status"])

        radius_val = max(20, int(saved.geofence_radius_meters or 150))
        boundary = CampusBoundary.objects.filter(is_active=True).first() or CampusBoundary.objects.first()
        if boundary:
            boundary.name = (saved.school_name or boundary.name or "Campus Boundary")[:100]
            boundary.latitude = saved.latitude
            boundary.longitude = saved.longitude
            boundary.radius_meters = radius_val
            boundary.is_active = True
            boundary.save()
        else:
            CampusBoundary.objects.create(
                name=(saved.school_name or "Campus Boundary")[:100],
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
        data.update(get_school_metadata(request, school=saved))
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
            cache.delete_many([SCHOOL_META_CACHE_KEY, "reports:system_status"])
            record_audit_log(
                request=request,
                table_name=school._meta.db_table,
                record_id=school.pk,
                action="DELETE",
                changed_fields=[field],
            )
            return self.get(request)
        return Response(
            {"error": "Specify school_logo, left_logo, or right_logo."},
            status=status.HTTP_400_BAD_REQUEST,
        )


WEEKEND_REST_CACHE_KEY = "school:calendar:weekend_rest_enabled"


class SchoolHolidayViewSet(AuditedModelViewSet):
    queryset = SchoolHoliday.objects.order_by("holiday_date")
    serializer_class = SchoolHolidaySerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        weekend_rest = cache.get(WEEKEND_REST_CACHE_KEY)
        if weekend_rest is None:
            weekend_rest = True
        if isinstance(response.data, dict):
            response.data["weekend_rest_enabled"] = bool(weekend_rest)
            if "results" in response.data and "exceptions" not in response.data:
                response.data["exceptions"] = response.data["results"]
        return response

    def patch(self, request, *args, **kwargs):
        """Handles collection-level PATCH /api/calendar/exceptions/ for weekend rest toggle."""
        if "pk" not in kwargs:
            if not is_school_leader(request.user):
                return Response({"error": "School leadership access required."}, status=status.HTTP_403_FORBIDDEN)
            return self.partial_update_settings(request)
        return super().partial_update(request, *args, **kwargs)

    def partial_update_settings(self, request):
        if not is_school_leader(request.user):
            return Response({"error": "School leadership access required."}, status=status.HTTP_403_FORBIDDEN)
        val = request.data.get("weekend_rest_enabled")
        if val is not None:
            enabled = bool(val) if isinstance(val, bool) else str(val).strip().lower() in ("true", "1", "yes")
            cache.set(WEEKEND_REST_CACHE_KEY, enabled, timeout=None)
            record_audit_log(
                request=request,
                table_name=SchoolHoliday._meta.db_table,
                record_id=0,
                action="UPDATE",
                new_data={"weekend_rest_enabled": enabled},
            )
            return Response({"ok": True, "weekend_rest_enabled": enabled})
        current = cache.get(WEEKEND_REST_CACHE_KEY)
        return Response({"ok": True, "weekend_rest_enabled": True if current is None else bool(current)})


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
        include_inactive = (
            self.action in ("retrieve", "update", "partial_update", "destroy")
            or str(self.request.query_params.get("include_inactive", "")).lower() in ("1", "true", "yes")
        )
        return get_sections_for_user(self.request.user, include_inactive=include_inactive)

    def _clear_adviser_cache(self, *teacher_ids):
        keys = [f"accounts:teacher_sections:{tid}" for tid in teacher_ids if tid]
        if keys:
            cache.delete_many(keys)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._clear_adviser_cache(serializer.instance.adviser_id)

    def perform_update(self, serializer):
        old_adviser_id = serializer.instance.adviser_id
        super().perform_update(serializer)
        self._clear_adviser_cache(old_adviser_id, serializer.instance.adviser_id)

    def perform_destroy(self, instance):
        adviser_id = instance.adviser_id
        super().perform_destroy(instance)
        self._clear_adviser_cache(adviser_id)


class ClassPeriodViewSet(AuditedModelViewSet):
    serializer_class = ClassPeriodSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get_queryset(self):
        sec_id = self.request.query_params.get("section_id") or self.request.query_params.get("section")
        return get_class_periods_for_user(
            self.request.user, int(sec_id) if (sec_id and str(sec_id).isdigit()) else None
        )

    def _clear_teacher_cache(self, *teacher_ids):
        keys = [f"accounts:teacher_sections:{tid}" for tid in teacher_ids if tid]
        if keys:
            cache.delete_many(keys)

    def perform_create(self, serializer):
        super().perform_create(serializer)
        self._clear_teacher_cache(serializer.instance.teacher_id)

    def perform_update(self, serializer):
        old_teacher_id = serializer.instance.teacher_id
        super().perform_update(serializer)
        self._clear_teacher_cache(old_teacher_id, serializer.instance.teacher_id)

    def perform_destroy(self, instance):
        teacher_id = instance.teacher_id
        super().perform_destroy(instance)
        self._clear_teacher_cache(teacher_id)