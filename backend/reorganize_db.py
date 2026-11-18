import os
import shutil
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
os.environ["DJANGO_SETTINGS_MODULE"] = "config.settings"

DOMAIN_APPS = [
    "accounts",
    "school",
    "students",
    "attendance",
    "campus",
    "messaging",
    "reports",
]


def ensure_app_packages_and_urls():
    """Guarantees every app has __init__.py, migrations/__init__.py, and urls.py."""
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
            print(f"[CREATED] apps/{app_name}/urls.py")


def archive_legacy_folders():
    backup_dir = BASE_DIR / "_legacy_backup"
    legacy_paths = [
        BASE_DIR / "attendsure_core",
        BASE_DIR / "apps" / "academics",
        BASE_DIR / "apps" / "api",
        BASE_DIR / "apps" / "common",
        BASE_DIR / "apps" / "core",
        BASE_DIR / "apps" / "telemetry",
    ]
    for path in legacy_paths:
        if path.exists():
            backup_dir.mkdir(exist_ok=True)
            target = backup_dir / path.name
            if target.exists():
                shutil.rmtree(target)
            shutil.move(str(path), str(target))
            print(f"[ARCHIVED] {path.relative_to(BASE_DIR)} -> _legacy_backup/{path.name}")


def ensure_holidays_table_for_existing_db(connection):
    """Creates school_holidays if attaching to an existing AttendSure database."""
    with connection.cursor() as cursor:
        tables = set(connection.introspection.table_names(cursor))
        if "academic_years" in tables and "school_holidays" not in tables:
            if connection.vendor == "postgresql":
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS school_holidays (
                        id BIGSERIAL PRIMARY KEY,
                        holiday_date DATE NOT NULL UNIQUE,
                        title VARCHAR(150) NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                """)
            else:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS school_holidays (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        holiday_date DATE NOT NULL UNIQUE,
                        title VARCHAR(150) NOT NULL,
                        created_at DATETIME NOT NULL
                    );
                """)
            print("[CREATED TABLE] school_holidays")


def sync_database_state():
    import django
    from django.core.management import call_command
    from django.db import connection

    django.setup()

    print("\n[1/3] Running Django system check...")
    call_command("check")

    print("\n[2/3] Generating migrations for domain apps...")
    call_command(
        "makemigrations",
        "accounts",
        "school",
        "students",
        "attendance",
        "campus",
        "messaging",
    )

    ensure_holidays_table_for_existing_db(connection)

    with connection.cursor() as cursor:
        existing_tables = set(connection.introspection.table_names(cursor))

    print("\n[3/3] Syncing database state (preserving all existing records)...")
    if "students" in existing_tables:
        call_command("migrate", "--fake-initial")
    else:
        call_command("migrate")

    print("\n[SUCCESS] All domain apps checked and synced with zero errors!")


if __name__ == "__main__":
    ensure_app_packages_and_urls()
    archive_legacy_folders()
    sync_database_state()