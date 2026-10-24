# backend/apps/api/views/auth.py

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authtoken.models import Token
from rest_framework.throttling import AnonRateThrottle
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from apps.academics.models import SchoolProfile, Schedule
from .common import resolve_faculty_for_user, get_user_role, safe_photo_url, is_regular_teacher

User = get_user_model()


class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class ValidationRateThrottle(AnonRateThrottle):
    rate = '60/minute'


def build_authenticated_user_payload(user, request=None):
    faculty = resolve_faculty_for_user(user)
    school = SchoolProfile.objects.first()
    profile = getattr(user, 'profile', None)
    assigned_role = get_user_role(user)

    emp_id = getattr(faculty, 'employee_id', user.username) if faculty else user.username
    first_name = (getattr(faculty, 'first_name', '') or user.first_name or '').strip()
    middle_name = (getattr(faculty, 'middle_name', '') or '').strip()
    last_name = (getattr(faculty, 'last_name', '') or user.last_name or '').strip()
    full_name = (
        getattr(faculty, 'full_name', '')
        if faculty
        else " ".join(filter(None, [first_name, middle_name, last_name])).strip() or user.username
    )

    photo_url = safe_photo_url(faculty.photo, request) if (faculty and faculty.photo) else None
    teaching_class_count = Schedule.objects.filter(faculty=faculty).count() if faculty else 0
    can_teach = bool(getattr(faculty, 'can_teach', True)) and bool(getattr(profile, 'is_teaching', True))

    return {
        'id': user.id,
        'username': user.username,
        'first_name': first_name,
        'middle_name': middle_name,
        'last_name': last_name,
        'full_name': full_name,
        'faculty_name': full_name,
        'faculty_id': emp_id,
        'faculty_pk': getattr(faculty, 'id', None),
        'email': getattr(faculty, 'email', '') or user.email or '',
        'contact_number': getattr(faculty, 'contact_number', '') if faculty else '',
        'position': getattr(faculty, 'position', '') if faculty else '',
        'department': getattr(faculty, 'department', '') if faculty else '',
        'rfid_uid': getattr(faculty, 'rfid_uid', '') if faculty else '',
        'photo': photo_url,
        'photo_url': photo_url,
        'school_name': getattr(school, 'school_name', '') if school else '',
        'role': assigned_role,
        'system_role': assigned_role,
        'is_profile_completed': bool(profile and getattr(profile, 'is_profile_completed', True)),
        'can_teach': can_teach,
        'is_teaching': can_teach or (teaching_class_count > 0) or is_regular_teacher(assigned_role),
        'assigned_class_count': teaching_class_count,
        'is_superuser': user.is_superuser,
    }


class DatabaseLoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthLoginRateThrottle]

    def post(self, request):
        username = str(request.data.get('username', '')).strip()
        password = str(request.data.get('password', '')).strip()

        if not username or not password:
            return Response(
                {'error': 'Username and password are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_user = User.objects.filter(username__iexact=username).first()
        profile = getattr(existing_user, 'profile', None) if existing_user else None

        if profile and hasattr(profile, 'is_locked') and profile.is_locked():
            return Response(
                {'error': 'Account locked due to excessive failed attempts. Try again in 15 minutes.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        user = authenticate(request=request, username=username, password=password)
        if user is None:
            if profile and hasattr(profile, 'record_failed_attempt'):
                profile.record_failed_attempt()
            return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

        if not user.is_active:
            return Response(
                {'error': 'Account is inactive. Contact school admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        if profile and hasattr(profile, 'reset_failed_attempts'):
            profile.reset_failed_attempts()

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {'token': token.key, 'user': build_authenticated_user_payload(user, request)},
            status=status.HTTP_200_OK,
        )


LoginAPIView = DatabaseLoginView


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_authenticated_user_payload(request.user, request), status=status.HTTP_200_OK)

    def put(self, request):
        user = request.user
        data = request.data
        faculty = resolve_faculty_for_user(user)

        if 'first_name' in data:
            user.first_name = str(data.get('first_name', '')).strip()
        if 'last_name' in data:
            user.last_name = str(data.get('last_name', '')).strip()
        if 'email' in data:
            user.email = str(data.get('email', '')).strip()

        new_password = data.get('password')
        if new_password:
            clean_pw = str(new_password).strip()
            if len(clean_pw) < 8:
                return Response(
                    {'error': 'Password must be at least 8 characters long.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                validate_password(clean_pw, user=user)
            except DjangoValidationError as exc:
                return Response({'error': list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
            user.set_password(clean_pw)

        user.save()

        if faculty:
            faculty.first_name = user.first_name
            faculty.last_name = user.last_name
            faculty.email = user.email
            faculty.save(update_fields=['first_name', 'last_name', 'email'])

        return Response(build_authenticated_user_payload(user, request), status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)


CurrentUserProfileView = CurrentUserView


class LiveFieldValidationAPIView(APIView):
    """
    Validates field uniqueness (username, email) in real time.
    Supports both GET and POST requests to prevent 405 Method Not Allowed errors.
    """
    permission_classes = [IsAuthenticated]
    throttle_classes = [ValidationRateThrottle]

    def _validate(self, field, val, exclude_id):
        val = str(val or '').strip()
        field = str(field or '').strip().lower()
        is_taken = False
        message = ''

        if field == 'username' and val:
            qs = User.objects.filter(username__iexact=val)
            if exclude_id and str(exclude_id).isdigit():
                qs = qs.exclude(id=int(exclude_id))
            is_taken = qs.exists()
            if is_taken:
                message = f"Username '{val}' is already taken."
        elif field == 'email' and val:
            qs = User.objects.filter(email__iexact=val)
            if exclude_id and str(exclude_id).isdigit():
                qs = qs.exclude(id=int(exclude_id))
            is_taken = qs.exists()
            if is_taken:
                message = f"Email '{val}' is already in use."

        return {
            'valid': not is_taken,
            'is_taken': is_taken,
            'message': message,
        }

    def get(self, request):
        field = request.query_params.get('field')
        val = request.query_params.get('value')
        exclude_id = request.query_params.get('exclude_id')
        result = self._validate(field, val, exclude_id)
        return Response(result, status=status.HTTP_200_OK)

    def post(self, request):
        field = request.data.get('field') or request.query_params.get('field')
        val = request.data.get('value') or request.query_params.get('value')
        exclude_id = request.data.get('exclude_id') or request.query_params.get('exclude_id')
        result = self._validate(field, val, exclude_id)
        return Response(result, status=status.HTTP_200_OK)


class RegisterPushTokenAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = str(request.data.get('push_token', '')).strip()
        if not token:
            return Response({'error': 'Push token required.'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'success': True}, status=status.HTTP_200_OK)