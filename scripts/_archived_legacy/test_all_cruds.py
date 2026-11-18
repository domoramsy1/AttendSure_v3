r"""
AttendSure - Complete Backend CRUD & Functional API Verification Suite
File: D:\AttendSure_V3\scripts\test_all_cruds.py

Automatically saves all test output, HTTP error responses, and exception
tracebacks into D:\AttendSure_V3\scripts\results\.
"""

import os
import sys
import time
import traceback
import uuid
from datetime import date, datetime, timedelta

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPTS_DIR, ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")
RESULTS_DIR = os.path.join(SCRIPTS_DIR, "results")

os.makedirs(RESULTS_DIR, exist_ok=True)
RESULT_FILE = os.path.join(RESULTS_DIR, "test_all_cruds_result.txt")
ERROR_FILE = os.path.join(RESULTS_DIR, "test_all_cruds_errors.txt")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendsure_core.settings")


class DualOutputLogger:
    """Mirrors all stdout and stderr output simultaneously to the terminal and results file."""

    def __init__(self, file_path: str):
        self.terminal = sys.stdout
        self.log = open(file_path, "w", encoding="utf-8")

    def write(self, message: str):
        self.terminal.write(message)
        self.log.write(message)
        self.log.flush()

    def flush(self):
        self.terminal.flush()
        self.log.flush()

    def close(self):
        self.log.close()


import django

django.setup()

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.academics.models import (
    AcademicYear,
    AppNotification,
    DailyAttendanceSummary,
    Enrollment,
    FacultyProfile,
    GradeLevel,
    Room,
    Schedule,
    SchoolProfile,
    Section,
    Student,
    Subject,
    SubjectAttendanceLog,
    UserProfile,
)

User = get_user_model()


