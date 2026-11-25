# AttendSure Backend - School Data Serializers
# File: D:\AttendSure_V3\backend\apps\school\serializers.py

from decimal import Decimal
import math
from django.core.cache import cache
from django.db import transaction
from rest_framework import serializers

from apps.accounts.models import TeacherProfile
from apps.campus.models import CampusBoundary
from common.media import SchoolLogoField, build_media_url
from common.validators import clean_text as _clean_text
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
    expand_schedule_days,
)
from .selectors import format_section_label
from .services import (
    check_class_period_conflicts,
    check_section_conflicts,
    normalize_day_of_week,
    sync_uniform_subjects_for_section,
)


class RoomSerializer(serializers.ModelSerializer):
    building = serializers.CharField(required=False, allow_blank=True, default="")

    class Meta:
        model = Room
        fields = ["id", "name", "building", "capacity", "room_type", "is_active"]

    def validate_name(self, value: str) -> str:
        clean = _clean_text(value, 100)
        if not clean:
            raise serializers.ValidationError("Classroom name is required.")
        qs = Room.objects.filter(name__iexact=clean)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A classroom with this name already exists.")
        return clean

    def to_representation(self, instance: Room) -> dict:
        return {
            "id": instance.id,
            "name": instance.name,
            "building": instance.building_name,
            "capacity": instance.capacity,
            "room_type": instance.room_type,
            "is_active": instance.is_active,
        }

    @transaction.atomic
    def create(self, validated_data):
        b_name = _clean_text(validated_data.pop("building", ""), 100)
        validated_data["name"] = _clean_text(validated_data.get("name", ""), 100)
        if b_name:
            b_obj, _ = Building.objects.get_or_create(name=b_name)
            validated_data["building"] = b_obj
        return super().create(validated_data)

    @transaction.atomic
    def update(self, instance, validated_data):
        if "building" in validated_data:
            b_name = _clean_text(validated_data.pop("building"), 100)
            instance.building = Building.objects.get_or_create(name=b_name)[0] if b_name else None
        if "name" in validated_data:
            validated_data["name"] = _clean_text(validated_data["name"], 100)
        return super().update(instance, validated_data)


class GradeLevelSerializer(serializers.ModelSerializer):
    level_order = serializers.IntegerField(source="level_number", required=False)

    class Meta:
        model = GradeLevel
        fields = ["id", "level_number", "level_order", "code", "name", "stage"]
        extra_kwargs = {
            "code": {"required": False, "allow_blank": True},
            "level_number": {"required": False},
        }

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "level_number" not in mutable and "level_order" in mutable:
            mutable["level_number"] = mutable["level_order"]
        if "name" in mutable:
            mutable["name"] = _clean_text(mutable["name"], 100)
        if "code" in mutable:
            mutable["code"] = _clean_text(mutable["code"], 20)
        return super().to_internal_value(mutable)

    def validate(self, attrs):
        if not self.instance and "level_number" not in attrs:
            raise serializers.ValidationError({"level_number": "Grade level number is required."})
        return attrs


class SchoolYearSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source="name", required=False)

    class Meta:
        model = SchoolYear
        fields = ["id", "name", "code", "start_date", "baseline_cutoff_date", "end_date", "is_active"]
        extra_kwargs = {"name": {"required": False}}

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if not mutable.get("name") and mutable.get("code"):
            mutable["name"] = _clean_text(mutable["code"], 20)
        elif mutable.get("name"):
            mutable["name"] = _clean_text(mutable["name"], 20)
        return super().to_internal_value(mutable)

    def validate(self, attrs):
        if not self.instance and not attrs.get("name"):
            raise serializers.ValidationError({"name": "School year name is required (e.g., 2026-2027)."})
        return attrs


