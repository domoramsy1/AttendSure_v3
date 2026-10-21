from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from apps.academics.models import SmsOutbox

class PendingSmsDispatchAPIView(APIView):
    def get(self, request):
        pending = SmsOutbox.objects.filter(status='PENDING').order_by('priority', 'created_at')[:20]
        return Response([{'id': s.id, 'to': s.recipient_number, 'msg': s.message_body} for s in pending], status=status.HTTP_200_OK)

class BulkSmsStatusAPIView(APIView):
    def post(self, request):
        results = request.data.get('results', [])
        for r in results:
            SmsOutbox.objects.filter(id=r.get('id')).update(status=r.get('status', 'SENT'))
        return Response({'success': True}, status=status.HTTP_200_OK)

class MarkSmsStatusAPIView(APIView):
    def post(self, request, pk):
        SmsOutbox.objects.filter(id=pk).update(status=request.data.get('status', 'SENT'))
        return Response({'success': True}, status=status.HTTP_200_OK)
