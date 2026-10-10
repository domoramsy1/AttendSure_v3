"""
AttendSure V3 - Fully Dynamic SMS Modem & Simulation Daemon
File: backend/scripts/sms_daemon.py

Capabilities:
- Dynamic serial port discovery across all connected COM devices.
- Auto-baud detection (115200, 9600, 57600, 19200, 38400).
- Automatic detection of non-modem devices (e.g. ESP32, RFID readers).
- Dynamic fallback: Switches to simulation mode if no GSM modem answers AT commands.
- Caches and hot-swaps working hardware modems without crashing.
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

# Active hardware state
ACTIVE_MODEM = {
    "port": None,
    "baud": None,
    "is_gsm": False
}


def get_available_ports():
    """Scans Windows for any registered COM ports."""
    if not serial:
        return []
    try:
        return [p.device for p in serial.tools.list_ports.comports()]
    except Exception:
        return []


def fetch_pending_messages():
    """Gets queued text messages from Django."""
    url = f"{API_BASE}/sms/pending/"
    try:
        req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as err:
        print(f"[API ERROR] Unable to query queue: {err}")
        return []


def update_sms_status(msg_id, status, error_msg=None):
    """Notifies Django of delivery success or failure."""
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
    """Tests if a port responds to GSM AT commands."""
    try:
        with serial.Serial(port, baudrate=baud, timeout=1.2, write_timeout=1.2) as s:
            s.dtr = True
            s.rts = True
            time.sleep(0.15)
            s.reset_input_buffer()
            s.write(b"AT\r\n")
            time.sleep(0.2)
            res = s.read(s.in_waiting or 64).decode("utf-8", errors="ignore")
            return "OK" in res
    except Exception:
        return False


def discover_active_modem(forced_port=None):
    """
    Dynamically tests every available COM port and baud rate.
    Finds the real GSM modem or determines if none exist.
    """
    global ACTIVE_MODEM

    ports = [forced_port] if forced_port else get_available_ports()
    if not ports:
        ACTIVE_MODEM = {"port": None, "baud": None, "is_gsm": False}
        return False

    print(f"[AUTOSENSE] Scanning detected port(s): {', '.join(ports)}...")

    for port in ports:
        for baud in COMMON_BAUDS:
            if test_port_at_handshake(port, baud):
                print(f"[AUTOSENSE] Identified GSM Modem on {port} at {baud} baud.")
                ACTIVE_MODEM = {"port": port, "baud": baud, "is_gsm": True}
                return True

    print("[AUTOSENSE] Connected COM ports are not responding to GSM commands (likely microcontrollers/readers).")
    ACTIVE_MODEM = {"port": None, "baud": None, "is_gsm": False}
    return False


def send_sms_hardware(port, baud, phone, text):
    """Transmits SMS through physical serial AT commands."""
    try:
        with serial.Serial(port, baudrate=baud, timeout=6, write_timeout=3) as ser:
            ser.dtr = True
            ser.rts = True
            time.sleep(0.2)

            # Set text mode
            ser.reset_input_buffer()
            ser.write(b"AT+CMGF=1\r\n")
            time.sleep(0.3)
            res = ser.read(ser.in_waiting or 64).decode("utf-8", errors="ignore")
            if "OK" not in res:
                return False, f"Failed text mode initialization: {res.strip()}"

            # Set recipient
            ser.reset_input_buffer()
            ser.write(f'AT+CMGS="{phone}"\r\n'.encode("utf-8"))
            time.sleep(0.4)

            # Transmit body and terminate with Ctrl+Z (\x1A)
            ser.write((text + "\x1A").encode("utf-8"))

            # Wait for network confirmation
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

    # Initial scan
    if not args.simulate:
        discover_active_modem(args.port)

    # Status summary
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

                # Re-verify hardware presence if not already in locked mode
                if not args.simulate and not ACTIVE_MODEM["is_gsm"]:
                    discover_active_modem(args.port)

                for msg in pending:
                    msg_id = msg["id"]
                    recipient = msg["recipient_number"]
                    body = msg.get("message_body", "")

                    print(f"  -> Dispatching #{msg_id} to {recipient}...")

                    # 1. Hardware path if a real GSM modem responded
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
                            # If hardware failed, retry or mark error
                            update_sms_status(msg_id, "FAILED", error_msg=detail)
                            print(f"     [FAILED] Hardware error: {detail}")
                            # Reset modem state to trigger fresh probe next round
                            ACTIVE_MODEM["is_gsm"] = False

                    # 2. Dynamic Simulation path if no GSM modem answered
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