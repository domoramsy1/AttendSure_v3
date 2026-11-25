# AttendSure v3 — School Rollout & Presentation Pack

A practical, plain-English presentation blueprint and live demonstration guide built around the real features running in `AttendSure_V3`.

---

## 10-Slide Presentation Outline

### Slide 1 — Title & Promise
- **Name:** AttendSure v3 — *Pure-Software School Attendance, Campus Safety & SARDO Early-Warning*
- **Tagline:** Every Teacher On Duty. Every Student Accounted For. Zero Extra Devices Required.
- **Built & Working Today:** Full-stack Django 6 + React 19 + Expo React Native platform tailored for DepEd school operations.

### Slide 2 — The Real Everyday Problem in Schools
- **Paper Logbooks Hide Cutting Classes:** When attendance lives in separate paper notebooks, an adviser may not learn until days later that a student attended first period and skipped afternoon classes.
- **Late Support for At-Risk Students (SARDO):** Without live 30-day absence and cutting tracking, schools notice chronic absenteeism only when a learner is already close to dropping out.
- **Heavy Monthly Paperwork:** Teachers and advisers spend hours every month tallying DepEd **SF1**, **SF2**, **SF4**, and **CSC Form 48 (DTR)** sheets by hand.
- **Slow Emergency Headcounts:** During earthquakes, typhoons, or campus drills, searching through paper binders delays confirming who is safely accounted for.

### Slide 3 — The Pure-Software Solution
- **Built-In Camera Student QR Scanning:** Teachers scan cryptographically signed student QR ID cards using the built-in webcam on their laptop/PC (`jsqr`) or the back camera on their phone (`expo-camera`). Works offline with automatic local queue sync when Wi-Fi returns.
- **Phone Lock + Campus GPS Teacher Check-In:** Teachers clock in and out inside the AttendSure mobile app using their phone's built-in face unlock, fingerprint, or PIN lock — paired with 1-to-1 phone binding and campus GPS boundary checks. Zero raw face photos are ever stored on the server.
- **Automated Weekday-Aware Monitoring:** Flags students who miss a scheduled later class on that weekday without an active Exit Pass, and tracks outside-campus teacher movement unless covered by an approved Official Locator Slip.
- **Official DepEd Reports & Safety Tools:** Generates print-ready **SF1**, **SF2**, **SF4**, **CSC Form 48 (DTR)**, **30-Day SARDO Risk** lists, and **1-Click Emergency Roll-Call**.

### Slide 4 — Why Schools Can Adopt It Immediately
- **Zero Extra Equipment Budget:** No special devices to buy, install, wire, or repair — schools use the laptops, webcams, and smartphones staff already carry every day.
- **Built for Campus Wi-Fi Gaps:** Both the web webcam scanner and the mobile app store scans locally when offline and upload them cleanly once reconnected.
- **Clear Roles for Every Staff Member:** Supports all 5 school staff profiles — System Admin, School Principal, Department Head, Teaching Teacher / Adviser, and Non-Teaching Staff — with `EN` and `FIL` language support.

### Slide 5 — Built-In Anti-Fraud & Privacy Engineering
- **Signed Student QR IDs:** Every student QR code is signed with HMAC-SHA256 (`ATTENDSURE:...`), so photocopied or guessed LRN strings cannot forge attendance.
- **Anti-Proxy Teacher Verification:** 1-to-1 phone binding (`bound_device_id`), hardware-stored check-in key verification (`biometric_key_id`), mock-GPS rejection, weak-signal (> 250 m) rejection, and travel-speed checks stop buddy punching and fake GPS apps.
- **Privacy by Design (RA 10173):** Zero raw face photos or biometric templates ever leave the teacher's phone. Role scoping keeps teachers inside their own assigned sections, audit logs track every change and export, and Division Data Exports support optional personal ID masking.