class BackendVerifier:
    def __init__(self):
        self.results = []
        self.errors = []
        self.client = APIClient()
        self.admin_user = None
        self.tag = uuid.uuid4().hex[:6].upper()

    def _format_response_error(self, res) -> str:
        try:
            data = getattr(res, "data", None)
            if data is not None:
                return str(data)[:350]
            content = getattr(res, "content", b"")
            if content:
                return content.decode("utf-8", errors="replace")[:350]
        except Exception:
            pass
        return ""

    def record(self, category: str, name: str, passed: bool, detail: str, elapsed_ms: float, error_body: str = ""):
        entry = {
            "category": category,
            "name": name,
            "passed": passed,
            "detail": detail,
            "ms": round(elapsed_ms, 1),
            "error_body": error_body,
        }
        self.results.append(entry)
        status_label = "PASS" if passed else "FAIL"
        print(f"[{status_label}] {category:<14} | {name:<34} | {round(elapsed_ms, 1):>6} ms | {detail}")
        if not passed:
            err_msg = f"[{category}] {name} -> {detail}"
            if error_body:
                err_msg += f"\n    Response: {error_body}"
            self.errors.append(err_msg)
            if error_body:
                print(f"       ERROR DETAIL: {error_body}")

    def timed_call(self, fn, *args, **kwargs):
        t0 = time.perf_counter()
        res = fn(*args, **kwargs)
        ms = (time.perf_counter() - t0) * 1000.0
        return res, ms

    def setup_auth(self) -> bool:
        self.admin_user = (
            User.objects.filter(is_superuser=True, is_active=True).first()
            or User.objects.filter(is_staff=True, is_active=True).first()
        )
        if not self.admin_user:
            msg = "No active admin account found in database. Run 'python manage.py createsuperuser' first."
            self.errors.append(msg)
            print(f"[FAIL] AUTH           | Admin Account Lookup               |    0.0 ms | {msg}")
            return False

        token, _ = Token.objects.get_or_create(user=self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}", HTTP_HOST="testserver")
        return True

    def run_crud_cycle(self, label: str, endpoint: str, create_payload: dict, update_payload: dict, verify_field: str, list_query: str = ""):
        created_id = None
        try:
            # 1. CREATE (POST)
            res, ms = self.timed_call(self.client.post, endpoint, create_payload, format="json", HTTP_HOST="testserver")
            ok_create = res.status_code in (200, 201)
            res_data = getattr(res, "data", {})
            if ok_create and isinstance(res_data, dict):
                created_id = res_data.get("id")
            err_body = "" if (ok_create and created_id) else self._format_response_error(res)
            self.record("CRUD-CREATE", f"{label} (POST)", ok_create and bool(created_id), f"HTTP {res.status_code} | ID={created_id}", ms, err_body)
            if not created_id:
                return

            detail_url = f"{endpoint}{created_id}/"

            # 2. READ LIST (GET)
            res_list, ms_list = self.timed_call(self.client.get, f"{endpoint}{list_query}", HTTP_HOST="testserver")
            list_data = getattr(res_list, "data", {})
            items = list_data.get("results", list_data) if isinstance(list_data, dict) else list_data
            found_in_list = isinstance(items, list) and any(item.get("id") == created_id for item in items if isinstance(item, dict))
            ok_list = res_list.status_code == 200 and found_in_list
            err_list = "" if ok_list else self._format_response_error(res_list)
            self.record("CRUD-READ", f"{label} List (GET)", ok_list, f"HTTP {res_list.status_code} | Count={len(items) if isinstance(items, list) else 0}", ms_list, err_list)

            # 3. READ DETAIL (GET /:id/)
            res_detail, ms_detail = self.timed_call(self.client.get, detail_url, HTTP_HOST="testserver")
            ok_detail = res_detail.status_code == 200
            err_detail = "" if ok_detail else self._format_response_error(res_detail)
            self.record("CRUD-READ", f"{label} Detail (GET)", ok_detail, f"HTTP {res_detail.status_code}", ms_detail, err_detail)

            # 4. UPDATE (PATCH)
            res_upd, ms_upd = self.timed_call(self.client.patch, detail_url, update_payload, format="json", HTTP_HOST="testserver")
            upd_data = getattr(res_upd, "data", {})
            updated_val = upd_data.get(verify_field) if isinstance(upd_data, dict) else None
            expected_val = update_payload.get(verify_field)
            ok_upd = res_upd.status_code == 200 and str(updated_val) == str(expected_val)
            err_upd = "" if ok_upd else self._format_response_error(res_upd)
            self.record("CRUD-UPDATE", f"{label} (PATCH)", ok_upd, f"HTTP {res_upd.status_code} | {verify_field}={updated_val}", ms_upd, err_upd)

            # 5. DELETE (DELETE)
            res_del, ms_del = self.timed_call(self.client.delete, detail_url, HTTP_HOST="testserver")
            ok_del = res_del.status_code in (200, 204)
            err_del = "" if ok_del else self._format_response_error(res_del)
            self.record("CRUD-DELETE", f"{label} (DELETE)", ok_del, f"HTTP {res_del.status_code}", ms_del, err_del)
            if ok_del:
                created_id = None
        finally:
            if created_id:
                self.client.delete(f"{endpoint}{created_id}/", HTTP_HOST="testserver")

    def test_system_and_auth(self):
        res_db, ms_db = self.timed_call(self.client.get, "/api/health/db/", HTTP_HOST="testserver")
        db_data = getattr(res_db, "data", {})
        ok_db = res_db.status_code == 200 and isinstance(db_data, dict) and (db_data.get("database") == "CONNECTED" or db_data.get("status") == "CONNECTED")
        self.record("HEALTH", "Database Connection", ok_db, f"HTTP {res_db.status_code}", ms_db, "" if ok_db else self._format_response_error(res_db))

        res_me, ms_me = self.timed_call(self.client.get, "/api/auth/me/", HTTP_HOST="testserver")
        me_data = getattr(res_me, "data", {})
        ok_me = res_me.status_code == 200 and isinstance(me_data, dict)
        username_val = me_data.get("username", "") if ok_me else ""
        self.record("AUTH", "Current User Profile (GET)", ok_me, f"User={username_val}", ms_me, "" if ok_me else self._format_response_error(res_me))

        res_dash, ms_dash = self.timed_call(self.client.get, "/api/dashboard/overview/", HTTP_HOST="testserver")
        dash_data = getattr(res_dash, "data", {})
        ok_dash = res_dash.status_code == 200 and isinstance(dash_data, dict)
        total_students = dash_data.get("total_students", 0) if ok_dash else 0
        self.record("DASHBOARD", "Dashboard Overview (GET)", ok_dash, f"Students={total_students}", ms_dash, "" if ok_dash else self._format_response_error(res_dash))

        res_school, ms_school = self.timed_call(self.client.get, "/api/settings/school/", HTTP_HOST="testserver")
        school_data = getattr(res_school, "data", {})
        ok_school = res_school.status_code == 200 and isinstance(school_data, dict)
        school_name = school_data.get("school_name", "") if ok_school else ""
        self.record("SETTINGS", "School Metadata (GET)", ok_school, f"School={school_name}", ms_school, "" if ok_school else self._format_response_error(res_school))

        res_logs, ms_logs = self.timed_call(self.client.get, "/api/user-activity-logs/", HTTP_HOST="testserver")
        logs_data = getattr(res_logs, "data", {})
        ok_logs = res_logs.status_code == 200 and isinstance(logs_data, dict)
        total_logs = logs_data.get("total", 0) if ok_logs else 0
        self.record("SECURITY", "Audit Activity Logs (GET)", ok_logs, f"Logs={total_logs}", ms_logs, "" if ok_logs else self._format_response_error(res_logs))

    def test_all_crud_endpoints(self):
        ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        temp_ay = None
        if not ay:
            temp_ay = AcademicYear.objects.create(
                code=f"AY-{self.tag}",
                start_date=date(2026, 6, 1),
                first_friday_june=date(2026, 6, 5),
                end_date=date(2027, 3, 31),
                is_active=True,
            )
            ay = temp_ay

        temp_grade = GradeLevel.objects.create(code=f"GR-{self.tag}", name=f"Grade Level {self.tag}", stage="JHS", level_order=99)
        temp_room = Room.objects.create(name=f"Room-{self.tag}", building="Main", capacity=45, room_type="LECTURE")
        temp_subject = Subject.objects.create(code=f"SUB-{self.tag}", title=f"Subject {self.tag}", grade_level=temp_grade, units=3)
        temp_faculty = FacultyProfile.objects.create(
            employee_id=f"EMP-{self.tag}",
            first_name="Faculty",
            last_name=f"Record-{self.tag}",
            position="Faculty I",
            department="Science",
            can_teach=True,
            is_active=True,
        )
        temp_section = Section.objects.create(
            academic_year=ay,
            grade_level=temp_grade,
            adviser=temp_faculty,
            room=temp_room,
            name=f"Section-{self.tag}",
            capacity=45,
        )

        try:
            self.run_crud_cycle(
                "Rooms",
                "/api/rooms/",
                {"name": f"Lab-{self.tag}", "building": "Science Wing", "capacity": 40, "room_type": "LAB"},
                {"capacity": 50},
                "capacity",
            )
            self.run_crud_cycle(
                "Grade Levels",
                "/api/grade-levels/",
                {"code": f"GL-{self.tag}", "name": f"Level {self.tag}", "stage": "SHS", "level_order": 98},
                {"name": f"Level-{self.tag}-Updated"},
                "name",
            )
            self.run_crud_cycle(
                "Subjects",
                "/api/subjects/",
                {"code": f"MATH-{self.tag}", "title": f"Mathematics {self.tag}", "tier": "Core", "subject_type": "Core", "units": 4},
                {"units": 5},
                "units",
            )
            self.run_crud_cycle(
                "Sections",
                "/api/sections/",
                {
                    "name": f"Sec-CRUD-{self.tag}",
                    "grade_level_id": temp_grade.id,
                    "academic_year": ay.id,
                    "adviser_id": temp_faculty.id,
                    "room_id": temp_room.id,
                    "capacity": 42,
                },
                {"capacity": 48},
                "capacity",
            )
            self.run_crud_cycle(
                "Schedules",
                "/api/schedules/",
                {
                    "section": temp_section.id,
                    "subject": temp_subject.id,
                    "faculty": temp_faculty.id,
                    "room": temp_room.id,
                    "start_time": "08:00:00",
                    "end_time": "09:00:00",
                },
                {"start_time": "08:30:00"},
                "start_time",
            )

            lrn_val = f"99{int(time.time()) % 10000000000:010d}"
            self.run_crud_cycle(
                "Students",
                "/api/students/",
                {
                    "lrn": lrn_val,
                    "first_name": "Learner",
                    "last_name": f"Record-{self.tag}",
                    "sex": "Female",
                    "birthdate": "2012-05-15",
                    "parent_contact": "09171234567",
                    "section_id": temp_section.id,
                },
                {"barangay": "Lumbia"},
                "barangay",
                list_query=f"?search={lrn_val}",
            )
            self.run_crud_cycle(
                "Faculty Profiles",
                "/api/faculty/",
                {
                    "employee_id": f"FAC-{self.tag}",
                    "first_name": "Adviser",
                    "last_name": f"Member-{self.tag}",
                    "position": "Faculty II",
                    "department": "Mathematics",
                    "can_teach": True,
                },
                {"department": "English"},
                "department",
            )
            self.run_crud_cycle(
                "User Accounts",
                "/api/users/",
                {
                    "username": f"parent_{self.tag.lower()}",
                    "password": f"SecurePass!{self.tag}99",
                    "first_name": "Parent",
                    "last_name": f"Account-{self.tag}",
                    "email": f"parent_{self.tag.lower()}@attendsureph.com",
                    "role": "PARENT",
                    "phone_number": "09181234567",
                },
                {"first_name": "Guardian"},
                "first_name",
            )

            now = timezone.now()
            self.run_crud_cycle(
                "Exit Passes",
                "/api/gate-passes/",
                {
                    "faculty": temp_faculty.id,
                    "pass_type": "OFFICIAL_BUSINESS",
                    "reason": f"Official Seminar {self.tag}",
                    "valid_from": now.isoformat(),
                    "valid_to": (now + timedelta(hours=3)).isoformat(),
                },
                {"reason": f"Updated Seminar {self.tag}"},
                "reason",
            )
            self.run_crud_cycle(
                "App Notifications",
                "/api/notifications/",
                {
                    "title": f"Attendance Notice {self.tag}",
                    "message": "Learner arrived in first period class.",
                    "category": "ATTENDANCE",
                    "is_read": False,
                },
                {"is_read": True},
                "is_read",
            )
        finally:
            Schedule.objects.filter(section=temp_section).delete()
            Section.objects.filter(id=temp_section.id).delete()
            Subject.objects.filter(id=temp_subject.id).delete()
            FacultyProfile.objects.filter(id=temp_faculty.id).delete()
            Room.objects.filter(id=temp_room.id).delete()
            GradeLevel.objects.filter(id=temp_grade.id).delete()
            if temp_ay:
                AcademicYear.objects.filter(id=temp_ay.id).delete()

    def test_qr_attendance_parent_gps_and_reports(self):
        ay = AcademicYear.objects.filter(is_active=True).first() or AcademicYear.objects.first()
        temp_ay = None
        if not ay:
            temp_ay = AcademicYear.objects.create(
                code=f"AY-FLOW-{self.tag}",
                start_date=date(2026, 6, 1),
                first_friday_june=date(2026, 6, 5),
                end_date=date(2027, 3, 31),
                is_active=True,
            )
            ay = temp_ay

        grade = GradeLevel.objects.create(code=f"GF-{self.tag}", name=f"Grade {self.tag}", stage="JHS", level_order=97)
        faculty = FacultyProfile.objects.create(
            employee_id=f"EMPF-{self.tag}",
            first_name="Adviser",
            last_name=f"Flow-{self.tag}",
            can_teach=True,
            is_active=True,
        )
        section = Section.objects.create(
            academic_year=ay,
            grade_level=grade,
            adviser=faculty,
            name=f"FlowSec-{self.tag}",
            capacity=40,
        )
        subj1 = Subject.objects.create(code=f"S1-{self.tag}", title="Period 1 Subject", grade_level=grade)
        subj2 = Subject.objects.create(code=f"S2-{self.tag}", title="Period 2 Subject", grade_level=grade)

        sched1 = Schedule.objects.create(
            section=section,
            subject=subj1,
            faculty=faculty,
            start_time="07:30:00",
            end_time="08:30:00",
            is_active=True,
        )
        sched2 = Schedule.objects.create(
            section=section,
            subject=subj2,
            faculty=faculty,
            start_time="08:30:00",
            end_time="09:30:00",
            is_active=True,
        )

        parent_user = User.objects.create_user(
            username=f"par_flow_{self.tag.lower()}",
            password=f"ParentPass!{self.tag}1",
            first_name="Parent",
            last_name=f"Flow-{self.tag}",
        )
        UserProfile.objects.update_or_create(
            user=parent_user,
            defaults={"role": "PARENT", "phone_number": "+639191112233", "is_teaching": False},
        )

        lrn_flow = f"88{int(time.time()) % 10000000000:010d}"
        student = Student.objects.create(
            lrn=lrn_flow,
            first_name="Student",
            last_name=f"Flow-{self.tag}",
            sex="Male",
            birthdate=date(2012, 8, 10),
            parent_contact="09191112233",
            is_active=True,
        )
        Enrollment.objects.create(student=student, section=section, academic_year=ay, status="ENROLLED")

        try:
            res_cards, ms_cards = self.timed_call(self.client.get, f"/api/classroom/qr-cards/?section_id={section.id}", HTTP_HOST="testserver")
            cards_data = getattr(res_cards, "data", {})
            cards = cards_data.get("cards", []) if isinstance(cards_data, dict) else []
            ok_cards = res_cards.status_code == 200 and len(cards) == 1
            self.record("QR-ID", "Printable QR ID Cards (GET)", ok_cards, f"HTTP {res_cards.status_code} | Cards={len(cards)}", ms_cards, "" if ok_cards else self._format_response_error(res_cards))

            res_cls, ms_cls = self.timed_call(self.client.get, "/api/classroom/classes/?mode=all", HTTP_HOST="testserver")
            ok_cls = res_cls.status_code == 200
            self.record("CLASSROOM", "Classes & Class List (GET)", ok_cls, f"HTTP {res_cls.status_code}", ms_cls, "" if ok_cls else self._format_response_error(res_cls))

            res_scan, ms_scan = self.timed_call(
                self.client.post,
                "/api/classroom/scan/",
                {"qr_token": student.qr_token, "schedule_id": sched2.id},
                format="json",
                HTTP_HOST="testserver",
            )
            scan_data = getattr(res_scan, "data", {})
            scan_ok = res_scan.status_code == 201 and isinstance(scan_data, dict) and scan_data.get("lrn") == lrn_flow
            self.record("QR-SCAN", "Classroom QR Scan (POST)", scan_ok, f"HTTP {res_scan.status_code} | Status={scan_data.get('status') if isinstance(scan_data, dict) else ''}", ms_scan, "" if scan_ok else self._format_response_error(res_scan))

            res_dup, ms_dup = self.timed_call(
                self.client.post,
                "/api/classroom/scan/",
                {"qr_token": student.qr_token, "schedule_id": sched2.id},
                format="json",
                HTTP_HOST="testserver",
            )
            dup_data = getattr(res_dup, "data", {})
            ok_dup = res_dup.status_code == 200 and isinstance(dup_data, dict) and dup_data.get("is_duplicate") is True
            self.record("QR-SCAN", "Duplicate Scan shield (POST)", ok_dup, f"HTTP {res_dup.status_code}", ms_dup, "" if ok_dup else self._format_response_error(res_dup))

            res_mat, ms_mat = self.timed_call(self.client.get, f"/api/classroom/adviser-matrix/?section_id={section.id}", HTTP_HOST="testserver")
            mat_data = getattr(res_mat, "data", {})
            ok_mat = res_mat.status_code == 200 and isinstance(mat_data, dict) and mat_data.get("total_students") == 1
            self.record("LOAFING", "Adviser Cutting Matrix (GET)", ok_mat, f"HTTP {res_mat.status_code}", ms_mat, "" if ok_mat else self._format_response_error(res_mat))

            parent_client = APIClient()
            parent_token, _ = Token.objects.get_or_create(user=parent_user)
            parent_client.credentials(HTTP_AUTHORIZATION=f"Token {parent_token.key}", HTTP_HOST="testserver")

            res_par, ms_par = self.timed_call(parent_client.get, "/api/parent/portal/", HTTP_HOST="testserver")
            par_data = getattr(res_par, "data", {})
            par_children = par_data.get("children", []) if isinstance(par_data, dict) else []
            par_notifs = par_data.get("notifications", []) if isinstance(par_data, dict) else []
            ok_par = res_par.status_code == 200 and len(par_children) == 1
            self.record("PARENT-APP", "Parent Portal Overview (GET)", ok_par, f"Children={len(par_children)} | Alerts={len(par_notifs)}", ms_par, "" if ok_par else self._format_response_error(res_par))

            res_read, ms_read = self.timed_call(parent_client.post, "/api/parent/notifications/read/", {}, format="json", HTTP_HOST="testserver")
            ok_read = res_read.status_code == 200
            self.record("PARENT-APP", "Mark Alerts Read (POST)", ok_read, f"HTTP {res_read.status_code}", ms_read, "" if ok_read else self._format_response_error(res_read))

            school = SchoolProfile.objects.first()
            test_lat = float(school.latitude) if (school and school.latitude is not None) else 8.4858
            test_lon = float(school.longitude) if (school and school.longitude is not None) else 124.6567

            res_geo, ms_geo = self.timed_call(self.client.get, "/api/geofence/status/", HTTP_HOST="testserver")
            ok_geo = res_geo.status_code == 200
            self.record("GPS-CHECK", "Geofence Status (GET)", ok_geo, f"HTTP {res_geo.status_code} | Center=({test_lat}, {test_lon})", ms_geo, "" if ok_geo else self._format_response_error(res_geo))

            today = timezone.localdate()
            month_name = today.strftime("%B")

            res_sf1, ms_sf1 = self.timed_call(self.client.get, f"/api/reports/sf1/?section_id={section.id}", HTTP_HOST="testserver")
            sf1_data = getattr(res_sf1, "data", {})
            ok_sf1 = res_sf1.status_code == 200 and isinstance(sf1_data, dict) and sf1_data.get("total_combined") == 1
            self.record("REPORTS", "DepEd SF1 Register (GET)", ok_sf1, f"HTTP {res_sf1.status_code}", ms_sf1, "" if ok_sf1 else self._format_response_error(res_sf1))

            res_sf2, ms_sf2 = self.timed_call(self.client.get, f"/api/reports/sf2/?section_id={section.id}&month={month_name}&year={today.year}", HTTP_HOST="testserver")
            ok_sf2 = res_sf2.status_code == 200
            self.record("REPORTS", "DepEd SF2 Attendance (GET)", ok_sf2, f"HTTP {res_sf2.status_code}", ms_sf2, "" if ok_sf2 else self._format_response_error(res_sf2))

            res_sf4, ms_sf4 = self.timed_call(self.client.get, f"/api/reports/sf4/?month={month_name}&year={today.year}", HTTP_HOST="testserver")
            ok_sf4 = res_sf4.status_code == 200
            self.record("REPORTS", "DepEd SF4 Summary (GET)", ok_sf4, f"HTTP {res_sf4.status_code}", ms_sf4, "" if ok_sf4 else self._format_response_error(res_sf4))

            res_dtr, ms_dtr = self.timed_call(self.client.get, f"/api/reports/dtr/?month={today.month}&year={today.year}", HTTP_HOST="testserver")
            ok_dtr = res_dtr.status_code == 200
            self.record("REPORTS", "Faculty Monthly DTR (GET)", ok_dtr, f"HTTP {res_dtr.status_code}", ms_dtr, "" if ok_dtr else self._format_response_error(res_dtr))

        finally:
            AppNotification.objects.filter(recipient=parent_user).delete()
            SubjectAttendanceLog.objects.filter(student=student).delete()
            DailyAttendanceSummary.objects.filter(student=student).delete()
            Enrollment.objects.filter(student=student).delete()
            Student.objects.filter(id=student.id).delete()
            Token.objects.filter(user=parent_user).delete()
            parent_user.delete()
            Schedule.objects.filter(id__in=[sched1.id, sched2.id]).delete()
            Subject.objects.filter(id__in=[subj1.id, subj2.id]).delete()
            Section.objects.filter(id=section.id).delete()
            FacultyProfile.objects.filter(id=faculty.id).delete()
            GradeLevel.objects.filter(id=grade.id).delete()
            if temp_ay:
                AcademicYear.objects.filter(id=temp_ay.id).delete()

    def write_error_summary(self):
        with open(ERROR_FILE, "w", encoding="utf-8") as f:
            f.write(f"AttendSure - Error & Failure Log ({datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')})\n")
            f.write("=" * 88 + "\n")
            if not self.errors:
                f.write("ZERO ERRORS: All backend CRUD and functional checks passed.\n")
            else:
                for idx, err in enumerate(self.errors, start=1):
                    f.write(f"{idx}. {err}\n\n")


