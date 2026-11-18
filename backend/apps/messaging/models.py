from django.conf import settings
from django.db import models
from django.utils import timezone


class Notification(models.Model):
    CATEGORY_CHOICES = [
        ("ATTENDANCE", "Classroom Attendance"),
        ("CUTTING_ALERT", "Cutting Class Alert"),
        ("GATE_PASS", "Exit Pass Update"),
        ("GEOFENCE", "Campus Boundary Alert"),
        ("ANNOUNCEMENT", "School Announcement"),
    ]

    id = models.BigAutoField(primary_key=True)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications", db_index=True
    )
    student = models.ForeignKey(
        "students.Student", on_delete=models.CASCADE, null=True, blank=True, related_name="parent_notifications"
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    category = models.CharField(max_length=25, choices=CATEGORY_CHOICES, default="ATTENDANCE", db_index=True)
    is_read = models.BooleanField(default=False, db_index=True)
    is_pushed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "app_notifications"
        ordering = ["-created_at"]


class ChatMessage(models.Model):
    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey("students.Student", on_delete=models.CASCADE, related_name="chat_messages")
    teacher = models.ForeignKey(
        "accounts.TeacherProfile",
        on_delete=models.CASCADE,
        db_column="faculty_id",
        related_name="chat_messages",
    )
    parent = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="parent_chat_messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_chat_messages"
    )
    body = models.TextField()
    is_read = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "parent_faculty_messages"
        ordering = ["created_at"]