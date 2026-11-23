# D:\AttendSure_V3\backend\apps\school\serializers.py
import math
from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import FacultyProfile
from apps.campus.models import CampusBoundary
from common.media import SchoolLogoField, build_media_url
from .models import (
    AdministrativeDivision,
    Building,
    ClassPeriod,
    GradeLevel,
    Room,
    SchoolHoliday,
    SchoolSettings,
    SchoolYear,
    Section,
    Subject,
)
from .selectors import format_section_label
from .services import sync_period_days, sync_uniform_subjects_for_section


class RoomSerializer(serializers.ModelSerializer):
    building = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Room
        fields = ["id", "name", "building", "capacity", "room_type", "is_active"]

    @transaction.atomic
    def create(self, validated_data):
        b_name = str(validated_data.pop("building", "") or "").strip()[:100]
        if b_name:
            b_obj, _ = Building.objects.get_or_create(name=b_name)
            validated_data["building_ref"] = b_obj
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        if "building" in validated_data:
            b_name = str(validated_data.pop("building") or "").strip()[:100]
            instance.building_ref = Building.objects.get_or_create(name=b_name)[0] if b_name else None
        return super().update(instance, validated_data)


class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = ["id", "code", "name", "stage", "level_order"]


class SchoolYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolYear
        fields = ["id", "code", "start_date", "baseline_cutoff_date", "end_date", "is_active"]


class SubjectSerializer(serializers.ModelSerializer):
    tier = serializers.CharField(source="subject_category", required=False, allow_blank=True)
    subject_type = serializers.CharField(source="subject_category", read_only=True)

    class Meta:
        model = Subject
        fields = ["id", "code", "title", "grade_level", "subject_category", "tier", "subject_type", "units"]


class SchoolHolidaySerializer(serializers.ModelSerializer):
    date = serializers.DateField(source="holiday_date")
    type = serializers.ChoiceField(
        source="holiday_type",
        choices=["HOLIDAY", "SUSPENSION", "EVENT"],
        required=False,
        default="HOLIDAY",
    )
    reason = serializers.CharField(source="title", required=False)

    class Meta:
        model = SchoolHoliday
        fields = ["id", "date", "type", "title", "reason", "created_at"]
        extra_kwargs = {"title": {"required": False}}

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if not mutable.get("reason") and mutable.get("title"):
            mutable["reason"] = mutable["title"]
        if "type" in mutable and mutable["type"]:
            mutable["type"] = str(mutable["type"]).strip().upper()
        return super().to_internal_value(mutable)

    def validate(self, attrs):
        if not self.partial and not str(attrs.get("title") or "").strip():
            raise serializers.ValidationError({"title": "Holiday or event title is required."})
        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["type"] = instance.holiday_type
        data["reason"] = instance.title
        data["affects_all_grades"] = True
        return data