def main() -> int:
    tee = DualOutputLogger(RESULT_FILE)
    sys.stdout = tee
    sys.stderr = tee

    print("AttendSure - Backend CRUD & Functional Verification")
    print(f"Run Time: {datetime.now().strftime('%Y-%m-%d %I:%M:%S %p')}")
    print("=" * 88)

    verifier = BackendVerifier()
    exit_code = 0

    try:
        if verifier.setup_auth():
            verifier.test_system_and_auth()
            verifier.test_all_crud_endpoints()
            verifier.test_qr_attendance_parent_gps_and_reports()
        else:
            exit_code = 1
    except Exception:
        exit_code = 1
        tb = traceback.format_exc()
        verifier.errors.append(f"UNHANDLED EXCEPTION:\n{tb}")
        print("\nUNHANDLED EXCEPTION:")
        print(tb)
    finally:
        passed_count = sum(1 for r in verifier.results if r["passed"])
        total_count = len(verifier.results)
        failed_count = total_count - passed_count
        if failed_count > 0:
            exit_code = 1

        verifier.write_error_summary()
        print("=" * 88)
        print(f"SUMMARY: {passed_count}/{total_count} Passed | {failed_count} Failed")
        print(f"Full Results Saved To: {RESULT_FILE}")
        print(f"Errors Log Saved To:   {ERROR_FILE}")

        sys.stdout = tee.terminal
        sys.stderr = tee.terminal
        tee.close()

    return exit_code


if __name__ == "__main__":
    sys.exit(main())