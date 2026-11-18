from rest_framework import permissions

LEADERSHIP_ROLES = {"ADMIN", "SUPERADMIN", "PRINCIPAL", "DEPT_HEAD"}


def get_user_role(user) -> str:
    if not user or not user.is_authenticated:
        return "ANONYMOUS"
    if user.is_superuser:
        return "ADMIN"
    profile = getattr(user, "profile", None)
    if profile and profile.role:
        return str(profile.role).upper()
    return "ADMIN" if user.is_staff else "FACULTY"


def is_school_leader(user) -> bool:
    return bool(user and user.is_authenticated and (user.is_superuser or get_user_role(user) in LEADERSHIP_ROLES))


class IsLeadershipOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
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