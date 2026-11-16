"""
AttendSure V3 - Classroom USB QR Station Views
File: backend/apps/scanners/views.py
"""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView


class USBQRStationStatusView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({'status': 'ONLINE', 'station_type': 'USB_QR_PC'}, status=status.HTTP_200_OK)
