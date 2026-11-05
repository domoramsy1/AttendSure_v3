"""
AttendSure V3 - SMS Outbox API Views
File: backend/apps/api/views/sms.py
"""

import re
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Q
from rest_framework import viewsets, status, permissions, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.throttling import UserRateThrottle

from apps.academics.models import SmsOutbox, Student, FacultyProfile

ALLOWED_SMS_STATUSES = {'PENDING', 'SENT', 'FAILED'}


def sanitize_ph_phone(number_str: str) -> str:
    """Standardizes input into 11-digit Philippine mobile format (09XXXXXXXXX)."""
    if not number_str:
        return ''
    cleaned = re.sub(r'[^\d+]', '', str(number_str)).strip()
    if cleaned.startswith('+63'):
        cleaned = '0' + cleaned[3:]
    elif cleaned.startswith('63') and len(cleaned) == 12:
        cleaned = '0' + cleaned[2:]
    return cleaned


class SmsOutboxSerializer(serializers.ModelSerializer):
    """
    Self-contained serializer for SMS outbox records.
    Formats dates into simple readable text for the web dashboard.
    """
    formatted_created_at = serializers.SerializerMethodField()
    formatted_sent_at = serializers.SerializerMethodField()

    class Meta:
        model = SmsOutbox
        fields = '__all__'

    def get_formatted_created_at(self, obj):
        created = getattr(obj, 'created_at', None)
        if created:
            try:
                return created.strftime('%b %d, %Y %I:%M %p')
            except Exception:
                return str(created)
        return ''

    def get_formatted_sent_at(self, obj):
        sent = getattr(obj, 'sent_at', None)
        if sent:
            try:
                return sent.strftime('%b %d, %Y %I:%M %p')
            except Exception:
                return str(sent)
        return 'Not sent'


