r"""
AttendSure - Web Source Code /v1/ Endpoint Standardizer
Rewrites all remaining unversioned API strings across web/src/ to canonical /v1/ routes.
"""

import re
from pathlib import Path

WEB_SRC = Path(__file__).resolve().parent.parent / "web" / "src"

LITERAL_SWAPS = [
    ("'/me/'", "'/v1/accounts/me/'"),
    ("'/users/'", "'/v1/accounts/users/'"),
    ("`/users/${", "`/v1/accounts/users/${"),
    ("'/facultys/'", "'/v1/accounts/teachers/'"),
    ("`/facultys/${", "`/v1/accounts/teachers/${"),
    ("'/faculty/dropdown/?include_all=true'", "'/v1/accounts/teachers/dropdown/?include_all=true'"),
    ("'/faculty/dropdown/'", "'/v1/accounts/teachers/dropdown/'"),
    ("`/faculty/${facultyId}/reset-device/`", "`/v1/accounts/teachers/${facultyId}/reset-device/`"),
    ("'/auth/validate/'", "'/v1/accounts/validate-field/'"),
    ("'/activity-logs/'", "'/v1/accounts/audit-logs/'"),
    ("`/activity-logs/?${qs}`", "`/v1/accounts/audit-logs/?${qs}`"),
    ("'/settings/school/'", "'/v1/school/settings/'"),
    ("'/academic-years/'", "'/v1/school/school-years/'"),
    ("'/grade-levels/?page_size=500'", "'/v1/school/grade-levels/?page_size=500'"),
    ("'/grade-levels/'", "'/v1/school/grade-levels/'"),
    ("'/rooms/'", "'/v1/school/rooms/'"),
    ("'/subjects/'", "'/v1/school/subjects/'"),
    ("'/sections/?page_size=500'", "'/v1/school/sections/?page_size=500'"),
    ("'/sections/?page_size=300'", "'/v1/school/sections/?page_size=300'"),
    ("'/sections/'", "'/v1/school/sections/'"),
    ("`/sections/${", "`/v1/school/sections/${"),
    ("'/schedules/?page_size=500'", "'/v1/school/periods/?page_size=500'"),
    ("'/schedules/?page_size=300'", "'/v1/school/periods/?page_size=300'"),
    ("'/schedules/'", "'/v1/school/periods/'"),
    ("`/schedules/${", "`/v1/school/periods/${"),
    ("'/students/?page_size=200'", "'/v1/students/dropdown/'"),
    ("'/students/?page_size=1000'", "'/v1/students/?page_size=1000'"),
    ("'/students/dropdown/'", "'/v1/students/dropdown/'"),
    ("'/students/metrics/'", "'/v1/students/metrics/'"),
    ("'/students/'", "'/v1/students/'"),
    ("`/students/${", "`/v1/students/${"),
    ("'/gate-passes/'", "'/v1/attendance/exit-passes/'"),
    ("`/gate-passes/${", "`/v1/attendance/exit-passes/${"),
    ("'/geofence/'", "'/v1/campus/boundary/'"),
    ("`/geofence/audit/?${", "`/v1/campus/audit/?${"),
    ("'/enterprise/sdg-impact/'", "'/v1/reports/sdg-impact/'"),
    ("'/enterprise/sardo-early-warning/'", "'/v1/reports/dropout-risk/'"),
    ("'/enterprise/emergency-rollcall/'", "'/v1/campus/roll-call/'"),
    ("'/dashboard/overview/'", "'/v1/reports/dashboard/'"),
    ("'/system/status/'", "'/v1/reports/system-status/'"),
    ("'/reports/audit-logs/'", "'/v1/reports/audit-logs/'"),
    ("`/reports/sf1/${", "`/v1/reports/sf1/${"),
    ("`/reports/sf2/${", "`/v1/reports/sf2/${"),
    ("`/reports/sf4/?", "`/v1/reports/sf4/?"),
    ("'/core/maintenance/db-check/'", "'/v1/health/db/'"),
    ("'/core/maintenance/flush-cache/'", "'/v1/cache/flush/'"),
]

ENDPOINT_TEMPLATE_RE = re.compile(r"`/\$\{endpoint\}/\$\{id\}/`")


def map_dynamic_delete(text: str) -> str:
    # AcademicSetupModal dynamic delete helper (`/${endpoint}/${id}/`)
    return text.replace(
        "handleDeleteItem('grade-levels',", "handleDeleteItem('v1/school/grade-levels',"
    ).replace(
        "handleDeleteItem('rooms',", "handleDeleteItem('v1/school/rooms',"
    ).replace(
        "handleDeleteItem('subjects',", "handleDeleteItem('v1/school/subjects',"
    ).replace(
        "handleDeleteItem('sections',", "handleDeleteItem('v1/school/sections',"
    ).replace(
        "handleDeleteItem('schedules',", "handleDeleteItem('v1/school/periods',"
    )


def main() -> None:
    updated_files = 0
    for path in sorted(WEB_SRC.rglob("*.ts*")):
        if path.name == "client.ts" or path.name == "routes.ts":
            continue
        original = path.read_text(encoding="utf-8")
        modified = original
        for old, new in LITERAL_SWAPS:
            modified = modified.replace(old, new)
        modified = map_dynamic_delete(modified)

        if modified != original:
            path.write_text(modified, encoding="utf-8")
            print(f"[MIGRATED -> /v1/] web/src/{path.relative_to(WEB_SRC)}")
            updated_files += 1

    print(f"\n[OK] Standardized {updated_files} web source file(s) to /api/v1/.")


if __name__ == "__main__":
    main()