### Slide 6 — Measurable School Impact
Every number shown on the AttendSure dashboard and safety panel comes live from the school database:
- **Faster Early Intervention (30-Day SARDO Risk):** Automatically highlights `CRITICAL_SARDO` and `EARLY_WARNING` learners so advisers and guidance staff can reach out early.
- **Hours Saved Every Month:** Eliminates manual end-of-month counting for DepEd **SF1**, **SF2**, **SF4**, and **CSC Form 48 (DTR)** submission and approval.
- **Live Campus Safety:** **1-Click Emergency Roll-Call** displays every student and teacher verified on campus today with live assembly-point safety checkboxes.
- **Cleaner Paperless Workflows:** Cuts repetitive printed daily sheets while keeping official print-ready DepEd forms one click away.

### Slide 7 — Clean, Maintainable Architecture
- **6 Focused Backend Apps (`accounts`, `school`, `students`, `attendance`, `campus`, `reports`):** Strict 3NF database design with zero duplicated columns, XOR database constraints on exit passes, and automated weekday schedule checks.
- **Consistent Web & Mobile Experience:** Synchronized 5-role permission checks across Django, React 19, and React Native, plus Light, Dark, and High-Contrast themes.
- **Zero-Downtime Updates:** Docker Blue-Green deployment (`web_blue` / `web_green` behind Nginx) updates the server without interrupting active classes.

### Slide 8 — Sustainable Deployment Model
| Plan | Designed For | What Is Included |
|---|---|---|
| **School Pilot** | Single public high school or pilot campus | Full built-in camera QR attendance, teacher phone check-in & GPS boundary, Exit Passes, SF1/SF2/SF4, CSC Form 48 (DTR), SARDO Risk, and Emergency Roll-Call. |
| **Division Rollout** | City or provincial school divisions | Multi-campus hosting, Division Data Export (`JSON` / `CSV` with optional ID masking), central onboarding, and zero-downtime server maintenance. |
| **Private K–12 Subscription** | Private schools & academies | Managed cloud hosting, automated backups, staff training, and priority technical support. |

- **Low Operating Cost:** Because AttendSure is pure software with zero extra hardware supply chain, school budgets go straight into reliable cloud or on-campus hosting and staff support.

### Slide 9 — Planned Next Steps (Roadmap)
- **Phase 1 (Current Release — Live Today):** Complete 5-role staff web portal & mobile app, signed camera QR scanning with offline sync, on-device phone lock & campus GPS teacher check-in, weekday-aware cutting detection, official DepEd SF1/SF2/SF4/DTR, 30-Day SARDO Risk, and 1-Click Emergency Roll-Call.
- **Phase 2 (Division Pilot & Scale):** Multi-school pilot across Region X public high schools, division analytics dashboards, and fine-tuned attendance trend reports.
- **Phase 3 (School-Wide Reporting Enhancements):** Expanded DepEd division analytics, attendance trend forecasting, and streamlined adviser-verified hardcopy excuse letter archiving.

### Slide 10 — Summary & Call to Action
- **Proven Codebase:** Verified by automated Django unit tests and an 8-gate repository audit covering migrations, API routes, 184 web/mobile permission checks, UI token consistency, vocabulary standards, and schedule conflict checks.
- **Ready for Campus Pilot:** Deployable on a school server or Docker cloud host in minutes using devices teachers already own.

---

## Timed 3-Minute Live Walkthrough Script

> **Before Starting:**  
> Run `python manage.py seed_competition_demo` inside `backend/`, start the Django server (`python manage.py runserver 0.0.0.0:8000`) and Web Portal (`npm run dev` inside `web/`), and open `http://localhost:5173`.

1. **[0:00 – 0:30] Landing Page & Language Switch**
   - Introduce AttendSure's core value: pure software running on existing teacher laptops, webcams, and phones — zero extra equipment to buy.
   - Toggle the header language switch (`EN` / `FIL`) and theme mode (`Light` / `Dark` / `High-Contrast`) to show everyday accessibility for Philippine school staff.
