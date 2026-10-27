"""
AttendSure V3 - Authentication & Identity APIs
File: backend/apps/api/views/auth.py
"""

import base64
import uuid
from django.core.files.base import ContentFile
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.academics.models import FacultyProfile, Schedule, SchoolProfile, UserProfile
from apps.common.utils import get_user_role, is_regular_teacher, safe_photo_url
from .common import resolve_faculty_for_user

User = get_user_model()


class AuthLoginRateThrottle(AnonRateThrottle):
    rate = '10/minute'


class ValidationRateThrottle(AnonRateThrottle):
    rate = '60/minute'


def _process_uploaded_photo(raw_photo):
    """
    Safely processes an uploaded photo from multipart/form-data or Base64 string.
    Returns a ContentFile instance or None.
    """
    if not raw_photo:
        return None

    # 1. Direct file upload via request.FILES
    if hasattr(raw_photo, 'read'):
        try:
            raw_photo.seek(0)
            photo_bytes = raw_photo.read()
            name = getattr(raw_photo, 'name', 'avatar.jpg')
            return ContentFile(photo_bytes, name=name)
        except Exception:
            return None

    # 2. Base64 data string from canvas or FileReader
    if isinstance(raw_photo, str):
        clean = raw_photo.strip()
        if clean.startswith('data:image') and ';base64,' in clean:
            try:
                header, img_str = clean.split(';base64,', 1)
                raw_ext = header.split('/')[-1].split(';')[0].lower()
                ext = 'jpg' if raw_ext in ('jpeg', 'pjpeg') else raw_ext
                if ext not in {'png', 'jpg', 'jpeg', 'webp'}:
                    ext = 'jpg'

                decoded_bytes = base64.b64decode(img_str, validate=True)
                if len(decoded_bytes) <= 5 * 1024 * 1024:
                    filename = f"avatar_{uuid.uuid4().hex[:10]}.{ext}"
                    return ContentFile(decoded_bytes, name=filename)
            except Exception:
                return None

    return None


def build_authenticated_user_payload(user, request=None):
    """
    Builds the user identity payload directly from the database
    without using mock or fake data.
    """
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

    # Resolve photo from faculty or user profile
    photo_url = None
    if faculty and faculty.photo:
        photo_url = safe_photo_url(faculty.photo, request)
    elif profile and profile.avatar:
        photo_url = safe_photo_url(profile.avatar, request)

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
    """
    Handles current session user details and profile updates.
    Syncs all fields across User, UserProfile, and FacultyProfile.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_authenticated_user_payload(request.user, request), status=status.HTTP_200_OK)

    def put(self, request):
        user = request.user
        data = request.data
        files = request.FILES

        # 1. Extract values supporting both snake_case and camelCase
        first_name = data.get('first_name') if 'first_name' in data else data.get('firstName')
        last_name = data.get('last_name') if 'last_name' in data else data.get('lastName')
        middle_name = data.get('middle_name') if 'middle_name' in data else data.get('middleName')
        suffix = data.get('suffix')
        contact_number = (
            data.get('contact_number') if 'contact_number' in data
            else (data.get('contactNumber') if 'contactNumber' in data else data.get('phone'))
        )
        department = data.get('department')
        position = data.get('position')
        raw_photo = files.get('photo') or files.get('avatar') or data.get('photo') or data.get('avatar')

        # 2. Update core User model
        user_updates = []
        if first_name is not None:
            user.first_name = str(first_name).strip()
            user_updates.append('first_name')

        if last_name is not None:
            user.last_name = str(last_name).strip()
            user_updates.append('last_name')

        if 'email' in data:
            clean_email = str(data.get('email', '')).strip()
            if clean_email:
                try:
                    validate_email(clean_email)
                except DjangoValidationError:
                    return Response({'error': 'Invalid email address format.'}, status=status.HTTP_400_BAD_REQUEST)
                if User.objects.filter(email__iexact=clean_email).exclude(id=user.id).exists():
                    return Response({'error': 'Email is already used by another account.'}, status=status.HTTP_400_BAD_REQUEST)
            user.email = clean_email
            user_updates.append('email')

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
            user_updates.append('password')

        if user_updates:
            user.save()

        # 3. Process photo / avatar
        photo_file = _process_uploaded_photo(raw_photo)

        # 4. Synchronize UserProfile
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.is_profile_completed = bool(user.first_name and user.last_name)
        if photo_file:
            profile.avatar = photo_file
            profile.save(update_fields=['avatar', 'is_profile_completed'])
        else:
            profile.save(update_fields=['is_profile_completed'])

        # 5. Synchronize or create FacultyProfile
        faculty = resolve_faculty_for_user(user)
        if not faculty:
            clean_emp_id = (user.username or 'EMP').strip().upper()[:50]
            faculty = FacultyProfile.objects.filter(employee_id__iexact=clean_emp_id).first()
            if not faculty:
                faculty = FacultyProfile.objects.create(
                    employee_id=clean_emp_id,
                    first_name=user.first_name or user.username,
                    middle_name=str(middle_name or '').strip(),
                    last_name=user.last_name or 'Staff',
                    suffix=str(suffix or '').strip(),
                    email=user.email or '',
                    contact_number=str(contact_number or '').strip(),
                    department=str(department or 'Administration').strip(),
                    position=str(position or 'Staff').strip(),
                    photo=photo_file,
                    is_active=True,
                )
            profile.faculty = faculty
            profile.save(update_fields=['faculty'])
        else:
            fac_updates = []
            if first_name is not None:
                faculty.first_name = user.first_name
                fac_updates.append('first_name')
            if last_name is not None:
                faculty.last_name = user.last_name
                fac_updates.append('last_name')
            if middle_name is not None:
                faculty.middle_name = str(middle_name).strip()
                fac_updates.append('middle_name')
            if suffix is not None:
                faculty.suffix = str(suffix).strip()
                fac_updates.append('suffix')
            if 'email' in data:
                faculty.email = user.email
                fac_updates.append('email')
            if contact_number is not None:
                faculty.contact_number = str(contact_number).strip()
                fac_updates.append('contact_number')
            if department is not None:
                faculty.department = str(department).strip()
                fac_updates.append('department')
            if position is not None:
                faculty.position = str(position).strip()
                fac_updates.append('position')
            if photo_file:
                faculty.photo = photo_file
                fac_updates.append('photo')

            if fac_updates:
                faculty.save(update_fields=fac_updates)

        return Response(build_authenticated_user_payload(user, request), status=status.HTTP_200_OK)

    def patch(self, request):
        return self.put(request)


CurrentUserProfileView = CurrentUserView


class LiveFieldValidationAPIView(APIView):
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
            try:
                validate_email(val)
                qs = User.objects.filter(email__iexact=val)
                if exclude_id and str(exclude_id).isdigit():
                    qs = qs.exclude(id=int(exclude_id))
                is_taken = qs.exists()
                if is_taken:
                    message = f"Email '{val}' is already in use."
            except DjangoValidationError:
                return {'valid': False, 'is_taken': False, 'message': 'Invalid email format.'}

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

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.push_token = token
        profile.save(update_fields=['push_token'])

        return Response({
            'success': True,
            'message': 'Push token registered successfully.'
        }, status=status.HTTP_200_OK)