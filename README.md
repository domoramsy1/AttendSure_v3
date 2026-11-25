# AttendSure v3 — Pure-Software DepEd Attendance, Campus Safety & SARDO Early-Warning System

> **Every Teacher On Duty. Every Student Accounted For. Pure Software — Zero Extra Devices Required.**  
> Built for Philippine public and private schools using everyday teacher laptops, PC webcams, and mobile phones — paired with official DepEd **SF1**, **SF2**, **SF4**, and **CSC Form 48 (DTR)** workflows.

---

## Why AttendSure Exists

Many schools still track student attendance and teacher time records using paper logbooks and manual spreadsheets. Paper records make it hard to spot students who arrive in the morning and skip later class periods, delay early support for students at risk of dropping out (**SARDO**), and take hours of manual encoding at the end of every month.

**AttendSure replaces paper logbooks with a pure-software school platform** that runs on devices teachers already own:

| Everyday School Need | Paper Logbooks & Manual Sheets | AttendSure v3 |
|---|---|---|
| **Extra Equipment Cost** | High printing & manual clerical cost | **\$0 extra devices** (runs on existing teacher laptops, webcams, and phones) |
| **Period-by-Period Student Check** | Hard to compare across subjects | **Built-in camera QR scanning** (`jsqr` webcam & `expo-camera` phone back camera) with signed student QR IDs |
| **Offline Reliability** | Lost or late sheets during outages | **Local offline queue** on web and mobile that syncs automatically when internet returns |
| **Teacher Duty Verification** | Handwritten logbooks open to proxy entries | **On-device face/fingerprint/PIN check** + **1-to-1 phone binding** + **campus GPS boundary** |
| **Teacher Loafing & Student Cutting Alerts** | Discovered days or weeks later | **Automatic weekday-aware alerts** for teacher loafing outside campus, students cutting class, and expired exit passes |
| **Official DepEd Reports** | Hours of manual monthly counting | **Print-ready DepEd SF1, SF2, SF4 & CSC Form 48 (DTR)** with submission and approval |
| **Emergency Evacuation Check** | Slow paper headcounts | **1-Click Emergency Roll-Call** of every student and teacher verified on campus today |

---

## Core Features Built Into the Repository

1. **Built-In Camera Student Attendance (`QR` + Manual Class List)**
   - Teachers scan HMAC-SHA256 signed student QR ID cards (`ATTENDSURE:...`) using their laptop/PC webcam (`jsqr` in the web portal) or phone back camera (`expo-camera` in the mobile app).
   - Every scan checks the teacher's assigned classes, prevents forged or unsigned QR badges, and saves to a local offline queue (`localStorage` on web, `AsyncStorage` on mobile) whenever school Wi-Fi drops, syncing cleanly through `POST /api/v1/attendance/offline-sync/`.
   - Homeroom advisers monitor period-by-period attendance in the **Adviser Matrix**, filtered strictly to class periods scheduled on that weekday (`ALL_WEEKDAYS`, `MWF`, `TTH`, or single days `1`–`7`).

2. **Teacher Campus GPS Check-In & Adaptive Duty Tracking**
   - Inside the AttendSure mobile app on their own phone, teachers verify their identity using their phone's built-in **face unlock, fingerprint sensor, or screen-lock PIN/pattern** (`expo-local-authentication` + `expo-secure-store`) before clocking in or out.
   - **Zero raw face photos or biometric templates** are ever sent to or stored on the server — only a public SHA-256 key ID (`biometric_key_id`) and a 1-to-1 phone ID (`bound_device_id`) are stored.
   - Server-side Haversine boundary checks reject mock GPS, impossible coordinates, and weak GPS readings (> 250 m accuracy). While clocked in during duty hours, the app sends adaptive **45-second campus GPS pings** and automatically opens or resolves outside-campus alerts unless an approved **Official Locator Slip / Exit Pass** is active.

3. **5-Role Staff Access Control (Synchronized Across Backend, Web & Mobile)**
   - **`ADMIN`** (System Administrator): Full school setup, user account management, teacher directory CRUD, device lock reset, campus boundary editing, and audit logs.
   - **`PRINCIPAL`** (School Principal): Full school visibility, student management, campus boundary editing, device lock reset, loafing resolution, SF4, and audit logs (view-only on Academic Setup and Teacher Directory).
   - **`DEPT_HEAD`** (Department Head): Department oversight, classroom QR scanning, DTR approval, exit pass / locator slip approval, loafing resolution, and SF4.
   - **Teaching `TEACHER` (`can_handle_classes=True`)**: Assigned classroom QR scanning, class lists, adviser matrix, student exit passes, SF1/SF2 for assigned classes, personal campus GPS check-in, and personal DTR. Homeroom advisers can also add/edit students in their own advised section.
   - **Non-Teaching `TEACHER` (`can_handle_classes=False`)**: Focused view for non-teaching school staff (Dashboard, personal Campus GPS Check-In / Geofence, personal Official Locator Slips / Exit Passes, and personal DTR), with student class lists and classroom QR tools hidden.

