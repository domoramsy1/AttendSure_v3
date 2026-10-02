import os
import sys
import time
from pathlib import Path
from datetime import datetime

# Initialize standalone Django environment
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')

import django
django.setup()

from django.utils import timezone
from apps.academics.models import SmsOutbox

# Read modem settings from environment
SERIAL_PORT = os.getenv('GSM_MODEM_PORT', 'COM3')
BAUD_RATE = int(os.getenv('GSM_BAUD_RATE', '115200'))
TIMEOUT = int(os.getenv('GSM_TIMEOUT_SEC', '5'))
SIMULATION_MODE = os.getenv('GSM_SIMULATION_MODE', 'True') == 'True'


class GSMModemController:
    def __init__(self, port, baud_rate, timeout):
        self.port = port
        self.baud_rate = baud_rate
        self.timeout = timeout
        self.serial_conn = None

    def connect(self):
        if SIMULATION_MODE:
            print(f"[SIMULATION] Mock GSM modem active on virtual port '{self.port}'.")
            return True

        try:
            import serial
            self.serial_conn = serial.Serial(
                port=self.port,
                baudrate=self.baud_rate,
                timeout=self.timeout
            )
            time.sleep(1)
            # Initialize SMS text mode
            self.send_command('AT\r')
            self.send_command('AT+CMGF=1\r')  # Text mode
            print(f"[+] Connected to hardware GSM modem on {self.port}")
            return True
        except Exception as e:
            print(f"[-] Hardware modem connection failed: {e}")
            return False

    def send_command(self, cmd, wait_time=0.5):
        if not self.serial_conn:
            return ""
        self.serial_conn.write(cmd.encode())
        time.sleep(wait_time)
        response = self.serial_conn.read_all().decode(errors='ignore')
        return response

    def send_sms(self, recipient, text):
        if SIMULATION_MODE:
            print(f"[SIMULATION] Sending to {recipient}: \"{text}\"")
            time.sleep(0.5)
            return True

        try:
            # Set target phone number
            self.serial_conn.write(f'AT+CMGS="{recipient}"\r'.encode())
            time.sleep(0.5)
            # Send SMS content terminated by ASCII 26 (Ctrl+Z)
            self.serial_conn.write((text + chr(26)).encode())
            time.sleep(3)
            reply = self.serial_conn.read_all().decode(errors='ignore')
            return "OK" in reply or "+CMGS:" in reply
        except Exception as e:
            print(f"[-] Transmission error to {recipient}: {e}")
            return False

    def close(self):
        if self.serial_conn and self.serial_conn.is_open:
            self.serial_conn.close()


def process_outbox_queue():
    modem = GSMModemController(SERIAL_PORT, BAUD_RATE, TIMEOUT)
    if not modem.connect():
        print("[-] Aborting queue processing: Modem unavailable.")
        return

    print("[*] AttendSure V3 SMS Outbox Worker running... (Press Ctrl+C to stop)")

    try:
        while True:
            # Process Priority 1 (Urgent/Absences) first, then Priority 2 (Standard)
            pending_messages = SmsOutbox.objects.filter(
                status='PENDING'
            ).order_by('priority', 'created_at')[:10]

            if not pending_messages.exists():
                time.sleep(2)
                continue

            for msg in pending_messages:
                msg.status = 'PROCESSING'
                msg.save(update_fields=['status'])

                success = modem.send_sms(msg.recipient_number, msg.message_body)

                if success:
                    msg.status = 'SENT'
                    msg.sent_at = timezone.now()
                    msg.save(update_fields=['status', 'sent_at'])
                    print(f"  [✔] Dispatched ID #{msg.id} -> {msg.recipient_number}")
                else:
                    msg.retry_count += 1
                    msg.status = 'FAILED' if msg.retry_count >= 3 else 'PENDING'
                    msg.save(update_fields=['status', 'retry_count'])
                    print(f"  [✖] Failed ID #{msg.id} (Attempt {msg.retry_count}/3)")

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[*] Stopping SMS daemon...")
    finally:
        modem.close()


if __name__ == "__main__":
    process_outbox_queue()