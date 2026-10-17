"""
AttendSure - Campus Administration & IoT Security Architecture
File: backend/apps/academics/admin.py (or core/admin.py)
"""

from django.contrib import admin
from django.contrib.admin.sites import NotRegistered
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from django.utils.html import format_html

from .models import (
    AcademicYear,
    ClassSchedule,
    DailyAttendanceSummary,
    Enrollment,
    FacultyHeartbeat,
    GatePass,
    GeofenceSetting,
    GradeLevel,
    IoTKiosk,
    LoafingIncident,
    Schedule,
    ScheduleDay,
    SchoolProfile,
    Section,
    SmsOutbox,
    FacultyGateLog,
    FacultyProfile,
    Student,
    StudentGateLog,
    Subject,
    SubjectAttendanceLog,
    UserProfile,
)

# Custom Institutional Portal Branding
admin.site.site_header = "AttendSure Campus Administration"
admin.site.site_title = "AttendSure Portal"
admin.site.index_title = "School Operations & IoT Telemetry Control"


# ==============================================================================
# CYBERSECURITY BASE: IMMUTABLE AUDIT LOG (WRITE-ONCE, NEVER EDIT OR DELETE)
# ==============================================================================

class SecureAuditLogAdmin(admin.ModelAdmin):
    """
    Prevents tampering with hardware, security, or GPS logs.
    Once created by an IoT device or mobile phone, records cannot be edited or removed.
    """
    def has_add_permission(self, request):
        # Only IoT hardware and automated APIs may generate logs, not human admins
        return False

    def has_change_permission(self, request, obj=None):
        # Prevents editing historical scans or altering location stamps
        return False

    def has_delete_permission(self, request, obj=None):
        # Prevents deleting evidence or attendance trails
        return False


# ==============================================================================
# 1. ACADEMIC CONFIGURATION & INSTITUTION
# ==============================================================================

@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('code', 'start_date', 'end_date', 'status_badge')
    list_filter = ('is_active',)
    search_fields = ('code',)
    ordering = ('-start_date',)
    actions = ['activate_academic_year']

    @admin.display(description='Academic Status')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #16a34a; font-weight: bold;">● ACTIVE</span>')
        return format_html('<span style="color: #64748b;">INACTIVE</span>')

    @admin.action(description="Activate selected year (Deactivates others)")
    def activate_academic_year(self, request, queryset):
        AcademicYear.objects.update(is_active=False)
        queryset.update(is_active=True)


@admin.register(SchoolProfile)
class SchoolProfileAdmin(admin.ModelAdmin):
    list_display = (
        'school_id',
        'school_name',
        'division',
        'principal_name',
        'updated_at',
    )
    search_fields = ('school_id', 'school_name', 'division', 'principal_name')
    readonly_fields = ('updated_at',)


@admin.register(ClassSchedule)
class ClassScheduleAdmin(admin.ModelAdmin):
    list_display = ('label', 'am_arrival_cutoff', 'am_departure_time', 'pm_arrival_time', 'pm_departure_cutoff')
    search_fields = ('label',)


@admin.register(GeofenceSetting)
class GeofenceSettingAdmin(admin.ModelAdmin):
    list_display = ('name', 'latitude', 'longitude', 'radius_meters', 'status_badge')
    list_filter = ('is_active',)
    search_fields = ('name',)

    @admin.display(description='Geofence State')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #16a34a; font-weight: bold;">ACTIVE BOUNDARY</span>')
        return format_html('<span style="color: #dc2626; font-weight: bold;">DISABLED</span>')


@admin.register(GradeLevel)
class GradeLevelAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'stage', 'level_order')
    list_filter = ('stage',)
    search_fields = ('name', 'code')
    ordering = ('level_order',)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'grade_level', 'academic_year', 'adviser', 'room_number')
    list_filter = ('academic_year', 'grade_level')
    search_fields = ('name', 'room_number', 'adviser__first_name', 'adviser__last_name')
    autocomplete_fields = ('adviser',)
    list_select_related = ('grade_level', 'academic_year', 'adviser')


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'title', 'tier', 'subject_type', 'units')
    list_filter = ('tier', 'subject_type')
    search_fields = ('code', 'title')