4. **Official DepEd Forms, SARDO Early-Warning & Campus Safety**
   - Print-ready **DepEd SF1** (School Register), **SF2** (Daily Attendance Report of Learners), **SF4** (Monthly Learner Movement and Attendance), and **CSC Form 48 (Daily Time Record / DTR)** with teacher submission and Department Head approval.
   - **DepEd Division Data Export** (`JSON` / `CSV`) with optional personal ID masking.
   - **30-Day SARDO Risk Tracker** identifying `CRITICAL_SARDO` and `EARLY_WARNING` students from recent absences, cutting-class alerts, and late arrivals.
   - **1-Click Emergency Roll-Call** (`/api/v1/campus/roll-call/`) listing every student and teacher verified on campus today with live assembly-point safe checkboxes.
   - **Language Support (`EN` / `FIL`)** and **3 Color Modes** (`Light`, `Dark`, `High-Contrast`) across the web portal.

---

## Strict 3NF Database Structure

AttendSure stores school records in **6 focused Django apps** with zero duplicated columns and database-level integrity constraints:

- **`accounts`**: `UserProfile` (role + 5-strike login lockout), `Department`, `PositionTitle`, `TeacherProfile` (name, email, and active flag stay strictly in `auth.User`; stores 1-to-1 `bound_device_id` and public SHA-256 `biometric_key_id`), and `AuditLog`.
- **`school`**: `SchoolYear`, `AdministrativeDivision`, `SchoolSettings`, `SchoolHoliday`, `Building`, `Room`, `GradeLevel`, `Subject`, `Section`, and `ClassPeriod` (with shared weekday helpers `expand_schedule_days` and `period_runs_on_weekday`).
- **`students`**: `AddressLocation` (normalized `barangay`, `municipality_city`, `province`), `Student` (personal info + plain-text guardian details for SF1; never duplicates section or grade level), and `Enrollment` (links `Student` + `Section`, deriving school year and grade level from `Section`).
- **`attendance`**: `DailyAttendance` (unique per `Enrollment` + `attendance_date`), `ClassAttendance` (unique per `Enrollment` + `ClassPeriod` + `attendance_date`, plus `client_scan_uuid` for duplicate-safe offline sync), and `ExitPass` (enforces the `ck_exitpass_xor_bearer` database check constraint so every pass belongs to either a `STUDENT` enrollment or a `TEACHER`, never both, and computes `pass_status` dynamically).
- **`campus`**: `CampusBoundary`, `TeacherDailyAttendance`, `TeacherLocationPing` (stores raw GPS coordinates and computes `distance_meters` and `is_inside` dynamically), `LoafingIncident` (derives display names and distances from joined tables), and `MonthlyTimeRecord` (CSC Form 48 submission and approval workflow).
- **`reports`**: Read-optimized selectors and print/export engines for Dashboard, SF1, SF2, SF4, DTR, SARDO risk, campus impact summary, and Division Data Export.
- **`common/`**: Shared helpers for role permissions (`permissions.py`), HMAC QR signing (`qr_signer.py`), Haversine GPS checks (`gps.py`), audit trails (`audit.py`), image validation (`media.py`), phone formatting (`phone.py`), security headers (`security.py`), and request logging (`request_logger.py`).

---

## Repository Structure

