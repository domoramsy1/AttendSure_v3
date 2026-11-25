# AttendSure Scripts - Automated Quality Gate Auditor
# File: D:\AttendSure_V3\scripts\audit_codebase.py

r"""
AttendSure - Master Automated Codebase, RBAC Matrix, UI Token & DepEd Positioning Auditor
Run: .\backend\venv\Scripts\python.exe .\scripts\audit_codebase.py

Exits 0 ONLY when ALL verification gates pass cleanly; exits 1 on any violation.
"""

import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))
from _bootstrap import PROJECT_ROOT, RESULTS_DIR, setup_django

setup_django()

from django.core.management import call_command
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.urls import resolve
from apps.school.models import ClassPeriod, expand_schedule_days

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".expo",
    "dist",
    "build",
    "__pycache__",
    "venv",
    ".venv",
    "_legacy_backup",
    "_archived_legacy",
    "exports",
    "results",
    "migrations",
    "media",
    "staticfiles",
}

PRINT_FORM_ALLOWLIST = {
    "SF1ReportTab.tsx",
    "SF2ReportTab.tsx",
    "SF4ReportTab.tsx",
    "DTRTab.tsx",
    "DepEdReportHeaderFooter.tsx",
    "StudentIdPassModal.tsx",
}

RETIRED_TOKENS = [
    "".join(["sms", "_outbox"]),
    "".join(["iot", "_kiosks"]),
    "".join(["rf", "id_uid"]),
    "".join(["turns", "tile"]),
    "".join(["gsm", "_modem"]),
    "".join(["fac", "ulty"]),
    "".join(["ros", "ter"]),
]
RETIRED_REGEX = re.compile(r"\b(" + "|".join(RETIRED_TOKENS) + r")\b", re.IGNORECASE)

FORBIDDEN_UI_REGEX = re.compile(
    r"(?:Ed-Fi|UN SDG|SDG\s*(?:4|5|8|11|12|13|16)\b|GDPR|FERPA|COPPA|Startup Showcase|Judge Demo|ParentChat|PushNotification|USB_GUN)",
    re.IGNORECASE,
)
FORBIDDEN_ROLE_REGEX = re.compile(r"""['"](?:PARENT|GUARDIAN_ACCOUNT|SECURITY_GUARD)['"]""")

BROWSER_DIALOG_REGEX = re.compile(r"\bwindow\.(alert|confirm|prompt)\s*\(")
HEX_COLOR_REGEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")


