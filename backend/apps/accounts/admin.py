from django.contrib import admin
from .models import AuditLog, TeacherProfile, UserProfile

admin.site.register(TeacherProfile)
admin.site.register(UserProfile)
admin.site.register(AuditLog)