# AttendSure v3.1 — Zero-Hardware Campus Attendance, Safety & Dropout Early-Warning OS

> **Every Student Accounted For. Zero Gate Hardware Required.**  
> Pure-software school attendance, 30-day AI dropout early-warning, emergency campus evacuation roll-call, parent safety alerts, and dual regulatory compliance (**Ed-Fi Data Standard v6.0 + GDPR** alongside **DepEd Philippines SF1 / SF2 / SF4 / CSC Form 48**).

[![Architecture](https://img.shields.io/badge/Architecture-Pure%20Software%20%240%20Hardware-0284c7)]()
[![Interoperability](https://img.shields.io/badge/Standard-Ed--Fi%20v6.0%20%2B%20GDPR%20Art.%2025-10b981)]()
[![UN SDGs](https://img.shields.io/badge/UN%20SDGs-4%20%7C%205%20%7C%208%20%7C%2011%20%7C%2012--13%20%7C%2016-7c3aed)]()
[![Deploy](https://img.shields.io/badge/Deploy-Docker%20Blue--Green%20Zero--Downtime-0f172a)]()

---

## Why AttendSure Exists

Over **85% of public schools globally** cannot afford legacy RFID turnstiles (\$5,500–\$18,000+ upfront CapEx per campus) or recurring SMS parent-notification gateways. As a result, schools rely on paper registers that conceal chronic absenteeism, period-by-period cutting classes, and invisible dropout trajectories until it is too late.

**AttendSure eliminates 100% of gate hardware CapEx** by turning existing teacher laptops, webcams, \$15 USB QR readers, and staff smartphones into an encrypted, offline-capable campus operating system.

| Capability | Legacy RFID Turnstiles | AttendSure v3.1 |
|---|---|---|
| **Upfront Gate Hardware Cost** | \$5,500 – \$18,000+ / school | **\$0** (Pure Software) |
| **Parent Alert Cost** | \$0.02 – \$0.05 / SMS | **\$0** (Mobile Push + Offline Queue) |
| **Classroom / Period Cutting Detection** | Gate-only blind spot | **Per-period HMAC-signed QR scans** |
| **Faculty Presence Verification** | Wall biometric clock (proxy risk) | **Hardware-bound GPS + Mock-GPS detection** |
| **Global Data Interoperability** | Proprietary lock-in | **Ed-Fi v6.0 JSON + GDPR Art. 25 Pseudonymization** |
| **National Statutory Forms** | Manual re-encoding | **Auto-generated DepEd SF1, SF2, SF4 & CSC Form 48** |
| **Emergency Disaster Safety** | Paper binders | **1-Click Live Emergency Campus Roll-Call** |

---

## Core Modules & International Competition Features

1. **UN SDG Impact & Safety Command Center** (`Impact & Safety` tab):
   - Live PostgreSQL metrics for **SDG 4** (Quality Education), **SDG 5 & 10** (Gender Attendance Parity Index & Social Aid/CCT monitoring), **SDG 8** (Teacher hours reclaimed & CapEx avoided), **SDG 12 & 13** (Paper & gate e-waste CO2e reduction), and **SDG 16** (Hardware-verified faculty GPS & tamper-evident audit logs).
   - **30-Day Dropout Early-Warning Engine** scoring absences, period cutting, and morning tardiness into `CRITICAL_SARDO` and `EARLY_WARNING` intervention rosters.
   - **SDG 11 Emergency Evacuation Campus Roll-Call**: Instant live headcount checklist of all students and faculty verified inside the campus today.
2. **Dual Compliance Mode + Multi-Language UI (`EN` / `FIL` / `ES` / `FR`)**:
   - Instant top-bar toggle between **Global Ed-Fi v6.0** terminology/USD metrics and **DepEd Philippines** statutory workflows (`SF1`, `SF2`, `SF4`, `CSC Form 48`).
   - One-click **Ed-Fi Data Standard v6.0 JSON Export** (`/api/v1/reports/edfi-export/?days=30&anonymize=1`) with deterministic SHA-256 GDPR Art. 25 pseudonymization.
3. **1-Click Judge Demo Mode (Environment-Gated)**:
   - Public Product Showcase landing page with instant role launchers (**System Admin**, **School Principal**, **Class Adviser**) backed by real database records.
   - Strictly disabled (`HTTP 404`) in production whenever `DEBUG=False` and `ENABLE_JUDGE_DEMO=False`.
4. **Offline-First Classroom Scanner & Mobile App**:
   - HMAC-SHA256 signed QR cards (`common/qr_signer.py`) prevent forged badges.
   - Automatic client-side offline queue syncs batch scans and telemetry heartbeats upon reconnection.

---

## Repository Structure

```text
AttendSure_V3/
├── backend/                     # Django 6 + DRF + SimpleJWT + Celery + Redis + PostgreSQL
│   ├── apps/
│   │   ├── accounts/            # RBAC, device lock, audit logs, DemoLoginView, tests.py
│   │   ├── school/              # School settings, sections, schedules, seed_competition_demo
│   │   ├── students/            # Student directory, enrollments, signed QR cards, parent portal
│   │   ├── attendance/          # Signed QR scan, offline batch sync, adviser matrix, exit passes
│   │   ├── campus/              # Haversine geofencing, mock-GPS defense, DTR, emergency roll-call
│   │   ├── messaging/           # Expo push worker, announcements, parent-teacher direct chat
│   │   └── reports/             # SF1, SF2, SF4, DTR, SDG Impact, Dropout Risk, Ed-Fi v6.0 engine
│   ├── common/                  # Audit middleware, GPS math, E.164 phone, HMAC QR signer
│   ├── config/                  # settings.py, urls.py, legacy_urls.py, wsgi.py, asgi.py, celery.py
│   ├── Dockerfile               # Non-root Python 3.12 production container
│   └── gunicorn.conf.py         # Blue/Green/Standalone Gunicorn config
├── web/                         # React 19 + TypeScript + Vite executive & faculty web portal
│   └── src/
│       ├── components/showcase/ # Public competition showcase & 1-Click Judge Demo launcher
│       ├── components/dashboard/# Live Dashboard + UN SDG Impact & Early-Warning Command Center
│       ├── components/tabs/     # Scanner, Students, Faculty, Schedules, Geofence, SF1/SF2/SF4/DTR
│       └── context/             # ThemeContext (Light/Dark/High-Contrast) + ComplianceContext (Global/DepEd + i18n)
├── mobile/                      # React Native / Expo companion app (Faculty GPS + Parent Portal)
├── deploy/                      # Nginx reverse proxy + Blue-Green zero-downtime switch scripts
├── docs/
│   ├── COMPETITION_PITCH_PACK.md    # 10-slide pitch deck blueprint, TAM/SAM/SOM & 3-min demo script
│   └── ARCHITECTURE_AND_SECURITY.md # Mermaid architecture, GDPR/FERPA/RA 10173 & Ed-Fi v6.0 spec
└── docker-compose.yml           # PostgreSQL 16 + Redis 7 + Blue/Green Web + Nginx + Celery
```

---

## 5-Minute Quickstart (Local Competition Demo)

### 1. Backend Setup & Competition Demo Seeder

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

> **Seeded Demo Accounts** (password: `AttendSure2026!`):  
> `demo_admin` (Admin) · `demo_principal` (Principal) · `demo_teacher` (Class Adviser) · `demo_parent` (Parent Mobile)  
> 1-Click Judge Demo buttons work automatically when `DEBUG=True` or `ENABLE_JUDGE_DEMO=True`.

### 2. Web Portal

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` to view the **Public Startup Showcase & 1-Click Judge Demo Launcher**.

### 3. Production Zero-Downtime Docker Deployment (Blue-Green)

```bash
cp backend/.env.example backend/.env   # Set SECRET_KEY, DB_PASSWORD, REDIS_PASSWORD, DEBUG=False
docker compose up -d --build
docker compose exec web_blue python manage.py migrate --noinput
docker compose exec web_blue python manage.py collectstatic --noinput

# Subsequent zero-downtime releases:
# Linux/macOS: ./deploy/switch.sh
# Windows:     .\deploy\switch.ps1
```

### 4. Automated Test Suite

```bash
cd backend
python manage.py check
python manage.py test apps.accounts.tests --verbosity=2
```

---

## Competition Documentation Pack

- **[Competition Pitch Pack & 3-Minute Live Demo Script](docs/COMPETITION_PITCH_PACK.md)** — 10-slide deck structure, unit economics, market sizing, competitive moat, and judge Q&A prep.
- **[Architecture, Security & Privacy Whitepaper](docs/ARCHITECTURE_AND_SECURITY.md)** — System topology, HMAC QR verification, mock-GPS & device-lock defense, GDPR/FERPA/COPPA/RA 10173 matrix, and Ed-Fi v6.0 schema reference.
