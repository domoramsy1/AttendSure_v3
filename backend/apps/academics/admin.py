from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

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
    StaffGateLog,
    StaffProfile,
    Student,
    StudentGateLog,
    Subject,
    SubjectAttendanceLog,
    UserProfile,
)


# ==========================================
# ACADEMIC CONFIGURATION & INSTITUTION
# ==========================================

@admin.register(AcademicYear)
class AcademicYearAdmin(admin.ModelAdmin):
    list_display = ('code', 'start_date', 'end_date', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('code',)
    ordering = ('-start_date',)


@admin.register(SchoolProfile)
class SchoolProfileAdmin(admin.ModelAdmin):
    list_display = (
        'school_id',
        'school_name',
        'region',
        'division',
        'district',
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
    list_display = ('name', 'latitude', 'longitude', 'radius_meters', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(GradeLevel)
class GradeLevelAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'tier', 'level_order')
    list_filter = ('tier',)
    search_fields = ('code', 'name')
    ordering = ('level_order',)


@admin.register(Section)
class SectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'grade_level', 'academic_year', 'adviser', 'room_number')
    list_filter = ('academic_year', 'grade_level')
    search_fields = ('name', 'room_number', 'adviser__first_name', 'adviser__last_name')
    autocomplete_fields = ('adviser',)


@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('code', 'title', 'tier', 'subject_type', 'units')
    list_filter = ('tier', 'subject_type')
    search_fields = ('code', 'title')


# ==========================================
# SCHEDULES & TIMETABLE
# ==========================================

class ScheduleDayInline(admin.TabularInline):
    model = ScheduleDay
    extra = 1


@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ('section', 'subject', 'teacher', 'start_time', 'end_time', 'room_number')
    list_filter = ('section__academic_year', 'section__grade_level')
    search_fields = ('section__name', 'subject__code', 'subject__title', 'teacher__first_name', 'teacher__last_name')
    autocomplete_fields = ('section', 'subject', 'teacher')
    inlines = [ScheduleDayInline]


# ==========================================
# PROFILES & ENROLLMENT (STUDENTS & STAFF)
# ==========================================

@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('lrn', 'last_name', 'first_name', 'sex', 'parent_contact', 'rfid_uid', 'qr_token', 'is_active')
    search_fields = ('lrn', 'last_name', 'first_name', 'rfid_uid', 'qr_token', 'parent_contact')
    list_filter = ('sex', 'is_active')
    ordering = ('last_name', 'first_name')


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ('employee_id', 'last_name', 'first_name', 'position', 'department', 'rfid_uid', 'qr_token', 'is_active')
    search_fields = ('employee_id', 'last_name', 'first_name', 'rfid_uid', 'qr_token', 'position', 'department')
    list_filter = ('department', 'is_active')
    ordering = ('last_name', 'first_name')


@admin.register(Enrollment)
class EnrollmentAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'academic_year', 'status', 'enrollment_date')
    list_filter = ('academic_year', 'status', 'section__grade_level')
    search_fields = ('student__lrn', 'student__last_name', 'student__first_name', 'section__name')
    autocomplete_fields = ('student', 'section')
    date_hierarchy = 'enrollment_date'


# ==========================================
# HARDWARE & ACCESS LOGS
# ==========================================

@admin.register(IoTKiosk)
class IoTKioskAdmin(admin.ModelAdmin):
    list_display = ('kiosk_code', 'terminal_name', 'location', 'is_active', 'last_ping')
    search_fields = ('kiosk_code', 'terminal_name', 'location')
    list_filter = ('is_active',)


@admin.register(StudentGateLog)
class StudentGateLogAdmin(admin.ModelAdmin):
    list_display = ('student', 'direction', 'scan_method', 'scan_time', 'kiosk')
    list_filter = ('direction', 'scan_method', 'scan_time')
    search_fields = ('student__lrn', 'student__last_name', 'student__first_name', 'raw_identifier', 'kiosk__kiosk_code')
    autocomplete_fields = ('student', 'kiosk')
    date_hierarchy = 'scan_time'


@admin.register(StaffGateLog)
class StaffGateLogAdmin(admin.ModelAdmin):
    list_display = ('staff', 'direction', 'scan_method', 'scan_time', 'kiosk')
    list_filter = ('direction', 'scan_method', 'scan_time')
    search_fields = ('staff__employee_id', 'staff__last_name', 'staff__first_name', 'raw_identifier', 'kiosk__kiosk_code')
    autocomplete_fields = ('staff', 'kiosk')
    date_hierarchy = 'scan_time'


# ==========================================
# CLASSROOM ATTENDANCE & DTR
# ==========================================

@admin.register(SubjectAttendanceLog)
class SubjectAttendanceLogAdmin(admin.ModelAdmin):
    list_display = ('student', 'schedule', 'teacher', 'status', 'attendance_date', 'scanned_at')
    list_filter = ('status', 'attendance_date')
    search_fields = ('student__lrn', 'student__last_name', 'teacher__last_name')
    autocomplete_fields = ('student', 'schedule', 'teacher')
    date_hierarchy = 'attendance_date'


@admin.register(DailyAttendanceSummary)
class DailyAttendanceSummaryAdmin(admin.ModelAdmin):
    list_display = ('student', 'section', 'attendance_date', 'status')
    list_filter = ('status', 'attendance_date', 'section')
    search_fields = ('student__lrn', 'student__last_name', 'section__name')
    autocomplete_fields = ('student', 'section')
    date_hierarchy = 'attendance_date'


# ==========================================
# SECURITY, PASSES & TELEMETRY
# ==========================================

@admin.register(GatePass)
class GatePassAdmin(admin.ModelAdmin):
    list_display = ('id', 'staff', 'student', 'status', 'valid_from', 'valid_to')
    list_filter = ('status',)
    search_fields = ('staff__first_name', 'staff__last_name', 'student__first_name', 'student__last_name', 'reason')
    autocomplete_fields = ('staff', 'student')
    date_hierarchy = 'valid_from'


@admin.register(FacultyHeartbeat)
class FacultyHeartbeatAdmin(admin.ModelAdmin):
    list_display = ('staff', 'latitude', 'longitude', 'is_inside_geofence', 'battery_level', 'recorded_at')
    list_filter = ('is_inside_geofence',)
    search_fields = ('staff__employee_id', 'staff__last_name', 'staff__first_name')
    autocomplete_fields = ('staff',)
    date_hierarchy = 'recorded_at'


@admin.register(LoafingIncident)
class LoafingIncidentAdmin(admin.ModelAdmin):
    list_display = ('staff', 'incident_date', 'status', 'trigger_reason', 'created_at')
    list_filter = ('status', 'incident_date')
    search_fields = ('staff__employee_id', 'staff__last_name', 'trigger_reason')
    autocomplete_fields = ('staff',)
    date_hierarchy = 'incident_date'


@admin.register(SmsOutbox)
class SmsOutboxAdmin(admin.ModelAdmin):
    list_display = ('recipient_number', 'trigger_event', 'priority', 'status', 'retry_count', 'created_at')
    list_filter = ('status', 'priority', 'trigger_event')
    search_fields = ('recipient_number', 'message_body')
    date_hierarchy = 'created_at'


# ==========================================
# AUTHENTICATION & USER INLINE
# ==========================================

@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role', 'staff')
    list_filter = ('role',)
    search_fields = ('user__username', 'staff__first_name', 'staff__last_name')
    autocomplete_fields = ('staff',)


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'AttendSure Profile Details'
    fk_name = 'user'
    autocomplete_fields = ('staff',)


class UserAdmin(BaseUserAdmin):
    inlines = (UserProfileInline,)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)