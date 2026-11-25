# AttendSure Backend - Common Role Access Rules
# File: D:\AttendSure_V3\backend\common\permissions.py

from rest_framework import permissions

ALLOWED_ROLES = {"ADMIN", "PRINCIPAL", "DEPT_HEAD", "TEACHER"}
LEADERSHIP_ROLES = {"ADMIN", "PRINCIPAL", "DEPT_HEAD"}
EXECUTIVE_ROLES = {"ADMIN", "PRINCIPAL"}


def get_user_role(user) -> str:
    if not user or not user.is_authenticated:
        return "ANONYMOUS"
    profile = getattr(user, "profile", None)
    if profile and profile.role:
        role = str(profile.role).upper()
        if role in ALLOWED_ROLES:
            return role
    if user.is_superuser or user.is_staff:
        return "ADMIN"
    return "TEACHER"


def is_system_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or get_user_role(user) == "ADMIN")
    )


def is_admin_or_principal(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or get_user_role(user) in EXECUTIVE_ROLES)
    )


def is_school_leader(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or get_user_role(user) in LEADERSHIP_ROLES)
    )


def is_teacher_or_leader(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or get_user_role(user) in ALLOWED_ROLES)
    )


class IsSchoolLeader(permissions.BasePermission):
    """Allows access only to System Administrator, School Principal, or Department Head."""

    def has_permission(self, request, view):
        return is_school_leader(request.user)


class IsTeacherOrLeader(permissions.BasePermission):
    """Allows access to authenticated teachers and school leaders."""

    def has_permission(self, request, view):
        return is_teacher_or_leader(request.user)


class IsLeadershipOrReadOnly(permissions.BasePermission):
    """Read access for authenticated teachers and school leaders; write access for leaders only."""

    def has_permission(self, request, view):
        if not is_teacher_or_leader(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_school_leader(request.user)


class IsAdminOrPrincipal(permissions.BasePermission):
    """Allows access only to System Administrator or School Principal."""

    def has_permission(self, request, view):
        return is_admin_or_principal(request.user)


class IsAdminOrPrincipalOrReadOnly(permissions.BasePermission):
    """Read access for authenticated school staff; write access for Admin or Principal only."""

    def has_permission(self, request, view):
        if not is_teacher_or_leader(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_admin_or_principal(request.user)


class IsSystemAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return is_system_admin(request.user)


class IsSystemAdminOrReadOnly(permissions.BasePermission):
    """Read access for authenticated school staff; write access strictly for System Admin."""

    def has_permission(self, request, view):
        if not is_teacher_or_leader(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_system_admin(request.user)
