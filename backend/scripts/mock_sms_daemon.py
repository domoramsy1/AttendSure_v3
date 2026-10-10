"""
AttendSure V3 - Dynamic SMS Modem & Simulation Daemon
File: backend/scripts/sms_daemon.py
"""

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

API_BASE = "http://127.0.0.1:8000/api"
COMMON_BAUDS = [115200, 9600, 57600, 19200, 38400]

ACTIVE_MODEM = {
    "port": None,
    "baud": None,
    "is_gsm": False,
    "scanned": False
}


def get_available_ports():
    if not serial:
        return []
    try:
        return [p.device for p in serial.tools.list_ports.comports()]
    except Exception:
        return []


def fetch_pending_messages():
    url = f"{API_BASE}/sms/pending/"
    try:
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        print(f"[API ERROR] HTTP {err.code}: {body or err.reason}")
        return []
    except Exception as err:
        print(f"[API ERROR] Unable to query queue: {err}")
        return []


def update_sms_status(msg_id, status, error_msg=None):
    url = f"{API_BASE}/sms/{msg_id}/status/"
    payload = json.dumps({"status": status, "error": error_msg}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.getcode() == 200
    except Exception as err:
        print(f"[API ERROR] Failed to update status for message #{msg_id}: {err}")
        return False


def test_port_at_handshake(port, baud):
    try:
        with serial.Serial(port, baudrate=baud, timeout=1.0, write_timeout=1.0) as s:
            s.dtr = True
            s.rts = True
            time.sleep(0.1)
            s.reset_input_buffer()
            s.write(b"AT\r\n")
            time.sleep(0.2)
            res = s.read(s.in_waiting or 64).decode("utf-8", errors="ignore")
            return "OK" in res
    except Exception:
        return False


def discover_active_modem(forced_port=None):
    global ACTIVE_MODEM

    ports = [forced_port] if forced_port else get_available_ports()
    ACTIVE_MODEM["scanned"] = True

    if not ports:
        ACTIVE_MODEM.update({"port": None, "baud": None, "is_gsm": False})
        return False

    print(f"[AUTOSENSE] Scanning detected port(s): {', '.join(ports)}...")

    for port in ports:
        for baud in COMMON_BAUDS:
            if test_port_at_handshake(port, baud):
                print(f"[AUTOSENSE] Identified GSM Modem on {port} at {baud} baud.")
                ACTIVE_MODEM.update({"port": port, "baud": baud, "is_gsm": True})
                return True

    print("[AUTOSENSE] Connected COM ports are not responding to GSM commands (microcontroller/reader).")
    ACTIVE_MODEM.update({"port": None, "baud": None, "is_gsm": False})
    return False


def send_sms_hardware(port, baud, phone, text):
    try:
        with serial.Serial(port, baudrate=baud, timeout=6, write_timeout=3) as ser:
            ser.dtr = True
            ser.rts = True
            time.sleep(0.2)
            ser.reset_input_buffer()
            ser.write(b"AT+CMGF=1\r\n")
            time.sleep(0.3)
            res = ser.read(ser.in_waiting or 64).decode("utf-8", errors="ignore")
            if "OK" not in res:
                return False, f"Failed text mode initialization: {res.strip()}"

            ser.reset_input_buffer()
            ser.write(f'AT+CMGS="{phone}"\r\n'.encode("utf-8"))
            time.sleep(0.4)
            ser.write((text + "\x1A").encode("utf-8"))

            start = time.time()
            res_str = ""
            while time.time() - start < 15:
                if ser.in_waiting > 0:
                    chunk = ser.read(ser.in_waiting).decode("utf-8", errors="ignore")
                    res_str += chunk
                    if "+CMGS:" in res_str or "OK" in res_str:
                        return True, "Delivered"
                    if "ERROR" in res_str:
                        return False, f"Carrier rejected message: {res_str.strip()}"
                time.sleep(0.1)

            return False, "Carrier transmission timeout"
    except Exception as err:
        return False, str(err)


def main():
    parser = argparse.ArgumentParser(description="AttendSure Dynamic SMS Dispatcher")
    parser.add_argument("--simulate", action="store_true", help="Force simulation mode")
    parser.add_argument("--port", type=str, help="Specific COM port to lock onto")
    parser.add_argument("--interval", type=int, default=3, help="Polling interval in seconds")
    args = parser.parse_args()

    print("=" * 60)
    print("  ATTENDSURE V3: DYNAMIC SMS DISPATCHER")
    print("=" * 60)

    if not args.simulate:
        discover_active_modem(args.port)

    if ACTIVE_MODEM["is_gsm"] and not args.simulate:
        print(f"[STATUS] Hardware Mode Active: {ACTIVE_MODEM['port']} @ {ACTIVE_MODEM['baud']} baud")
    else:
        print("[STATUS] Simulation Mode Active (Messages will be acknowledged as SENT)")

    print("[DISPATCHER] Listening for new attendance scans...\n")

    while True:
        try:
            pending = fetch_pending_messages()

            if pending:
                print(f"[{time.strftime('%I:%M:%S %p')}] Found {len(pending)} pending SMS message(s):")

                for msg in pending:
                    msg_id = msg["id"]
                    recipient = msg["recipient_number"]
                    body = msg.get("message_body", "")

                    print(f"  -> Dispatching #{msg_id} to {recipient}...")

                    if ACTIVE_MODEM["is_gsm"] and not args.simulate:
                        success, detail = send_sms_hardware(
                            ACTIVE_MODEM["port"],
                            ACTIVE_MODEM["baud"],
                            recipient,
                            body
                        )
                        if success:
                            update_sms_status(msg_id, "SENT")
                            print(f"     [DELIVERED] Sent via {ACTIVE_MODEM['port']}: #{msg_id}")
                        else:
                            update_sms_status(msg_id, "FAILED", error_msg=detail)
                            print(f"     [FAILED] Hardware error: {detail}")
                            ACTIVE_MODEM["is_gsm"] = False
                    else:
                        time.sleep(0.3)
                        update_sms_status(msg_id, "SENT")
                        print(f"     [DELIVERED] Simulated delivery confirmed: #{msg_id}")

            time.sleep(args.interval)

        except KeyboardInterrupt:
            print("\n[DISPATCHER] Stopped by user.")
            sys.exit(0)
        except Exception as err:
            print(f"[DISPATCHER ERROR] {err}")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()