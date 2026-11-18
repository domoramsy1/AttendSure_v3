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


def custom_exception_handler(exc, context):
    if isinstance(exc, AppError):
        return Response(
            {"ok": False, "error_code": exc.error_code, "message": exc.message},
            status=exc.status_code,
        )

    response = exception_handler(exc, context)
    if response is not None:
        response.data = {
            "ok": False,
            "error_code": "VALIDATION_ERROR",
            "details": response.data,
        }
        return response

    view_name = context.get("view").__class__.__name__ if context.get("view") else "UnknownView"
    logger.exception("Unhandled server error in %s: %s", view_name, exc)
    return Response(
        {
            "ok": False,
            "error_code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected server error occurred.",
        },
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )