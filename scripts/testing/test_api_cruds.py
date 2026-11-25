r"""
AttendSure - End-to-End 3NF Backend CRUD, Security & DepEd Report Verification
Run: python testing\test_api_cruds.py
"""

import sys
import time
import traceback
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from _bootstrap import RESULTS_DIR, setup_django

setup_django()

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from common.qr_signer import sign_student_qr
from apps.accounts.models import Department, PositionTitle, TeacherProfile, UserProfile
from apps.attendance.models import ClassAttendance, DailyAttendance, ExitPass
from apps.school.models import Building, ClassPeriod, GradeLevel, Room, SchoolYear, Section, Subject
from apps.students.models import Enrollment, Student

User = get_user_model()
RESULT_FILE = RESULTS_DIR / "test_all_cruds_result.txt"
ERROR_FILE = RESULTS_DIR / "test_all_cruds_errors.txt"


class DualLogger:
    def __init__(self, path: Path):
        self.term = sys.stdout
        self.fh = path.open("w", encoding="utf-8")

    def write(self, msg: str):
        self.term.write(msg)
        self.fh.write(msg)

    def flush(self):
        self.term.flush()
        self.fh.flush()

    def close(self):
        self.fh.close()


class ApiSuiteVerifier:
    def __init__(self):
        self.client = APIClient()
        self.results = []
        self.errors = []
        self.tag = uuid.uuid4().hex[:6].upper()

    def _err_text(self, res) -> str:
        data = getattr(res, "data", None)
        if data is not None:
            return str(data)[:300]
        return getattr(res, "content", b"").decode("utf-8", errors="replace")[:300]

    def record(self, cat: str, name: str, ok: bool, detail: str, ms: float, err: str = ""):
        self.results.append({"passed": ok})
        badge = "PASS" if ok else "FAIL"
        print(f"[{badge}] {cat:<14} | {name:<36} | {ms:>6.1f} ms | {detail}")
        if not ok:
            self.errors.append(f"[{cat}] {name} -> {detail} | {err}")

    def call(self, fn, *args, **kwargs):
        t0 = time.perf_counter()
        res = fn(*args, **kwargs)
        return res, (time.perf_counter() - t0) * 1000.0

    def authenticate_admin(self) -> bool:
        admin = User.objects.filter(is_superuser=True, is_active=True).first()
        if not admin:
            self.record("AUTH", "Superuser Lookup", False, "No active superuser in DB", 0.0)
            return False
        token, _ = Token.objects.get_or_create(user=admin)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}", HTTP_HOST="localhost")
        return True

    def crud_cycle(self, label: str, url: str, create_data: dict, patch_data: dict, check_key: str, query: str = ""):
        obj_id = None
        try:
            res, ms = self.call(self.client.post, url, create_data, format="json", HTTP_HOST="localhost")
            ok = res.status_code in (200, 201) and isinstance(getattr(res, "data", None), dict)
            obj_id = res.data.get("id") if ok else None
            self.record(
                "CRUD-CREATE",
                f"{label} (POST)",
                bool(obj_id),
                f"HTTP {res.status_code} ID={obj_id}",
                ms,
                "" if obj_id else self._err_text(res),
            )
            if not obj_id:
                return

            detail = f"{url}{obj_id}/"
            res_l, ms_l = self.call(self.client.get, f"{url}{query}", HTTP_HOST="localhost")
            raw_l = getattr(res_l, "data", {})
            items = raw_l.get("results", raw_l) if isinstance(raw_l, dict) else raw_l
            ok_l = res_l.status_code == 200 and isinstance(items, list)
            self.record(
                "CRUD-READ",
                f"{label} List (GET)",
                ok_l,
                f"HTTP {res_l.status_code} Count={len(items) if ok_l else 0}",
                ms_l,
                "" if ok_l else self._err_text(res_l),
            )

            res_d, ms_d = self.call(self.client.get, detail, HTTP_HOST="localhost")
            self.record(
                "CRUD-READ",
                f"{label} Detail (GET)",
                res_d.status_code == 200,
                f"HTTP {res_d.status_code}",
                ms_d,
                "" if res_d.status_code == 200 else self._err_text(res_d),
            )

            res_u, ms_u = self.call(self.client.patch, detail, patch_data, format="json", HTTP_HOST="localhost")
            got_val = res_u.data.get(check_key) if isinstance(getattr(res_u, "data", None), dict) else None
            ok_u = res_u.status_code == 200 and str(got_val) == str(patch_data[check_key])
            self.record(
                "CRUD-UPDATE",
                f"{label} (PATCH)",
                ok_u,
                f"HTTP {res_u.status_code} {check_key}={got_val}",
                ms_u,
                "" if ok_u else self._err_text(res_u),
            )

            res_x, ms_x = self.call(self.client.delete, detail, HTTP_HOST="localhost")
            ok_x = res_x.status_code in (200, 204)
            self.record(
                "CRUD-DELETE",
                f"{label} (DELETE)",
                ok_x,
                f"HTTP {res_x.status_code}",
                ms_x,
                "" if ok_x else self._err_text(res_x),
            )
            if ok_x:
                obj_id = None
        finally:
            if obj_id:
                self.client.delete(f"{url}{obj_id}/", HTTP_HOST="localhost")

    def run_all(self):
        for cat, label, path in [
            ("HEALTH", "Database Health (/api/v1/health/db/)", "/api/v1/health/db/"),
            ("AUTH", "Current User (/api/v1/accounts/me/)", "/api/v1/accounts/me/"),
            ("DASHBOARD", "Dashboard (/api/v1/reports/dashboard/)", "/api/v1/reports/dashboard/"),
            ("SETTINGS", "School Settings (/api/v1/school/settings/)", "/api/v1/school/settings/"),
            ("AUDIT", "Audit Logs (/api/v1/accounts/audit-logs/)", "/api/v1/accounts/audit-logs/"),
            ("TEACHERS", "Teacher Dropdown (/api/v1/accounts/teachers/dropdown/)", "/api/v1/accounts/teachers/dropdown/?include_all=true"),
            ("CLASSES", "Class Lists (/api/v1/attendance/classes/)", "/api/v1/attendance/classes/"),
            ("CAMPUS", "Campus Overview (/api/v1/campus/overview/)", "/api/v1/campus/overview/"),
        ]:
            res, ms = self.call(self.client.get, path, HTTP_HOST="localhost")
            self.record(cat, label, res.status_code == 200, f"HTTP {res.status_code}", ms, "" if res.status_code == 200 else self._err_text(res))

        sy = SchoolYear.objects.filter(is_active=True).first() or SchoolYear.objects.first()
        temp_sy = None
        if not sy:
            temp_sy = SchoolYear.objects.create(
                name=f"SY-{self.tag}",
                start_date=date(2026, 6, 1),
                baseline_cutoff_date=date(2026, 6, 5),
                end_date=date(2027, 3, 31),
                is_active=True,
            )
            sy = temp_sy

        dept, _ = Department.objects.get_or_create(code=f"DP-{self.tag}", defaults={"name": f"Dept {self.tag}"})
        pos, _ = PositionTitle.objects.get_or_create(title=f"Teacher {self.tag}")
        bldg, _ = Building.objects.get_or_create(name=f"Bldg-{self.tag}")
        grade = GradeLevel.objects.create(level_number=95, code=f"GR-{self.tag}", name=f"Grade {self.tag}", stage="JHS")
        room = Room.objects.create(name=f"Rm-{self.tag}", building=bldg, capacity=45, room_type="LECTURE")
        subj = Subject.objects.create(code=f"SB-{self.tag}", title=f"Subject {self.tag}", grade_level=grade, units=3)
        teacher_user = User.objects.create_user(
            username=f"tch_{self.tag.lower()}",
            password=f"Pass!{self.tag}99",
            first_name="Test",
            last_name=f"Teacher-{self.tag}",
        )
        UserProfile.objects.update_or_create(user=teacher_user, defaults={"role": "TEACHER"})
        teacher = TeacherProfile.objects.create(
            user=teacher_user,
            employee_id=f"EMP-{self.tag}",
            department=dept,
            position=pos,
            can_handle_classes=True,
        )
        section = Section.objects.create(
            school_year=sy, grade_level=grade, adviser=teacher, room_name=room.name, name=f"Sec-{self.tag}", capacity=45
        )
        period = ClassPeriod.objects.create(
            section=section,
            subject=subj,
            teacher=teacher,
            day_of_week="ALL_WEEKDAYS",
            start_time="07:30:00",
            end_time="08:30:00",
            is_active=True,
        )
        lrn = f"98{int(time.time()) % 10000000000:010d}"
        student = Student.objects.create(
            lrn=lrn,
            first_name="Learner",
            last_name=f"Flow-{self.tag}",
            gender="Male",
            birth_date=date(2012, 5, 10),
            guardian_contact="09198887766",
            is_active=True,
        )
        enrollment = Enrollment.objects.create(student=student, section=section, status="ENROLLED")

        try:
            self.crud_cycle("Rooms", "/api/v1/school/rooms/", {"name": f"Lab-{self.tag}", "building": "Sci", "capacity": 40, "room_type": "LAB"}, {"capacity": 50}, "capacity")
            self.crud_cycle("Grade Levels", "/api/v1/school/grade-levels/", {"code": f"GL-{self.tag}", "name": f"Level {self.tag}", "stage": "SHS", "level_number": 96}, {"name": f"Lv-{self.tag}"}, "name")
            self.crud_cycle("Subjects", "/api/v1/school/subjects/", {"code": f"MT-{self.tag}", "title": "Math", "units": 4}, {"units": 5}, "units")
            self.crud_cycle("Sections", "/api/v1/school/sections/", {"name": f"S-{self.tag}", "grade_level": grade.id, "school_year": sy.id, "adviser": teacher.id, "capacity": 40}, {"capacity": 45}, "capacity")
            self.crud_cycle("Class Periods", "/api/v1/school/periods/", {"section": section.id, "subject": subj.id, "teacher": teacher.id, "start_time": "09:00:00", "end_time": "10:00:00"}, {"start_time": "09:15:00"}, "start_time")
            self.crud_cycle("Teachers", "/api/v1/accounts/teachers/", {"employee_id": f"TC-{self.tag}", "first_name": "Ana", "last_name": "Cruz", "department": "Math", "can_handle_classes": True}, {"department": "Science"}, "department")

            st_lrn = f"97{int(time.time()) % 10000000000:010d}"
            self.crud_cycle("Students", "/api/v1/students/", {"lrn": st_lrn, "first_name": "Maria", "last_name": "Clara", "gender": "Female", "birth_date": "2013-04-12", "guardian_contact": "09171112222", "section_id": section.id}, {"barangay": "Macasandig"}, "barangay", query=f"?search={st_lrn}")

            now = timezone.now()
            self.crud_cycle(
                "Exit Passes",
                "/api/v1/attendance/exit-passes/",
                {
                    "pass_scope": "TEACHER",
                    "teacher": teacher.id,
                    "reason": f"Seminar {self.tag}",
                    "destination": "Division Office",
                    "valid_until": (now + timedelta(hours=2)).isoformat(),
                },
                {"reason": f"Updated {self.tag}"},
                "reason",
            )

            signed_qr = sign_student_qr(student.lrn, student.qr_token)
            res_sc, ms_sc = self.call(self.client.post, "/api/v1/attendance/scan/", {"qr_text": signed_qr, "period_id": period.id}, format="json", HTTP_HOST="localhost")
            self.record("QR-SCAN", "Signed HMAC QR Scan (POST)", res_sc.status_code == 201, f"HTTP {res_sc.status_code}", ms_sc, "" if res_sc.status_code == 201 else self._err_text(res_sc))

            res_dp, ms_dp = self.call(self.client.post, "/api/v1/attendance/scan/", {"qr_text": signed_qr, "period_id": period.id}, format="json", HTTP_HOST="localhost")
            ok_dp = res_dp.status_code == 200 and res_dp.data.get("is_duplicate") is True
            self.record("QR-SCAN", "Duplicate Scan Shield (POST)", ok_dp, f"HTTP {res_dp.status_code}", ms_dp, "" if ok_dp else self._err_text(res_dp))

            today = timezone.localdate()
            month_name = today.strftime("%B")
            for rep_name, rep_url in [
                ("Adviser Cutting Matrix", f"/api/v1/attendance/adviser-matrix/?section_id={section.id}"),
                ("Campus GPS Boundary", "/api/v1/campus/boundary/"),
                ("DepEd SF1 Report", f"/api/v1/reports/sf1/{section.id}/"),
                ("DepEd SF2 Report", f"/api/v1/reports/sf2/{section.id}/?month={month_name}&year={today.year}"),
                ("DepEd SF4 Report", f"/api/v1/reports/sf4/?month={month_name}&year={today.year}"),
                ("Monthly DTR Report", f"/api/v1/reports/dtr/?month={today.month}&year={today.year}"),
            ]:
                r_rep, ms_rep = self.call(self.client.get, rep_url, HTTP_HOST="localhost")
                self.record("REPORTS", rep_name, r_rep.status_code == 200, f"HTTP {r_rep.status_code}", ms_rep, "" if r_rep.status_code == 200 else self._err_text(r_rep))
        finally:
            ExitPass.objects.filter(teacher=teacher).delete()
            ExitPass.objects.filter(enrollment=enrollment).delete()
            ClassAttendance.objects.filter(enrollment=enrollment).delete()
            DailyAttendance.objects.filter(enrollment=enrollment).delete()
            Enrollment.objects.filter(id=enrollment.id).delete()
            Student.objects.filter(id=student.id).delete()
            ClassPeriod.objects.filter(section=section).delete()
            Section.objects.filter(id=section.id).delete()
            Subject.objects.filter(id=subj.id).delete()
            TeacherProfile.objects.filter(id=teacher.id).delete()
            teacher_user.delete()
            Room.objects.filter(id=room.id).delete()
            Building.objects.filter(id=bldg.id).delete()
            GradeLevel.objects.filter(id=grade.id).delete()
            Department.objects.filter(id=dept.id).delete()
            PositionTitle.objects.filter(id=pos.id).delete()
            if temp_sy:
                temp_sy.delete()


def main() -> int:
    logger = DualLogger(RESULT_FILE)
    sys.stdout = sys.stderr = logger
    suite = ApiSuiteVerifier()
    code = 0
    try:
        print(f"AttendSure - Full 3NF API Verification ({datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')})")
        print("=" * 90)
        if suite.authenticate_admin():
            suite.run_all()
        else:
            code = 1
    except Exception:
        code = 1
        suite.errors.append(traceback.format_exc())
        print(traceback.format_exc())
    finally:
        passed = sum(1 for r in suite.results if r["passed"])
        total = len(suite.results)
        if passed < total:
            code = 1
        ERROR_FILE.write_text(
            "ZERO ERRORS\n" if not suite.errors else "\n".join(suite.errors),
            encoding="utf-8",
        )
        print("=" * 90)
        print(f"SUMMARY: {passed}/{total} Passed | {total - passed} Failed")
        print(f"Saved: {RESULT_FILE}")
        sys.stdout = sys.stderr = logger.term
        logger.close()
    return code


if __name__ == "__main__":
    sys.exit(main())
