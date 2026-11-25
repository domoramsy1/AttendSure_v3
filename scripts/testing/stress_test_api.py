# AttendSure Scripts - Stress Test API
# File: D:\AttendSure_V3\scripts\testing\stress_test_api.py

r"""
AttendSure - Live API Concurrency Benchmark (Requires running backend on 127.0.0.1:8000)
Run: python testing\stress_test_api.py
"""

import concurrent.futures
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import setup_django

setup_django()

import requests
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
TARGET_URL = "http://127.0.0.1:8000/api/v1/reports/dashboard/"


def hit_endpoint(headers: dict) -> tuple[int | str, float]:
    t0 = time.perf_counter()
    try:
        resp = requests.get(TARGET_URL, headers=headers, timeout=5)
        return resp.status_code, (time.perf_counter() - t0) * 1000.0
    except requests.RequestException as exc:
        return f"ERR:{exc.__class__.__name__}", (time.perf_counter() - t0) * 1000.0


def main():
    user = User.objects.filter(is_superuser=True, is_active=True).first() or User.objects.first()
    if not user:
        sys.exit("[ERROR] No user found in database.")
    access = str(RefreshToken.for_user(user).access_token)
    headers = {"Authorization": f"Bearer {access}"}

    print(f"Benchmarking 50 parallel requests -> {TARGET_URL} (User: {user.username})")
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(lambda _: hit_endpoint(headers), range(50)))

    ok_latencies = [ms for code, ms in results if code == 200]
    avg_ms = round(sum(ok_latencies) / len(ok_latencies), 2) if ok_latencies else 0.0
    print(f"[RESULT] {len(ok_latencies)}/50 HTTP 200 OK | Average Latency: {avg_ms} ms")


if __name__ == "__main__":
    main()