class SubjectSerializer(serializers.ModelSerializer):
    tier = serializers.CharField(source="subject_category", required=False, allow_blank=True)
    subject_type = serializers.CharField(source="subject_category", read_only=True)

    class Meta:
        model = Subject
        fields = ["id", "code", "title", "grade_level", "subject_category", "tier", "subject_type", "units"]

    def validate_code(self, value: str) -> str:
        clean = _clean_text(value, 30)
        if not clean:
            raise serializers.ValidationError("Subject code is required.")
        qs = Subject.objects.filter(code__iexact=clean)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A subject with this code already exists.")
        return clean

    def validate_title(self, value: str) -> str:
        return _clean_text(value, 200)


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
            mutable["reason"] = _clean_text(mutable["title"], 150)
        elif mutable.get("reason"):
            mutable["reason"] = _clean_text(mutable["reason"], 150)
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
    school_year = serializers.CharField(required=False, allow_blank=True, write_only=True)
    latitude = serializers.FloatField(required=False, write_only=True)
    longitude = serializers.FloatField(required=False, write_only=True)
    geofence_radius_meters = serializers.IntegerField(required=False, write_only=True)

    principal_teacher = serializers.PrimaryKeyRelatedField(
        queryset=TeacherProfile.objects.all(),
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
            "school_year",
            "academic_year",
            "address",
            "contact_number",
            "email",
            "website",
            "principal_teacher",
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
        }
        for src_key, dest_key in alias_map.items():
            if src_key in mutable and dest_key not in mutable:
                mutable[dest_key] = mutable[src_key]

        if "principal_teacher" in mutable and str(mutable["principal_teacher"]).strip().lower() in (
            "",
            "null",
            "none",
            "undefined",
        ):
            mutable["principal_teacher"] = None

        for txt_key in ("school_id", "school_name", "address", "superintendent_name", "region", "division", "district"):
            if txt_key in mutable and isinstance(mutable[txt_key], str):
                mutable[txt_key] = _clean_text(mutable[txt_key], 255)

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
                        mutable[coord_key] = round(parsed, 6)
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
                region=_clean_text(region, 100),
                division=_clean_text(division, 100),
                district=_clean_text(district, 100),
            )
            validated_data["division_ref"] = div_obj

        sy_name = _clean_text(
            validated_data.pop("school_year", "") or validated_data.pop("academic_year", ""), 20
        )
        if sy_name:
            sy_obj = SchoolYear.objects.filter(name__iexact=sy_name).first()
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
        lat = validated_data.pop("latitude", float(curr_b.center_latitude) if curr_b else 8.4858)
        lng = validated_data.pop("longitude", float(curr_b.center_longitude) if curr_b else 124.6567)
        rad = validated_data.pop("geofence_radius_meters", curr_b.radius_meters if curr_b else 150)

        if has_gps or not curr_b:
            b_name = _clean_text(
                validated_data.get("school_name")
                or (instance.school_name if instance else "Main Campus"),
                150,
            ) or "Main Campus"
            if curr_b:
                curr_b.campus_name = b_name
                curr_b.center_latitude = Decimal(f"{float(lat):.6f}")
                curr_b.center_longitude = Decimal(f"{float(lng):.6f}")
                curr_b.radius_meters = int(rad)
                curr_b.is_active = True
                curr_b.save()
                validated_data["campus_boundary"] = curr_b
            else:
                validated_data["campus_boundary"] = CampusBoundary.objects.create(
                    campus_name=b_name,
                    center_latitude=Decimal(f"{float(lat):.6f}"),
                    center_longitude=Decimal(f"{float(lng):.6f}"),
                    radius_meters=int(rad),
                    is_active=True,
                )
            cache.delete("campus:active_boundary")

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

    def to_representation(self, instance: SchoolSettings):
        data = super().to_representation(instance)
        div = instance.division_ref
        sy = instance.active_school_year or SchoolYear.objects.filter(is_active=True).first()
        b = instance.campus_boundary or CampusBoundary.objects.filter(is_active=True).first()
        p = instance.principal_teacher

        data["region"] = div.region if div else ""
        data["division"] = div.division if div else ""
        data["district"] = div.district if div else ""
        data["school_year"] = sy.name if sy else ""
        data["academic_year"] = sy.name if sy else ""
        data["latitude"] = float(b.center_latitude) if b else 8.4858
        data["longitude"] = float(b.center_longitude) if b else 124.6567
        data["geofence_radius_meters"] = int(b.radius_meters) if b else 150
        data["principal_teacher"] = p.id if p else None
        data["principal_name"] = p.full_name if p else ""
        data["principal_title"] = (
            p.position_title if (p and p.position_title) else "School Principal"
        )
        data["principal_employee_id"] = p.employee_id if p else ""
        data["principal_department"] = p.department_name if p else "Administration"
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
    school_year_name = serializers.CharField(source="school_year.name", read_only=True)
    school_year_code = serializers.CharField(source="school_year.name", read_only=True)
    room_number = serializers.CharField(source="room_name", required=False, allow_blank=True)
    display_label = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(source="enrolled_count", read_only=True, default=0)
    scheduled_subjects_count = serializers.SerializerMethodField()
    allow_multiple_advisories = serializers.BooleanField(required=False, default=False, write_only=True)

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
            "school_year_name",
            "school_year_code",
            "adviser",
            "adviser_id",
            "adviser_name",
            "adviser_employee_id",
            "adviser_photo_url",
            "room_name",
            "room_number",
            "capacity",
            "track_strand",
            "display_label",
            "student_count",
            "scheduled_subjects_count",
            "allow_multiple_advisories",
            "is_active",
        ]
        extra_kwargs = {"school_year": {"required": False}, "room_name": {"required": False}}
        validators = []

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "adviser" not in mutable and "adviser_id" in mutable:
            mutable["adviser"] = mutable.get("adviser_id")
        if "adviser" in mutable and str(mutable["adviser"]).strip().lower() in ("", "null", "none", "undefined"):
            mutable["adviser"] = None
        if "room_name" not in mutable and "room_number" in mutable:
            mutable["room_name"] = _clean_text(mutable.get("room_number", ""), 100)
        if "name" in mutable:
            mutable["name"] = _clean_text(mutable["name"], 100)
        if "room_name" in mutable:
            mutable["room_name"] = _clean_text(mutable["room_name"], 100)
        return super().to_internal_value(mutable)

    def get_adviser_photo_url(self, obj):
        if obj.adviser and obj.adviser.photo:
            return build_media_url(obj.adviser.photo, self.context.get("request"))
        return None

    def get_display_label(self, obj) -> str:
        return format_section_label(obj.grade_level.name if obj.grade_level else "", obj.name)

    def get_scheduled_subjects_count(self, obj) -> int:
        annotated = getattr(obj, "active_periods_count", None)
        if annotated is not None:
            return int(annotated)
        return ClassPeriod.objects.filter(section_id=obj.id, is_active=True).count()

    def validate(self, attrs):
        allow_multiple = bool(attrs.pop("allow_multiple_advisories", False))
        self._allow_multiple_advisories_used = allow_multiple

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
        adviser = attrs.get("adviser") if "adviser" in attrs else (self.instance.adviser if self.instance else None)
        is_active = attrs.get("is_active") if "is_active" in attrs else (self.instance.is_active if self.instance else True)
        room_name = attrs.get("room_name") if "room_name" in attrs else (self.instance.room_name if self.instance else "")

        result = check_section_conflicts(
            school_year=sy,
            grade_level_id=grade_level.id if grade_level else None,
            name=name or "",
            adviser=adviser,
            room_name=room_name or "",
            exclude_id=self.instance.pk if self.instance else None,
            is_active=bool(is_active),
        )

        if result["name_taken"]:
            raise serializers.ValidationError({"name": result["name_message"]})

        adv_info = result["adviser_conflict"]
        if adviser is not None and not adv_info["can_handle_classes"]:
            raise serializers.ValidationError({"adviser": adv_info["message"]})

        adviser_changed_or_new = (
            (not self.instance)
            or (self.instance.adviser_id != (adviser.id if adviser else None))
            or (self.instance.school_year_id != sy.id)
            or (bool(is_active) and not self.instance.is_active)
        )
        if adv_info["has_existing_advisory"] and adviser_changed_or_new and not allow_multiple:
            raise serializers.ValidationError({"adviser": adv_info["message"]})

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        section = super().create(validated_data)
        sync_uniform_subjects_for_section(section)
        return section


class ClassPeriodSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)
    grade_level_name = serializers.CharField(source="section.grade_level.name", read_only=True, default="")
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_title = serializers.CharField(source="subject.title", read_only=True)
    room_name = serializers.CharField(read_only=True)
    days_of_week = serializers.CharField(source="day_of_week", required=False)
    teacher_id = serializers.IntegerField(read_only=True)
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
            "teacher",
            "teacher_id",
            "teacher_name",
            "teacher_employee_id",
            "teacher_photo_url",
            "room_name",
            "day_of_week",
            "days_of_week",
            "start_time",
            "end_time",
            "is_active",
        ]

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "teacher" not in mutable and "teacher_id" in mutable:
            mutable["teacher"] = mutable["teacher_id"]
        if "section" not in mutable and "section_id" in mutable:
            mutable["section"] = mutable["section_id"]
        if "subject" not in mutable and "subject_id" in mutable:
            mutable["subject"] = mutable["subject_id"]
        raw_dow = mutable.get("day_of_week") or mutable.get("days_of_week")
        if raw_dow is not None:
            mutable["day_of_week"] = normalize_day_of_week(raw_dow)
            mutable.pop("days_of_week", None)
        return super().to_internal_value(mutable)

    def _expand_days(self, dow: str) -> set[int]:
        return expand_schedule_days(dow)

    def validate(self, attrs):
        section = attrs.get("section") if "section" in attrs else (self.instance.section if self.instance else None)
        teacher = attrs.get("teacher") if "teacher" in attrs else (self.instance.teacher if self.instance else None)
        day_of_week = attrs.get("day_of_week") if "day_of_week" in attrs else (self.instance.day_of_week if self.instance else "ALL_WEEKDAYS")
        start_time = attrs.get("start_time") if "start_time" in attrs else (self.instance.start_time if self.instance else None)
        end_time = attrs.get("end_time") if "end_time" in attrs else (self.instance.end_time if self.instance else None)
        is_active = attrs.get("is_active") if "is_active" in attrs else (self.instance.is_active if self.instance else True)

        result = check_class_period_conflicts(
            section=section,
            teacher=teacher,
            day_of_week=day_of_week,
            start_time=start_time,
            end_time=end_time,
            exclude_id=self.instance.pk if self.instance else None,
            is_active=bool(is_active),
        )
        if result["time_error"]:
            raise serializers.ValidationError({"end_time": result["time_error"]})
        if result["teacher_conflict"]:
            raise serializers.ValidationError({"teacher": result["teacher_conflict"]})
        if result["section_conflict"]:
            raise serializers.ValidationError({"start_time": result["section_conflict"]})
        if result["room_conflict"]:
            raise serializers.ValidationError({"room_name": result["room_conflict"]})

        return attrs

    def get_teacher_name(self, obj) -> str:
        return obj.teacher.full_name if obj.teacher else "Unassigned"

    def get_teacher_employee_id(self, obj) -> str:
        return obj.teacher.employee_id if obj.teacher else ""

    def get_teacher_photo_url(self, obj):
        if obj.teacher and obj.teacher.photo:
            return build_media_url(obj.teacher.photo, self.context.get("request"))
        return None
