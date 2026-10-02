import os
import sys
import time

# Enable native ANSI VT100 color support in Windows PowerShell / Command Prompt
if sys.platform == 'win32':
    os.system('')

class ColoredAPILoggingMiddleware:
    """
    Colorizes terminal output for all HTTP requests:
    - 2xx / 3xx (OK): Bright GREEN
    - 4xx / 5xx (Bugs / Errors): Bright RED
    """
    # ANSI escape color codes
    GREEN = '\033[92m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    RESET = '\033[0m'
    DIM = '\033[2m'

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = time.time()
        
        response = self.get_response(request)
        
        duration_ms = (time.time() - start_time) * 1000
        status_code = response.status_code
        method = request.method
        full_path = request.get_full_path()
        time_str = time.strftime('%H:%M:%S')

        # Determine color based on HTTP status code
        if status_code < 400:
            # OK (Green)
            color = self.GREEN
            tag = "✓ OK"
        else:
            # Bug or Error (Red)
            color = self.RED
            tag = "✗ ERROR"

        log_output = (
            f"{color}{self.BOLD}[{time_str}] [{tag} {status_code}] "
            f"{method:<6} {full_path} {self.DIM}({duration_ms:.1f}ms){self.RESET}"
        )

        print(log_output, flush=True)
        return response

    def process_exception(self, request, exception):
        """Catches uncaught 500 exceptions and prints in Bright Red with traceback hint"""
        time_str = time.strftime('%H:%M:%S')
        print(
            f"{self.RED}{self.BOLD}[{time_str}] [✗ BUG 500] "
            f"{request.method} {request.get_full_path()} -> EXCEPTION: {exception}{self.RESET}",
            flush=True
        )