class SmsOutboxViewSet(viewsets.ModelViewSet):
    """
    ViewSet for SMS Outbox management with connection-safe caching,
    rate throttling, and administrative actions.
    """
    serializer_class = SmsOutboxSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UserRateThrottle]

    def get_queryset(self):
        queryset = SmsOutbox.objects.all().order_by('-created_at')

        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() in ALLOWED_SMS_STATUSES:
            queryset = queryset.filter(status=status_param.upper())

        category_param = self.request.query_params.get('category')
        if category_param and category_param != 'ALL':
            queryset = queryset.filter(
                Q(category=category_param) | Q(trigger_event=category_param)
            )

        search_query = self.request.query_params.get('search')
        if search_query:
            search_query = search_query.strip()
            queryset = queryset.filter(
                Q(recipient_name__icontains=search_query) |
                Q(recipient_number__icontains=search_query) |
                Q(message_body__icontains=search_query)
            )

        return queryset

    def create(self, request, *args, **kwargs):
        """Creates a single queued SMS message with sanitized phone number."""
        data = request.data.copy()
        raw_number = data.get('recipient_number', '')
        clean_number = sanitize_ph_phone(raw_number)

        if not clean_number or len(clean_number) < 11:
            return Response(
                {"recipient_number": ["Enter a valid Philippine mobile number (09XXXXXXXXX)."]},
                status=status.HTTP_400_BAD_REQUEST
            )

        data['recipient_number'] = clean_number
        data['status'] = 'PENDING'
        data['message_body'] = data.get('message_body') or data.get('message', '')

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        cache.delete("sms_outbox_metrics_summary")

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        response = super().update(request, *args, **kwargs)
        cache.delete("sms_outbox_metrics_summary")
        return response

    def destroy(self, request, *args, **kwargs):
        response = super().destroy(request, *args, **kwargs)
        cache.delete("sms_outbox_metrics_summary")
        return response

    @action(detail=False, methods=['get'], url_path='metrics')
    def metrics(self, request):
        """
        Fast aggregated metrics in a single query.
        Cached in RAM for 4 seconds to prevent database connection exhaustion.
        """
        cache_key = "sms_outbox_metrics_summary"
        cached_result = cache.get(cache_key)
        if cached_result is not None:
            return Response(cached_result, status=status.HTTP_200_OK)

        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)

        data = SmsOutbox.objects.aggregate(
            sent_today=Count('id', filter=Q(status='SENT', sent_at__gte=today_start)),
            total_today=Count('id', filter=Q(created_at__gte=today_start)),
            pending=Count('id', filter=Q(status='PENDING')),
            failed=Count('id', filter=Q(status='FAILED'))
        )

        metrics_payload = {
            "total_today": data['total_today'] or 0,
            "sent_today": data['sent_today'] or 0,
            "pending": data['pending'] or 0,
            "failed": data['failed'] or 0,
            "modem_port": getattr(settings, 'GSM_MODEM_PORT', 'COM3'),
            "modem_baudrate": getattr(settings, 'GSM_MODEM_BAUDRATE', 115200),
        }

        cache.set(cache_key, metrics_payload, timeout=4)
        return Response(metrics_payload, status=status.HTTP_200_OK)

    @action(detail=False, methods=['delete'], url_path='clear-pending')
    def clear_pending(self, request):
        """Purges all unsent pending SMS in the queue."""
        deleted_count, _ = SmsOutbox.objects.filter(status='PENDING').delete()
        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Successfully cleared {deleted_count} pending messages.",
                "deleted_count": deleted_count
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['delete'], url_path='delete-delivered')
    def delete_delivered(self, request):
        """Deletes all successfully sent SMS logs to free storage."""
        deleted_count, _ = SmsOutbox.objects.filter(status='SENT').delete()
        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Deleted {deleted_count} delivered message records.",
                "deleted_count": deleted_count
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], url_path='retry')
    def retry_single(self, request, pk=None):
        """Re-queues a failed message."""
        sms_obj = self.get_object()
        sms_obj.status = 'PENDING'
        sms_obj.error_message = None
        sms_obj.retry_count = 0
        sms_obj.save(update_fields=['status', 'error_message', 'retry_count'])
        cache.delete("sms_outbox_metrics_summary")
        return Response({"success": True, "message": f"Message #{sms_obj.id} re-queued."}, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='retry-all-failed')
    def retry_all_failed(self, request):
        """Re-queues all failed notifications."""
        updated_count = SmsOutbox.objects.filter(status='FAILED').update(
            status='PENDING',
            error_message=None,
            retry_count=0
        )
        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Successfully re-queued {updated_count} failed messages.",
                "updated_count": updated_count
            },
            status=status.HTTP_200_OK
        )

    @action(detail=False, methods=['post'], url_path='broadcast')
    def broadcast_announcement(self, request):
        """Batches broadcast messages using fast bulk database creation."""
        data = request.data
        audience = data.get('audience') or data.get('recipient_group', 'ALL_PARENTS')
        message_body = (data.get('message_body') or data.get('message', '')).strip()
        priority = data.get('priority', 'HIGH')

        if not message_body:
            return Response({"error": "Message body cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        recipients = []

        if audience == 'ALL_PARENTS':
            for s in Student.objects.all():
                phone = getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone) if phone else ''
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {getattr(s, 'full_name', 'Student')}"
                    recipients.append((name, clean))

        elif audience == 'ALL_FACULTY':
            for f in FacultyProfile.objects.all():
                phone = getattr(f, 'phone_number', None)
                clean = sanitize_ph_phone(phone) if phone else ''
                if clean:
                    name = getattr(f, 'full_name', 'Faculty')
                    recipients.append((name, clean))

        elif audience == 'BOTH_PARENTS_AND_FACULTY':
            for s in Student.objects.all():
                phone = getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone) if phone else ''
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {getattr(s, 'full_name', 'Student')}"
                    recipients.append((name, clean))
            for f in FacultyProfile.objects.all():
                phone = getattr(f, 'phone_number', None)
                clean = sanitize_ph_phone(phone) if phone else ''
                if clean:
                    name = getattr(f, 'full_name', 'Faculty')
                    recipients.append((name, clean))

        elif audience == 'BY_YEAR_LEVEL':
            year_level = str(data.get('year_level', '')).strip()
            for s in Student.objects.filter(grade_level__iexact=year_level):
                phone = getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone) if phone else ''
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {getattr(s, 'full_name', 'Student')}"
                    recipients.append((name, clean))

        elif audience == 'BY_SECTION':
            section_id = data.get('section_id')
            for s in Student.objects.filter(section_id=section_id):
                phone = getattr(s, 'guardian_phone', None)
                clean = sanitize_ph_phone(phone) if phone else ''
                if clean:
                    name = getattr(s, 'guardian_name', None) or f"Parent of {getattr(s, 'full_name', 'Student')}"
                    recipients.append((name, clean))

        elif audience == 'SPECIFIC_PARENT':
            target_id = data.get('specific_target_id') or data.get('target_id')
            student = Student.objects.filter(id=target_id).first()
            if student and getattr(student, 'guardian_phone', None):
                clean = sanitize_ph_phone(student.guardian_phone)
                if clean:
                    name = getattr(student, 'guardian_name', None) or f"Parent of {getattr(student, 'full_name', 'Student')}"
                    recipients.append((name, clean))

        elif audience == 'SPECIFIC_FACULTY':
            target_id = data.get('specific_target_id') or data.get('target_id')
            faculty = FacultyProfile.objects.filter(id=target_id).first()
            if faculty and getattr(faculty, 'phone_number', None):
                clean = sanitize_ph_phone(faculty.phone_number)
                if clean:
                    recipients.append((getattr(faculty, 'full_name', 'Faculty'), clean))

        unique_recipients = {}
        for name, phone in recipients:
            if phone not in unique_recipients:
                unique_recipients[phone] = name

        if not unique_recipients:
            return Response(
                {"error": "No valid phone numbers found for the selected audience."},
                status=status.HTTP_400_BAD_REQUEST
            )

        new_sms_objects = [
            SmsOutbox(
                recipient_name=name,
                recipient_number=phone,
                message_body=message_body,
                trigger_event='ANNOUNCEMENT',
                category='ANNOUNCEMENT',
                priority=priority,
                status='PENDING'
            )
            for phone, name in unique_recipients.items()
        ]

        with transaction.atomic():
            SmsOutbox.objects.bulk_create(new_sms_objects, batch_size=500)

        cache.delete("sms_outbox_metrics_summary")
        return Response(
            {
                "success": True,
                "message": f"Successfully queued {len(new_sms_objects)} announcement messages.",
                "count": len(new_sms_objects)
            },
            status=status.HTTP_201_CREATED
        )


# ==============================================================================
# HARDWARE MODEM DAEMON ENDPOINTS
# ==============================================================================

class PendingSmsDispatchAPIView(APIView):
    """Used by the local GSM Modem background worker to pull pending SMS tasks."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pending = SmsOutbox.objects.filter(status='PENDING').order_by('priority', 'created_at')[:20]
        return Response(
            [{'id': s.id, 'to': s.recipient_number, 'msg': s.message_body} for s in pending],
            status=status.HTTP_200_OK,
        )


class BulkSmsStatusAPIView(APIView):
    """Processes batch dispatch acknowledgments from the GSM modem."""
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
                error_message=r.get('error', None)
            )
        cache.delete("sms_outbox_metrics_summary")
        return Response({'success': True}, status=status.HTTP_200_OK)


class MarkSmsStatusAPIView(APIView):
    """Marks individual SMS delivery status from hardware."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        new_status = str(request.data.get('status', 'SENT')).upper()
        if new_status not in ALLOWED_SMS_STATUSES:
            return Response({'error': 'Invalid SMS status.'}, status=status.HTTP_400_BAD_REQUEST)
        SmsOutbox.objects.filter(id=pk).update(
            status=new_status,
            sent_at=timezone.now() if new_status == 'SENT' else None,
            error_message=request.data.get('error', None)
        )
        cache.delete("sms_outbox_metrics_summary")
        return Response({'success': True}, status=status.HTTP_200_OK)