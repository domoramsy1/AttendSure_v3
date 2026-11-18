from rest_framework import serializers


class CampusBoundaryInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100, required=False, default="Campus Boundary")
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    radius_meters = serializers.IntegerField(min_value=20, max_value=5000, default=150)


class TeacherCheckInSerializer(serializers.Serializer):
    latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    accuracy = serializers.FloatField(min_value=0.0, required=False, allow_null=True)
    battery_level = serializers.IntegerField(min_value=0, max_value=100, default=100, required=False)
    is_mock_location = serializers.BooleanField(default=False, required=False)
    client_device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
    face_verified = serializers.BooleanField(default=True, required=False)
    liveness_passed = serializers.BooleanField(default=True, required=False)