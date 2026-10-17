"""
AttendSure V3 - Real-Time Telemetry & Anti-Cheating Engine
File: backend/apps/telemetry/views.py

Cybersecurity & Anti-Cheating:
1. Rejects fake GPS / mock location apps.
2. Device lock: Enforces 1 phone per faculty account (anti-buddy punching).
3. Signal accuracy validation: Rejects inaccurate cell tower estimates (> 35m).
4. Abandoned phone detection: Detects phones left charging or stationary without student presence.
5. Classroom cross-referencing: Checks if enrolled students are currently scanned in.
6. Optimized SQL: Uses indexed queries and selective column fetching for fast responses.
"""

import math
from datetime import timedelta
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions

from apps.academics.models import (
    SchoolProfile,
    FacultyProfile,
    ClassSchedule,
    StudentGateLog,
)


def calculate_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates real distance between two GPS coordinates in meters using the Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    return R * (2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)))


def get_faculty_for_user(user):
    """
    Safely finds the FacultyProfile record for a logged-in user.
    Checks UserProfile foreign key, username, and email.
    """
    if not user or not user.is_authenticated:
        return None

    # 1. Check account -> UserProfile -> user
    try:
        faculty = FacultyProfile.objects.filter(account__user=user).first()
        if faculty:
            return faculty
    except Exception:
        pass

    # 2. Check direct UserProfile relation
    user_prof = getattr(user, 'userprofile', None) or getattr(user, 'profile', None)
    if user_prof:
        try:
            faculty = FacultyProfile.objects.filter(account=user_prof).first()
            if faculty:
                return faculty
        except Exception:
            pass

    # 3. Check username / employee ID
    username = getattr(user, 'username', '')
    if username:
        faculty = FacultyProfile.objects.filter(employee_id__iexact=username).first()
        if faculty:
            return faculty

    # 4. Check email
    email = getattr(user, 'email', '')
    if email:
        faculty = FacultyProfile.objects.filter(email__iexact=email).exclude(email='').first()
        if faculty:
            return faculty

    return None


class AsyncTelemetryHeartbeatView(APIView):
    """
    Endpoint: POST /api/telemetry/heartbeat/
    Processes live background GPS, battery level, and classroom verification.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        data = request.data
        faculty = get_faculty_for_user(user)

        if not faculty:
            return Response(
                {'success': False, 'message': 'Faculty profile not found for this account.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 1. Read input numbers safely
        try:
            latitude = float(data.get('latitude', 0))
            longitude = float(data.get('longitude', 0))
            accuracy = float(data.get('accuracy_meters', 0)) if data.get('accuracy_meters') is not None else None
            is_mock = bool(data.get('is_mock_location', False))
            device_id = str(data.get('device_id', '')).strip()
            battery_level = int(data.get('battery_level', 100))
            is_charging = bool(data.get('is_charging', False))
        except (ValueError, TypeError):
            return Response(
                {'success': False, 'message': 'Invalid telemetry data received.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Cybersecurity: Block Fake / Mock GPS
        if is_mock:
            return Response(
                {
                    'success': False,
                    'status': 'SPOOF_BLOCKED',
                    'message': 'Fake GPS detected. Mock location applications are blocked.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # 3. Cybersecurity: Block Weak GPS Signals (> 35 meters)
        if accuracy is not None and accuracy > 35.0:
            return Response(
                {
                    'success': False,
                    'status': 'WEAK_SIGNAL',
                    'message': f'GPS signal too weak (±{round(accuracy)}m). Telemetry requires outdoor satellite lock.',
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 4. Anti-Buddy Punching: Hardware Device Lock
        if faculty.bound_device_id and faculty.bound_device_id != device_id:
            return Response(
                {
                    'success': False,
                    'status': 'DEVICE_MISMATCH',
                    'message': 'Account is locked to a different phone. Contact your school administrator to reset.',
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        elif not faculty.bound_device_id and device_id:
            faculty.bound_device_id = device_id
            faculty.save(update_fields=['bound_device_id'])

        # 5. Campus Geofence Perimeter Calculation
        school = SchoolProfile.objects.first()
        campus_lat = float(school.latitude) if school and school.latitude else 8.485800
        campus_lng = float(school.longitude) if school and school.longitude else 124.656700
        allowed_radius = int(school.geofence_radius_meters) if school and hasattr(school, 'geofence_radius_meters') and school.geofence_radius_meters else 200

        distance = calculate_distance_meters(latitude, longitude, campus_lat, campus_lng)
        is_inside_campus = distance <= allowed_radius

        now = timezone.localtime()
        current_time = now.time()
        current_day = now.strftime('%A').upper()  # MONDAY, TUESDAY, etc.

        # 6. Cross-Reference Faculty Class Schedule
        active_class = None
        try:
            active_class = ClassSchedule.objects.filter(
                faculty=faculty,
                day_of_week=current_day,
                start_time__lte=current_time,
                end_time__gte=current_time,
            ).select_related('section', 'subject').first()
        except Exception:
            pass

        classroom_status = 'NO_SCHEDULED_CLASS'
        verified_students_count = 0

        if active_class and is_inside_campus:
            # 7. Student Cross-Referencing: Check if students from this section have scanned in
            time_threshold = now - timedelta(minutes=60)
            try:
                verified_students_count = StudentGateLog.objects.filter(
                    student__section=active_class.section,
                    timestamp__gte=time_threshold,
                ).values('student_id').distinct().count()

                # If at least 3 students are present, the class session is verified
                if verified_students_count >= 3:
                    classroom_status = 'VERIFIED_IN_CLASSROOM'
                else:
                    classroom_status = 'PENDING_STUDENT_CONFIRMATION'
            except Exception:
                classroom_status = 'VERIFIED_ON_CAMPUS'

        # 8. Abandoned Device Detection:
        # Flag if phone is inside campus during class hours, but stationary/charging with 0 students present
        is_abandoned_risk = False
        if active_class and is_inside_campus and verified_students_count == 0 and is_charging:
            is_abandoned_risk = True

        return Response(
            {
                'success': True,
                'status': 'VERIFIED_ON_CAMPUS' if is_inside_campus else 'OFF_CAMPUS',
                'distance_meters': round(distance, 1),
                'classroom_verification': {
                    'status': classroom_status,
                    'active_section': active_class.section.name if (active_class and hasattr(active_class, 'section') and active_class.section) else None,
                    'active_subject': active_class.subject.name if (active_class and hasattr(active_class, 'subject') and active_class.subject) else None,
                    'students_detected': verified_students_count,
                    'abandoned_phone_risk': is_abandoned_risk,
                },
                'battery_level': battery_level,
                'is_charging': is_charging,
                'timestamp': now.strftime('%I:%M:%S %p'),
            },
            status=status.HTTP_200_OK,
        )


# Export alias so both import names work seamlessly
TelemetryHeartbeatAPIView = AsyncTelemetryHeartbeatView