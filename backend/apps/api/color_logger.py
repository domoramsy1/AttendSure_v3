"""
AttendSure V3 - Color Terminal Request Logger Middleware
File: backend/apps/api/color_logger.py

Formats terminal output with ANSI colors to visually highlight:
- CRUD actions: [CREATE], [READ], [UPDATE], [DELETE]
- Health indicators: Working (Green), Client Error (Yellow), Server Crash (Red)
- Dims background SMS queue polling to keep console clean.
"""

import time
from django.utils import timezone


class TerminalColors:
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    # Foreground
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    WHITE = "\033[97m"

    # Background
    BG_RED = "\033[41m\033[97m\033[1m"
    BG_YELLOW = "\033[43m\033[30m\033[1m"
    BG_GREEN = "\033[42m\033[30m\033[1m"


class ColorTerminalMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.time()
        response = self.get_response(request)
        duration_ms = int((time.time() - start_time) * 1000)

        self.log_request(request, response, duration_ms)
        return response

    def log_request(self, request, response, duration_ms):
        method = request.method
        path = request.path
        code = response.status_code
        now_str = timezone.localtime().strftime("%H:%M:%S")

        # 1. Background daemon polling filter (dimmed so it does not clutter terminal)
        if path == "/api/sms/pending/" and code == 200:
            print(
                f"{TerminalColors.DIM}[{now_str}] [SMS-POLL] GET {path} -> 200 OK ({duration_ms}ms){TerminalColors.RESET}"
            )
            return

        # 2. CRUD Action Tag & Color
        if method == "POST":
            crud_badge = f"{TerminalColors.GREEN}{TerminalColors.BOLD}[CREATE]{TerminalColors.RESET}"
            method_str = f"{TerminalColors.GREEN}{method}{TerminalColors.RESET}"
        elif method == "GET":
            crud_badge = f"{TerminalColors.CYAN}{TerminalColors.BOLD}[READ]  {TerminalColors.RESET}"
            method_str = f"{TerminalColors.CYAN}{method}{TerminalColors.RESET}"
        elif method in ("PUT", "PATCH"):
            crud_badge = f"{TerminalColors.YELLOW}{TerminalColors.BOLD}[UPDATE]{TerminalColors.RESET}"
            method_str = f"{TerminalColors.YELLOW}{method}{TerminalColors.RESET}"
        elif method == "DELETE":
            crud_badge = f"{TerminalColors.MAGENTA}{TerminalColors.BOLD}[DELETE]{TerminalColors.RESET}"
            method_str = f"{TerminalColors.MAGENTA}{method}{TerminalColors.RESET}"
        else:
            crud_badge = f"{TerminalColors.WHITE}[OTHER] {TerminalColors.RESET}"
            method_str = method

        # 3. Status Code Badge & Health Color
        if 200 <= code < 300:
            status_badge = f"{TerminalColors.GREEN}{TerminalColors.BOLD}[WORKING {code}]{TerminalColors.RESET}"
        elif 300 <= code < 400:
            status_badge = f"{TerminalColors.CYAN}[REDIRECT {code}]{TerminalColors.RESET}"
        elif code in (401, 403):
            status_badge = f"{TerminalColors.BG_YELLOW} [DENIED {code}] {TerminalColors.RESET}"
        elif 400 <= code < 500:
            status_badge = f"{TerminalColors.YELLOW}{TerminalColors.BOLD}[BAD REQUEST {code}]{TerminalColors.RESET}"
        elif code >= 500:
            status_badge = f"{TerminalColors.BG_RED} [SERVER CRASH {code}] {TerminalColors.RESET}"
        else:
            status_badge = f"[{code}]"

        # 4. Authenticated User Identity
        user = getattr(request, "user", None)
        if user and user.is_authenticated:
            user_label = f"{TerminalColors.WHITE}(User: {user.username}){TerminalColors.RESET}"
        else:
            user_label = f"{TerminalColors.DIM}(Anon/Hardware){TerminalColors.RESET}"

        # 5. Latency badge
        if duration_ms > 500:
            latency_badge = f"{TerminalColors.RED}{duration_ms}ms (SLOW){TerminalColors.RESET}"
        else:
            latency_badge = f"{TerminalColors.DIM}{duration_ms}ms{TerminalColors.RESET}"

        # Print unified colored log line
        print(
            f"[{now_str}] {crud_badge} {status_badge} {method_str} {path} {user_label} {latency_badge}"
        )