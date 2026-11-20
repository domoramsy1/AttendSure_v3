# D:\AttendSure_V3\backend\common\permissions.py

from rest_framework import permissions

LEADERSHIP_ROLES = {"ADMIN", "SUPERADMIN", "PRINCIPAL", "DEPT_HEAD"}
STAFF_AND_FACULTY_ROLES = {"ADMIN", "SUPERADMIN", "PRINCIPAL", "DEPT_HEAD", "FACULTY"}


def get_user_role(user) -> str:
    if not user or not user.is_authenticated:
        return "ANONYMOUS"
    profile = getattr(user, "profile", None)
    if profile and profile.role:
        role = str(profile.role).upper()
        if user.is_superuser and role not in {"SUPERADMIN", "ADMIN"}:
            return "SUPERADMIN"
        return role
    if user.is_superuser:
        return "SUPERADMIN"
    return "ADMIN" if user.is_staff else "FACULTY"


def is_school_leader(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or get_user_role(user) in LEADERSHIP_ROLES)
    )


def is_staff_or_faculty(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or get_user_role(user) in STAFF_AND_FACULTY_ROLES)
    )


class IsSchoolLeader(permissions.BasePermission):
    """Allows access only to Admin, Superadmin, Principal, or Department Head."""

    def has_permission(self, request, view):
        return is_school_leader(request.user)


class IsStaffOrFaculty(permissions.BasePermission):
    """Blocks PARENT accounts from internal staff/faculty endpoints."""

    def has_permission(self, request, view):
        return is_staff_or_faculty(request.user)


class IsLeadershipOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_school_leader(request.user)


class IsLeadershipOrStaffReadOnly(permissions.BasePermission):
    """Read access for school staff/faculty (excludes PARENT); write access for school leaders."""

    def has_permission(self, request, view):
        if not is_staff_or_faculty(request.user):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return is_school_leader(request.user)


class IsSystemAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_superuser or get_user_role(request.user) in {"ADMIN", "SUPERADMIN"})
        )