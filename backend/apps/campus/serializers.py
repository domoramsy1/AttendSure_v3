# D:\AttendSure_V3\backend\apps\campus\serializers.py
from rest_framework import serializers


class CampusBoundaryInputSerializer(serializers.Serializer):
    campus_name = serializers.CharField(max_length=150, required=False, default="Main Campus")
    center_latitude = serializers.FloatField(min_value=-90.0, max_value=90.0)
    center_longitude = serializers.FloatField(min_value=-180.0, max_value=180.0)
    radius_meters = serializers.IntegerField(min_value=20, max_value=5000, default=150)
    loafing_grace_minutes = serializers.IntegerField(min_value=0, max_value=120, required=False, default=10)
    duty_start_time = serializers.TimeField(required=False)
    duty_end_time = serializers.TimeField(required=False)
    enforce_geofence_checkin = serializers.BooleanField(required=False, default=True)

    def to_internal_value(self, data):
        mutable = {k: data.get(k) for k in data.keys()} if hasattr(data, "keys") else dict(data)
        if "campus_name" not in mutable and "name" in mutable:
            mutable["campus_name"] = mutable["name"]
        if "center_latitude" not in mutable and "latitude" in mutable:
            mutable["center_latitude"] = mutable["latitude"]
        if "center_longitude" not in mutable and "longitude" in mutable:
            mutable["center_longitude"] = mutable["longitude"]
        if "radius_meters" not in mutable and "geofence_radius_meters" in mutable:
            mutable["radius_meters"] = mutable["geofence_radius_meters"]
        if "loafing_grace_minutes" not in mutable and "grace_minutes" in mutable:
            mutable["loafing_grace_minutes"] = mutable["grace_minutes"]
        return super().to_internal_value(mutable)


class TeacherGpsPingSerializer(serializers.Serializer):
    action = serializers.ChoiceField(
        choices=[
            "PING",
            "CHECK_IN",
            "CHECK_OUT",
            "TIME_IN",
            "TIME_OUT",
            "TIME_IN_AM",
            "TIME_OUT_AM",
            "TIME_IN_PM",
            "TIME_OUT_PM",
        ],
        required=False,
        default="PING",
    )
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()
    accuracy = serializers.FloatField(required=False, allow_null=True)
    accuracy_meters = serializers.FloatField(required=False, allow_null=True)
    speed_mps = serializers.FloatField(required=False, allow_null=True)
    gps_timestamp_ms = serializers.IntegerField(required=False, allow_null=True)
    is_mock_location = serializers.BooleanField(default=False, required=False)
    mocked = serializers.BooleanField(default=False, required=False)
    device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
    client_device_id = serializers.CharField(max_length=128, required=False, allow_blank=True)
    device_model = serializers.CharField(max_length=100, required=False, allow_blank=True)

    # Built-in phone biometric verification + backward-compatible aliases
    biometric_verified_on_device = serializers.BooleanField(default=True, required=False)
    face_verified_on_device = serializers.BooleanField(default=True, required=False)
    face_verified = serializers.BooleanField(default=True, required=False)
    biometric_key_id = serializers.CharField(
        max_length=128, required=False, allow_blank=True, allow_null=True
    )
    biometric_proof = serializers.CharField(
        max_length=128, required=False, allow_blank=True, allow_null=True
    )
    biometric_method = serializers.CharField(
        max_length=40, required=False, allow_blank=True, allow_null=True
    )
    biometric_timestamp_ms = serializers.IntegerField(required=False, allow_null=True)

    def validate_biometric_proof(self, value):
        if value is None:
            return value
        return str(value).strip()
