"""
AttendSure - Role-Based Access Control (RBAC) & Endpoint Authorization
App: apps.api
File: backend/apps/api/permissions.py
"""

from rest_framework import permissions


def is_active_and_unlocked(user) -> bool:
    """
    Cybersecurity helper: Verifies user is logged in, active, and not locked out.
    """
    if not (user and user.is_authenticated and user.is_active):
        return False

    profile = getattr(user, 'profile', None)
    if profile and hasattr(profile, 'is_locked') and profile.is_locked():
        return False

    return True


class IsSystemAdmin(permissions.BasePermission):
    """
    Grants access only to active, unlocked System Administrators and Superusers.
    Used for hardware resets, server telemetry, and database maintenance.
    """
    def has_permission(self, request, view):
        if not is_active_and_unlocked(request.user):
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role == 'ADMIN')


class IsPrincipalOrAdmin(permissions.BasePermission):
    """
    Grants access to high-level school management actions:
    - Excusing faculty loafing/exit violations.
    - Updating campus geofence coordinates.
    - Modifying school identity and DepEd metadata.
    """
    def has_permission(self, request, view):
        if not is_active_and_unlocked(request.user):
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in ['ADMIN', 'PRINCIPAL'])


class IsFacultyUser(permissions.BasePermission):
    """
    Grants access to verified teachers, advisers, and administrators.
    Rejects security guards or unassigned accounts.
    """
    def has_permission(self, request, view):
        if not is_active_and_unlocked(request.user):
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'FACULTY'])


class IsAdviserOrAdmin(permissions.BasePermission):
    """
    Safeguards DepEd learner rosters, SF1 (School Register), and SF2 (Daily Attendance):
    - Admins, Principals, and Department Heads: Full read/write access.
    - Teachers / Advisers: Read-only access across sections.
    - Write / Edit: Allowed ONLY if the teacher is the verified section adviser.
    """
    def has_permission(self, request, view):
        if not is_active_and_unlocked(request.user):
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, 'profile', None)
        return bool(profile and profile.role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'FACULTY'])

    def has_object_permission(self, request, view, obj):
        if not is_active_and_unlocked(request.user):
            return False

        if request.user.is_superuser:
            return True

        profile = getattr(request.user, 'profile', None)
        if not profile:
            return False

        role = profile.role

        # School administration has full management access
        if role in ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD']:
            return True

        # All faculty can view DepEd rosters (Read-Only)
        if request.method in permissions.SAFE_METHODS and role == 'FACULTY':
            return True

        # Write access protection (Prevents teachers from altering other sections)
        if role == 'FACULTY' and getattr(profile, 'faculty', None):
            faculty_id = profile.faculty.id
            if not faculty_id:
                return False

            # Check direct section ownership
            if hasattr(obj, 'adviser_id') and obj.adviser_id is not None:
                return obj.adviser_id == faculty_id

            # Check section link on student enrollment or attendance record
            section = getattr(obj, 'section', None)
            if section and getattr(section, 'adviser_id', None) is not None:
                return section.adviser_id == faculty_id

        # Explicit deny for unassigned objects or mismatched advisers
        return False


class ReadOnlyAuditLedger(permissions.BasePermission):
    """
    Enforces log immutability and confidentiality:
    1. Blocks public access: Users must be authenticated and active.
    2. Read-only: Denies POST, PUT, PATCH, and DELETE requests to protect legal audit integrity.
    """
    def has_permission(self, request, view):
        # Confidentiality safeguard: Disallow anonymous queries
        if not is_active_and_unlocked(request.user):
            return False

        # Integrity safeguard: Only allow safe reading methods (GET, HEAD, OPTIONS)
        return request.method in permissions.SAFE_METHODS