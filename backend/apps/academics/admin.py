"""
AttendSure V3 - Campus Administration (Printed QR ID & Mobile App Only)
File: backend/apps/academics/admin.py
"""

from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.utils.html import format_html

from .models import (
    AcademicYear,
    AppNotification,
    ClassSchedule,
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    FacultyProfile,
    GatePass,
    GeofenceSetting,
    GradeLevel,
    LoafingIncident,
    Schedule,
    ScheduleDay,
    SchoolProfile,
    Section,
    Student,
    Subject,
    SubjectAttendanceLog,
    UserProfile,
)

admin.site.site_header = "AttendSure Campus Administration"
admin.site.site_title = "AttendSure Portal"
admin.site.index_title = "School Operations & Mobile App Control"


class SecureAuditLogAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('code', 'start_date', 'end_date', 'status_badge')
    list_filter = ('is_active',)
    search_fields = ('code',)
    ordering = ('-start_date',)

    @admin.display(description='Status')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #16a34a; font-weight: bold;">ACTIVE</span>')
        return format_html('<span style="color: #64748b;">INACTIVE</span>')


@admin.register(SchoolProfile)
class SchoolProfileAdmin(admin.ModelAdmin):
    list_display = ('school_id', 'school_name', 'division', 'principal_name', 'updated_at')
    search_fields = ('school_id', 'school_name', 'division', 'principal_name')
    readonly_fields = ('updated_at',)


@admin.register(ClassSchedule)
class ClassScheduleAdmin(admin.ModelAdmin):
    list_display = ('label', 'am_arrival_cutoff', 'am_departure_time', 'pm_arrival_time', 'pm_departure_cutoff')


@admin.register(GeofenceSetting)
class GeofenceSettingAdmin(admin.ModelAdmin):
    list_display = ('name', 'latitude', 'longitude', 'radius_meters', 'is_active')
    list_filter = ('is_active',)


@admin.register(GradeLevel)
class GradeLevelAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'stage', 'level_order')
    ordering = ('level_order',)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'grade_level', 'academic_year', 'adviser', 'room_number')
    list_filter = ('academic_year', 'grade_level')
    search_fields = ('name', 'room_number', 'adviser__first_name', 'adviser__last_name')
    autocomplete_fields = ('adviser',)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'title', 'grade_level', 'tier', 'subject_type', 'units')
    list_filter = ('grade_level', 'tier', 'subject_type')
    search_fields = ('code', 'title')


class ScheduleDayInline(admin.TabularInline):
    model = ScheduleDay
    extra = 1


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ('section', 'subject', 'faculty', 'start_time', 'end_time', 'room_number')
    list_filter = ('section__academic_year', 'section__grade_level')
    search_fields = ('section__name', 'subject__code', 'subject__title', 'faculty__first_name', 'faculty__last_name')
    autocomplete_fields = ('section', 'subject', 'faculty')
    inlines = [ScheduleDayInline]


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('lrn', 'last_name', 'first_name', 'sex', 'masked_contact', 'parent_user', 'qr_ready', 'is_active')
    search_fields = ('lrn', 'last_name', 'first_name', 'qr_token', 'parent_contact')
    list_filter = ('sex', 'is_active')
    ordering = ('last_name', 'first_name')
    list_per_page = 50

    @admin.display(description='Parent Contact')
    def masked_contact(self, obj):
        phone = obj.parent_contact or ''
        return f"{phone[:4]}****{phone[-3:]}" if len(phone) >= 10 else (phone or "—")

    @admin.display(description='Printed QR ID')
    def qr_ready(self, obj):
        if obj.qr_token:
            return format_html('<span style="color: #16a34a; font-weight: bold;">QR READY</span>')
        return format_html('<span style="color: #dc2626;">MISSING</span>')


@admin.register(FacultyProfile)
class FacultyProfileAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'last_name', 'first_name', 'position', 'department', 'is_active')
    search_fields = ('employee_id', 'last_name', 'first_name', 'position', 'department')
    list_filter = ('department', 'is_active')
    ordering = ('last_name', 'first_name')
    list_per_page = 50


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'academic_year', 'status', 'enrollment_date')
    list_filter = ('academic_year', 'status', 'section__grade_level')
    search_fields = ('student__lrn', 'student__last_name', 'student__first_name', 'section__name')
    autocomplete_fields = ('student', 'section')
    list_per_page = 50


@admin.register(SubjectAttendanceLog)
class SubjectAttendanceLogAdmin(admin.ModelAdmin):
    list_display = ('student', 'schedule', 'faculty', 'status', 'attendance_date', 'scanned_at')
    list_filter = ('status', 'attendance_date')
    search_fields = ('student__lrn', 'student__last_name', 'faculty__last_name')
    readonly_fields = ('scanned_at',)
    list_per_page = 50


@admin.register(DailyAttendanceSummary)
class DailyAttendanceSummaryAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'attendance_date', 'status')
    list_filter = ('status', 'attendance_date', 'section')
    search_fields = ('student__lrn', 'student__last_name', 'section__name')
    list_per_page = 50


@admin.register(GatePass)
class GatePassAdmin(admin.ModelAdmin):
    list_display = ('pass_number', 'faculty', 'student', 'status', 'valid_from', 'valid_to')
    list_filter = ('status',)
    search_fields = ('pass_number', 'faculty__last_name', 'student__last_name', 'reason')


@admin.register(FacultyHeartbeat)
class FacultyHeartbeatAdmin(SecureAuditLogAdmin):
    list_display = ('faculty', 'latitude', 'longitude', 'is_inside_geofence', 'battery_level', 'recorded_at')
    list_filter = ('is_inside_geofence',)
    list_per_page = 50


@admin.register(LoafingIncident)
class LoafingIncidentAdmin(admin.ModelAdmin):
    list_display = ('faculty', 'incident_date', 'status', 'trigger_reason', 'created_at')
    list_filter = ('status', 'incident_date')


@admin.register(AppNotification)
class AppNotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'student', 'category', 'title', 'is_read', 'is_pushed', 'created_at')
    list_filter = ('category', 'is_read', 'is_pushed')
    search_fields = ('recipient__username', 'student__last_name', 'title')
    list_per_page = 50


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'phone_number', 'faculty')
    list_filter = ('role',)
    search_fields = ('user__username', 'phone_number', 'faculty__last_name')


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    fk_name = 'user'


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


try:
    admin.site.unregister(User)
except NotRegistered:
    pass

admin.site.register(User, UserAdmin)