# ==============================================================================
# 2. SCHEDULES & TIMETABLE
# ==============================================================================

class ScheduleDayInline(admin.TabularInline):
    model = ScheduleDay
    extra = 1


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ('section', 'subject', 'faculty', 'start_time', 'end_time', 'room_number')
    list_filter = ('section__academic_year', 'section__grade_level')
    search_fields = ('section__name', 'subject__code', 'subject__title', 'faculty__first_name', 'faculty__last_name')
    autocomplete_fields = ('section', 'subject', 'faculty')
    list_select_related = ('section', 'subject', 'faculty')
    inlines = [ScheduleDayInline]


# ==============================================================================
# 3. IDENTITIES & PROFILES (STUDENTS & FACULTY)
# ==============================================================================

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('lrn', 'last_name', 'first_name', 'sex', 'masked_contact', 'hardware_bound', 'is_active')
    search_fields = ('lrn', 'last_name', 'first_name', 'rfid_uid', 'qr_token', 'parent_contact')
    list_filter = ('sex', 'is_active')
    ordering = ('last_name', 'first_name')
    list_per_page = 50

    @admin.display(description='Parent Contact')
    def masked_contact(self, obj):
        # Mask middle digits for family privacy protection
        phone = obj.parent_contact or ''
        if len(phone) >= 10:
            return f"{phone[:4]}****{phone[-3:]}"
        return phone or "—"

    @admin.display(description='Card/QR Linked')
    def hardware_bound(self, obj):
        has_rfid = bool(obj.rfid_uid)
        has_qr = bool(obj.qr_token)
        if has_rfid and has_qr:
            return format_html('<span style="color: #16a34a; font-weight: bold;">RFID + QR</span>')
        if has_rfid:
            return format_html('<span style="color: #2563eb; font-weight: bold;">RFID ONLY</span>')
        if has_qr:
            return format_html('<span style="color: #d97706; font-weight: bold;">QR ONLY</span>')
        return format_html('<span style="color: #dc2626;">UNASSIGNED</span>')


@admin.register(FacultyProfile)
class FacultyProfileAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'last_name', 'first_name', 'position', 'department', 'hardware_bound', 'is_active')
    search_fields = ('employee_id', 'last_name', 'first_name', 'rfid_uid', 'qr_token', 'position', 'department')
    list_filter = ('department', 'is_active')
    ordering = ('last_name', 'first_name')
    list_per_page = 50

    @admin.display(description='Hardware Token')
    def hardware_bound(self, obj):
        if obj.rfid_uid:
            return format_html('<span style="color: #16a34a; font-weight: bold;">ENROLLED</span>')
        return format_html('<span style="color: #dc2626;">PENDING</span>')


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'academic_year', 'status', 'enrollment_date')
    list_filter = ('academic_year', 'status', 'section__grade_level')
    search_fields = ('student__lrn', 'student__last_name', 'student__first_name', 'section__name')
    autocomplete_fields = ('student', 'section')
    list_select_related = ('student', 'section', 'academic_year')
    date_hierarchy = 'enrollment_date'
    list_per_page = 50


# ==============================================================================
# 4. HARDWARE MANAGEMENT & TAMPER-PROOF ACCESS LOGS
# ==============================================================================

