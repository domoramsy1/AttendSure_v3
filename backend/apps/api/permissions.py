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
    Restricts DepEd SF1 and sensitive learner records:
    - Admins have full access.
    - Facultys can only view learners enrolled in their advisory section.
    """
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser:
            return True
        profile = getattr(request.user, 'profile', None)
        if not profile:
            return False
        if profile.role == 'ADMIN':
            return True
        if profile.role == 'TEACHER' and profile.faculty:
            # Check if faculty is the registered adviser of the section
            return getattr(obj, 'adviser_id', None) == profile.faculty.id
        return False


class ReadOnlyAuditLedger(permissions.BasePermission):
    """Enforces immutability: allows only safe HTTP reading methods (GET, HEAD, OPTIONS)."""
    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS