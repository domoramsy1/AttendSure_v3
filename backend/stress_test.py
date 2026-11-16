import os
import time
import concurrent.futures
import requests

# 1. Initialize Django to retrieve a valid user token
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
import django
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.authtoken.models import Token

User = get_user_model()
test_user = User.objects.filter(is_superuser=True).first() or User.objects.first()

if not test_user:
    raise RuntimeError("No users found in database. Run 'python seed_data.py' first.")

token, _ = Token.objects.get_or_create(user=test_user)

BASE_URL = "http://127.0.0.1:8000/api"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Token {token.key}",
}

payload = {
    "section_id": 1,
    "faculty_id": 1,
    "room_name": "Rm 101",
    "days_of_week": "MON-FRI",
    "start_time": "07:30",
    "end_time": "08:30"
}

def send_validation_request(request_id):
    start = time.time()
    try:
        res = requests.post(
            f"{BASE_URL}/schedules/validate-conflict/",
            json=payload,
            headers=HEADERS,
            timeout=5
        )
        duration = round((time.time() - start) * 1000, 2)
        return res.status_code, duration
    except Exception as e:
        return "ERROR", str(e)

print(f"Authenticated as: {test_user.username} (Token: {token.key[:6]}...)")
print("Starting concurrency test (50 parallel requests)...")

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
    results = list(executor.map(send_validation_request, range(50)))

success_count = sum(1 for status_code, _ in results if status_code == 200)
durations = [d for status_code, d in results if isinstance(d, (int, float))]
avg_latency = round(sum(durations) / len(durations), 2) if durations else 0

print(f"\nCompleted: {success_count}/50 returned HTTP 200.")
print(f"Average response latency: {avg_latency}ms")