from rest_framework import permissions

class IsSystemAdmin(permissions.BasePermission):
    """Allows access only to authenticated superusers or system administrators."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'ADMIN')


class IsAdviserOrAdmin(permissions.BasePermission):
    """
    Grants access to DepEd SF1, SF2, and learner records:
    - Admins, Principals, and Department Heads have full access.
    - Teachers have read-only access (GET, HEAD, OPTIONS) to view DepEd reports across sections.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.is_superuser:
            return True

        profile = getattr(request.user, 'profile', None)
        role = getattr(profile, 'role', 'FACULTY') if profile else 'FACULTY'

        if role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']:
            return True

        if request.method in permissions.SAFE_METHODS and role == 'FACULTY':
            return True

        if role == 'FACULTY' and getattr(profile, 'faculty', None):
            return getattr(obj, 'adviser_id', None) == profile.faculty.id

        return False


class ReadOnlyAuditLedger(permissions.BasePermission):
    """Enforces immutability: allows only safe HTTP reading methods (GET, HEAD, OPTIONS)."""
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS