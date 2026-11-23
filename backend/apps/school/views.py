# D:\AttendSure_V3\backend\apps\school\views.py
from django.core.cache import cache
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

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

WEEKEND_REST_CACHE_KEY = "school:calendar:weekend_rest_enabled"


def _wants_fresh_cache(request) -> bool:
    flag = str(request.query_params.get("nocache", "")).strip().lower()
    return flag in ("1", "true", "yes")


class PublicSchoolBrandingView(APIView):
    """Returns non-sensitive public school letterhead info for Web & Mobile Sign-In screens."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if _wants_fresh_cache(request):
            cache.delete(SCHOOL_META_CACHE_KEY)

        school = SchoolSettings.objects.select_related(
            "division_ref",
            "active_school_year",
            "campus_boundary",
            "principal_faculty",
            "principal_faculty__position_ref",
        ).first()
        meta = get_school_metadata(request, school=school)
        sid = str(meta.get("school_id") or "").strip()

        return Response(
            {
                "school_id": sid,
                "deped_school_id": sid,
                "school_name": meta.get("school_name", ""),
                "short_name": "",
                "region": meta.get("region", ""),
                "division": meta.get("division", ""),
                "district": meta.get("district", ""),
                "address": meta.get("school_address", ""),
                "contact_number": meta.get("school_contact", ""),
                "email": meta.get("school_email", ""),
                "principal_name": meta.get("principal_name", ""),
                "principal_title": meta.get("principal_title", ""),
                "academic_year": meta.get("academic_year", ""),
                "school_logo": meta.get("school_logo"),
                "left_logo": meta.get("left_logo"),
                "right_logo": meta.get("right_logo"),
                "is_configured": bool(meta.get("is_configured", False)),
            }
        )


class SchoolSettingsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get(self, request):
        if _wants_fresh_cache(request):
            cache.delete(SCHOOL_META_CACHE_KEY)

        school = SchoolSettings.objects.select_related(
            "division_ref",
            "active_school_year",
            "campus_boundary",
            "principal_faculty",
            "principal_faculty__position_ref",
            "principal_faculty__department_ref",
        ).first()
        if not school:
            meta = get_school_metadata(request)
            meta["deped_school_id"] = meta.get("school_id", "")
            return Response(meta)

        school = migrate_inline_logos_to_files(school)
        serialized = dict(SchoolSettingsSerializer(school, context={"request": request}).data)
        meta = get_school_metadata(request, school=school)
        merged = {**meta, **{k: v for k, v in serialized.items() if v not in (None, "")}}
        merged["deped_school_id"] = merged.get("school_id", "")
        for logo_key in ("school_logo", "left_logo", "right_logo"):
            if meta.get(logo_key):
                merged[logo_key] = meta[logo_key]
        return Response(merged)

    @transaction.atomic
    def put(self, request):
        school = SchoolSettings.objects.select_related(
            "division_ref", "active_school_year", "campus_boundary", "principal_faculty"
        ).first()
        raw_payload = (
            {k: request.data.get(k) for k in request.data.keys()}
            if hasattr(request.data, "keys")
            else dict(request.data)
        )
        if not raw_payload.get("school_id") and raw_payload.get("deped_school_id"):
            raw_payload["school_id"] = str(raw_payload["deped_school_id"]).strip()[:50]

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

        record_audit_log(
            request=request,
            table_name=saved._meta.db_table,
            record_id=saved.pk,
            action="UPDATE",
            changed_fields=list(raw_payload.keys()),
        )
        return self.get(request)

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


class SchoolHolidayViewSet(AuditedModelViewSet):
    queryset = SchoolHoliday.objects.order_by("holiday_date")
    serializer_class = SchoolHolidaySerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def _get_weekend_rest(self) -> bool:
        cached = cache.get(WEEKEND_REST_CACHE_KEY)
        if cached is not None:
            return bool(cached)
        school = SchoolSettings.objects.only("weekend_rest_enabled").first()
        val = bool(school.weekend_rest_enabled) if school else True
        cache.set(WEEKEND_REST_CACHE_KEY, val, timeout=300)
        return val

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if isinstance(response.data, dict):
            response.data["weekend_rest_enabled"] = self._get_weekend_rest()
            if "results" in response.data and "exceptions" not in response.data:
                response.data["exceptions"] = response.data["results"]
        return response

    def patch(self, request, *args, **kwargs):
        if "pk" not in kwargs:
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
            SchoolSettings.objects.all().update(weekend_rest_enabled=enabled)
            cache.set(WEEKEND_REST_CACHE_KEY, enabled, timeout=300)
            cache.delete(SCHOOL_META_CACHE_KEY)
            record_audit_log(
                request=request,
                table_name=SchoolHoliday._meta.db_table,
                record_id=0,
                action="UPDATE",
                new_data={"weekend_rest_enabled": enabled},
            )
            return Response({"ok": True, "weekend_rest_enabled": enabled})
        return Response({"ok": True, "weekend_rest_enabled": self._get_weekend_rest()})


class RoomViewSet(AuditedModelViewSet):
    queryset = Room.objects.select_related("building_ref").order_by("name")
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


class ClassPeriodViewSet(AuditedModelViewSet):
    serializer_class = ClassPeriodSerializer
    permission_classes = [permissions.IsAuthenticated, IsLeadershipOrReadOnly]

    def get_queryset(self):
        sec_id = self.request.query_params.get("section_id") or self.request.query_params.get("section")
        return get_class_periods_for_user(
            self.request.user,
            int(sec_id) if (sec_id and str(sec_id).isascii() and str(sec_id).isdigit()) else None,
        )