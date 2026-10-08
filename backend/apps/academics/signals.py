from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth import get_user_model
from .models import UserProfile

User = get_user_model()

@receiver(post_save, sender=User)
def auto_sync_superuser_to_attendsure_admin(sender, instance, created, **kwargs):
    """
    Catches superuser creation in Django and automatically binds 
    an AttendSure UserProfile with role='ADMIN'.
    """
    # Safely check for is_faculty without crashing standard Django User objects
    is_faculty = getattr(instance, 'is_faculty', False)
    target_role = 'ADMIN' if (instance.is_superuser or is_faculty) else 'TEACHER'

    if created:
        UserProfile.objects.get_or_create(
            user=instance,
            defaults={'role': target_role}
        )
    else:
        if instance.is_superuser:
            profile, _ = UserProfile.objects.get_or_create(
                user=instance,
                defaults={'role': 'ADMIN'}
            )
            if profile.role != 'ADMIN':
                profile.role = 'ADMIN'
                profile.save(update_fields=['role'])