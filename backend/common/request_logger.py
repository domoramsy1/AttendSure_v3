r"""
AttendSure - Thread-Safe Color Terminal API & Security Logger
File: D:\AttendSure_V3\backend\common\request_logger.py
"""

import ipaddress
import logging
import os
import re
import sys
import threading
import time
import unicodedata
from urllib.parse import parse_qsl, urlencode
from django.utils import timezone

security_logger = logging.getLogger("attendsure.security")

_CONSOLE_LOCK = threading.Lock()

# Strips ANSI CSI, OSC, and single-char ESC sequences
TERMINAL_ESCAPE_RE = re.compile(
    r"\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))"
)
KEY_SPLIT_RE = re.compile(r"[^a-z0-9]+")

# Exact parameter names that must always be redacted
EXACT_SENSITIVE_KEYS = {
    "pass",
    "code",
    "key",
    "sig",
    "signature",
    "pin",
    "otp",
    "jwt",
    "bearer",
    "authorization",
}

# Word segments (split on _, -, .) that indicate a credential or token
SENSITIVE_KEY_SEGMENTS = {
    "password",
    "passwd",
    "pwd",
    "passcode",
    "passphrase",
    "token",
    "secret",
    "apikey",
    "otp",
    "jwt",
    "refresh",
    "access",
    "session",
    "sessionid",
    "csrf",
    "csrftoken",
    "private",
    "credential",
}

HIDDEN_POLL_PARAMS = {"silent", "nocache", "_t"}

QUIET_POLL_PATHS = {
    "/api/system/status/",
    "/api/v1/reports/system-status/",
    "/api/health/db/",
    "/api/v1/health/db/",
    "/api/v1/school/public-branding/",
}

TRUSTED_PROXIES = {
    ip.strip()
    for ip in os.getenv("TRUSTED_PROXY_IPS", "127.0.0.1,::1").split(",")
    if ip.strip()
}


def _enable_windows_ansi_colors() -> bool:
    """Enables ANSI color codes on Windows terminals unless NO_COLOR is set."""
    if os.getenv("NO_COLOR") or "test" in sys.argv:
        return False
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
            kernel32.SetConsoleMode(handle, mode.value | 0x0004)
        return True
    except Exception:
        return True


def _atomic_print(line: str) -> None:
    """Writes a complete newline-terminated log row atomically across threads."""
    if sys.stdout is None:
        return
    try:
        with _CONSOLE_LOCK:
            sys.stdout.write(f"{line}\n")
            sys.stdout.flush()
    except OSError:
        pass


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


def _sanitize_log_text(value: object, max_len: int = 140) -> str:
    """Strips ANSI escapes, C0/C1 controls, and Unicode BiDi/format spoofing chars."""
    cleaned = TERMINAL_ESCAPE_RE.sub("", str(value or ""))
    safe_chars = [
        ch for ch in cleaned if unicodedata.category(ch)[0] != "C"
    ]
    return "".join(safe_chars)[:max_len]


def _is_sensitive_key(key: str) -> bool:
    """Redacts tokens and secrets without masking benign keys like pass_type or subject_code."""
    lowered = key.strip().lower()
    if lowered in EXACT_SENSITIVE_KEYS:
        return True
    if lowered.endswith(("_key", "-key", "_code", "-code")) and lowered.startswith(
        ("api", "auth", "secret", "qr", "otp", "reset", "verify", "client")
    ):
        return True
    segments = set(KEY_SPLIT_RE.split(lowered))
    return bool(segments & SENSITIVE_KEY_SEGMENTS)


def _safe_query_string(raw_query: str) -> str:
    """Formats query parameters safely while masking credentials and tokens."""
    if not raw_query:
        return ""
    pairs = parse_qsl(raw_query[:1024], keep_blank_values=True)
    masked = [
        (k, "***" if _is_sensitive_key(k) else v)
        for k, v in pairs
        if k not in HIDDEN_POLL_PARAMS
    ]
    if not masked:
        return ""
    return f"?{_sanitize_log_text(urlencode(masked), max_len=90)}"


def _validate_ip(raw_ip: str) -> str | None:
    candidate = raw_ip.strip()
    if not candidate:
        return None
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def _get_trusted_proxies() -> set[str]:
    normalized: set[str] = set()
    for raw in TRUSTED_PROXIES:
        valid = _validate_ip(raw)
        normalized.add(valid or raw.strip())
    return normalized


