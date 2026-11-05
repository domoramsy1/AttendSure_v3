import os
import sys
import random
import uuid
import secrets
from datetime import date, time, datetime

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'attendsure_core.settings')
import django
django.setup()

from django.db import connection, transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.apps import apps

User = get_user_model()

def get_model(app_label, model_name):
    try:
        return apps.get_model(app_label, model_name)
    except LookupError:
        for m in apps.get_models():
            if m.__name__.lower() == model_name.lower():
                return m
        return None

def get_concrete_fields(model):
    if not model:
        return set()
    return {f.name for f in model._meta.concrete_fields}

AcademicYear = get_model('academics', 'AcademicYear')
GradeLevel = get_model('academics', 'GradeLevel')
Section = get_model('academics', 'Section')
Subject = get_model('academics', 'Subject')
Schedule = get_model('academics', 'Schedule')
Student = get_model('academics', 'Student')
Enrollment = get_model('academics', 'Enrollment')
StaffProfile = get_model('academics', 'StaffProfile') or get_model('academics', 'FacultyProfile')

AttendanceModel = get_model('academics', 'DailyAttendanceSummary') or get_model('academics', 'AttendanceRecord') or get_model('academics', 'Attendance')

# ============================================================================
# FILIPINO DEMOGRAPHIC DATA POOLS (CAGAYAN DE ORO & NORTHERN MINDANAO)
# ============================================================================
BOYS_FIRST_NAMES = [
    "Juan Miguel", "Christian Paul", "Mark Joshua", "Angelo Gabriel", "Daniel Joseph",
    "John Lloyd", "Carl Jerome", "Axel Sean", "Marco Antonio", "Clyde Anthony",
    "Russell Vance", "Dominic Matthew", "Jerome Francis", "Nathaniel Lance", "Rafael Luis",
    "Kian Andrei", "Gian Carlo", "Elijah Vince", "Justin Kyle", "Kenneth Renz",
    "Paolo Miguel", "Lance Gabriel", "Francis John", "Kurt Russell", "Matthew Sean",
    "Dave Patrick", "Adrian Keith", "Jeric James", "Alden Ross", "Sean Michael",
    "Joshua Miguel", "Gabriel Luis", "Adrian Kyle", "Carl Vincent", "Angelo Dominic",
    "Justin Carl", "Ethan James", "Matthew Alexander", "Tristan Paul", "Nathaniel James",
    "Lance Christian", "Kenneth Mark", "Jayson Lee", "Ralph Lauren", "Sean Andrei",
    "Francis Lloyd", "Kevin Ray", "Bryan Dale", "Patrick John", "Miguel Antonio",
    "Carlo James", "Kurt Daniel", "Anton Miguel", "Dave Allen", "Aaron Paul",
    "Neil Brian", "Ian Joshua", "Jerome Dave", "Raymond Kyle", "Vince Arthur"
]

GIRLS_FIRST_NAMES = [
    "Maria Cristina", "Lyka Marie", "Tracy Anne", "Hazel Jane", "Charisse Faith",
    "Dianne Nicole", "Bea Bianca", "Samantha Joy", "Alyssa Ashley", "Patricia Ann",
    "Chloe Denise", "Kathryn Mae", "Jasmine Rose", "Hannah Sofia", "Andrea Nicole",
    "Camille Rose", "Princess Sarah", "Kyla Marie", "Erika Jane", "Rhea Mae",
    "Gillian Joyce", "Althea Grace", "Franchesca Louise", "Pauline Kate", "Abigail Faith",
    "Kimberly Ann", "Janine Marie", "Stephanie Joy", "Clarisse May", "Angelica Rose",
    "Christine Joy", "Angel Mae", "Althea Mae", "Samantha Nicole", "Princess Diane",
    "Chloe Isabel", "Hannah Sophia", "Sofia Grace", "Mary Joy", "Faith Kimberly",
    "Stephanie Anne", "Angelica Faith", "Camille Joy", "Alyssa Marie", "Ella Mae",
    "Danica Rose", "Janine Nicole", "Patricia Mae", "Clarisse Joy", "Rochelle Ann",
    "Marian Joyce", "Gillian Marie", "Nicole Angela", "Denise Faye", "Ashley Jane",
    "Pauline Rose", "Erika Joy", "Chelsy Marie", "Kate Andrea", "Joy Beatrice"
]

SURNAMES = [
    "Dela Cruz", "Santos", "Reyes", "Bautista", "Garcia", "Mendoza", "Torres", "Fernandez",
    "Lopez", "Gonzales", "Villanueva", "Castillo", "Ramos", "Rivera", "Espiritu", "Navarro",
    "Salvador", "Mercado", "Valdez", "Aquino", "Morales", "Pascual", "Manalo", "Soriano",
    "Del Rosario", "Aguilar", "Alcantara", "Dimayuga", "Macalintal", "Punzalan", "Carandang",
    "Gutierrez", "Lontoc", "Eduave", "Ladman", "Macaraeg", "Dimaculangan", "Calingasan",
    "Sumalinog", "Balistoy", "Magallanes", "Cagas", "Villamor", "Salcedo", "Padilla",
    "Batungbacal", "Catagutan", "Ocampo", "Flores", "Perez", "Roxas", "Dizon", "Domo"
]

MIDDLE_NAMES = [
    "Bautista", "Ramos", "Santos", "Dizon", "Alcantara", "Salvador", "Roxas", "Navarro",
    "Villanueva", "Mercado", "Aquino", "Pascual", "Morales", "Soriano", "Aguilar", "Torres",
    "Abuhan", "Garcia", "Mendoza", "Castillo", "Lopez", "Rivera", "Tolentino", "Manalo"
]

BARANGAYS = [
    "Lapasan", "Nazareth", "Macasandig", "Carmen", "Kauswagan",
    "Balulang", "Bulua", "Patag", "Gusa", "Cugman", "Camaman-an", "Puntod", "Lumbia"
]

RELIGIONS = [
    "Roman Catholic", "Islam", "Seventh-day Adventist",
    "Iglesia ni Cristo", "Bible Baptist", "Evangelical Christian"
]

MOTHER_TONGUES = ["Cebuano", "Bisaya", "Tagalog", "Maranao", "Hiligaynon", "Waray"]
ETHNIC_GROUPS = ["None", "Cebuano", "Higaonon", "Maranao", "Boholano", "Tagalog"]

STREET_TEMPLATES = [
    "Block 2, Lot 14, Villa Ernesto", "Zone 1, Sitio Riverside, Purok 8",
    "Zone 4, Sitio San Juan, Purok 3", "Block 5, Lot 18, Phase 2",
    "Zone 2, Hilltop, Purok 5", "Block 3, Lot 10, Greenview Subd.",
    "Zone 6, Lower Riverside, Purok 2", "Block 7, Lot 12, Sunrise Village",
    "Zone 3, Sitio Sto. Nino, Purok 4", "Block 4, Lot 16, Golden Glow"
]

FACULTY_CANDIDATES = [
    ("Jerel", "Eduave"), ("Maria", "Santos"), ("Juan", "Dela Cruz"),
    ("Grace", "Fernandez"), ("Rolando", "Garcia"), ("Elena", "Torres"),
    ("Mark", "Bautista"), ("Christine", "Reyes"), ("Roberto", "Gutierrez"),
    ("Luzviminda", "Ladman"), ("Arthur", "Lim"), ("Carmelita", "Ramos"),
    ("Danilo", "Gomez"), ("Evelyn", "Tan"), ("Fernando", "Castillo"),
    ("Gloria", "Mercado"), ("Hector", "Flores"), ("Irene", "Dizon"),
    ("Joel", "Valenzuela"), ("Kristine", "Alcantara"), ("Leonardo", "Villanueva"),
    ("Miriam", "Navarro"), ("Nestor", "Aquino"), ("Olivia", "Morales"),
    ("Patricio", "Soriano"), ("Quirino", "Del Rosario"), ("Rowena", "Aguilar"),
    ("Salvador", "Dimayuga"), ("Teresa", "Macalintal"), ("Ulysses", "Punzalan"),
    ("Vicente", "Carandang"), ("Wilma", "Gutierrez"), ("Xavier", "Lontoc"),
    ("Yolanda", "Ladman"), ("Zenaida", "Macaraeg"), ("Benigno", "Aquino"),
    ("Corazon", "Sumalinog"), ("Estrella", "Alvarez"), ("Fidel", "Ramos")
]

