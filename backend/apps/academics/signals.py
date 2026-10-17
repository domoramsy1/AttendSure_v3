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
    Automatically creates and syncs AttendSure UserProfile and FacultyProfile with Django Users.
    """
    # Safeguard: Skip processing during raw database migrations or fixture loading
    if raw:
        return

    # Least Privilege: Superusers get ADMIN; regular staff default to FACULTY
    desired_role = 'ADMIN' if instance.is_superuser else 'FACULTY'

    try:
        with transaction.atomic():
            # -----------------------------------------------------------------
            # 1. USER PROFILE ROLE & SECURITY SYNCHRONIZATION
            # -----------------------------------------------------------------
            if created:
                profile, was_created = UserProfile.objects.get_or_create(
                    user=instance,
                    defaults={
                        'role': desired_role,
                        'is_teaching': (desired_role == 'FACULTY'),
                        'is_profile_completed': True,
                    }
                )
                if was_created and desired_role == 'ADMIN':
                    logger.warning(
                        f"SECURITY AUDIT: Superuser '{instance.username}' (ID: {instance.pk}) "
                        f"created with AttendSure role 'ADMIN'."
                    )
            else:
                try:
                    profile = instance.profile
                except UserProfile.DoesNotExist:
                    profile = UserProfile.objects.create(
                        user=instance,
                        role=desired_role,
                        is_teaching=(desired_role == 'FACULTY'),
                        is_profile_completed=True,
                    )
                    logger.info(f"Self-healed missing UserProfile for '{instance.username}'.")

                # Auto-promote or auto-demote based on Django superuser status
                if instance.is_superuser and profile.role != 'ADMIN':
                    old_role = profile.role
                    profile.role = 'ADMIN'
                    profile.save(update_fields=['role'])
                    logger.warning(
                        f"SECURITY AUDIT: User '{instance.username}' promoted from '{old_role}' to 'ADMIN'."
                    )
                elif not instance.is_superuser and profile.role == 'ADMIN':
                    profile.role = 'FACULTY'
                    profile.is_teaching = True
                    profile.save(update_fields=['role', 'is_teaching'])
                    logger.warning(
                        f"SECURITY AUDIT: User '{instance.username}' demoted from 'ADMIN' to 'FACULTY'."
                    )

            # -----------------------------------------------------------------
            # 2. FACULTY PROFILE LINKING & TEACHING CLEARANCE
            # -----------------------------------------------------------------
            if profile.role == 'FACULTY':
                faculty = profile.faculty

                # If not linked, locate matching FacultyProfile by Employee ID, Email, or Name
                if not faculty:
                    faculty = (
                        FacultyProfile.objects.filter(employee_id__iexact=instance.username).first()
                        or (FacultyProfile.objects.filter(email__iexact=instance.email).first() if instance.email else None)
                        or FacultyProfile.objects.filter(
                            first_name__iexact=instance.first_name,
                            last_name__iexact=instance.last_name
                        ).first()
                    )

                # If still not found, create an active FacultyProfile
                if not faculty:
                    emp_id = instance.username.upper() if len(instance.username) <= 50 else f"EMP-{instance.pk:04d}"
                    if FacultyProfile.objects.filter(employee_id=emp_id).exists():
                        emp_id = f"EMP-{instance.pk:04d}"

                    faculty = FacultyProfile.objects.create(
                        employee_id=emp_id,
                        first_name=instance.first_name or instance.username,
                        last_name=instance.last_name or 'Faculty',
                        email=instance.email or '',
                        is_active=True,
                        can_teach=True,
                    )
                    logger.info(
                        f"SECURITY AUTO-PROVISION: Created FacultyProfile '{faculty.employee_id}' for user '{instance.username}'."
                    )

                # Ensure teaching eligibility and active flags are turned on
                f_updates = []
                if not faculty.is_active:
                    faculty.is_active = True
                    f_updates.append('is_active')
                if not faculty.can_teach:
                    faculty.can_teach = True
                    f_updates.append('can_teach')
                if f_updates:
                    faculty.save(update_fields=f_updates)

                # Link back to UserProfile
                p_updates = []
                if profile.faculty != faculty:
                    profile.faculty = faculty
                    p_updates.append('faculty')
                if not profile.is_teaching:
                    profile.is_teaching = True
                    p_updates.append('is_teaching')
                if not profile.is_profile_completed:
                    profile.is_profile_completed = True
                    p_updates.append('is_profile_completed')
                if p_updates:
                    profile.save(update_fields=p_updates)

    except Exception as exc:
        logger.error(
            f"SECURITY ERROR: Signal auto_sync_user_profile failed for '{instance.username}': {exc}",
            exc_info=True
        )


@receiver(post_save, sender=FacultyProfile)
def auto_sync_faculty_profile(sender, instance, created, raw=False, **kwargs):
    """
    Two-Way Bridge: When a FacultyProfile is created or modified in the Faculty Tab,
    ensure its teaching status is active and automatically link to matching User accounts.
    """
    if raw:
        return

    try:
        with transaction.atomic():
            # 1. Enforce active teaching clearances
            f_updates = []
            if not instance.is_active:
                instance.is_active = True
                f_updates.append('is_active')
            if not instance.can_teach:
                instance.can_teach = True
                f_updates.append('can_teach')
            if f_updates:
                FacultyProfile.objects.filter(pk=instance.pk).update(
                    **{field: getattr(instance, field) for field in f_updates}
                )

            # 2. Check if already linked to a User account
            if hasattr(instance, 'account') and instance.account:
                profile = instance.account
                if not profile.is_teaching or not profile.is_profile_completed:
                    profile.is_teaching = True
                    profile.is_profile_completed = True
                    profile.save(update_fields=['is_teaching', 'is_profile_completed'])
            else:
                # 3. If unlinked, search for matching User account
                user = (
                    User.objects.filter(username__iexact=instance.employee_id).first()
                    or (User.objects.filter(email__iexact=instance.email).first() if instance.email else None)
                    or User.objects.filter(
                        first_name__iexact=instance.first_name,
                        last_name__iexact=instance.last_name
                    ).first()
                )
                if user and hasattr(user, 'profile'):
                    profile = user.profile
                    if not profile.faculty:
                        profile.faculty = instance
                        profile.is_teaching = True
                        profile.save(update_fields=['faculty', 'is_teaching'])
                        logger.info(
                            f"SECURITY LINK: Linked FacultyProfile '{instance.employee_id}' to User '{user.username}'."
                        )

    except Exception as exc:
        logger.error(
            f"SECURITY ERROR: Signal auto_sync_faculty_profile failed for '{instance.employee_id}': {exc}",
            exc_info=True
        )