def extract_client_ip(request) -> str:
    """Honors forwarded headers only when REMOTE_ADDR is a trusted reverse proxy."""
    if not request or not hasattr(request, "META"):
        return "127.0.0.1"

    raw_remote = str(request.META.get("REMOTE_ADDR") or "").strip()
    validated_remote = _validate_ip(raw_remote)
    trusted = _get_trusted_proxies()

    if validated_remote and (validated_remote in trusted or raw_remote in trusted):
        cf_ip = _validate_ip(str(request.META.get("HTTP_CF_CONNECTING_IP") or ""))
        if cf_ip:
            return cf_ip

        xff = str(request.META.get("HTTP_X_FORWARDED_FOR") or "")
        if xff:
            forwarded_ip = _validate_ip(xff.split(",")[0])
            if forwarded_ip:
                return forwarded_ip

    return validated_remote or "127.0.0.1"


_extract_client_ip = extract_client_ip


def _resolve_authenticated_username(request, response) -> str | None:
    """Reads already-resolved DRF or Django user objects with zero extra DB queries."""
    if response is not None:
        renderer_ctx = getattr(response, "renderer_context", None)
        if isinstance(renderer_ctx, dict):
            drf_request = renderer_ctx.get("request")
            drf_user = getattr(drf_request, "_user", None)
            if drf_user and getattr(drf_user, "is_authenticated", False):
                return _sanitize_log_text(drf_user.username, max_len=40)

    # Read _cached_user from __dict__ so SimpleLazyObject never triggers a DB hit on 404s
    cached_user = getattr(request, "__dict__", {}).get("_cached_user")
    if cached_user and getattr(cached_user, "is_authenticated", False):
        return _sanitize_log_text(cached_user.username, max_len=40)

    return None


def _format_response_size(response, status_code: int) -> str:
    """Reads Content-Length first to avoid copying response byte buffers."""
    if response is None or status_code in (204, 304):
        return "0B"

    header_len = response.get("Content-Length")
    if header_len and str(header_len).isdigit():
        byte_len = int(header_len)
    elif getattr(response, "streaming", False):
        return "stream"
    else:
        content = getattr(response, "content", None)
        byte_len = len(content) if content is not None else None

    if byte_len is None:
        return "stream"
    if byte_len >= 1024 * 1024:
        return f"{byte_len / (1024 * 1024):.2f}MB"
    if byte_len >= 1024:
        return f"{byte_len / 1024:.1f}KB"
    return f"{byte_len}B"