class SchoolSettingsSerializer(serializers.ModelSerializer):
    school_logo = SchoolLogoField(required=False, allow_null=True)
    left_logo = SchoolLogoField(required=False, allow_null=True)
    right_logo = SchoolLogoField(required=False, allow_null=True)

    region = serializers.CharField(required=False, allow_blank=True, write_only=True)
    division = serializers.CharField(required=False, allow_blank=True, write_only=True)
    district = serializers.CharField(required=False, allow_blank=True, write_only=True)
    academic_year = serializers.CharField(required=False, allow_blank=True, write_only=True)
    latitude = serializers.FloatField(required=False, write_only=True)
    longitude = serializers.FloatField(required=False, write_only=True)
    geofence_radius_meters = serializers.IntegerField(required=False, write_only=True)

    principal_faculty = serializers.PrimaryKeyRelatedField(
        queryset=FacultyProfile.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = SchoolSettings
        fields = [
            "id",
            "school_id",
            "school_name",
            "region",
            "division",
            "district",
            "academic_year",
            "address",
            "contact_number",
            "email",
            "website",
            "principal_faculty",
            "superintendent_name",
            "school_logo",
            "left_logo",
            "right_logo",
            "latitude",
            "longitude",
            "geofence_radius_meters",
            "weekend_rest_enabled",
            "updated_at",
        ]
        extra_kwargs = {
            "school_id": {"required": False, "allow_blank": True},
            "school_name": {"required": False, "allow_blank": True},
        }

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        alias_map = {
            "school_address": "address",
            "school_contact": "contact_number",
            "school_email": "email",
            "radius_meters": "geofence_radius_meters",
            "geofence_radius": "geofence_radius_meters",
            "emblem": "school_logo",
            "main_logo": "school_logo",
            "principal_teacher": "principal_faculty",
        }
        for src_key, dest_key in alias_map.items():
            if src_key in mutable and dest_key not in mutable:
                mutable[dest_key] = mutable[src_key]

        if "principal_faculty" in mutable and str(mutable["principal_faculty"]).strip().lower() in (
            "",
            "null",
            "none",
            "undefined",
        ):
            mutable["principal_faculty"] = None

        if "website" in mutable:
            raw_web = str(mutable.get("website") or "").strip()
            mutable["website"] = (
                f"https://{raw_web}"
                if (raw_web and not raw_web.startswith(("http://", "https://")))
                else raw_web
            )

        for coord_key in ("latitude", "longitude"):
            if coord_key in mutable:
                raw_coord = mutable[coord_key]
                if raw_coord in (None, "", "null", "undefined"):
                    mutable.pop(coord_key, None)
                else:
                    try:
                        parsed = float(raw_coord)
                        if not math.isfinite(parsed):
                            raise ValueError("non-finite")
                        mutable[coord_key] = round(parsed, 7)
                    except (TypeError, ValueError):
                        raise serializers.ValidationError({coord_key: f"Invalid {coord_key} value."})

        if "geofence_radius_meters" in mutable:
            raw_rad = mutable["geofence_radius_meters"]
            if raw_rad in (None, "", "null", "undefined"):
                mutable.pop("geofence_radius_meters", None)
            else:
                try:
                    parsed_rad = float(raw_rad)
                    if not math.isfinite(parsed_rad):
                        raise ValueError("non-finite")
                    mutable["geofence_radius_meters"] = max(20, min(5000, int(parsed_rad)))
                except (TypeError, ValueError, OverflowError):
                    raise serializers.ValidationError(
                        {"geofence_radius_meters": "Invalid radius in meters."}
                    )

        return super().to_internal_value(mutable)

    def _apply_3nf_relations(self, validated_data: dict, instance: SchoolSettings | None = None):
        has_div = any(k in validated_data for k in ("region", "division", "district"))
        curr_div = instance.division_ref if instance else None
        region = validated_data.pop("region", curr_div.region if curr_div else "")
        division = validated_data.pop("division", curr_div.division if curr_div else "")
        district = validated_data.pop("district", curr_div.district if curr_div else "")
        if has_div and (region or division or district):
            div_obj, _ = AdministrativeDivision.objects.get_or_create(
                region=str(region).strip()[:100],
                division=str(division).strip()[:100],
                district=str(district).strip()[:100],
            )
            validated_data["division_ref"] = div_obj

        sy_code = str(validated_data.pop("academic_year", "") or "").strip()
        if sy_code:
            sy_obj = SchoolYear.objects.filter(code__iexact=sy_code).first()
            if sy_obj:
                validated_data["active_school_year"] = sy_obj
        elif not instance and "active_school_year" not in validated_data:
            active_sy = SchoolYear.objects.filter(is_active=True).first()
            if active_sy:
                validated_data["active_school_year"] = active_sy

        has_gps = any(k in validated_data for k in ("latitude", "longitude", "geofence_radius_meters"))
        curr_b = (instance.campus_boundary if instance and instance.campus_boundary else None) or (
            CampusBoundary.objects.filter(is_active=True).first() or CampusBoundary.objects.first()
        )
        lat = validated_data.pop("latitude", curr_b.center_lat if curr_b else 8.4858)
        lng = validated_data.pop("longitude", curr_b.center_lng if curr_b else 124.6567)
        rad = validated_data.pop("geofence_radius_meters", curr_b.radius_meters if curr_b else 150)

        if has_gps or not curr_b:
            b_name = str(
                validated_data.get("school_name")
                or (instance.school_name if instance else "Main Campus")
            )[:120]
            if curr_b:
                curr_b.name = b_name
                curr_b.center_lat = float(lat)
                curr_b.center_lng = float(lng)
                curr_b.radius_meters = int(rad)
                curr_b.is_active = True
                curr_b.save()
                validated_data["campus_boundary"] = curr_b
            else:
                validated_data["campus_boundary"] = CampusBoundary.objects.create(
                    name=b_name,
                    center_lat=float(lat),
                    center_lng=float(lng),
                    radius_meters=int(rad),
                    is_active=True,
                )

    @transaction.atomic
    def create(self, validated_data):
        if not validated_data.get("school_id"):
            validated_data["school_id"] = "304100"
        self._apply_3nf_relations(validated_data, instance=None)
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        self._apply_3nf_relations(validated_data, instance=instance)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        div = instance.division_ref
        sy = instance.active_school_year or SchoolYear.objects.filter(is_active=True).first()
        b = instance.campus_boundary or CampusBoundary.objects.filter(is_active=True).first()
        p = instance.principal_faculty

        data["region"] = div.region if div else ""
        data["division"] = div.division if div else ""
        data["district"] = div.district if div else ""
        data["academic_year"] = sy.code if sy else ""
        data["latitude"] = float(b.center_lat) if b else 8.4858
        data["longitude"] = float(b.center_lng) if b else 124.6567
        data["geofence_radius_meters"] = int(b.radius_meters) if b else 150
        data["principal_teacher"] = p.id if p else None
        data["principal_name"] = p.full_name if p else ""
        data["principal_title"] = p.position if (p and p.position) else "School Principal"
        data["principal_employee_id"] = p.employee_id if p else ""
        data["principal_department"] = p.department if p else "Administration"
        data["principal_email"] = p.email if p else ""
        data["principal_contact_number"] = p.contact_number if p else ""
        data["principal_photo_url"] = (
            build_media_url(p.photo, self.context.get("request")) if (p and p.photo) else None
        )
        return data


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    grade_level_code = serializers.CharField(source="grade_level.code", read_only=True)
    adviser_id = serializers.IntegerField(source="adviser.id", read_only=True, allow_null=True)
    adviser_name = serializers.CharField(source="adviser.full_name", read_only=True, default="")
    adviser_employee_id = serializers.CharField(source="adviser.employee_id", read_only=True, default="")
    adviser_photo_url = serializers.SerializerMethodField()
    school_year_code = serializers.CharField(source="school_year.code", read_only=True)
    room_number = serializers.CharField(required=False, allow_blank=True, default="")
    display_label = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(source="enrolled_count", read_only=True, default=0)

    class Meta:
        model = Section
        fields = [
            "id",
            "name",
            "code",
            "grade_level",
            "grade_level_name",
            "grade_level_code",
            "school_year",
            "school_year_code",
            "adviser",
            "adviser_id",
            "adviser_name",
            "adviser_employee_id",
            "adviser_photo_url",
            "room",
            "room_number",
            "capacity",
            "track_strand",
            "display_label",
            "student_count",
            "is_active",
        ]
        extra_kwargs = {"school_year": {"required": False}}
        validators = []

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "adviser" not in mutable and "adviser_id" in mutable:
            mutable["adviser"] = mutable.get("adviser_id")
        return super().to_internal_value(mutable)

    def get_adviser_photo_url(self, obj):
        if obj.adviser and obj.adviser.photo:
            return build_media_url(obj.adviser.photo, self.context.get("request"))
        return None

    def get_display_label(self, obj) -> str:
        return format_section_label(obj.grade_level.name if obj.grade_level else "", obj.name)

    def validate(self, attrs):
        sy = attrs.get("school_year") or (self.instance.school_year if self.instance else None)
        if not sy:
            sy = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
            if not sy:
                raise serializers.ValidationError(
                    {"school_year": "Create an active School Year before adding sections."}
                )
            attrs["school_year"] = sy

        grade_level = attrs.get("grade_level") or (self.instance.grade_level if self.instance else None)
        name = attrs.get("name") if "name" in attrs else (self.instance.name if self.instance else None)
        if sy and grade_level and name:
            dup_qs = Section.objects.filter(school_year=sy, grade_level=grade_level, name=name)
            if self.instance:
                dup_qs = dup_qs.exclude(pk=self.instance.pk)
            if dup_qs.exists():
                raise serializers.ValidationError(
                    {"name": "A section with this name already exists for this grade level and school year."}
                )
        return attrs

    def _resolve_room(self, validated_data: dict):
        room_num = str(validated_data.pop("room_number", "") or "").strip()[:100]
        if room_num and not validated_data.get("room"):
            room_obj, _ = Room.objects.get_or_create(name=room_num)
            validated_data["room"] = room_obj

    @transaction.atomic
    def create(self, validated_data):
        self._resolve_room(validated_data)
        section = super().create(validated_data)
        sync_uniform_subjects_for_section(section)
        return section

    @transaction.atomic
    def update(self, instance, validated_data):
        self._resolve_room(validated_data)
        return super().update(instance, validated_data)


class ClassPeriodSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)
    grade_level_name = serializers.CharField(source="section.grade_level.name", read_only=True, default="")
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_title = serializers.CharField(source="subject.title", read_only=True)
    room_name = serializers.CharField(source="room.name", read_only=True, default="")
    room_number = serializers.CharField(required=False, allow_blank=True, default="")
    days_of_week = serializers.CharField(required=False, default="MON-FRI")
    faculty_id = serializers.IntegerField(read_only=True)
    faculty_name = serializers.SerializerMethodField()
    faculty_employee_id = serializers.SerializerMethodField()
    faculty_photo_url = serializers.SerializerMethodField()
    teacher = serializers.IntegerField(source="faculty_id", read_only=True)
    teacher_id = serializers.IntegerField(source="faculty_id", read_only=True)
    teacher_name = serializers.SerializerMethodField()
    teacher_employee_id = serializers.SerializerMethodField()
    teacher_photo_url = serializers.SerializerMethodField()

    class Meta:
        model = ClassPeriod
        fields = [
            "id",
            "schedule_code",
            "section",
            "section_name",
            "grade_level_name",
            "subject",
            "subject_code",
            "subject_title",
            "faculty",
            "faculty_id",
            "faculty_name",
            "faculty_employee_id",
            "faculty_photo_url",
            "teacher",
            "teacher_id",
            "teacher_name",
            "teacher_employee_id",
            "teacher_photo_url",
            "room",
            "room_name",
            "room_number",
            "days_of_week",
            "start_time",
            "end_time",
            "is_active",
        ]

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "faculty" not in mutable:
            for alias in ("faculty_id", "teacher", "teacher_id"):
                if alias in mutable:
                    mutable["faculty"] = mutable[alias]
                    break
        if "section" not in mutable and "section_id" in mutable:
            mutable["section"] = mutable["section_id"]
        if "subject" not in mutable and "subject_id" in mutable:
            mutable["subject"] = mutable["subject_id"]
        if "room" not in mutable and "room_id" in mutable:
            mutable["room"] = mutable["room_id"]
        return super().to_internal_value(mutable)

    def get_faculty_name(self, obj) -> str:
        return obj.faculty.full_name if obj.faculty else "Unassigned"

    def get_teacher_name(self, obj) -> str:
        return self.get_faculty_name(obj)

    def get_faculty_employee_id(self, obj) -> str:
        return obj.faculty.employee_id if obj.faculty else ""

    def get_teacher_employee_id(self, obj) -> str:
        return self.get_faculty_employee_id(obj)

    def get_faculty_photo_url(self, obj):
        if obj.faculty and obj.faculty.photo:
            return build_media_url(obj.faculty.photo, self.context.get("request"))
        return None

    def get_teacher_photo_url(self, obj):
        return self.get_faculty_photo_url(obj)

    def _resolve_room(self, validated_data: dict):
        room_num = str(validated_data.pop("room_number", "") or "").strip()[:100]
        if room_num and not validated_data.get("room"):
            room_obj, _ = Room.objects.get_or_create(name=room_num)
            validated_data["room"] = room_obj

    @transaction.atomic
    def create(self, validated_data):
        days_str = validated_data.pop("days_of_week", "MON-FRI")
        self._resolve_room(validated_data)
        period = super().create(validated_data)
        sync_period_days(period, days_str)
        return period

    @transaction.atomic
    def update(self, instance, validated_data):
        days_str = validated_data.pop("days_of_week", None)
        self._resolve_room(validated_data)
        period = super().update(instance, validated_data)
        if days_str is not None:
            sync_period_days(period, days_str)
        return period