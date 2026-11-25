# AttendSure Scripts - Audit Codebase
# File: D:\AttendSure_V3\scripts\testing\audit_codebase.py

r"""
AttendSure - Testing Subdirectory Entrypoint delegating to scripts/audit_codebase.py
Run: python scripts\testing\audit_codebase.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from audit_codebase import main

if __name__ == "__main__":
    raise SystemExit(main())
