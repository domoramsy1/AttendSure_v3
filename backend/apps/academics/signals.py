"""
AttendSure - User Role Sync & Uniform Grade-Level Subject Auto-Enrollment
File: backend/apps/academics/signals.py
"""

import logging
from datetime import time
from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import (
    UserProfile,
    FacultyProfile,
    Subject,
    Section,
    Schedule,
    Enrollment,
)

User = get_user_model()
logger = logging.getLogger('apps.academics')


def sync_uniform_subjects_for_section(section: Section):
    """
    Ensures a section has schedule slots for all uniform subjects
    assigned to its grade level using a single bulk insert.
    """
    if not section or not section.grade_level_id:
        return []

    uniform_subjects = list(
        Subject.objects.filter(grade_level_id=section.grade_level_id).order_by('id')
    )
    if not uniform_subjects:
        return []

    existing_subject_ids = set(
        Schedule.objects.filter(section=section).values_list('subject_id', flat=True)
    )

    new_schedules = []
    for idx, subj in enumerate(uniform_subjects):
        if subj.id in existing_subject_ids:
            continue
        start_hr = min(7 + idx, 16)
        new_schedules.append(
            Schedule(
                section=section,
                subject=subj,
                start_time=time(start_hr, 30),
                end_time=time(min(start_hr + 1, 17), 30),
                days_of_week='MON-FRI',
                room=section.room,
                room_number=section.room_number or '',
                is_active=True,
            )
        )

    if new_schedules:
        Schedule.objects.bulk_create(new_schedules, ignore_conflicts=True)

    return list(
        Schedule.objects.filter(section=section, is_active=True)
        .select_related('subject', 'faculty')
        .order_by('start_time')
    )


@receiver(post_save, sender=Section)
def auto_assign_section_uniform_subjects(sender, instance: Section, raw=False, **kwargs):
    if not raw and instance.grade_level_id:
        transaction.on_commit(lambda: sync_uniform_subjects_for_section(instance))


@receiver(post_save, sender=Subject)
def auto_propagate_grade_level_subject(sender, instance: Subject, raw=False, **kwargs):
    if raw or not instance.grade_level_id:
        return

    def propagate():
        sections = Section.objects.filter(grade_level_id=instance.grade_level_id, is_active=True)
        for sec in sections:
            sync_uniform_subjects_for_section(sec)

    transaction.on_commit(propagate)


@receiver(post_save, sender=Enrollment)
def auto_enroll_student_in_section_subjects(sender, instance: Enrollment, raw=False, **kwargs):
    """
    When a student is enrolled in a grade level and section, automatically
    ensures all uniform subjects under that section's class list are active.
    """
    if raw or instance.status != 'ENROLLED' or not instance.section_id:
        return

    transaction.on_commit(lambda: sync_uniform_subjects_for_section(instance.section))


@receiver(post_save, sender=User)
def auto_sync_user_profile(sender, instance, created, raw=False, **kwargs):
    if raw:
        return

    desired_role = 'ADMIN' if instance.is_superuser else 'FACULTY'
    try:
        with transaction.atomic():
            profile, _ = UserProfile.objects.get_or_create(
                user=instance,
                defaults={
                    'role': desired_role,
                    'is_teaching': (desired_role == 'FACULTY'),
                    'is_profile_completed': bool(instance.first_name and instance.last_name),
                }
            )
            if instance.is_superuser and profile.role != 'ADMIN':
                profile.role = 'ADMIN'
                profile.save(update_fields=['role'])

            faculty = profile.faculty or (
                FacultyProfile.objects.filter(employee_id__iexact=instance.username).first()
                or (FacultyProfile.objects.filter(email__iexact=instance.email).first() if instance.email else None)
            )

            if faculty:
                updates = []
                if faculty.can_teach != profile.is_teaching:
                    faculty.can_teach = profile.is_teaching
                    updates.append('can_teach')
                if faculty.is_active != instance.is_active:
                    faculty.is_active = instance.is_active
                    updates.append('is_active')
                if updates:
                    faculty.save(update_fields=updates)

                if profile.faculty_id != faculty.id:
                    profile.faculty = faculty
                    profile.save(update_fields=['faculty'])
    except Exception as exc:
        logger.error(f"Signal auto_sync_user_profile failed for '{instance.username}': {exc}", exc_info=True)


@receiver(post_save, sender=FacultyProfile)
def auto_sync_faculty_profile(sender, instance, created, raw=False, **kwargs):
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
                if user and hasattr(user, 'profile') and not user.profile.faculty_id:
                    user.profile.faculty = instance
                    user.profile.is_teaching = instance.can_teach
                    user.profile.save(update_fields=['faculty', 'is_teaching'])
    except Exception as exc:
        logger.error(f"Signal auto_sync_faculty_profile failed for '{instance.employee_id}': {exc}", exc_info=True)