def generate_unique_lrn(existing_lrns):
    while True:
        candidate = f"128936{random.randint(100000, 999999)}"
        if candidate not in existing_lrns:
            existing_lrns.add(candidate)
            return candidate

def get_or_create_faculty_user(first, last, TargetAdviserModel):
    username = f"{first.lower().replace(' ', '')}.{last.lower().replace(' ', '')}"
    email = f"{username}@school.edu.ph"

    user, _ = User.objects.get_or_create(
        username=username,
        defaults={'email': email, 'first_name': first, 'last_name': last, 'is_staff': True}
    )
    if not user.password:
        user.set_password('Teacher@123')
        user.save()

    if TargetAdviserModel and TargetAdviserModel != User:
        model_fields = get_concrete_fields(TargetAdviserModel)
        lookup = {'user': user} if 'user' in model_fields else {'id': user.id}
        defaults = {
            'first_name': first,
            'last_name': last,
            'department': 'Junior High School',
            'employee_id': f"EMP-{random.randint(1000, 9999)}"
        }
        filtered_defaults = {k: v for k, v in defaults.items() if k in model_fields}
        faculty_obj, _ = TargetAdviserModel.objects.get_or_create(**lookup, defaults=filtered_defaults)
        return faculty_obj

    return user


def run_seed():
    print("==========================================================")
    print("  ATTENDSURE V3: SEEDING 40 STUDENTS PER SECTION (ALL LEVELS)")
    print("==========================================================")

    admin_user = User.objects.filter(is_superuser=True).first() or User.objects.first()
    admin_id = admin_user.id if admin_user else 1

    # 1. ACADEMIC YEAR (2026-2027)
    ay_valid = get_concrete_fields(AcademicYear)
    ay_defaults = {}
    if 'start_date' in ay_valid: ay_defaults['start_date'] = date(2026, 6, 1)
    if 'end_date' in ay_valid: ay_defaults['end_date'] = date(2027, 3, 31)
    if 'is_active' in ay_valid: ay_defaults['is_active'] = True
    if 'first_friday_june' in ay_valid: ay_defaults['first_friday_june'] = date(2026, 6, 5)

    ay, _ = AcademicYear.objects.get_or_create(code='2026-2027', defaults=ay_defaults)
    if 'is_active' in ay_valid:
        ay.is_active = True
        ay.save()
    print(f"[OK] Academic Year Active: {ay.code}")

    # 2. GRADE LEVELS (7 to 12)
    gl_valid = get_concrete_fields(GradeLevel)
    grade_levels_spec = [
        ("Grade 7", "G7", 7, "JHS"),
        ("Grade 8", "G8", 8, "JHS"),
        ("Grade 9", "G9", 9, "JHS"),
        ("Grade 10", "G10", 10, "JHS"),
        ("Grade 11 - STEM", "G11-STEM", 11, "SHS"),
        ("Grade 11 - ABM", "G11-ABM", 11, "SHS"),
        ("Grade 11 - HUMSS", "G11-HUMSS", 11, "SHS"),
        ("Grade 12 - STEM", "G12-STEM", 12, "SHS"),
        ("Grade 12 - ABM", "G12-ABM", 12, "SHS"),
        ("Grade 12 - HUMSS", "G12-HUMSS", 12, "SHS"),
    ]

    grade_level_map = {}
    for g_name, g_code, g_order, g_stage in grade_levels_spec:
        fields = {}
        if 'name' in gl_valid: fields['name'] = g_name
        if 'code' in gl_valid: fields['code'] = g_code
        if 'level_order' in gl_valid: fields['level_order'] = g_order
        if 'stage' in gl_valid: fields['stage'] = g_stage
        gl, _ = GradeLevel.objects.update_or_create(name=g_name, defaults=fields)
        grade_level_map[g_name] = gl
    print(f"[OK] Verified {len(grade_level_map)} Grade Levels")

    # 3. SECTIONS SPECIFICATION
    sections_spec = {
        "Grade 7": ["Diamond", "Emerald", "Ruby", "Sapphire", "Pearl", "Jade", "Topaz", "Amethyst", "Opal", "Garnet"],
        "Grade 8": ["Einstein", "Newton", "Galileo", "Curie"],
        "Grade 9": ["Rizal", "Bonifacio", "Mabini", "Luna"],
        "Grade 10": ["Platinum", "Titanium", "Gold", "Silver"],
        "Grade 11 - STEM": ["STEM"],
        "Grade 11 - ABM": ["ABM"],
        "Grade 11 - HUMSS": ["HUMSS"],
        "Grade 12 - STEM": ["STEM"],
        "Grade 12 - ABM": ["ABM"],
        "Grade 12 - HUMSS": ["HUMSS"],
    }

    birth_year_map = {
        "Grade 7": 2013,
        "Grade 8": 2012,
        "Grade 9": 2011,
        "Grade 10": 2010,
        "Grade 11 - STEM": 2009,
        "Grade 11 - ABM": 2009,
        "Grade 11 - HUMSS": 2009,
        "Grade 12 - STEM": 2008,
        "Grade 12 - ABM": 2008,
        "Grade 12 - HUMSS": 2008,
    }

    sec_valid = get_concrete_fields(Section)
    st_concrete = get_concrete_fields(Student)
    enr_concrete = get_concrete_fields(Enrollment)

    TargetAdviserModel = None
    if 'adviser' in sec_valid:
        TargetAdviserModel = Section._meta.get_field('adviser').remote_field.model

    existing_lrns = set(Student.objects.values_list('lrn', flat=True))
    base_enrollment_date = date(2026, 6, 5)
    base_enrollment_dt = timezone.make_aware(datetime(2026, 6, 5, 8, 0, 0))

    assigned_faculties = set()
    for s in Section.objects.all():
        if getattr(s, 'adviser', None):
            assigned_faculties.add(s.adviser_id)

    faculty_idx = 0
    total_added_students = 0
    all_seeded_sections = []

    with transaction.atomic():
        for gl_name, sec_names in sections_spec.items():
            gl_obj = grade_level_map[gl_name]
            b_year = birth_year_map[gl_name]

            for s_name in sec_names:
                # 1. Resolve or create Section
                sec = Section.objects.filter(name=s_name, grade_level=gl_obj).first()
                if not sec:
                    sec = Section.objects.filter(name=s_name).first()

                if not sec:
                    sec_defaults = {}
                    if 'grade_level' in sec_valid: sec_defaults['grade_level'] = gl_obj
                    if 'academic_year' in sec_valid: sec_defaults['academic_year'] = ay
                    if 'capacity' in sec_valid: sec_defaults['capacity'] = 50
                    if 'room_number' in sec_valid: sec_defaults['room_number'] = f"Rm-{random.randint(101, 305)}"
                    sec = Section.objects.create(name=s_name, **sec_defaults)
                else:
                    if 'grade_level' in sec_valid and sec.grade_level != gl_obj:
                        sec.grade_level = gl_obj
                    if 'academic_year' in sec_valid and sec.academic_year != ay:
                        sec.academic_year = ay
                    sec.save()

                # 2. Assign Dedicated Faculty (1 faculty per section)
                # Keep Grade 7 existing advisers; assign new unique faculty for empty sections
                if not getattr(sec, 'adviser', None):
                    while faculty_idx < len(FACULTY_CANDIDATES):
                        f_first, f_last = FACULTY_CANDIDATES[faculty_idx]
                        faculty_idx += 1
                        fac_obj = get_or_create_faculty_user(f_first, f_last, TargetAdviserModel)
                        fac_id = getattr(fac_obj, 'id', None)
                        if fac_id not in assigned_faculties:
                            assigned_faculties.add(fac_id)
                            sec.adviser = fac_obj
                            sec.save()
                            break

                all_seeded_sections.append(sec)

                # 3. Calculate Students Needed to Reach Exactly 40
                current_enrolled = Enrollment.objects.filter(section=sec, academic_year=ay).count()
                needed_students = max(0, 40 - current_enrolled)

                if needed_students == 0:
                    print(f"  [OK] Section {gl_name} - {s_name}: Already has 40 students.")
                    continue

                print(f"  [+] Section {gl_name} - {s_name}: Enrolling {needed_students} new students (Current: {current_enrolled})...")

                num_boys = needed_students // 2
                num_girls = needed_students - num_boys

                for idx in range(needed_students):
                    is_male = (idx < num_boys)

                    if is_male:
                        first = random.choice(BOYS_FIRST_NAMES)
                        sex = 'M'
                        suf = random.choice(["", "", "", "Jr.", "III"])
                    else:
                        first = random.choice(GIRLS_FIRST_NAMES)
                        sex = 'F'
                        suf = ""

                    last = random.choice(SURNAMES)
                    mid = random.choice(MIDDLE_NAMES)
                    bgy = random.choice(BARANGAYS)
                    street = random.choice(STREET_TEMPLATES)

                    b_month = random.randint(1, 12)
                    b_day = random.randint(1, 28)
                    bdate = date(b_year, b_month, b_day)

                    unique_lrn = generate_unique_lrn(existing_lrns)
                    unique_rfid = secrets.token_hex(4).upper()
                    unique_token = secrets.token_urlsafe(32)

                    father_name = f"Edgardo {last} {suf}".strip() if is_male else f"Roberto {last}"
                    mother_maiden = f"Elena {mid} Ramos"

                    if random.random() > 0.5:
                        guardian_name = father_name
                        guardian_rel = "Father"
                    else:
                        guardian_name = mother_maiden
                        guardian_rel = "Mother"

                    st_dict = {
                        'lrn': unique_lrn,
                        'first_name': first,
                        'middle_name': mid,
                        'last_name': last,
                        'suffix': suf,
                        'sex': sex,
                        'birthdate': bdate,
                        'date_of_birth': bdate,
                        'birth_place': 'Misamis Oriental',
                        'place_of_birth': 'Misamis Oriental',
                        'mother_tongue': random.choice(MOTHER_TONGUES),
                        'ethnic_group': random.choice(ETHNIC_GROUPS),
                        'ip_community': random.choice(ETHNIC_GROUPS),
                        'religion': random.choice(RELIGIONS),
                        'house_street_sitio': street,
                        'house_street': street,
                        'address': street,
                        'barangay': bgy,
                        'municipality_city': 'Cagayan de Oro City',
                        'city': 'Cagayan de Oro City',
                        'municipality': 'Cagayan de Oro City',
                        'province': 'Misamis Oriental',
                        'father_name': father_name,
                        'father': father_name,
                        'mother_maiden_name': mother_maiden,
                        'mother': mother_maiden,
                        'guardian_name': guardian_name,
                        'guardian': guardian_name,
                        'guardian_relationship': guardian_rel,
                        'relationship': guardian_rel,
                        'parent_contact': f"09{random.randint(150000000, 999999999)}",
                        'photo': f"students/photos/std_{unique_lrn}.jpg",
                        'qr_token': unique_token,
                        'is_active': True,
                        'rfid_uid': unique_rfid,
                        'photo_thumbnail': f"students/thumbnails/std_{unique_lrn}_thumb.jpg",
                        'photo_updated_at': base_enrollment_dt,
                        'created_at': base_enrollment_dt,
                        'updated_at': base_enrollment_dt,
                        'created_by_id': admin_id,
                        'updated_by_id': admin_id,
                        'remarks': 'Regular Learner',
                    }

                    filtered_fields = {k: v for k, v in st_dict.items() if k in st_concrete}
                    st_obj = Student.objects.create(**filtered_fields)

                    # Ensure created_at on student is June 5, 2026 to bypass auto_now_add
                    Student.objects.filter(id=st_obj.id).update(created_at=base_enrollment_dt, updated_at=base_enrollment_dt)

                    enr_dict = {
                        'student': st_obj,
                        'section': sec,
                        'academic_year': ay,
                        'status': 'ENROLLED',
                        'is_active': True,
                        'enrollment_date': base_enrollment_date,
                        'date_enrolled': base_enrollment_date,
                        'created_at': base_enrollment_dt,
                        'updated_at': base_enrollment_dt,
                    }
                    filtered_enr = {k: v for k, v in enr_dict.items() if k in enr_concrete}
                    enr_obj = Enrollment.objects.create(**filtered_enr)

                    # Ensure created_at on enrollment is June 5, 2026 so it passes all SF1 cut-offs
                    Enrollment.objects.filter(id=enr_obj.id).update(created_at=base_enrollment_dt, updated_at=base_enrollment_dt)

                    total_added_students += 1

    print(f"\n[OK] Enrolled {total_added_students} new students! All sections now have 40 students.")

    # 4. SEED ATTENDANCE RECORDS FOR OCTOBER 2026
