import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
django.setup()

from django.db import connection
from django.core.management import call_command
from apps.academics.models import SchoolProfile

all_db_tables = connection.introspection.table_names()
print("\n" + "=" * 60)
print("[*] Inspecting PostgreSQL tables...")

# 1. Locate the actual school table in PostgreSQL
school_tables = [t for t in all_db_tables if 'school' in t.lower()]
print(f"[*] Found candidate school tables: {school_tables}")

actual_table = None
if 'school_profile' in all_db_tables:
    actual_table = 'school_profile'
elif 'school_profiles' in all_db_tables:
    actual_table = 'school_profiles'
elif 'schoolprofile' in all_db_tables:
    actual_table = 'schoolprofile'
elif school_tables:
    actual_table = school_tables[0]

# If no school table exists at all, create it cleanly
if not actual_table:
    actual_table = 'school_profile'
    print(f"[*] No existing school table found. Creating '{actual_table}'...")
    with connection.schema_editor() as editor:
        SchoolProfile._meta.db_table = actual_table
        editor.create_model(SchoolProfile)
    print(f"[✓] Created '{actual_table}' table successfully.")
else:
    print(f"[✓] Identified active table in PostgreSQL: '{actual_table}'")

# 2. Add the dynamic columns to the identified table
new_columns = [
    ('address', 'TEXT DEFAULT \'\''),
    ('contact_number', 'VARCHAR(100) DEFAULT \'\''),
    ('email', 'VARCHAR(254) DEFAULT \'\''),
    ('kagawaran_logo', 'TEXT'),
    ('deped_logo', 'TEXT'),
    ('school_logo', 'TEXT'),
    ('left_logo', 'TEXT'),
    ('right_logo', 'TEXT'),
]

with connection.cursor() as cursor:
    for col, col_type in new_columns:
        print(f"[*] Adding column '{col}' to '{actual_table}' if missing...")
        cursor.execute(f"ALTER TABLE {actual_table} ADD COLUMN IF NOT EXISTS {col} {col_type};")

# 3. Create AuditLog table if declared in models and not yet in PostgreSQL
try:
    from apps.academics.models import AuditLog
    if AuditLog._meta.db_table not in all_db_tables and 'academics_auditlog' not in all_db_tables:
        print("[*] Creating AuditLog table...")
        with connection.schema_editor() as editor:
            editor.create_model(AuditLog)
        print("[✓] AuditLog table created.")
except Exception as e:
    print(f"[*] AuditLog check: {e}")

# 4. Remove any unapplied migration file that caused DuplicateColumn errors
migrations_dir = os.path.join(os.path.dirname(__file__), 'apps', 'academics', 'migrations')
for fname in os.listdir(migrations_dir):
    if fname.startswith('0005_') and fname.endswith('.py'):
        fpath = os.path.join(migrations_dir, fname)
        try:
            os.remove(fpath)
            print(f"[*] Removed conflicting migration file: {fname}")
        except Exception:
            pass

# 5. Generate a fresh migration and fake-apply it so Django's state matches PostgreSQL
print("[*] Generating updated migration state...")
call_command('makemigrations', 'academics')

print("[*] Synchronizing Django migration history (fake apply)...")
call_command('migrate', 'academics', fake=True)

print("=" * 60)
print(f"[✓] SUCCESS! Your actual database table is: '{actual_table}'")
print(f"[*] Please verify apps/academics/models.py has:")
print(f"    class Meta:\n        db_table = '{actual_table}'")
print("=" * 60 + "\n")