2. **[0:30 – 1:10] Live Dashboard, 30-Day SARDO Risk & 1-Click Emergency Roll-Call**
   - Sign in as `demo_admin` or `demo_principal` (password `AttendSure2026!`, or use the environment-gated preview button in local development).
   - Open **SARDO & Safety** to show students automatically grouped into `CRITICAL_SARDO` and `EARLY_WARNING` from real 30-day attendance patterns.
   - Click **Emergency Campus Roll-Call** to show the live headcount of every student and teacher verified on campus today, and mark students as **SAFE** at the assembly area in real time.
3. **[1:10 – 1:55] Classroom QR Scanner, Adviser Matrix & Weekday Schedule Filtering**
   - Open **QR Scanner** to show built-in laptop/PC webcam scanning (`jsqr`) with HMAC-signed student QR IDs and automatic offline local queue sync.
   - Open **Advisory** to show the daily subject monitoring matrix filtered to today's scheduled class periods (`ALL_WEEKDAYS`, `MWF`, `TTH`), spotting students present in Period 1 who missed a later scheduled period without an active Exit Pass.
4. **[1:55 – 2:30] Campus GPS Boundary, Teacher Check-In & Exit Passes**
   - Open **Geofence & Loafing** to show the campus GPS circle, live teacher check-in status, and outside-campus alerts (auto-resolved when teachers return or excused when an approved **Official Locator Slip** is active).
   - Emphasize privacy: teachers verify identity using their own phone's face/fingerprint/PIN lock with 1-to-1 phone binding and zero raw face photos sent to the server.
5. **[2:30 – 3:00] Official DepEd Forms & Division Export**
   - Open **DepEd Reports** to show print-ready **SF1**, **SF2**, **SF4**, and **DTR (CSC Form 48)** with teacher submission and Department Head approval.
   - Click **Division Export** with personal ID masking enabled to show privacy-safe reporting ready for school division offices.

---

## Common Reviewer Questions & Clear Answers

- **Q: What happens when campus internet goes down during morning attendance?**  
  *A:* Both the web webcam scanner (`localStorage`) and the mobile phone camera scanner (`AsyncStorage`) store signed QR scans in a local offline queue with unique scan IDs (`client_scan_uuid`). Once internet reconnects, they sync cleanly to `/api/v1/attendance/offline-sync/` without creating duplicates.
- **Q: Can someone copy a student's LRN or fake a teacher's location?**  
  *A:* Student QR cards are signed with HMAC-SHA256 (`common/qr_signer.py`), so plain LRNs or edited codes are rejected immediately. Teacher check-ins require their bound phone (`bound_device_id`), on-device face/fingerprint/PIN confirmation (`biometric_key_id`), real non-mocked GPS coordinates inside the campus boundary, and accurate GPS readings (≤ 250 m).
- **Q: Do you store teacher face photos or fingerprints on the server?**  
  *A:* Never. Face unlock, fingerprint, and PIN checks stay entirely inside the phone's operating system via `expo-local-authentication` and `expo-secure-store`. The server only stores a non-reversible SHA-256 key identifier (`biometric_key_id`) to confirm check-ins came from the teacher's bound phone.
- **Q: How does AttendSure handle non-teaching school staff?**  
  *A:* Non-teaching staff have `role="TEACHER"` with `can_handle_classes=False`. Both the web portal and mobile app hide classroom QR scanning, student class lists, and SF1/SF2 for them, showing only their personal dashboard, campus GPS check-in, official locator slips, and CSC Form 48 DTR.
- **Q: Are the preview login buttons safe for real production schools?**  
  *A:* Yes. `/api/v1/accounts/demo-login/` checks `DEBUG or ENABLE_JUDGE_DEMO` on the server and returns `HTTP 404` when disabled in production, verified by automated tests.