@admin.register(IoTKiosk)
class IoTKioskAdmin(admin.ModelAdmin):
    list_display = ('kiosk_code', 'terminal_name', 'location', 'status_badge', 'last_ping')
    search_fields = ('kiosk_code', 'terminal_name', 'location')
    list_filter = ('is_active',)

    @admin.display(description='Operational State')
    def status_badge(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #16a34a; font-weight: bold;">ONLINE</span>')
        return format_html('<span style="color: #dc2626; font-weight: bold;">OFFLINE</span>')


@admin.register(StudentGateLog)
class StudentGateLogAdmin(SecureAuditLogAdmin):
    """Immutable: Student physical entrance/exit logs cannot be edited or deleted."""
    list_display = ('student', 'direction_badge', 'scan_method', 'scan_time', 'kiosk')
    list_filter = ('direction', 'scan_method', 'scan_time')
    search_fields = ('student__lrn', 'student__last_name', 'student__first_name', 'raw_identifier', 'kiosk__kiosk_code')
    autocomplete_fields = ('student', 'kiosk')
    list_select_related = ('student', 'kiosk')
    date_hierarchy = 'scan_time'
    list_per_page = 50

    @admin.display(description='Direction')
    def direction_badge(self, obj):
        color = "#16a34a" if obj.direction == "IN" else "#d97706"
        return format_html(f'<span style="color: {color}; font-weight: bold;">{obj.direction}</span>')


@admin.register(FacultyGateLog)
class FacultyGateLogAdmin(SecureAuditLogAdmin):
    """Immutable: Faculty turnstile gate taps cannot be forged or altered."""
    list_display = ('faculty', 'direction_badge', 'scan_method', 'scan_time', 'kiosk')
    list_filter = ('direction', 'scan_method', 'scan_time')
    search_fields = ('faculty__employee_id', 'faculty__last_name', 'faculty__first_name', 'raw_identifier', 'kiosk__kiosk_code')
    autocomplete_fields = ('faculty', 'kiosk')
    list_select_related = ('faculty', 'kiosk')
    date_hierarchy = 'scan_time'
    list_per_page = 50

    @admin.display(description='Direction')
    def direction_badge(self, obj):
        color = "#16a34a" if obj.direction == "IN" else "#d97706"
        return format_html(f'<span style="color: {color}; font-weight: bold;">{obj.direction}</span>')


# ==============================================================================
# 5. CLASSROOM ATTENDANCE & SUMMARY
# ==============================================================================

@admin.register(SubjectAttendanceLog)
class SubjectAttendanceLogAdmin(admin.ModelAdmin):
    list_display = ('student', 'schedule', 'faculty', 'status_badge', 'attendance_date', 'scanned_at')
    list_filter = ('status', 'attendance_date')
    search_fields = ('student__lrn', 'student__last_name', 'faculty__last_name')
    autocomplete_fields = ('student', 'schedule', 'faculty')
    list_select_related = ('student', 'schedule', 'faculty')
    readonly_fields = ('scanned_at',)
    date_hierarchy = 'attendance_date'
    list_per_page = 50

    @admin.display(description='Attendance')
    def status_badge(self, obj):
        colors = {'PRESENT': '#16a34a', 'LATE': '#d97706', 'ABSENT': '#dc2626', 'EXCUSED': '#2563eb'}
        color = colors.get(str(obj.status).upper(), '#64748b')
        return format_html(f'<span style="color: {color}; font-weight: bold;">{obj.status}</span>')


@admin.register(DailyAttendanceSummary)
class DailyAttendanceSummaryAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'attendance_date', 'status')
    list_filter = ('status', 'attendance_date', 'section')
    search_fields = ('student__lrn', 'student__last_name', 'section__name')
    autocomplete_fields = ('student', 'section')
    list_select_related = ('student', 'section')
    date_hierarchy = 'attendance_date'
    list_per_page = 50


# ==============================================================================
# 6. SECURITY, PASSES & MOBILE GEOFENCE TELEMETRY
# ==============================================================================

@admin.register(GatePass)
class GatePassAdmin(admin.ModelAdmin):
    list_display = ('id', 'faculty', 'student', 'status_badge', 'valid_from', 'valid_to')
    list_filter = ('status',)
    search_fields = ('faculty__first_name', 'faculty__last_name', 'student__first_name', 'student__last_name', 'reason')
    autocomplete_fields = ('faculty', 'student')
    list_select_related = ('faculty', 'student')
    date_hierarchy = 'valid_from'
    actions = ['approve_passes', 'reject_passes']

    @admin.display(description='Pass Status')
    def status_badge(self, obj):
        colors = {'APPROVED': '#16a34a', 'PENDING': '#d97706', 'REJECTED': '#dc2626', 'EXPIRED': '#64748b'}
        color = colors.get(str(obj.status).upper(), '#64748b')
        return format_html(f'<span style="color: {color}; font-weight: bold;">{obj.status}</span>')

    @admin.action(description="Approve selected gate passes")
    def approve_passes(self, request, queryset):
        queryset.update(status='APPROVED')

    @admin.action(description="Reject selected gate passes")
    def reject_passes(self, request, queryset):
        queryset.update(status='REJECTED')


