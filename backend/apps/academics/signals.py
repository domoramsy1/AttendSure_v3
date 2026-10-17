"""
AttendSure - User Security & Role Synchronization Signals
App: apps.academics
File: apps/academics/signals.py
"""

import logging
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import UserProfile

User = get_user_model()
logger = logging.getLogger('apps.academics')


@receiver(post_save, sender=User)
def auto_sync_user_profile(sender, instance, created, raw=False, **kwargs):
    """
    Automatically creates and syncs AttendSure UserProfile with Django User accounts.
    
    Cybersecurity Rules Applied:
    1. Least Privilege: Only real Django superusers receive the 'ADMIN' role.
    2. Revocation: If superuser status is removed, profile role is safely demoted.
    3. Migration Shield: Skips processing during database migrations and fixtures (raw=True).
    4. Audit Trail: Logs all administrative role assignments for security tracking.
    """
    # Safeguard 1: Do not execute when loading database fixtures or raw migrations
    if raw:
        return

    # Safeguard 2: Enforce strict role assignment (Least Privilege)
    # Only superusers get ADMIN; regular staff and teachers default to FACULTY
    desired_role = 'ADMIN' if instance.is_superuser else 'FACULTY'

    try:
        with transaction.atomic():
            if created:
                # Create profile with least privilege role
                profile, was_created = UserProfile.objects.get_or_create(
                    user=instance,
                    defaults={'role': desired_role}
                )
                if was_created and desired_role == 'ADMIN':
                    logger.warning(
                        f"SECURITY AUDIT: Superuser '{instance.username}' (ID: {instance.pk}) "
                        f"created and assigned AttendSure role 'ADMIN'."
                    )
            else:
                # Existing user updated: sync profile role if superuser status changed
                try:
                    profile = instance.profile
                except UserProfile.DoesNotExist:
                    profile = UserProfile.objects.create(
                        user=instance,
                        role=desired_role
                    )
                    logger.info(f"Self-healed missing UserProfile for '{instance.username}'.")
                    return

                # Auto-promote or auto-demote based on current superuser status
                if instance.is_superuser and profile.role != 'ADMIN':
                    old_role = profile.role
                    profile.role = 'ADMIN'
                    profile.save(update_fields=['role'])
                    logger.warning(
                        f"SECURITY AUDIT: User '{instance.username}' promoted from '{old_role}' "
                        f"to 'ADMIN' via superuser grant."
                    )
                elif not instance.is_superuser and profile.role == 'ADMIN':
                    # Demote to prevent lingering admin access on deactivated superusers
                    profile.role = 'FACULTY'
                    profile.save(update_fields=['role'])
                    logger.warning(
                        f"SECURITY AUDIT: User '{instance.username}' demoted from 'ADMIN' "
                        f"to 'FACULTY' because superuser privileges were revoked."
                    )

    except Exception as exc:
        # Prevent server crash while ensuring the incident is logged
        logger.error(
            f"SECURITY ERROR: Failed to synchronize profile for user '{instance.username}': {exc}",
            exc_info=True
        )