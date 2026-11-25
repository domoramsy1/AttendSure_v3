# AttendSure Backend - Reorganize DB
# File: D:\AttendSure_V3\backend\reorganize_db.py

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"

DOMAIN_APPS = [
    "accounts",
    "school",
    "students",
    "attendance",
    "campus",
    "reports",
]


def ensure_app_packages_and_urls():
    """Guarantees every domain app has __init__.py, migrations/__init__.py, and urls.py."""
    (BASE_DIR / "apps" / "__init__.py").touch(exist_ok=True)
    for app_name in DOMAIN_APPS:
        app_dir = BASE_DIR / "apps" / app_name
        mig_dir = app_dir / "migrations"
        mig_dir.mkdir(parents=True, exist_ok=True)
        (app_dir / "__init__.py").touch(exist_ok=True)
        (mig_dir / "__init__.py").touch(exist_ok=True)

        urls_file = app_dir / "urls.py"
        if not urls_file.exists():
            urls_file.write_text("urlpatterns = []\n", encoding="utf-8")


def sync_database_state():
    import django
    from django.core.management import call_command

    django.setup()

    print("\n[1/3] Running Django system check...")
    call_command("check")

    print("\n[2/3] Generating 3NF migrations for domain apps...")
    call_command(
        "makemigrations",
        "accounts",
        "school",
        "students",
        "attendance",
        "campus",
        "reports",
    )

    print("\n[3/3] Applying migrations...")
    call_command("migrate")

    print("\n[SUCCESS] All 6 domain apps checked and synced cleanly!")


if __name__ == "__main__":
    ensure_app_packages_and_urls()
    sync_database_state()
