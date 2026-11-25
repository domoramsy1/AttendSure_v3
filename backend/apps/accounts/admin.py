from django.contrib import admin

from .models import AuditLog, Department, PositionTitle, TeacherProfile, UserProfile


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ("id", "code", "name")
    search_fields = ("code", "name")
    ordering = ("name",)


@admin.register(PositionTitle)
class PositionTitleAdmin(admin.ModelAdmin):
    list_display = ("id", "title")
    search_fields = ("title",)
    ordering = ("title",)


@admin.register(TeacherProfile)
class TeacherProfileAdmin(admin.ModelAdmin):
    list_display = (
        "employee_id",
        "full_name",
        "department",
        "position",
        "can_handle_classes",
        "is_active",
    )
    list_filter = ("can_handle_classes", "department", "position", "user__is_active")
    search_fields = ("employee_id", "user__first_name", "user__last_name", "user__email", "contact_number")
    list_select_related = ("user", "department", "position")
    ordering = ("user__last_name", "user__first_name")


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "role",
        "failed_login_attempts",
        "locked_until",
        "updated_at",
    )
    list_filter = ("role",)
    search_fields = (
        "user__username",
        "user__first_name",
        "user__last_name",
        "user__email",
    )
    list_select_related = ("user",)


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
