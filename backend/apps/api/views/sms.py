from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, permissions
from apps.academics.models import SmsOutbox

ALLOWED_SMS_STATUSES = {'PENDING', 'SENT', 'FAILED'}


class PendingSmsDispatchAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pending = SmsOutbox.objects.filter(status='PENDING').order_by('priority', 'created_at')[:20]
        return Response(
            [{'id': s.id, 'to': s.recipient_number, 'msg': s.message_body} for s in pending],
            status=status.HTTP_200_OK,
        )


class BulkSmsStatusAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        results = request.data.get('results', [])
        now = timezone.now()
        for r in results:
            new_status = str(r.get('status', 'SENT')).upper()
            if new_status not in ALLOWED_SMS_STATUSES:
                new_status = 'SENT'
            SmsOutbox.objects.filter(id=r.get('id')).update(
                status=new_status,
                sent_at=now if new_status == 'SENT' else None,
            )
        return Response({'success': True}, status=status.HTTP_200_OK)


class MarkSmsStatusAPIView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        new_status = str(request.data.get('status', 'SENT')).upper()
        if new_status not in ALLOWED_SMS_STATUSES:
            return Response({'error': 'Invalid SMS status.'}, status=status.HTTP_400_BAD_REQUEST)
        SmsOutbox.objects.filter(id=pk).update(
            status=new_status,
            sent_at=timezone.now() if new_status == 'SENT' else None,
        )
        return Response({'success': True}, status=status.HTTP_200_OK)
