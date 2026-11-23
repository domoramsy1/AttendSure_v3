from django.contrib import admin

from .models import AuditLog, Department, FacultyProfile, PositionTitle, UserProfile


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)
    ordering = ("name",)


@admin.register(PositionTitle)
class PositionTitleAdmin(admin.ModelAdmin):
    list_display = ("id", "title")
    search_fields = ("title",)
    ordering = ("title",)


@admin.register(FacultyProfile)
class FacultyProfileAdmin(admin.ModelAdmin):
    list_display = (
        "employee_id",
        "last_name",
        "first_name",
        "department_ref",
        "position_ref",
        "can_handle_classes",
        "is_active",
    )
    list_filter = ("is_active", "can_handle_classes", "department_ref", "position_ref")
    search_fields = ("employee_id", "first_name", "last_name", "email", "contact_number")
    list_select_related = ("department_ref", "position_ref")
    ordering = ("last_name", "first_name")


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "role",
        "faculty",
        "phone_number",
        "is_profile_completed",
        "failed_attempts",
        "locked_until",
    )
    list_filter = ("role", "is_profile_completed")
    search_fields = (
        "user__username",
        "user__first_name",
        "user__last_name",
        "user__email",
        "phone_number",
        "faculty__employee_id",
    )
    list_select_related = ("user", "faculty")


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("id", "created_at", "table_name", "record_id", "action", "performed_by", "client_ip")
    list_filter = ("action", "table_name")
    search_fields = ("table_name", "record_id", "performed_by__username", "client_ip")
    list_select_related = ("performed_by",)
    readonly_fields = (
        "table_name",
        "record_id",
        "action",
        "old_data",
        "new_data",
        "changed_fields",
        "performed_by",
        "client_ip",
        "user_agent",
        "created_at",
    )
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False