# 4. SEED ATTENDANCE RECORDS FOR OCTOBER 2026
    if AttendanceModel:
        att_concrete = get_concrete_fields(AttendanceModel)
        october_school_days = [
            date(2026, 10, 1), date(2026, 10, 2), date(2026, 10, 5),
            date(2026, 10, 6), date(2026, 10, 7)
        ]
        date_col = 'attendance_date' if 'attendance_date' in att_concrete else 'date'

        print("[...] Generating October 2026 attendance summaries...")
        total_att = 0
        with transaction.atomic():
            for sec in all_seeded_sections:
                # Query Enrollment directly to bypass reverse foreign key naming conflicts
                sec_enrs = Enrollment.objects.filter(section=sec, academic_year=ay).select_related('student')
                sec_students = [e.student for e in sec_enrs if e.student]

                for s_day in october_school_days:
                    for st in sec_students:
                        status_val = 'PRESENT' if random.random() > 0.06 else 'LATE'
                        att_fields = {
                            'student': st,
                            date_col: s_day,
                        }
                        defaults = {}
                        if 'section' in att_concrete: defaults['section'] = sec
                        if 'academic_year' in att_concrete: defaults['academic_year'] = ay
                        if 'status' in att_concrete: defaults['status'] = status_val
                        if 'time_in' in att_concrete: defaults['time_in'] = time(7, 15) if status_val == 'PRESENT' else time(7, 45)

                        AttendanceModel.objects.update_or_create(**att_fields, defaults=defaults)
                        total_att += 1
        print(f"[OK] Seeded {total_att} October attendance records.")

        
    # 5. SAFE SEQUENCE SYNC (Outside transaction block)
    print("[...] Synchronizing PostgreSQL primary key sequences...")
    for model in [Student, Enrollment, Section, GradeLevel, AcademicYear]:
        if model:
            tbl_name = model._meta.db_table
            with connection.cursor() as cursor:
                try:
                    cursor.execute(f"SELECT setval(pg_get_serial_sequence('{tbl_name}', 'id'), COALESCE(MAX(id), 1)) FROM \"{tbl_name}\";")
                except Exception:
                    pass

    print("==========================================================")
    print("  SUCCESS! ALL YEAR LEVELS NOW HAVE EXACTLY 40 STUDENTS!  ")
    print("==========================================================")


if __name__ == '__main__':
    run_seed()