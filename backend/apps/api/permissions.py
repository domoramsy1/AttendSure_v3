from rest_framework import permissions
from apps.academics.models import Schedule
from .views.common import get_user_role, is_leadership_role, resolve_faculty_for_user


def is_active_and_unlocked(user) -> bool:
    if not (user and user.is_authenticated and user.is_active):
        return False
    profile = getattr(user, 'profile', None)
    if profile and hasattr(profile, 'is_locked') and profile.is_locked():
        return False
    return True


class IsSystemAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_active_and_unlocked(request.user) and get_user_role(request.user) == 'ADMIN'


class IsPrincipalOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_active_and_unlocked(request.user) and get_user_role(request.user) in {'ADMIN', 'PRINCIPAL'}


class IsAcademicManagerPermission(permissions.BasePermission):
    def has_permission(self, request, view):
        if not is_active_and_unlocked(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        if request.method == 'DELETE':
            return role in {'ADMIN', 'PRINCIPAL'}
        return role in {'ADMIN', 'PRINCIPAL', 'DEPT_HEAD'}


class IsFacultyUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_active_and_unlocked(request.user) and get_user_role(request.user) in {
            'ADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'FACULTY'
        }


class IsAdviserOrAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_active_and_unlocked(request.user)

    def has_object_permission(self, request, view, obj):
        if not is_active_and_unlocked(request.user):
            return False
        if is_leadership_role(request.user):
            return True
        if request.method in permissions.SAFE_METHODS:
            return True
        faculty = resolve_faculty_for_user(request.user)
        if not faculty:
            return False
        if getattr(obj, 'adviser_id', None) == faculty.id:
            return True
        section = getattr(obj, 'section', None)
        if section and getattr(section, 'adviser_id', None) == faculty.id:
            return True
        return Schedule.objects.filter(section=obj, faculty=faculty).exists()


class ReadOnlyAuditLedger(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_active_and_unlocked(request.user) and request.method in permissions.SAFE_METHODS


# Alias for backward compatibility
IsSystemAdminRole = IsSystemAdmin
