from rest_framework import serializers
from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True, default="")
    recipient_name = serializers.SerializerMethodField()
    target_role = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = Notification
        fields = [
            "id", "recipient", "recipient_name", "student", "student_name", "title",
            "message", "category", "is_read", "is_pushed", "target_role", "created_at",
        ]
        read_only_fields = ["id", "is_pushed", "created_at"]
        extra_kwargs = {"recipient": {"required": False}}

    def get_recipient_name(self, obj) -> str:
        if not obj.recipient:
            return ""
        return obj.recipient.get_full_name() or obj.recipient.username