@admin.register(FacultyHeartbeat)
class FacultyHeartbeatAdmin(SecureAuditLogAdmin):
    """Immutable: Real-time GPS pings from mobile devices cannot be edited."""
    list_display = ('faculty', 'latitude', 'longitude', 'boundary_check', 'battery_level', 'recorded_at')
    list_filter = ('is_inside_geofence',)
    search_fields = ('faculty__employee_id', 'faculty__last_name', 'faculty__first_name')
    autocomplete_fields = ('faculty',)
    list_select_related = ('faculty',)
    date_hierarchy = 'recorded_at'
    list_per_page = 50

    @admin.display(description='Geofence Status')
    def boundary_check(self, obj):
        if obj.is_inside_geofence:
            return format_html('<span style="color: #16a34a; font-weight: bold;">WITHIN CAMPUS</span>')
        return format_html('<span style="color: #dc2626; font-weight: bold;">OUTSIDE BOUNDARY</span>')


@admin.register(LoafingIncident)
class LoafingIncidentAdmin(admin.ModelAdmin):
    """Incidents created when faculty leaves geofenced boundary during class hours."""
    list_display = ('faculty', 'incident_date', 'status_badge', 'trigger_reason', 'created_at')
    list_filter = ('status', 'incident_date')
    search_fields = ('faculty__employee_id', 'faculty__last_name', 'trigger_reason')
    autocomplete_fields = ('faculty',)
    list_select_related = ('faculty',)
    readonly_fields = ('created_at',)
    date_hierarchy = 'incident_date'

    @admin.display(description='Review Status')
    def status_badge(self, obj):
        colors = {'RESOLVED': '#16a34a', 'FLAGGED': '#dc2626', 'EXCUSED': '#2563eb'}
        color = colors.get(str(obj.status).upper(), '#d97706')
        return format_html(f'<span style="color: {color}; font-weight: bold;">{obj.status}</span>')


@admin.register(SmsOutbox)
class SmsOutboxAdmin(admin.ModelAdmin):
    list_display = ('masked_recipient', 'trigger_event', 'priority', 'status_badge', 'retry_count', 'created_at')
    list_filter = ('status', 'priority', 'trigger_event')
    search_fields = ('recipient_number', 'message_body')
    readonly_fields = ('created_at',)
    date_hierarchy = 'created_at'
    actions = ['resend_failed_sms']
    list_per_page = 50

    @admin.display(description='Recipient')
    def masked_recipient(self, obj):
        phone = obj.recipient_number or ''
        if len(phone) >= 10:
            return f"{phone[:4]}****{phone[-3:]}"
        return phone

    @admin.display(description='Delivery')
    def status_badge(self, obj):
        colors = {'SENT': '#16a34a', 'DELIVERED': '#16a34a', 'PENDING': '#d97706', 'FAILED': '#dc2626'}
        color = colors.get(str(obj.status).upper(), '#64748b')
        return format_html(f'<span style="color: {color}; font-weight: bold;">{obj.status}</span>')

    @admin.action(description="Reset failed messages to PENDING for retry")
    def resend_failed_sms(self, request, queryset):
        queryset.filter(status='FAILED').update(status='PENDING', retry_count=0)


# ==============================================================================
# 7. AUTHENTICATION & USER INLINE (ZERO TRUST ACCESS)
# ==============================================================================

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'faculty')
    list_filter = ('role',)
    search_fields = ('user__username', 'faculty__first_name', 'faculty__last_name')
    autocomplete_fields = ('faculty',)
    list_select_related = ('user', 'faculty')


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'AttendSure Profile Details'
    fk_name = 'user'
    autocomplete_fields = ('faculty',)


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


# Safe unregistration: Prevents system crashes if already unregistered during hot reloads
try:
    admin.site.unregister(User)
except NotRegistered:
    pass

admin.site.register(User, UserAdmin)