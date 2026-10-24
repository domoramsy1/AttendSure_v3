"""
AttendSure - User Security & Role Synchronization Signals
App: apps.academics
File: backend/apps/academics/signals.py
"""

import logging
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import UserProfile, FacultyProfile

User = get_user_model()
logger = logging.getLogger('apps.academics')


@receiver(post_save, sender=User)
def auto_sync_user_profile(sender, instance, created, raw=False, **kwargs):
    """
    Automatically creates and syncs UserProfile with Django Users.
    Maintains teaching permissions strictly based on profile.is_teaching.
    """
    if raw:
        return

    desired_role = 'ADMIN' if instance.is_superuser else 'FACULTY'

    try:
        with transaction.atomic():
            if created:
                profile, was_created = UserProfile.objects.get_or_create(
                    user=instance,
                    defaults={
                        'role': desired_role,
                        'is_teaching': (desired_role == 'FACULTY'),
                        'is_profile_completed': bool(instance.first_name and instance.last_name),
                    }
                )
            else:
                try:
                    profile = instance.profile
                except UserProfile.DoesNotExist:
                    profile = UserProfile.objects.create(
                        user=instance,
                        role=desired_role,
                        is_teaching=(desired_role == 'FACULTY'),
                        is_profile_completed=bool(instance.first_name and instance.last_name),
                    )

                if instance.is_superuser and profile.role != 'ADMIN':
                    profile.role = 'ADMIN'
                    profile.save(update_fields=['role'])

            # Synchronize FacultyProfile teaching status
            faculty = profile.faculty
            if not faculty:
                faculty = (
                    FacultyProfile.objects.filter(employee_id__iexact=instance.username).first()
                    or (FacultyProfile.objects.filter(email__iexact=instance.email).first() if instance.email else None)
                )

            if faculty:
                f_updates = []
                if faculty.can_teach != profile.is_teaching:
                    faculty.can_teach = profile.is_teaching
                    f_updates.append('can_teach')
                if faculty.is_active != instance.is_active:
                    faculty.is_active = instance.is_active
                    f_updates.append('is_active')
                if f_updates:
                    faculty.save(update_fields=f_updates)

                if profile.faculty != faculty:
                    profile.faculty = faculty
                    profile.save(update_fields=['faculty'])

    except Exception as exc:
        logger.error(f"Signal auto_sync_user_profile failed for '{instance.username}': {exc}", exc_info=True)


@receiver(post_save, sender=FacultyProfile)
def auto_sync_faculty_profile(sender, instance, created, raw=False, **kwargs):
    """
    Two-Way Bridge: When a FacultyProfile is modified, link back to matching User account
    WITHOUT overwriting can_teach to True.
    """
    if raw:
        return

    try:
        with transaction.atomic():
            if hasattr(instance, 'account') and instance.account:
                profile = instance.account
                if profile.is_teaching != instance.can_teach:
                    profile.is_teaching = instance.can_teach
                    profile.save(update_fields=['is_teaching'])
            else:
                user = (
                    User.objects.filter(username__iexact=instance.employee_id).first()
                    or (User.objects.filter(email__iexact=instance.email).first() if instance.email else None)
                )
                if user and hasattr(user, 'profile'):
                    profile = user.profile
                    if not profile.faculty:
                        profile.faculty = instance
                        profile.is_teaching = instance.can_teach
                        profile.save(update_fields=['faculty', 'is_teaching'])

    except Exception as exc:
        logger.error(f"Signal auto_sync_faculty_profile failed for '{instance.employee_id}': {exc}", exc_info=True)