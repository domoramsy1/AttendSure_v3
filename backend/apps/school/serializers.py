from decimal import Decimal, InvalidOperation
from rest_framework import serializers
from common.media import SchoolLogoField, build_media_url
from apps.accounts.models import TeacherProfile
from .models import (
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
    class Meta:
        model = Room
        fields = ["id", "name", "building", "capacity", "room_type", "is_active"]


class GradeLevelSerializer(serializers.ModelSerializer):
    class Meta:
        model = GradeLevel
        fields = ["id", "code", "name", "stage", "level_order"]


class SchoolYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = SchoolYear
        fields = ["id", "code", "start_date", "baseline_cutoff_date", "end_date", "is_active"]


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = ["id", "code", "title", "grade_level", "tier", "subject_type", "units"]


class SchoolHolidaySerializer(serializers.ModelSerializer):
    date = serializers.DateField(source="holiday_date")

    class Meta:
        model = SchoolHoliday
        fields = ["id", "date", "title", "created_at"]


class SchoolSettingsSerializer(serializers.ModelSerializer):
    school_logo = SchoolLogoField(required=False, allow_null=True)
    left_logo = SchoolLogoField(required=False, allow_null=True)
    right_logo = SchoolLogoField(required=False, allow_null=True)

    principal_faculty = serializers.PrimaryKeyRelatedField(
        source="principal_teacher",
        queryset=TeacherProfile.objects.all(),
        required=False,
        allow_null=True,
    )
    principal_photo_url = serializers.SerializerMethodField()
    principal_employee_id = serializers.SerializerMethodField()
    principal_department = serializers.SerializerMethodField()
    principal_email = serializers.SerializerMethodField()
    principal_contact_number = serializers.SerializerMethodField()

    class Meta:
        model = SchoolSettings
        fields = [
            "id", "school_id", "school_name", "region", "division", "district",
            "academic_year", "address", "contact_number", "email", "website",
            "principal_teacher", "principal_faculty", "principal_name",
            "principal_title", "superintendent_name",
            "principal_photo_url", "principal_employee_id", "principal_department",
            "principal_email", "principal_contact_number",
            "school_logo", "left_logo", "right_logo",
            "latitude", "longitude", "geofence_radius_meters", "updated_at",
        ]
        extra_kwargs = {
            "school_id": {"required": False, "allow_blank": True},
            "school_name": {"required": False, "allow_blank": True},
            "principal_teacher": {"required": False, "allow_null": True},
        }

    def to_internal_value(self, data):
        mutable = {}
        if hasattr(data, "keys"):
            for key in data.keys():
                mutable[key] = data.get(key)
        else:
            mutable = dict(data)

        alias_map = {
            "school_address": "address",
            "school_contact": "contact_number",
            "school_email": "email",
            "school_head": "principal_name",
            "radius_meters": "geofence_radius_meters",
            "geofence_radius": "geofence_radius_meters",
            "emblem": "school_logo",
            "main_logo": "school_logo",
        }
        for src_key, dest_key in alias_map.items():
            if src_key in mutable and dest_key not in mutable:
                mutable[dest_key] = mutable[src_key]

        for fk_key in ("principal_faculty", "principal_teacher"):
            if fk_key in mutable and str(mutable[fk_key]).strip().lower() in ("", "null", "none", "undefined"):
                mutable[fk_key] = None

        if "website" in mutable:
            raw_web = str(mutable.get("website") or "").strip()
            if raw_web and not raw_web.startswith(("http://", "https://")):
                mutable["website"] = f"https://{raw_web}"
            else:
                mutable["website"] = raw_web

        for coord_key in ("latitude", "longitude"):
            if coord_key in mutable:
                raw_coord = mutable[coord_key]
                if raw_coord in (None, "", "null", "undefined"):
                    mutable.pop(coord_key, None)
                else:
                    try:
                        mutable[coord_key] = Decimal(f"{float(raw_coord):.7f}")
                    except (TypeError, ValueError, InvalidOperation):
                        raise serializers.ValidationError({coord_key: f"Invalid {coord_key} value."})

        if "geofence_radius_meters" in mutable:
            raw_rad = mutable["geofence_radius_meters"]
            if raw_rad in (None, "", "null", "undefined"):
                mutable.pop("geofence_radius_meters", None)
            else:
                try:
                    mutable["geofence_radius_meters"] = max(20, min(5000, int(float(raw_rad))))
                except (TypeError, ValueError):
                    raise serializers.ValidationError({"geofence_radius_meters": "Invalid radius in meters."})

        return super().to_internal_value(mutable)

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        if instance.principal_teacher:
            if not instance.principal_name:
                instance.principal_name = instance.principal_teacher.full_name
            if not instance.principal_title and instance.principal_teacher.position:
                instance.principal_title = instance.principal_teacher.position
            instance.save(update_fields=["principal_name", "principal_title", "updated_at"])
        return instance

    def get_principal_photo_url(self, obj):
        if obj.principal_teacher and obj.principal_teacher.photo:
            return build_media_url(obj.principal_teacher.photo, self.context.get("request"))
        return None

    def get_principal_employee_id(self, obj) -> str:
        return obj.principal_teacher.employee_id if obj.principal_teacher else ""

    def get_principal_department(self, obj) -> str:
        return obj.principal_teacher.department if obj.principal_teacher else "Administration"

    def get_principal_email(self, obj) -> str:
        return obj.principal_teacher.email if obj.principal_teacher else ""

    def get_principal_contact_number(self, obj) -> str:
        return obj.principal_teacher.contact_number if obj.principal_teacher else ""


class SectionSerializer(serializers.ModelSerializer):
    grade_level_name = serializers.CharField(source="grade_level.name", read_only=True)
    adviser_name = serializers.CharField(source="adviser.full_name", read_only=True)
    school_year_code = serializers.CharField(source="school_year.code", read_only=True)
    display_label = serializers.SerializerMethodField()
    student_count = serializers.IntegerField(source="enrolled_count", read_only=True, default=0)

    class Meta:
        model = Section
        fields = [
            "id", "name", "code", "grade_level", "grade_level_name",
            "school_year", "school_year_code", "adviser", "adviser_name",
            "room", "room_number", "capacity", "track_strand",
            "display_label", "student_count", "is_active",
        ]
        extra_kwargs = {"school_year": {"required": False}}

    def get_display_label(self, obj) -> str:
        return format_section_label(obj.grade_level.name if obj.grade_level else "", obj.name)

    def create(self, validated_data):
        if not validated_data.get("school_year"):
            validated_data["school_year"] = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
        section = super().create(validated_data)
        sync_uniform_subjects_for_section(section)
        return section


class ClassPeriodSerializer(serializers.ModelSerializer):
    section_name = serializers.CharField(source="section.name", read_only=True)
    subject_code = serializers.CharField(source="subject.code", read_only=True)
    subject_title = serializers.CharField(source="subject.title", read_only=True)
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = ClassPeriod
        fields = [
            "id", "schedule_code", "section", "section_name",
            "subject", "subject_code", "subject_title",
            "teacher", "teacher_name", "room", "room_number",
            "days_of_week", "start_time", "end_time", "is_active",
        ]

    def get_teacher_name(self, obj) -> str:
        return obj.teacher.full_name if obj.teacher else "Unassigned"

    def create(self, validated_data):
        period = super().create(validated_data)
        sync_period_days(period, validated_data.get("days_of_week", "MON-FRI"))
        return period

    def update(self, instance, validated_data):
        period = super().update(instance, validated_data)
        if "days_of_week" in validated_data:
            sync_period_days(period, validated_data["days_of_week"])
        return period