import logging
from django.db import transaction
from rest_framework import viewsets

from common.request_logger import extract_client_ip

logger = logging.getLogger(__name__)


def get_client_ip(request) -> str:
    """Returns a validated client IP, honoring forwarded headers only from trusted proxies."""
    return extract_client_ip(request)


def record_audit_log(
    *,
    request,
    table_name: str,
    record_id: int,
    action: str,
    changed_fields: list[str] | None = None,
    new_data: dict | None = None,
):
    from apps.accounts.models import AuditLog

    user = request.user if (request and request.user and request.user.is_authenticated) else None
    payload = dict(new_data or {})
    if changed_fields:
        payload["changed_fields"] = [str(field) for field in changed_fields]

    try:
        with transaction.atomic():
            AuditLog.objects.create(
                table_name=str(table_name)[:64],
                record_id=record_id or 0,
                action=str(action).upper()[:10],
                new_data=payload or None,
                performed_by=user,
                client_ip=get_client_ip(request),
                user_agent=str(request.META.get("HTTP_USER_AGENT", ""))[:255] if request else "",
            )
    except Exception as exc:
        logger.warning("Audit log skipped for %s #%s: %s", table_name, record_id, exc)


class AuditedModelViewSet(viewsets.ModelViewSet):
    """Automatically records real CREATE, UPDATE, and DELETE entries in audit_logs."""

    def perform_create(self, serializer):
        instance = serializer.save()
        record_audit_log(
            request=self.request,
            table_name=instance._meta.db_table,
            record_id=instance.pk or 0,
            action="CREATE",
            changed_fields=list(serializer.validated_data.keys()),
        )

    def perform_update(self, serializer):
        changed = list(serializer.validated_data.keys())
        instance = serializer.save()
        record_audit_log(
            request=self.request,
            table_name=instance._meta.db_table,
            record_id=instance.pk or 0,
            action="UPDATE",
            changed_fields=changed,
        )

    def perform_destroy(self, instance):
        table_name = instance._meta.db_table
        record_id = instance.pk or 0
        instance.delete()
        record_audit_log(
            request=self.request,
            table_name=table_name,
            record_id=record_id,
            action="DELETE",
        )