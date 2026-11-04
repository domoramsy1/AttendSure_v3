
import os
import json
import urllib.parse
import shutil
from datetime import datetime

HISTORY_DIR = r"C:\Users\vc\AppData\Roaming\Code\User\History"
PROJECT_ROOT = r"D:\AttendSure_V3"

TARGET_TIMESTAMP = datetime(2026, 11, 5, 1, 15, 0).timestamp() * 1000
print(f"Targeting snapshots around 1:15 AM...")

restored_count = 0
if not os.path.exists(HISTORY_DIR):
    print(f"Error: History directory not found at {HISTORY_DIR}")
    exit(1)

for folder_name in os.listdir(HISTORY_DIR):
    folder_path = os.path.join(HISTORY_DIR, folder_name)
    if not os.path.isdir(folder_path):
        continue
    entries_file = os.path.join(folder_path, "entries.json")
    if not os.path.exists(entries_file):
        continue
    try:
        with open(entries_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        resource_uri = data.get("resource", "")
        if not resource_uri:
            continue
        decoded_uri = urllib.parse.unquote(resource_uri)
        clean_path = decoded_uri[8:].replace("/", "\\") if decoded_uri.lower().startswith("file:///") else decoded_uri.replace("/", "\\")
        if not clean_path.lower().startswith(PROJECT_ROOT.lower()):
            continue
        entries = data.get("entries", [])
        if not entries:
            continue
        
        valid = [e for e in entries if e.get("timestamp", 0) <= TARGET_TIMESTAMP + 15 * 60 * 1000]
        if not valid:
            continue
        valid.sort(key=lambda x: abs(x.get("timestamp", 0) - TARGET_TIMESTAMP))
        best_entry = valid[0]
        
        snapshot_file = os.path.join(folder_path, best_entry.get("id"))
        if os.path.exists(snapshot_file):
            os.makedirs(os.path.dirname(clean_path), exist_ok=True)
            shutil.copy2(snapshot_file, clean_path)
            print(f"Restored: {os.path.basename(clean_path)}")
            restored_count += 1
    except Exception:
        pass

print(f"\nSuccessfully restored {restored_count} files to their exact 1:15 AM state.")

