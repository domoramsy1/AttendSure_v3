# D:\AttendSure_V3\backend\common\exceptions.py

import logging
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, error_code: str, message: str, status_code: int = 400):
        self.error_code = error_code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def _extract_first_error_message(detail_data) -> str:
    if isinstance(detail_data, str):
        return detail_data
    if isinstance(detail_data, list) and detail_data:
        return _extract_first_error_message(detail_data[0])
    if isinstance(detail_data, dict) and detail_data:
        first_key, first_val = next(iter(detail_data.items()))
        msg = _extract_first_error_message(first_val)
        if first_key in ("detail", "non_field_errors", "message", "error"):
            return msg
        return f"{str(first_key).replace('_', ' ').title()}: {msg}"
    return "Please check your input and try again."


def custom_exception_handler(exc, context):
    if isinstance(exc, AppError):
        return Response(
            {
                "ok": False,
                "error_code": exc.error_code,
                "message": exc.message,
                "detail": exc.message,
                "error": exc.message,
            },
            status=exc.status_code,
        )

    response = exception_handler(exc, context)
    if response is not None:
        raw_details = response.data
        readable = _extract_first_error_message(raw_details)
        response.data = {
            "ok": False,
            "error_code": "VALIDATION_ERROR",
            "message": readable,
            "detail": readable,
            "error": readable,
            "details": raw_details,
        }
        return response

    view_name = context.get("view").__class__.__name__ if context.get("view") else "UnknownView"
    logger.exception("Unhandled server error in %s: %s", view_name, exc)
    fallback_msg = "An unexpected server error occurred. Please try again."
    return Response(
        {
            "ok": False,
            "error_code": "INTERNAL_SERVER_ERROR",
            "message": fallback_msg,
            "detail": fallback_msg,
            "error": fallback_msg,
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )