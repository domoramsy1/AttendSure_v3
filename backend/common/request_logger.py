"""
AttendSure - Safe Color Terminal API Status Logger
File: backend/common/request_logger.py
"""

import logging
import os
import re
import sys
import time
from urllib.parse import parse_qsl, urlencode
from django.utils import timezone

security_logger = logging.getLogger("attendsure.security")

ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
SENSITIVE_QUERY_KEYS = {"password", "token", "access", "refresh", "secret", "key", "code"}
QUIET_POLL_PATHS = {
    "/api/notifications/",
    "/api/v1/messaging/notifications/",
    "/api/system/status/",
    "/api/v1/reports/system-status/",
    "/api/core/maintenance/db-check/",
    "/api/health/db/",
    "/api/v1/health/db/",
}


def _enable_windows_ansi_colors() -> bool:
    """Enables ANSI color codes in Windows cmd.exe and PowerShell terminals."""
    if not hasattr(sys.stdout, "isatty") or not sys.stdout.isatty():
        return False
    if os.name != "nt":
        return True
    try:
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = kernel32.GetStdHandle(-11)  # STD_OUTPUT_HANDLE
        mode = ctypes.c_ulong()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            # 0x0004 = ENABLE_VIRTUAL_TERMINAL_PROCESSING
            kernel32.SetConsoleMode(handle, mode.value | 0x0004)
        return True
    except Exception:
        return True


class TerminalColors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    CYAN = "\033[96m"
    MAGENTA = "\033[95m"
    WHITE = "\033[97m"

    BG_RED = "\033[41m\033[97m\033[1m"
    BG_YELLOW = "\033[43m\033[30m\033[1m"


def _sanitize_log_text(value: str, max_len: int = 140) -> str:
    """Strips ANSI escape codes and control characters to prevent terminal log injection."""
    cleaned = ANSI_ESCAPE_RE.sub("", str(value or ""))
    safe_chars = "".join(ch for ch in cleaned if 32 <= ord(ch) != 127)
    return safe_chars[:max_len]


def _safe_query_string(raw_query: str) -> str:
    """Formats query parameters while masking tokens, passwords, and secrets."""
    if not raw_query:
        return ""
    pairs = parse_qsl(raw_query, keep_blank_values=True)
    masked = [
        (k, "***" if k.lower() in SENSITIVE_QUERY_KEYS else v)
        for k, v in pairs
        if k != "silent"
    ]
    if not masked:
        return ""
    return f"?{_sanitize_log_text(urlencode(masked), max_len=80)}"


def _resolve_authenticated_username(request, response) -> str | None:
    """Reads the authenticated DRF Token/JWT user first without triggering extra DB queries."""
    renderer_ctx = getattr(response, "renderer_context", None)
    if isinstance(renderer_ctx, dict):
        drf_request = renderer_ctx.get("request")
        drf_user = getattr(drf_request, "user", None)
        if drf_user and getattr(drf_user, "is_authenticated", False):
            return _sanitize_log_text(drf_user.username, max_len=40)

    django_user = getattr(request, "user", None)
    if django_user and getattr(django_user, "is_authenticated", False):
        return _sanitize_log_text(django_user.username, max_len=40)
    return None


def _format_response_size(response) -> str:
    """Formats payload size safely without consuming streaming media responses."""
    if getattr(response, "streaming", False):
        header_len = response.get("Content-Length")
        byte_len = int(header_len) if (header_len and str(header_len).isdigit()) else None
    else:
        content = getattr(response, "content", b"")
        byte_len = len(content) if content is not None else None

    if byte_len is None:
        return "stream"
    if byte_len >= 1024 * 1024:
        return f"{byte_len / (1024 * 1024):.2f}MB"
    if byte_len >= 1024:
        return f"{byte_len / 1024:.1f}KB"
    return f"{byte_len}B"


