from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from .tasks import process_telemetry_batch
import uuid

class AsyncTelemetryHeartbeatView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        payload = request.data
        
        # Enforce idempotency: prevent accidental duplicate scans
        request_id = payload.get('request_id') or str(uuid.uuid4())

        telemetry_event = {
            'request_id': request_id,
            'user_id': user.id,
            'client_device_id': payload.get('client_device_id'),
            'latitude': payload.get('latitude'),
            'longitude': payload.get('longitude'),
            'battery_level': payload.get('battery_level'),
            'is_mock_location': payload.get('is_mock_location', False),
        }

        # Hand off immediately to Celery background task via Redis
        process_telemetry_batch.delay(telemetry_event)

        return Response({
            'status': 'QUEUED',
            'request_id': request_id
        }, status=status.HTTP_202_ACCEPTED)