class RequestLoggerMiddleware:
    """Prints thread-safe, color-coded API status, user, size, and latency lines."""

    sync_capable = True
    async_capable = False

    def __init__(self, get_response):
        self.get_response = get_response
        self.use_colors = _enable_windows_ansi_colors()
        self.quiet_mode = os.getenv("ATTENDSURE_QUIET_LOGGER", "").lower() in ("1", "true")

        reset = self._color(TerminalColors.RESET)
        bold = self._color(TerminalColors.BOLD)
        self._reset = reset
        self._dim = self._color(TerminalColors.DIM)
        self._bold = bold
        self._white = self._color(TerminalColors.WHITE)
        self._red = self._color(TerminalColors.RED)

        # Precompute method badges once at startup
        self._method_badges = {
            "POST": (
                f"{self._color(TerminalColors.GREEN)}{bold}[CREATE]{reset}",
                f"{self._color(TerminalColors.GREEN)}{'POST':<6}{reset}",
            ),
            "GET": (
                f"{self._color(TerminalColors.CYAN)}{bold}[READ]  {reset}",
                f"{self._color(TerminalColors.CYAN)}{'GET':<6}{reset}",
            ),
            "PUT": (
                f"{self._color(TerminalColors.YELLOW)}{bold}[UPDATE]{reset}",
                f"{self._color(TerminalColors.YELLOW)}{'PUT':<6}{reset}",
            ),
            "PATCH": (
                f"{self._color(TerminalColors.YELLOW)}{bold}[UPDATE]{reset}",
                f"{self._color(TerminalColors.YELLOW)}{'PATCH':<6}{reset}",
            ),
            "DELETE": (
                f"{self._color(TerminalColors.MAGENTA)}{bold}[DELETE]{reset}",
                f"{self._color(TerminalColors.MAGENTA)}{'DELETE':<6}{reset}",
            ),
        }

    def __call__(self, request):
        started = time.perf_counter()
        try:
            response = self.get_response(request)
        except Exception:
            duration_ms = max(1, round((time.perf_counter() - started) * 1000))
            if not self.quiet_mode:
                self.log_request(request, None, duration_ms, forced_code=500)
            raise

        duration_ms = max(1, round((time.perf_counter() - started) * 1000))
        if not self.quiet_mode:
            self.log_request(request, response, duration_ms)
        return response

    def _color(self, ansi_code: str) -> str:
        return ansi_code if self.use_colors else ""

    def _status_badge(self, code: int) -> str:
        reset, bold = self._reset, self._bold
        if 200 <= code < 300:
            return f"{self._color(TerminalColors.GREEN)}{bold}[OK {code}]       {reset}"
        if code == 304:
            return f"{self._color(TerminalColors.CYAN)}[CACHED 304]   {reset}"
        if 300 <= code < 400:
            return f"{self._color(TerminalColors.CYAN)}[REDIRECT {code}] {reset}"
        if code in (401, 403):
            return f"{self._color(TerminalColors.BG_YELLOW)} [DENIED {code}]  {reset}"
        if code == 404:
            return f"{self._red}{bold}[NOT FOUND 404]{reset}"
        if code == 405:
            return f"{self._color(TerminalColors.MAGENTA)}{bold}[METHOD 405]   {reset}"
        if code == 429:
            return f"{self._color(TerminalColors.BG_YELLOW)} [LIMIT 429]   {reset}"
        if 400 <= code < 500:
            return f"{self._color(TerminalColors.YELLOW)}{bold}[BAD REQ {code}]  {reset}"
        return f"{self._color(TerminalColors.BG_RED)} [ERROR {code}]   {reset}"

    def log_request(
        self,
        request,
        response,
        duration_ms: int,
        forced_code: int | None = None,
    ) -> None:
        path = _sanitize_log_text(request.path)
        if path.startswith("/static/"):
            return

        method = _sanitize_log_text(request.method, max_len=10).upper()
        code = forced_code if forced_code is not None else int(getattr(response, "status_code", 200))

        if method == "OPTIONS" and 200 <= code < 400:
            return

        now_str = timezone.localtime().strftime("%H:%M:%S")
        raw_qs = request.META.get("QUERY_STRING", "")
        is_media = path.startswith("/media/")
        is_silent_poll = method == "GET" and ("silent=1" in raw_qs or path in QUIET_POLL_PATHS)

        if (is_silent_poll or is_media) and 200 <= code < 400 and duration_ms <= 500:
            tag = "MEDIA" if is_media else "POLL "
            state_str = "CACHED 304" if code == 304 else f"OK {code}"
            _atomic_print(
                f"{self._dim}[{now_str}] [{tag}]   [{state_str}] {method} {path} ({duration_ms}ms){self._reset}"
            )
            return

        action_badge, method_str = self._method_badges.get(
            method,
            (f"{self._white}[CHECK] {self._reset}", f"{method:<6}"),
        )
        status_badge = self._status_badge(code)

        username = None if is_media else _resolve_authenticated_username(request, response)
        user_label = (
            f"{self._white}(User: {username}){self._reset}"
            if username
            else f"{self._dim}(Guest){self._reset}"
        )

        size_str = _format_response_size(response, code)
        if duration_ms > 500:
            perf_badge = f"{self._red}{self._bold}{duration_ms}ms SLOW{self._reset} {self._dim}[{size_str}]{self._reset}"
        else:
            perf_badge = f"{self._dim}{duration_ms}ms [{size_str}]{self._reset}"

        full_target = f"{path}{_safe_query_string(raw_qs)}"
        _atomic_print(
            f"[{now_str}] {action_badge} {status_badge} {method_str} {full_target} {user_label} {perf_badge}"
        )

        if code >= 400:
            client_ip = _extract_client_ip(request)
            security_logger.warning(
                "%s %s -> %s (User: %s, IP: %s, %sms)",
                method,
                full_target,
                code,
                username or "Guest",
                client_ip,
                duration_ms,
            )


ColorTerminalMiddleware = RequestLoggerMiddleware