"""
AttendSure V3 - Reusable Cybersecurity & Permission Classes
File: backend/apps/api/permissions.py
"""

from rest_framework import permissions
from apps.common.utils import get_user_role, is_leadership_role


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Allows full access to System Admins; read-only access to others."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_superuser or get_user_role(request.user) in ('ADMIN', 'SUPERADMIN')


class IsAcademicAdminOrReadOnly(permissions.BasePermission):
    """Allows full access to Principals, School Heads, and Admins; read-only to others."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_superuser or is_leadership_role(request.user)


class IsStudentManagerOrReadOnly(permissions.BasePermission):
    """Allows student management only to Registrars, Principals, and Admins."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.is_superuser or get_user_role(request.user) in (
            'ADMIN', 'SUPERADMIN', 'PRINCIPAL', 'REGISTRAR'
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    """Allows users to view, update, and delete their own account; admins can manage all."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if request.user.is_superuser or get_user_role(request.user) == 'ADMIN':
            return True
        return obj.id == request.user.id