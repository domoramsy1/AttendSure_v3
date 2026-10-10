"""
AttendSure V3 - Hardware & Mobile Ingestion Test Harness
File: backend/test_hardware_pipeline.py

Simulates external physical turnstile hardware and mobile camera scans.
Target Data:
  Student : LRN 128936242137 | RFID C51494D6
  Faculty : EMP-3228         | RFID 742DS890
"""

import json
import urllib.error
import urllib.request

BASE_URL = "http://127.0.0.1:8000/api"
KIOSK_CODE = "GATE-01-ENTRY"
SECRET_KEY = "attendsure_kiosk_secret_2026"

STUDENT_RFID = "C51494D6"
STUDENT_LRN = "128936242137"

FACULTY_RFID = "742DS890"
FACULTY_EMP_ID = "EMP-3228"


def send_post(endpoint: str, payload: dict):
    url = f"{BASE_URL}{endpoint}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.getcode(), json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8")
        try:
            return err.code, json.loads(body)
        except Exception:
            return err.code, {"error": body}
    except Exception as err:
        return 0, {"network_error": str(err)}


def main():
    print("=" * 65)
    print("ATTENDSURE V3: HARDWARE & MOBILE INGESTION TEST")
    print("=" * 65)
    print(f"Server Target   : {BASE_URL}")
    print(f"Kiosk Terminal  : {KIOSK_CODE}")
    print(f"Student Data    : LRN {STUDENT_LRN} | RFID {STUDENT_RFID}")
    print(f"Faculty Data    : EMP {FACULTY_EMP_ID} | RFID {FACULTY_RFID}")

    # TEST 1: Kiosk Telemetry Heartbeat
    print("\n[TEST 1] Dispatching Hardware Kiosk Heartbeat...")
    status, res = send_post(
        "/scanners/heartbeat/",
        {
            "kiosk_code": KIOSK_CODE,
            "secret_key": SECRET_KEY,
        }
    )
    print(f"  HTTP Status : {status}")
    print(f"  Response    : {json.dumps(res, indent=2)}")

    # TEST 2: Student Turnstile RFID Scan (Entry)
    print(f"\n[TEST 2] Dispatching Student Turnstile Tap (RFID: {STUDENT_RFID})...")
    status, res = send_post(
        "/gate/scan/",
        {
            "kiosk_code": KIOSK_CODE,
            "secret_key": SECRET_KEY,
            "raw_identifier": STUDENT_RFID,
            "scan_method": "RFID",
            "direction": "IN"
        }
    )
    print(f"  HTTP Status : {status}")
    print(f"  Response    : {json.dumps(res, indent=2)}")

    # TEST 3: Faculty CSC Form 48 DTR Scan (Entry)
    print(f"\n[TEST 3] Dispatching Faculty DTR Tap (RFID: {FACULTY_RFID})...")
    status, res = send_post(
        "/gate/scan/",
        {
            "kiosk_code": KIOSK_CODE,
            "secret_key": SECRET_KEY,
            "raw_identifier": FACULTY_RFID,
            "scan_method": "RFID",
            "direction": "IN"
        }
    )
    print(f"  HTTP Status : {status}")
    print(f"  Response    : {json.dumps(res, indent=2)}")

    # TEST 4: Mobile Camera QR Scan (Student Exit via LRN)
    print(f"\n[TEST 4] Dispatching Mobile QR Camera Scan (LRN: {STUDENT_LRN})...")
    status, res = send_post(
        "/gate/scan/",
        {
            "kiosk_code": KIOSK_CODE,
            "secret_key": SECRET_KEY,
            "raw_identifier": STUDENT_LRN,
            "scan_method": "QR",
            "direction": "OUT"
        }
    )
    print(f"  HTTP Status : {status}")
    print(f"  Response    : {json.dumps(res, indent=2)}")

    # TEST 5: Mobile Camera QR Scan (Faculty Exit via Employee ID)
    print(f"\n[TEST 5] Dispatching Faculty Mobile QR Scan (EMP: {FACULTY_EMP_ID})...")
    status, res = send_post(
        "/gate/scan/",
        {
            "kiosk_code": KIOSK_CODE,
            "secret_key": SECRET_KEY,
            "raw_identifier": FACULTY_EMP_ID,
            "scan_method": "QR",
            "direction": "OUT"
        }
    )
    print(f"  HTTP Status : {status}")
    print(f"  Response    : {json.dumps(res, indent=2)}")

    print("\n" + "=" * 65)
    print("Integration verification completed.")
    print("=" * 65)


if __name__ == "__main__":
    main()