class RequestLoggerMiddleware:
    """Prints clean, color-coded API status, user, size, and latency lines in real time."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.use_colors = _enable_windows_ansi_colors()

    def __call__(self, request):
        started = time.perf_counter()
        response = self.get_response(request)
        duration_ms = max(1, round((time.perf_counter() - started) * 1000))
        self.log_request(request, response, duration_ms)
        return response

    def _color(self, ansi_code: str) -> str:
        return ansi_code if self.use_colors else ""

    def log_request(self, request, response, duration_ms: int) -> None:
        path = _sanitize_log_text(request.path)
        if path.startswith("/static/"):
            return

        method = _sanitize_log_text(request.method, max_len=10).upper()
        code = int(getattr(response, "status_code", 200))
        now_str = timezone.localtime().strftime("%H:%M:%S")
        raw_qs = request.META.get("QUERY_STRING", "")
        is_silent_poll = "silent=1" in raw_qs or path in QUIET_POLL_PATHS

        reset = self._color(TerminalColors.RESET)
        dim = self._color(TerminalColors.DIM)
        bold = self._color(TerminalColors.BOLD)

        # Dim routine 200 OK background polls and media loads so real actions stand out
        if (is_silent_poll or path.startswith("/media/")) and 200 <= code < 400 and duration_ms <= 500:
            tag = "MEDIA" if path.startswith("/media/") else "POLL "
            print(f"{dim}[{now_str}] [{tag}]   [OK {code}] {method} {path} ({duration_ms}ms){reset}", flush=True)
            return

        if method == "POST":
            c = self._color(TerminalColors.GREEN)
            action_badge = f"{c}{bold}[CREATE]{reset}"
            method_str = f"{c}{method:<6}{reset}"
        elif method == "GET":
            c = self._color(TerminalColors.CYAN)
            action_badge = f"{c}{bold}[READ]  {reset}"
            method_str = f"{c}{method:<6}{reset}"
        elif method in ("PUT", "PATCH"):
            c = self._color(TerminalColors.YELLOW)
            action_badge = f"{c}{bold}[UPDATE]{reset}"
            method_str = f"{c}{method:<6}{reset}"
        elif method == "DELETE":
            c = self._color(TerminalColors.MAGENTA)
            action_badge = f"{c}{bold}[DELETE]{reset}"
            method_str = f"{c}{method:<6}{reset}"
        else:
            c = self._color(TerminalColors.WHITE)
            action_badge = f"{c}[OTHER] {reset}"
            method_str = f"{method:<6}"

        if 200 <= code < 300:
            status_badge = f"{self._color(TerminalColors.GREEN)}{bold}[OK {code}]       {reset}"
        elif 300 <= code < 400:
            status_badge = f"{self._color(TerminalColors.CYAN)}[REDIRECT {code}] {reset}"
        elif code in (401, 403):
            status_badge = f"{self._color(TerminalColors.BG_YELLOW)} [DENIED {code}]  {reset}"
        elif code == 404:
            status_badge = f"{self._color(TerminalColors.RED)}{bold}[NOT FOUND 404]{reset}"
        elif code == 405:
            status_badge = f"{self._color(TerminalColors.MAGENTA)}{bold}[METHOD 405]   {reset}"
        elif code == 429:
            status_badge = f"{self._color(TerminalColors.BG_YELLOW)} [LIMIT 429]   {reset}"
        elif 400 <= code < 500:
            status_badge = f"{self._color(TerminalColors.YELLOW)}{bold}[BAD REQ {code}]  {reset}"
        else:
            status_badge = f"{self._color(TerminalColors.BG_RED)} [ERROR {code}]   {reset}"

        username = _resolve_authenticated_username(request, response)
        user_label = (
            f"{self._color(TerminalColors.WHITE)}(User: {username}){reset}"
            if username
            else f"{dim}(Guest){reset}"
        )

        size_str = _format_response_size(response)
        if duration_ms > 500:
            perf_badge = f"{self._color(TerminalColors.RED)}{bold}{duration_ms}ms SLOW{reset} {dim}[{size_str}]{reset}"
        else:
            perf_badge = f"{dim}{duration_ms}ms [{size_str}]{reset}"

        full_target = f"{path}{_safe_query_string(raw_qs)}"
        print(
            f"[{now_str}] {action_badge} {status_badge} {method_str} {full_target} {user_label} {perf_badge}",
            flush=True,
        )

        if code >= 400:
            security_logger.warning(
                "%s %s -> %s (User: %s, %sms)",
                method,
                full_target,
                code,
                username or "Guest",
                duration_ms,
            )


# Alias for backward compatibility
ColorTerminalMiddleware = RequestLoggerMiddleware