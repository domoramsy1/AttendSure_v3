"""
AttendSure V3 - Cache Clean Utility
File: scripts/clean_cache.py
Run: python scripts/clean_cache.py
"""

import os
import sys
import django

# Add project root and backend to python path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, 'backend')
sys.path.extend([ROOT_DIR, BACKEND_DIR])

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.core.cache import cache

def run():
    print("[AttendSure] Clearing system memory and application cache...")
    cache.clear()
    print("[AttendSure] Application cache successfully cleared.")

if __name__ == '__main__':
    run()