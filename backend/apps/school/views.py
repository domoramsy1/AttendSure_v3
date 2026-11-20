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


def _wants_fresh_cache(request) -> bool:
    flag = str(request.query_params.get("nocache", "")).strip().lower()
    return flag in ("1", "true", "yes")


def _resolve_clean_school_id(school_obj: SchoolSettings | None, meta: dict) -> str:
    if school_obj and getattr(school_obj, "school_id", None):
        clean_db_id = str(school_obj.school_id).strip()
        if clean_db_id:
            return clean_db_id
    return str(meta.get("school_id") or meta.get("deped_school_id") or "").strip()


class PublicSchoolBrandingView(APIView):
    """Returns non-sensitive public school letterhead info for Web & Mobile Sign-In screens."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if _wants_fresh_cache(request):
            cache.delete(SCHOOL_META_CACHE_KEY)

        school = SchoolSettings.objects.select_related("principal_teacher").first()
        meta = get_school_metadata(request, school=school) if school else get_school_metadata(request)
        resolved_school_id = _resolve_clean_school_id(school, meta)

        return Response(
            {
                "school_id": resolved_school_id,
                "deped_school_id": resolved_school_id,
                "school_name": (school.school_name if school and school.school_name else meta.get("school_name", "")) or "",
                "short_name": (getattr(school, "short_name", "") if school else meta.get("short_name", "")) or "",
                "region": (school.region if school and school.region else meta.get("region", "")) or "",
                "division": (school.division if school and school.division else meta.get("division", "")) or "",
                "district": (school.district if school and school.district else meta.get("district", "")) or "",
                "address": (getattr(school, "address", "") if school else meta.get("address", "")) or "",
                "contact_number": (getattr(school, "contact_number", "") if school else meta.get("contact_number", "")) or "",
                "email": (getattr(school, "email", "") if school else meta.get("email", "")) or "",
                "principal_name": meta.get("principal_name") or (getattr(school, "principal_name", "") if school else "") or "",
                "principal_title": meta.get("principal_title") or (getattr(school, "principal_title", "") if school else "") or "",
                "academic_year": meta.get("academic_year", ""),
                "school_logo": meta.get("school_logo"),
                "left_logo": meta.get("left_logo"),
                "right_logo": meta.get("right_logo"),
                "is_configured": bool(school and (resolved_school_id or school.school_name)) or bool(meta.get("is_configured", False)),
            }
        )


class SchoolSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get(self, request):
        if _wants_fresh_cache(request):
            cache.delete(SCHOOL_META_CACHE_KEY)

        school = SchoolSettings.objects.select_related("principal_teacher").first()
        if not school:
            meta = get_school_metadata(request)
            sid = str(meta.get("school_id") or "").strip()
            meta["school_id"] = sid
            meta["deped_school_id"] = sid
            return Response(meta)

        school = migrate_inline_logos_to_files(school)
        serialized = dict(SchoolSettingsSerializer(school, context={"request": request}).data)
        meta = get_school_metadata(request, school=school)

        # Merge metadata without allowing a blank cached value to erase real DB columns
        merged = {**meta, **{k: v for k, v in serialized.items() if v not in (None, "")}}
        resolved_school_id = _resolve_clean_school_id(school, merged)
        merged["school_id"] = resolved_school_id
        merged["deped_school_id"] = resolved_school_id

        for logo_key in ("school_logo", "left_logo", "right_logo"):
            if meta.get(logo_key):
                merged[logo_key] = meta[logo_key]

        if meta.get("academic_year"):
            merged["academic_year"] = meta["academic_year"]

        return Response(merged)

    @transaction.atomic
    def put(self, request):
        school = SchoolSettings.objects.first()
        raw_payload = (
            {k: request.data.get(k) for k in request.data.keys()}
            if hasattr(request.data, "keys")
            else dict(request.data)
        )

        # Support deped_school_id alias cleanly if sent by frontend forms
        if not raw_payload.get("school_id") and raw_payload.get("deped_school_id"):
            raw_payload["school_id"] = str(raw_payload["deped_school_id"]).strip()[:30]

        if school:
            serializer = SchoolSettingsSerializer(
                school, data=raw_payload, partial=True, context={"request": request}
            )
        else:
            if not str(raw_payload.get("school_name") or "").strip():
                return Response(
                    {"error": "School name is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = SchoolSettingsSerializer(data=raw_payload, context={"request": request})

        serializer.is_valid(raise_exception=True)
        saved = migrate_inline_logos_to_files(serializer.save())
        cache.delete_many([SCHOOL_META_CACHE_KEY, "reports:system_status"])

        try:
            parsed_radius = int(saved.geofence_radius_meters or 150)
        except (TypeError, ValueError):
            parsed_radius = 150
        radius_val = min(5000, max(20, parsed_radius))

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

        serialized = dict(SchoolSettingsSerializer(saved, context={"request": request}).data)
        meta = get_school_metadata(request, school=saved)
        merged = {**meta, **{k: v for k, v in serialized.items() if v not in (None, "")}}
        resolved_school_id = _resolve_clean_school_id(saved, merged)
        merged["school_id"] = resolved_school_id
        merged["deped_school_id"] = resolved_school_id
        for logo_key in ("school_logo", "left_logo", "right_logo"):
            if meta.get(logo_key):
                merged[logo_key] = meta[logo_key]
        return Response(merged)

    def post(self, request):
        return self.put(request)

    def patch(self, request):
        return self.put(request)

    def delete(self, request):
        school = SchoolSettings.objects.first()
        field = str(request.query_params.get("field") or request.data.get("field") or "").strip()
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
                return Response(
                    {"error": "School leadership access required."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return self.partial_update_settings(request)
        return super().partial_update(request, *args, **kwargs)

    def partial_update_settings(self, request):
        if not is_school_leader(request.user):
            return Response(
                {"error": "School leadership access required."},
                status=status.HTTP_403_FORBIDDEN,
            )
        val = request.data.get("weekend_rest_enabled")
        if val is not None:
            enabled = (
                bool(val)
                if isinstance(val, bool)
                else str(val).strip().lower() in ("true", "1", "yes")
            )
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
        return Response(
            {"ok": True, "weekend_rest_enabled": True if current is None else bool(current)}
        )


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