```text
AttendSure_V3/
├── backend/                     # Django 6 + DRF + SimpleJWT + Celery + Redis + PostgreSQL/SQLite
│   ├── apps/
│   │   ├── accounts/            # Staff roles, TeacherProfile, 5-strike lockout, AuditLog, tests
│   │   ├── school/              # School settings, sections, schedules, weekday rules, demo seeder
│   │   ├── students/            # Student directory, AddressLocation, Enrollment, signed QR IDs
│   │   ├── attendance/          # Signed QR scan, offline sync, adviser matrix, cutting detector, exit passes
│   │   ├── campus/              # Campus boundary, Haversine GPS pings, teacher check-in, loafing, roll-call
│   │   └── reports/             # SF1, SF2, SF4, CSC Form 48 (DTR), 30-Day SARDO Risk, Division Export
│   ├── common/                  # Permissions, HMAC QR signer, GPS math, audit helpers, image & phone checks
│   ├── config/                  # settings.py, urls.py, legacy_urls.py, wsgi.py, asgi.py, celery.py
│   ├── Dockerfile               # Non-root Python 3.12 production container
│   └── gunicorn.conf.py         # Gunicorn worker configuration
├── web/                         # React 19 + TypeScript + Vite 8 web portal
│   └── src/
│       ├── components/dashboard/# Live Dashboard + SARDO Risk & 1-Click Emergency Roll-Call panel
│       ├── components/scanner/  # Built-in webcam QR scanner (jsqr) with offline local queue
│       ├── components/tabs/     # Students, Teachers, Schedules, Geofence, Exit Passes, SF1/SF2/SF4/DTR, Users, Settings
│       ├── components/showcase/ # School portal overview & environment-gated role preview launcher
│       ├── context/             # ThemeContext (Light/Dark/High-Contrast), ComplianceContext (EN/FIL), AlertContext, SchoolContext
│       └── utils/permissions.ts # 5-profile Web access control matrix
├── mobile/                      # Expo (SDK 58) + React Native 0.88 staff companion app
│   ├── AGENTS.md                # Mobile architecture, navigation, theme tokens, and security guide
│   └── src/
│       ├── navigation/          # AppNavigator (@react-navigation/native-stack) + 5-tab MainTabNavigator
│       ├── screens/             # Dashboard, Scanner/Check-In, Geofence, Passes, Account, Matrix, Reports, DTR, Calendar, Settings
│       ├── services/            # biometricService, deviceService, telemetryService, backgroundLocation, offlineQueue
│       ├── theme/tokens.ts      # Centralized palette & font tokens (re-exported by constants/theme.ts)
│       └── utils/permissions.ts # 5-profile Mobile access control matrix
├── deploy/                      # Nginx config + Blue-Green zero-downtime switch scripts (switch.sh / switch.ps1)
├── docs/
│   ├── ARCHITECTURE_AND_SECURITY.md # System topology, 3NF schema, RBAC, anti-spoofing & RA 10173 privacy
│   └── COMPETITION_PITCH_PACK.md    # 10-slide presentation guide, live walkthrough script & Q&A prep
├── scripts/
│   ├── audit_codebase.py        # 8-gate automated codebase, RBAC, UI token, vocabulary & schedule auditor
│   └── database/                # Database check, index optimization, and seeding utilities
└── docker-compose.yml           # PostgreSQL 16 + Redis 7 + Blue/Green Gunicorn + Nginx + Celery
```

---

## Quickstart (Local Development)

### 1. Backend Setup & Demo Data

```bash
cd backend
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# macOS / Linux:
# source venv/bin/activate

pip install -r requirements.txt
python manage.py migrate
python manage.py seed_competition_demo
python manage.py runserver 0.0.0.0:8000
```

> **Seeded Staff Preview Accounts** (password: `AttendSure2026!`):  
> `demo_admin` (System Administrator) · `demo_principal` (School Principal) · `demo_dept_head` (Department Head) · `demo_teacher` (Teacher / Class Adviser)  
> One-click role preview buttons on the landing page work only when `DEBUG=True` or `ENABLE_JUDGE_DEMO=True`, and return `HTTP 404` when disabled in production.

### 2. Web Portal

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### 3. Mobile App (Expo)

```bash
cd mobile
npm install
npx expo start
```

### 4. Production Deployment (Blue-Green Zero-Downtime Docker)

```bash
cp backend/.env.example backend/.env   # Set SECRET_KEY, DB_PASSWORD, REDIS_PASSWORD, DEBUG=False
docker compose up -d --build
docker compose exec web_blue python manage.py migrate --noinput
docker compose exec web_blue python manage.py collectstatic --noinput

# Subsequent zero-downtime updates:
# Windows:     .\deploy\switch.ps1
# Linux/macOS: ./deploy/switch.sh
```

---

## Verification & Automated Audit

Run the backend test suite and the 8-gate repository auditor:

```bash
# 1. Run all Django unit and integration tests
cd backend
python manage.py check
python manage.py test --verbosity=2

# 2. Run the 8-gate master codebase auditor (migrations, routes, 184 RBAC checks, dialogs, colors, vocabulary, schedules)
cd ..
python scripts/audit_codebase.py
```

---

## Documentation

- **[Architecture, 3NF Schema & Security Guide](docs/ARCHITECTURE_AND_SECURITY.md)** — System diagram, 3NF tables, 5-role access matrix, signed QR verification, on-device phone lock & campus GPS controls, and RA 10173 privacy safeguards.
- **[School & Competition Presentation Pack](docs/COMPETITION_PITCH_PACK.md)** — 10-slide presentation outline, 3-minute live walkthrough script, sustainability model, and reviewer Q&A guide.
- **[Mobile App Developer Guide](mobile/AGENTS.md)** — React Navigation stack and 5-tab layout, theme token rules, offline queue design, and mobile security checks.
