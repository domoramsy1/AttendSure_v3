from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True, default="")

    class Meta:
        model = Notification
        fields = [
            "id", "recipient", "student", "student_name", "title",
            "message", "category", "is_read", "is_pushed", "created_at",
        ]
        read_only_fields = ["id", "is_pushed", "created_at"]
        extra_kwargs = {"recipient": {"required": False}}