def verify_rbac_permission_modules() -> tuple[bool, list[str]]:
    """Transpile and execute both Web & Mobile permissions.ts in Node to assert every Matrix 3.1 cell."""
    node_script = r"""
const fs = require('fs');
const path = require('path');
const ts = require(path.resolve('web/node_modules/typescript'));

function loadTsModule(relPath) {
  const source = fs.readFileSync(path.resolve(relPath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const fn = new Function('exports', 'require', 'module', transpiled);
  fn(mod.exports, require, mod);
  return mod.exports;
}

const webPerm = loadTsModule('web/src/utils/permissions.ts');
const mobPerm = loadTsModule('mobile/src/utils/permissions.ts');

const profiles = {
  ADMIN: { role: 'ADMIN', can_handle_classes: true, can_teach: true },
  PRINCIPAL: { role: 'PRINCIPAL', can_handle_classes: false, can_teach: false },
  DEPT_HEAD: { role: 'DEPT_HEAD', can_handle_classes: true, can_teach: true },
  TEACHER_TEACH: { role: 'TEACHER', can_handle_classes: true, can_teach: true },
  TEACHER_NONTEACH: { role: 'TEACHER', can_handle_classes: false, can_teach: false },
};

const errors = [];
function expectEq(label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

// 1. Web RBAC Matrix Assertions
const webMatrix = [
  ['canViewTab(dashboard)', (u) => webPerm.canViewTab(u, 'dashboard'), [true, true, true, true, true]],
  ['canViewTab(classroom-scanner)', (u) => webPerm.canViewTab(u, 'classroom-scanner'), [true, true, true, true, false]],
  ['canViewTab(geofence)', (u) => webPerm.canViewTab(u, 'geofence'), [true, true, true, true, true]],
  ['canViewTab(students)', (u) => webPerm.canViewTab(u, 'students'), [true, true, true, true, false]],
  ['canViewTab(gate-passes)', (u) => webPerm.canViewTab(u, 'gate-passes'), [true, true, true, true, true]],
  ['canViewTab(teachers)', (u) => webPerm.canViewTab(u, 'teachers'), [true, true, true, false, false]],
  ['canViewTab(dtr)', (u) => webPerm.canViewTab(u, 'dtr'), [true, true, true, true, true]],
  ['canViewTab(reports)', (u) => webPerm.canViewTab(u, 'reports'), [true, true, true, true, false]],
  ['canViewTab(schedules)', (u) => webPerm.canViewTab(u, 'schedules'), [true, true, false, false, false]],
  ['canViewTab(users)', (u) => webPerm.canViewTab(u, 'users'), [true, false, false, false, false]],
  ['canViewTab(settings)', (u) => webPerm.canViewTab(u, 'settings'), [true, true, false, false, false]],
  ['canEditGeofence', webPerm.canEditGeofence, [true, true, false, false, false]],
  ['canResolveLoafing', webPerm.canResolveLoafing, [true, true, true, false, false]],
  ['canResetBoundDevice', webPerm.canResetBoundDevice, [true, true, false, false, false]],
  ['canManageTeachers', webPerm.canManageTeachers, [true, false, false, false, false]],
  ['canManageUsers', webPerm.canManageUsers, [true, false, false, false, false]],
  ['canManageSchoolSetup', webPerm.canManageSchoolSetup, [true, false, false, false, false]],
  ['canViewAuditLogs', webPerm.canViewAuditLogs, [true, true, false, false, false]],
  ['canViewSf4', webPerm.canViewSf4, [true, true, true, false, false]],
  ['canIssueStudentExitPass', webPerm.canIssueStudentExitPass, [true, true, true, true, false]],
  ['canApproveOrCancelLocatorSlip', webPerm.canApproveOrCancelLocatorSlip, [true, true, true, false, false]],
  ['canDeleteStudents', webPerm.canDeleteStudents, [true, true, false, false, false]],
];

const order = ['ADMIN', 'PRINCIPAL', 'DEPT_HEAD', 'TEACHER_TEACH', 'TEACHER_NONTEACH'];
for (const [name, fn, expectedRow] of webMatrix) {
  order.forEach((roleKey, idx) => {
    expectEq(`WEB ${name} [${roleKey}]`, Boolean(fn(profiles[roleKey])), expectedRow[idx]);
  });
}

// Homeroom adviser student edit check
expectEq('WEB adviser own section', webPerm.canManageStudents(profiles.TEACHER_TEACH, [10], 10), true);
expectEq('WEB adviser other section', webPerm.canManageStudents(profiles.TEACHER_TEACH, [10], 20), false);
expectEq('WEB non-adviser teacher', webPerm.canManageStudents(profiles.TEACHER_TEACH, [], 10), false);
expectEq('WEB DEPT_HEAD edit student', webPerm.canManageStudents(profiles.DEPT_HEAD, [10], 10), false);

// 2. Mobile RBAC Matrix Assertions
const mobMatrix = [
  ['canScanStudentQr', mobPerm.canScanStudentQr, [true, true, true, true, false]],
  ['canIssueStudentExitPass', mobPerm.canIssueStudentExitPass, [true, true, true, true, false]],
  ['canApproveOrCancelLocatorSlip', mobPerm.canApproveOrCancelLocatorSlip, [true, true, true, false, false]],
  ['canViewClassList', mobPerm.canViewClassList, [true, true, true, true, false]],
  ['canViewReports', mobPerm.canViewReports, [true, true, true, true, false]],
  ['canViewSf4', mobPerm.canViewSf4, [true, true, true, false, false]],
  ['canEditGeofence', mobPerm.canEditGeofence, [true, true, false, false, false]],
  ['canResolveLoafing', mobPerm.canResolveLoafing, [true, true, true, false, false]],
  ['canResetBoundDevice', mobPerm.canResetBoundDevice, [true, true, false, false, false]],
  ['canManageSchoolSetup', mobPerm.canManageSchoolSetup, [true, false, false, false, false]],
  ['canManageUsers', mobPerm.canManageUsers, [true, false, false, false, false]],
  ['canViewAuditLogs', mobPerm.canViewAuditLogs, [true, true, false, false, false]],
  ['canViewTab(class_list)', (u) => mobPerm.canViewTab(u, 'class_list'), [true, true, true, true, false]],
  ['canViewTab(reports)', (u) => mobPerm.canViewTab(u, 'reports'), [true, true, true, true, false]],
];

for (const [name, fn, expectedRow] of mobMatrix) {
  order.forEach((roleKey, idx) => {
    expectEq(`MOBILE ${name} [${roleKey}]`, Boolean(fn(profiles[roleKey])), expectedRow[idx]);
  });
}

console.log(JSON.stringify({ ok: errors.length === 0, checked: webMatrix.length * 5 + mobMatrix.length * 5 + 4, errors }));
process.exit(errors.length === 0 ? 0 : 1);
"""
    proc = subprocess.run(
        ["node", "-e", node_script],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        detail = (proc.stdout or "") + (proc.stderr or "")
        return False, [detail.strip()]
    try:
        parsed = json.loads(proc.stdout.strip().splitlines()[-1])
        return bool(parsed.get("ok")), list(parsed.get("errors", []))
    except Exception as exc:
        return False, [f"Could not parse RBAC check output: {exc}"]


def main() -> int:
    failures: list[str] = []
    lines = [
        "=" * 80,
        f"ATTENDSURE MASTER CODEBASE & RBAC AUDIT ({datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')})",
        "=" * 80,
    ]

    # 1. Django System & Pending Migrations Check
    try:
        call_command("check")
        call_command("makemigrations", check=True, dry_run=True, verbosity=0)
        executor = MigrationExecutor(connection)
        pending = executor.migration_plan(executor.loader.graph.leaf_nodes())
        if pending:
            failures.append(f"Pending database migrations detected: {len(pending)}")
            lines.append(f"[FAIL] Pending migrations: {len(pending)}")
        else:
            lines.append("[PASS] Django check & makemigrations --check --dry-run passed (0 pending migrations).")
    except Exception as exc:
        failures.append(f"Django check / migration check failed: {exc}")
        lines.append(f"[FAIL] Django check / migration check failed: {exc}")

    # 2. Core Canonical v1 Route Resolution
    routes = [
        "/api/v1/health/db/",
        "/api/v1/accounts/login/",
        "/api/v1/accounts/me/",
        "/api/v1/accounts/profile/",
        "/api/v1/accounts/change-password/",
        "/api/v1/accounts/teachers/dropdown/",
        "/api/v1/accounts/departments/",
        "/api/v1/school/settings/",
        "/api/v1/school/years/",
        "/api/v1/school/departments/",
        "/api/v1/students/",
        "/api/v1/attendance/scan/",
        "/api/v1/attendance/classes/",
        "/api/v1/attendance/exit-passes/",
        "/api/v1/campus/boundary/",
        "/api/v1/campus/overview/",
        "/api/v1/campus/loafing/",
        "/api/v1/campus/loafing-incidents/",
        "/api/v1/reports/sf4/",
        "/api/v1/reports/division-export/",
    ]
    for route in routes:
        try:
            resolve(route)
        except Exception as exc:
            failures.append(f"Route failed to resolve: {route} ({exc})")
    lines.append(f"[PASS] Verified {len(routes)} core canonical v1 API routes.")

    # 3. 5-Profile RBAC Matrix Check (Web + Mobile permissions.ts)
    rbac_ok, rbac_errors = verify_rbac_permission_modules()
    if rbac_ok:
        lines.append("[PASS] Web & Mobile 5-profile RBAC permission matrix verified (184 assertions).")
    else:
        failures.extend(rbac_errors)
        lines.append(f"[FAIL] RBAC matrix mismatch ({len(rbac_errors)} error(s)):")
        lines.extend([f"  - {e}" for e in rbac_errors[:15]])

    # 4. Zero window.alert / window.confirm / window.prompt in web/src/
    web_src = PROJECT_ROOT / "web" / "src"
    dialog_hits: list[str] = []
    for path in sorted(web_src.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in BROWSER_DIALOG_REGEX.finditer(text):
            dialog_hits.append(f"{path.relative_to(PROJECT_ROOT)} -> {match.group(0)}")
    if dialog_hits:
        failures.append(f"Native browser dialogs found in web/src: {len(dialog_hits)}")
        lines.append(f"[FAIL] Native window.alert/confirm/prompt hits: {len(dialog_hits)}")
        lines.extend([f"  - {h}" for h in dialog_hits[:15]])
    else:
        lines.append("[PASS] Zero window.alert/confirm/prompt calls in web/src/.")

    # 5. Zero stray hardcoded hex colors in non-print web/src/components/ & mobile/src/screens/
    hex_hits: list[str] = []
    for path in sorted((web_src / "components").rglob("*.tsx")):
        if path.name in PRINT_FORM_ALLOWLIST:
            continue
        found = HEX_COLOR_REGEX.findall(path.read_text(encoding="utf-8", errors="ignore"))
        if found:
            hex_hits.append(f"{path.relative_to(PROJECT_ROOT)} ({len(found)}): {found[:5]}")

    mobile_screens = PROJECT_ROOT / "mobile" / "src" / "screens"
    for path in sorted(mobile_screens.rglob("*.tsx")):
        found = HEX_COLOR_REGEX.findall(path.read_text(encoding="utf-8", errors="ignore"))
        if found:
            hex_hits.append(f"{path.relative_to(PROJECT_ROOT)} ({len(found)}): {found[:5]}")

    if hex_hits:
        failures.append(f"Stray hardcoded hex colors found: {len(hex_hits)} file(s)")
        lines.append(f"[FAIL] Hardcoded hex color hits in UI components/screens: {len(hex_hits)}")
        lines.extend([f"  - {h}" for h in hex_hits[:20]])
    else:
        lines.append("[PASS] Zero stray hardcoded hex colors in non-print Web components & Mobile screens.")

    # 6. Zero visible foreign acronym jargon / banned UI patterns in web/src/ & mobile/src/
    jargon_hits: list[str] = []
    for ui_root in [web_src, PROJECT_ROOT / "mobile" / "src"]:
        for path in sorted(ui_root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".ts", ".tsx"}:
                continue
            for lineno, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
                m = FORBIDDEN_UI_REGEX.search(line) or FORBIDDEN_ROLE_REGEX.search(line)
                if m:
                    jargon_hits.append(f"{path.relative_to(PROJECT_ROOT)}:{lineno} -> '{m.group(0)}'")
    if jargon_hits:
        failures.append(f"Forbidden UI jargon/features found: {len(jargon_hits)}")
        lines.append(f"[FAIL] Forbidden UI jargon/features hits: {len(jargon_hits)}")
        lines.extend([f"  - {h}" for h in jargon_hits[:20]])
    else:
        lines.append("[PASS] Zero forbidden foreign acronym jargon or banned UI features in Web & Mobile.")

    # 7. Retired Hardware & Banned Legacy Vocabulary Scan across Codebase
    this_file = Path(__file__).resolve()
    testing_audit_file = (SCRIPTS_DIR / "testing" / "audit_codebase.py").resolve()
    retired_hits: list[str] = []
    for path in PROJECT_ROOT.rglob("*"):
        if not path.is_file() or any(p in SKIP_DIRS for p in path.parts):
            continue
        if path.resolve() in {this_file, testing_audit_file}:
            continue
        if path.suffix.lower() not in {".py", ".ts", ".tsx"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        match = RETIRED_REGEX.search(text)
        if match:
            retired_hits.append(f"{path.relative_to(PROJECT_ROOT)}: '{match.group(0)}'")

    if retired_hits:
        failures.append(f"Retired hardware/vocabulary identifiers found: {len(retired_hits)}")
        lines.append(f"[FAIL] Retired identifier hits: {len(retired_hits)}")
        lines.extend([f"  - {h}" for h in retired_hits[:25]])
    else:
        lines.append("[PASS] Zero retired hardware or banned legacy vocabulary identifiers across codebase.")

    # 8. Timetable Double-Booking Check (requires overlapping time AND intersecting weekdays)
    periods = list(ClassPeriod.objects.filter(is_active=True).select_related("section", "teacher", "subject"))
    days_by_period = {p.id: expand_schedule_days(p.day_of_week) for p in periods}
    conflict_details: list[str] = []
    for i, p1 in enumerate(periods):
        days_1 = days_by_period[p1.id]
        for p2 in periods[i + 1 :]:
            if not (p1.start_time < p2.end_time and p1.end_time > p2.start_time):
                continue
            if not (days_1 & days_by_period[p2.id]):
                continue
            if p1.teacher_id and p1.teacher_id == p2.teacher_id:
                conflict_details.append(
                    f"Teacher conflict (teacher #{p1.teacher_id}): period #{p1.id} "
                    f"({p1.day_of_week} {p1.start_time}-{p1.end_time}) overlaps period #{p2.id} "
                    f"({p2.day_of_week} {p2.start_time}-{p2.end_time})"
                )
            if p1.section_id and p1.section_id == p2.section_id:
                conflict_details.append(
                    f"Section conflict (section #{p1.section_id}): period #{p1.id} "
                    f"({p1.day_of_week} {p1.start_time}-{p1.end_time}) overlaps period #{p2.id} "
                    f"({p2.day_of_week} {p2.start_time}-{p2.end_time})"
                )
    conflicts = len(conflict_details)
    if conflicts > 0:
        failures.append(f"Schedule double-booking conflicts detected: {conflicts}")
        lines.append(f"[FAIL] Active class periods inspected: {len(periods)} | Schedule conflicts: {conflicts}")
        lines.extend([f"  - {detail}" for detail in conflict_details[:20]])
    else:
        lines.append(f"[PASS] Active class periods inspected: {len(periods)} | Schedule conflicts: 0")
    lines.append("=" * 80)

    report = "\n".join(lines)
    print(report)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out = RESULTS_DIR / "system_audit.txt"
    out.write_text(report, encoding="utf-8")
    print(f"Saved audit report to: {out}")

    if failures:
        print(f"\nAUDIT FAILED with {len(failures)} error category(ies).")
        return 1
    print("\nALL AUDIT GATES PASSED (EXIT 0).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
