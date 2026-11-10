"""
AttendSure - Automated Term Replacer
Replaces 'class list' and 'kiosk' with simple English terms across backend, web, and mobile.
"""

import os
import re

# File-specific replacement rules
REPLACEMENTS = {
    os.path.normpath("backend/apps/api/views/classroom.py"): [
        ("class FacultyClassroomClassListAPIView(APIView):", "class FacultyClassroomListAPIView(APIView):"),
        ("FacultyClassroomClassListAPIView = FacultyClassroomListAPIView", ""),  # clean duplicate if exists
        ("StudentListAPIView = FacultyClassroomClassListAPIView", 
         "StudentListAPIView = FacultyClassroomListAPIView\nFacultyClassroomClassListAPIView = FacultyClassroomListAPIView"),
        ("Endpoint: GET /api/classroom/class list/", "Endpoint: GET /api/classroom/student_list/"),
    ],
    os.path.normpath("backend/apps/api/urls.py"): [
        ("FacultyClassroomClassListAPIView,", "FacultyClassroomListAPIView, FacultyClassroomClassListAPIView,"),
        ("path('classroom/student_list/', FacultyClassroomClassListAPIView.as_view()", 
         "path('classroom/student_list/', FacultyClassroomListAPIView.as_view()"),
        ("path('classroom/student-list/', FacultyClassroomClassListAPIView.as_view()", 
         "path('classroom/student-list/', FacultyClassroomListAPIView.as_view()"),
    ],
    os.path.normpath("backend/apps/api/views/__init__.py"): [
        ("from .classroom import FacultyClassroomClassListAPIView", 
         "from .classroom import FacultyClassroomListAPIView, FacultyClassroomClassListAPIView"),
        ("'FacultyClassroomClassListAPIView',", "'FacultyClassroomListAPIView', 'FacultyClassroomClassListAPIView',"),
    ],
    os.path.normpath("backend/apps/api/views/geofence.py"): [
        ("dashboard telemetry & real faculty class list", "dashboard telemetry & real faculty list"),
        ("faculty_class_list = []", "faculty_list = []"),
        ("faculty_class_list.append({", "faculty_list.append({"),
        ("'faculty_class_list': faculty_class_list,", "'faculty_list': faculty_list,\n            'faculty_class_list': faculty_list,"),
    ],
    os.path.normpath("mobile/src/types/index.ts"): [
        ("// 2. KIOSK GATE LOGS", "// 2. SCHOOL GATE LOGS"),
    ],
    os.path.normpath("mobile/src/components/reports/SF1ReportView.tsx"): [
        ("activeClassListList", "activeStudentList"),
        ("isClassListEmpty", "isListEmpty"),
    ],
    os.path.normpath("mobile/src/components/reports/SF2ReportView.tsx"): [
        ("isClassListEmpty", "isListEmpty"),
    ],
    os.path.normpath("mobile/src/screens/DashboardScreen.tsx"): [
        ("interface StudentClassListItem", "interface StudentItem"),
        ("StudentClassListItem", "StudentItem"),
        ("interface SectionRoster", "interface SectionItem"),
        ("SectionRoster", "SectionItem"),
        ("// GATE KIOSK STATUS", "// SCHOOL GATE STATUS"),
        ("rosterRes", "classListRes"),
        ("rosterData", "classData"),
    ],
    os.path.normpath("mobile/src/screens/ScannerScreen.tsx"): [
        ("interface StudentClassListItem", "interface StudentItem"),
        ("StudentClassListItem", "StudentItem"),
        ("interface SectionRoster", "interface SectionClass"),
        ("SectionRoster", "SectionClass"),
        ("// Faculty Class List Data", "// Faculty Student List"),
        ("rosterLoading", "listLoading"),
        ("showClassListDrawer", "showStudentListModal"),
        ("fetchFacultyRoster", "fetchFacultyStudentList"),
        ("Class List Sync Notice", "Class List Notice"),
        ("Synchronizing assigned teaching class lists...", "Synchronizing assigned teaching class lists..."),
        ("Class Student Class List Modal", "Class Student List Modal"),
        ("rosterDrawerBtnText", "studentListBtnText"),
        ("rosterDrawerBtn", "studentListBtn"),
        ("rosterModalHeader", "studentListModalHeader"),
        ("rosterModalTitle", "studentListModalTitle"),
        ("rosterModalSub", "studentListModalSub"),
        ("studentClassListRow", "studentListRow"),
        ("rosterAvatarBox", "studentAvatarBox"),
        ("rosterAvatarImg", "studentAvatarImg"),
    ],
    os.path.normpath("web/src/components/layout/Sidebar.tsx"): [
        ("groupTitle: 'ACADEMICS & CLASS LIST',", "groupTitle: 'ACADEMICS & CLASS LIST',"),
    ],
    os.path.normpath("web/src/components/tabs/GeofenceTab.tsx"): [
        ("export interface FacultyClassListItem", 
         "export interface FacultyListItem"),
        ("faculty_class_list: FacultyClassListItem[];", 
         "faculty_list: FacultyListItem[];\n  faculty_class_list?: FacultyListItem[];"),
        ("const getStatusBadge = (s: FacultyClassListItem)", 
         "export type FacultyClassListItem = FacultyListItem;\nconst getStatusBadge = (s: FacultyListItem)"),
        ("kiosk gate cross-referencing", "school gate cross-referencing"),
        ("Kiosk", "Gate"),
        ("geoData?.faculty_class_list?.length", "(geoData?.faculty_list?.length || geoData?.faculty_class_list?.length)"),
        ("geoData.faculty_class_list.map", "(geoData?.faculty_list || geoData?.faculty_class_list || []).map"),
        ("geoData?.faculty_class_list && geoData.faculty_class_list.length > 0", 
         "(geoData?.faculty_list || geoData?.faculty_class_list || []).length > 0"),
    ],
    os.path.normpath("web/src/components/tabs/MyAssignedClassesTab.tsx"): [
        ("interface StudentClassListItem", "interface StudentItem"),
        ("students: StudentClassListItem[];", "students: StudentItem[];\ntype StudentClassListItem = StudentItem;"),
    ],
    os.path.normpath("web/src/components/tabs/SF1ReportTab.tsx"): [
        ("activeClassListList", "activeStudentList"),
        ("isClassListEmpty", "isListEmpty"),
    ],
    os.path.normpath("web/src/components/tabs/SF2ReportTab.tsx"): [
        ("isClassListEmpty", "isListEmpty"),
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