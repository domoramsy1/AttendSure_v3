"""
AttendSure - Automated Term Replacer
Replaces 'roster' and 'turnstile' with simple English terms across backend, web, and mobile.
"""

import os
import re

# File-specific replacement rules
REPLACEMENTS = {
    os.path.normpath("backend/apps/api/views/classroom.py"): [
        ("class FacultyClassroomRosterAPIView(APIView):", "class FacultyClassroomListAPIView(APIView):"),
        ("FacultyClassroomRosterAPIView = FacultyClassroomListAPIView", ""),  # clean duplicate if exists
        ("StudentListAPIView = FacultyClassroomRosterAPIView", 
         "StudentListAPIView = FacultyClassroomListAPIView\nFacultyClassroomRosterAPIView = FacultyClassroomListAPIView"),
        ("Endpoint: GET /api/classroom/roster/", "Endpoint: GET /api/classroom/student_list/"),
    ],
    os.path.normpath("backend/apps/api/urls.py"): [
        ("FacultyClassroomRosterAPIView,", "FacultyClassroomListAPIView, FacultyClassroomRosterAPIView,"),
        ("path('classroom/student_list/', FacultyClassroomRosterAPIView.as_view()", 
         "path('classroom/student_list/', FacultyClassroomListAPIView.as_view()"),
        ("path('classroom/student-list/', FacultyClassroomRosterAPIView.as_view()", 
         "path('classroom/student-list/', FacultyClassroomListAPIView.as_view()"),
    ],
    os.path.normpath("backend/apps/api/views/__init__.py"): [
        ("from .classroom import FacultyClassroomRosterAPIView", 
         "from .classroom import FacultyClassroomListAPIView, FacultyClassroomRosterAPIView"),
        ("'FacultyClassroomRosterAPIView',", "'FacultyClassroomListAPIView', 'FacultyClassroomRosterAPIView',"),
    ],
    os.path.normpath("backend/apps/api/views/geofence.py"): [
        ("dashboard telemetry & real faculty roster", "dashboard telemetry & real faculty list"),
        ("faculty_roster = []", "faculty_list = []"),
        ("faculty_roster.append({", "faculty_list.append({"),
        ("'faculty_roster': faculty_roster,", "'faculty_list': faculty_list,\n            'faculty_roster': faculty_list,"),
    ],
    os.path.normpath("mobile/src/types/index.ts"): [
        ("// 2. TURNSTILE GATE LOGS", "// 2. SCHOOL GATE LOGS"),
    ],
    os.path.normpath("mobile/src/components/reports/SF1ReportView.tsx"): [
        ("activeRosterList", "activeStudentList"),
        ("isRosterEmpty", "isListEmpty"),
    ],
    os.path.normpath("mobile/src/components/reports/SF2ReportView.tsx"): [
        ("isRosterEmpty", "isListEmpty"),
    ],
    os.path.normpath("mobile/src/screens/HomeScreen.tsx"): [
        ("interface StudentRosterItem", "interface StudentItem"),
        ("StudentRosterItem", "StudentItem"),
        ("interface SectionRoster", "interface SectionItem"),
        ("SectionRoster", "SectionItem"),
        ("// GATE TURNSTILE STATUS", "// SCHOOL GATE STATUS"),
        ("rosterRes", "classListRes"),
        ("rosterData", "classData"),
    ],
    os.path.normpath("mobile/src/screens/ScannerScreen.tsx"): [
        ("interface StudentRosterItem", "interface StudentItem"),
        ("StudentRosterItem", "StudentItem"),
        ("interface SectionRoster", "interface SectionClass"),
        ("SectionRoster", "SectionClass"),
        ("// Faculty Roster Data", "// Faculty Student List"),
        ("rosterLoading", "listLoading"),
        ("showRosterDrawer", "showStudentListModal"),
        ("fetchFacultyRoster", "fetchFacultyStudentList"),
        ("Roster Sync Notice", "Class List Notice"),
        ("Synchronizing assigned teaching rosters...", "Synchronizing assigned teaching class lists..."),
        ("Class Student Roster Modal", "Class Student List Modal"),
        ("rosterDrawerBtnText", "studentListBtnText"),
        ("rosterDrawerBtn", "studentListBtn"),
        ("rosterModalHeader", "studentListModalHeader"),
        ("rosterModalTitle", "studentListModalTitle"),
        ("rosterModalSub", "studentListModalSub"),
        ("studentRosterRow", "studentListRow"),
        ("rosterAvatarBox", "studentAvatarBox"),
        ("rosterAvatarImg", "studentAvatarImg"),
    ],
    os.path.normpath("web/src/components/layout/Sidebar.tsx"): [
        ("groupTitle: 'ACADEMICS & ROSTER',", "groupTitle: 'ACADEMICS & CLASS LIST',"),
    ],
    os.path.normpath("web/src/components/tabs/GeofenceTab.tsx"): [
        ("export interface FacultyRosterItem", 
         "export interface FacultyListItem"),
        ("faculty_roster: FacultyRosterItem[];", 
         "faculty_list: FacultyListItem[];\n  faculty_roster?: FacultyListItem[];"),
        ("const getStatusBadge = (s: FacultyRosterItem)", 
         "export type FacultyRosterItem = FacultyListItem;\nconst getStatusBadge = (s: FacultyListItem)"),
        ("turnstile gate cross-referencing", "school gate cross-referencing"),
        ("Turnstile", "Gate"),
        ("geoData?.faculty_roster?.length", "(geoData?.faculty_list?.length || geoData?.faculty_roster?.length)"),
        ("geoData.faculty_roster.map", "(geoData?.faculty_list || geoData?.faculty_roster || []).map"),
        ("geoData?.faculty_roster && geoData.faculty_roster.length > 0", 
         "(geoData?.faculty_list || geoData?.faculty_roster || []).length > 0"),
    ],
    os.path.normpath("web/src/components/tabs/MyAssignedClassesTab.tsx"): [
        ("interface StudentRosterItem", "interface StudentItem"),
        ("students: StudentRosterItem[];", "students: StudentItem[];\ntype StudentRosterItem = StudentItem;"),
    ],
    os.path.normpath("web/src/components/tabs/SF1ReportTab.tsx"): [
        ("activeRosterList", "activeStudentList"),
        ("isRosterEmpty", "isListEmpty"),
    ],
    os.path.normpath("web/src/components/tabs/SF2ReportTab.tsx"): [
        ("isRosterEmpty", "isListEmpty"),
    ],
}


def run_replacements():
    total_files_modified = 0
    total_replacements = 0

    for relative_path, rules in REPLACEMENTS.items():
        if not os.path.exists(relative_path):
            print(f"[SKIP] File not found: {relative_path}")
            continue

        try:
            with open(relative_path, "r", encoding="utf-8") as f:
                content = f.read()

            original_content = content
            file_replacement_count = 0

            for target, replacement in rules:
                if target in content:
                    content = content.replace(target, replacement)
                    file_replacement_count += 1

            if content != original_content:
                with open(relative_path, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"[OK] {relative_path} ({file_replacement_count} replacements)")
                total_files_modified += 1
                total_replacements += file_replacement_count
            else:
                print(f"[NO CHANGE] {relative_path} (Already updated)")

        except Exception as e:
            print(f"[ERROR] Failed updating {relative_path}: {e}")

    print("-" * 60)
    print(f"Complete! Updated {total_files_modified} files with {total_replacements} replacements.")


if __name__ == "__main__":
    run_replacements()