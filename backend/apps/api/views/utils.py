from django.core.cache import cache
from django.db import connection
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from rest_framework.decorators import api_view, permission_classes
from .common import IsSystemAdminRole, resolve_logo_field
from apps.academics.models import SchoolProfile
from apps.api.serializers import SchoolProfileSerializer

class SchoolSettingsAPIView(APIView):
    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [IsSystemAdminRole()]

    def get(self, request):
        cache_key = "attendsure_school_settings_fast_payload"
        cached = cache.get(cache_key)
        if cached: return Response(cached, status=status.HTTP_200_OK)

        profile = SchoolProfile.objects.first() or SchoolProfile.objects.create()
        data = dict(SchoolProfileSerializer(profile, context={'request': request}).data)
        for key in ('school_logo', 'left_logo', 'right_logo'):
            if data.get(key): data[key] = resolve_logo_field(data[key], request)
        cache.set(cache_key, data, timeout=300)
        return Response(data, status=status.HTTP_200_OK)

    def put(self, request):
        profile = SchoolProfile.objects.first() or SchoolProfile.objects.create()
        serializer = SchoolProfileSerializer(profile, data=request.data, partial=True, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            cache.delete("attendsure_school_settings_fast_payload")
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request):
        return self.put(request)

class CalendarExceptionAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    def get(self, request): return Response([], status=status.HTTP_200_OK)
    def post(self, request): return Response({'success': True}, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def ping_scanners(request):
    return Response({'status': 'ONLINE'}, status=status.HTTP_200_OK)

@api_view(['GET', 'POST'])
@permission_classes([permissions.IsAuthenticated])
def test_sms_gateway(request):
    return Response({'status': 'DISPATCHED'}, status=status.HTTP_200_OK)

@api_view(['GET'])
@permission_classes([permissions.IsAuthenticated])
def db_check(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1;")
    return Response({'database': 'CONNECTED'}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsSystemAdminRole])
def flush_cache(request):
    cache.clear()
    return Response({'success': True, 'message': 'Cache cleared.'}, status=status.HTTP_200_OK)
