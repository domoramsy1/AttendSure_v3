from django.apps import AppConfig


class CampusConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.campus"
    label = "campus"
    verbose_name = "Campus GPS & Time Records"