# AttendSure User Manual

Welcome to **AttendSure**, your pure-software Philippine DepEd school attendance, campus GPS monitoring, and official school reporting platform.

This manual uses simple, everyday English and matches the searchable in-app **User Manual & Help** available on both the AttendSure Web Portal and the AttendSure Mobile App.

---

## Who Uses AttendSure (5 School Staff Profiles)

Only school staff sign in to AttendSure. **There is no parent user account, parent login, or parent mobile app access** anywhere in the system. Parent and guardian contact details are stored solely as official DepEd **SF1 (School Register)** student demographic fields.

| Role Profile | Main Daily Tasks |
|---|---|
| **School System Admin (`ADMIN`)** | School setup, official letterhead logos, user accounts, teacher phone lock resets, campus GPS boundary, all attendance tools, and all DepEd forms (`SF1`, `SF2`, `SF4`, `Form 48`, `SARDO`). |
| **School Principal (`PRINCIPAL`)** | School-wide dashboard, live teacher campus & phone health monitor, approving teacher locator slips & DTRs, student exit passes, emergency roll-call, and `SF1`/`SF2`/`SF4` oversight. |
| **Department Head (`DEPT_HEAD`)** | Academic setup & class schedules, teacher & student management, scanning student QR IDs, approving teacher locator slips, resolving campus alerts, `SF1`/`SF2`/`SF4`, and approving department DTRs. |
| **Classroom Teacher / Adviser (`TEACHER`, handles classes)** | Mobile Time In / Time Out with phone lock & campus GPS, built-in camera QR student attendance scanning (with offline auto-sync), advisory class list matrix, issuing student exit passes for advised students after receiving a parent's hardcopy excuse letter, `SF1`/`SF2`, and own `Form 48` DTR. |
| **Non-Teaching School Staff (`TEACHER`, non-teaching)** | Mobile Time In / Time Out with phone lock & campus GPS, submitting official business locator slips for leader approval, school calendar, and own `Form 48` DTR. |

---

## 1. First-Time Sign-In, Personal Profile & Phone Setup

Sign in safely on Web or Mobile, update your personal information and profile portrait photo, and prepare your personal phone for 1-to-1 campus check-ins.

- Works on any laptop/PC browser and on your personal Android or iPhone.
- Your session refreshes automatically and signs out cleanly on just the device you choose (including a **Sign Out** button on the first-login profile prompt).
- Your phone pairs 1-to-1 with your account on your very first verified Time In.

### Step-by-Step
1. **Sign in with your school account:** Open AttendSure on your school computer or mobile app, enter your username and password from the school admin, and tap **Sign In**.
2. **Complete or edit your personal details:** On first login — or anytime later via **My Profile** (Web header) or **Account -> Settings -> Profile & Alarms** (Mobile) — update your First Name, Middle Name, Last Name, Email, Mobile Number (Philippine `09XXXXXXXXX` or international `+...` format), and password (minimum 8 characters with confirmation).
3. **Add, change, or remove your profile photo:** On Mobile, tap **Take Photo** (camera), **Gallery** (photo library with square crop), or **Remove Photo**, then tap **Save Profile Changes**. Your updated name and photo refresh immediately across **Account**, **Dashboard**, **Settings**, and your **Digital Teacher ID Pass**. (This portrait photo is your account avatar only — zero face-unlock biometric data is ever stored on the server.)
4. **Turn on your phone screen lock & permissions:** Before your first mobile Time In, make sure your phone has Face Unlock, Fingerprint, PIN, or Pattern turned on in phone settings, and grant Location permission (*Allow while using* / *Allow all the time*) plus Camera permission if you scan student QR IDs.

> **Helpful Tip:** If you replace or factory-reset your phone later, ask your School Admin or Principal to click **Reset Phone Lock** in the **Teachers Directory** so your new phone can pair smoothly.

---

## 2. Teacher Time In & Time Out

Record your daily Time In and Time Out inside the AttendSure mobile app using your phone lock and school campus GPS — no raw face photos or fingerprints are ever stored on the server.

- Uses your own phone lock (Face Unlock, Fingerprint, or PIN) plus a private cryptographic signing key stored strictly inside your phone.
- Zero raw face photos or biometric scans are ever uploaded or saved on the school server.
- Confirms you are standing inside the approved school campus GPS boundary (or holds a school-leader **Approved** Official Locator Slip).

### Step-by-Step
1. **Open Scanner / Time In-Out on Mobile:** When you arrive on school grounds, open the AttendSure mobile app and tap **Scanner** (or **Time In/Out** for non-teaching staff) on the bottom 5-tab dock.
2. **Confirm GPS shows Inside Campus:** Wait a few seconds for your GPS pin to lock inside the green school boundary ring. Step near a window or open hallway if concrete walls weaken GPS accuracy.
3. **Tap Time In and unlock with your phone:** Tap the green **Time In** button and confirm your identity with your phone Face Unlock, Fingerprint, or PIN. Your phone signs the one-time check-in challenge with its private key and sends only the verified proof to the server.
4. **Tap Time Out before leaving school:** At the end of your duty hours, open the same screen inside campus, tap **Time Out**, and unlock your phone once more. Background campus GPS pings stop right away after Time Out.

> **Helpful Tip:** Only your bound personal phone can record your Time In and Time Out. Signing in on someone else's phone will not pass the 1-to-1 phone check.

---

## 3. Taking Student Attendance (Built-In Camera QR & Offline Sync)

Scan signed student QR IDs with your built-in laptop webcam, PC webcam, or mobile phone camera — even when school internet drops.

- Pure software: uses only the built-in camera on your laptop, PC webcam, or mobile phone (no extra scanning hardware or special cards required).
- Every student QR ID carries a tamper-proof school signature tied to their 12-digit DepEd LRN.
- If Wi-Fi or mobile data disconnects, scans save safely on your device and auto-sync once back online.

### Step-by-Step
1. **Pick your active class period:** Open **QR Scanner** on Web or **Scanner -> Student QR** on Mobile, then select the subject and section class list you are teaching right now.
2. **Point the camera at each student QR ID:** Hold the printed or screen QR ID inside the camera box. AttendSure automatically records **Present** or **Late** using Manila time (`Asia/Manila`) and plays a clear chime.
3. **Keep scanning even without internet:** If the connection drops mid-class, keep scanning as usual. Each scan is stamped with its exact time and queued locally until signal returns, then uploaded automatically.
4. **Mark remaining unscanned students absent (Web & Mobile):** After checking the room, use **Mark Unscanned Absent** in the Web **QR Scanner** / **My Classes** view or in Mobile **Classes** (`Class List`) — where you can also switch sections, toggle **Today** / **Previous Day**, and pick the class period. Students covered by an active Exit Pass are marked **Excused** automatically, and both **Enrolled** and **Transferred-In** students appear automatically.

> **Helpful Tip:** If a student forgot their QR ID card, use the manual class list search inside **QR Scanner** or **My Classes** to mark them Present, Late, or Excused.

---

## 4. Managing Class Lists, Directories, Schedules & Settings

Keep student enrollments, teacher records, academic schedules, school branding, and interface tools organized across Web and Mobile.

- Both **Enrolled** and **Transferred-In** students stay active across every class list, QR scan, exit pass, QR card, and DepEd report.
- Web header tools give quick access to **Theme Mode** (Light / Dark / High-Contrast), **Language** (`EN`/`FIL`), **Schedule Alarms** (toggle & test chimes), **User Manual**, **Guided Walkthrough**, **My Profile**, and **Sign Out**.
- Mobile uses a 5-tab bottom dock (**Home**, **Scanner / Time In-Out**, **Classes**, **Passes**, **Account**) with full directories and tools inside **Account**.

### Step-by-Step
1. **Review your assigned class lists & cutting flags:** Teaching teachers open **My Classes** and **Advisory** (Web) or **Classes** (Mobile) to check enrolled students, switch sections, review Today or Previous Day period statuses, export class lists, and spot cutting flags.
2. **Manage Students & Teachers Directories:** Authorized staff open **Students** (3-tab DepEd SF1 form with portrait photo Camera/Gallery/Remove, live 12-digit LRN check, and Student QR ID pass) and **Teachers** (portrait photo, department, teaching toggle, and **Reset Phone Lock**).
3. **Keep schedules, rooms, and holidays updated (School Leaders):** Admins and authorized leaders manage school years, grade levels, sections, subjects, rooms, holidays, and class periods under **Academic Setup** (Web) or **Account -> Academic Setup & Schedules** and **School Calendar** (Mobile).
4. **Configure School Profile, 3 Logos, Maintenance & Audit Logs (Admins/Leaders):** Open **System Settings** (Web) or **Account -> Settings** (Mobile) to update school details, assign the School Principal, upload or remove all 3 official letterhead logos, run maintenance checks, unlock locked accounts, and review Audit Logs.

> **Helpful Tip:** Save buttons wait cleanly while live duplicate checks (LRN, Username, Employee ID, Email, Mobile Number) finish checking so duplicate records are prevented before saving.

---

## 5. Student Excuse & Exit Pass Process + Teacher Locator Slips

Handle student absences/early departures from parents' physical excuse letters and manage school-leader approval of teacher official locator slips in one place.

- **No Parent User Accounts:** Parents do not sign in to AttendSure. All excuse requests go through the school's physical hardcopy excuse letter process.
- **Flexible Proof Attachments (Photo or PDF):** On both Web and Mobile, attach a **Camera photo**, **Gallery image**, or **PDF / Document file** (up to 2 MB), replace or remove proof when editing, preview images inline, and open attached PDFs cleanly.
- **Strict Approval Security for Teachers:** Teacher Locator Slips requested by non-leaders start as **Pending Approval** and cannot bypass campus geofence check-ins or loafing checks until approved by a school leader.

### Step-by-Step
1. **Student Excuse & Exit Pass Process (Hardcopy Excuse Letter):** When a parent wants their child excused from class or released early, the parent submits a **physical hardcopy excuse letter** to the school. The student's **class adviser** (for students in their advised section) or a school leader (`ADMIN`, `PRINCIPAL`, or `DEPT_HEAD`) reviews the hardcopy, opens **Exit & Travel Passes** (Web) or **Passes** (Mobile), selects **Student Exit Pass**, optionally attaches a photo, gallery image, or PDF scan under **Hardcopy Excuse Letter / Proof (Photo or PDF)**, and issues the pass. Covered periods are automatically marked **Excused**.
2. **Requesting a Teacher Official Locator Slip:** Any teacher leaving campus during duty hours for official DepEd business selects **Official Locator Slip**, enters destination, reason, and duration, and optionally attaches a travel order or memo (using **Camera**, **Gallery**, or **PDF / File** on Mobile). Requests from non-leaders start with a **Pending Approval** badge.
3. **Approving a Teacher Locator Slip (School Leaders):** An `ADMIN`, `PRINCIPAL`, or `DEPT_HEAD` filters by **Pending Approval**, inspects the slip and any attached proof photo/PDF, and clicks **Approve**. Once approved, the slip turns **Active** (`Authorized Off-Campus`) and is locked against edits or deletion by non-leaders.
4. **Marking Returned or Updating Proof:** Open any active or overdue pass to view attached photos or tap **Open / View** on attached PDFs, edit or remove proof if permitted, or tap **Mark Returned** as soon as the student or teacher returns to campus.

> **Helpful Tip:** Always mark passes as **Returned** when the student or teacher comes back on campus so overdue pass alerts stay accurate.

---

## 6. Monitoring Campus Alerts, Phone Health & Emergency Roll-Call

Watch live teacher campus presence, phone health status, outside-campus alerts, lost phone signal warnings, and run one-tap emergency evacuation roll-calls.

- Shows live teacher phone health: **battery level**, **charging state**, **network type**, **GPS on/off**, and **Battery Saver** mode.
- Displays a clear **Signal Lost** warning badge (`SIGNAL_LOST`) whenever a timed-in teacher goes offline with an open **Teacher Phone Signal Lost** alert (and excludes them from verified on-campus counts until signal returns).
- **Emergency Campus Roll-Call** gives school heads an instant headcount during drills or emergencies.

### Step-by-Step
1. **Check the live Geofence & Loafing board:** Open **Geofence & Loafing** (Web) or **Account -> Campus Geofence Status** (Mobile) to see every on-duty teacher's distance from campus center along with their latest battery, network, GPS, and Signal Lost badges.
2. **Understand "Teacher Phone Signal Lost" alerts:** If an on-duty teacher's phone stops sending campus heartbeats for too long (for example, battery drained, GPS turned off, or app closed), AttendSure raises a **Teacher Phone Signal Lost** alert so leaders can check in.
3. **Run Campus Audits & resolve alerts with review notes (Web & Mobile):** Leaders can tap **Run Campus Audit** to immediately check for student cutting, expired passes, and lost teacher phone signals; filter alerts by status (**Open**, **Resolved**, **All**) and type; enter optional **review remarks**; and tap **Excuse** or **Confirm**.
4. **Use Emergency Roll-Call during drills:** Under **SARDO & Safety**, tap **Emergency Roll-Call** to verify every student and teacher currently on campus in real time.

> **Helpful Tip:** Keeping GPS enabled and disabling strict battery killing for AttendSure prevents accidental **Teacher Phone Signal Lost** alerts during duty hours.

---

## 7. Printing Official Reports (`SF1`, `SF2`, `SF4`, `Form 48`, `SARDO`)

Generate ready-to-sign DepEd school forms, Civil Service Form 48 Daily Time Records, printable packs, and SARDO early-warning reports directly from live attendance records.

- **DepEd SF1** (School Register, including parent/guardian contact info), **SF2** (Daily Attendance), and **SF4** (Monthly Movement for school leaders).
- **CSC Form 48 Daily Time Record** prints cleanly from the top of Page 1 with verified Manila-time mobile Time In and Time Out logs.
- **SARDO Early-Warning** highlights students at risk of dropping out based on 30-day absence trends.

### Step-by-Step
1. **Open DepEd Reports (`SF1`, `SF2`, `SF4`):** Teaching teachers and advisers open **DepEd Reports** (Web) or **Account -> DepEd Forms** (Mobile) to pick their section and month, inspect live attendance totals, adjust paper margins, and print or save as PDF, Excel, Word, or CSV.
2. **Review SF4 school-wide movement (Leaders only):** Admins, Principals, and Department Heads can switch to **SF4** for school-wide monthly movement, enrollment parity, and division export packets.
3. **Submit, print, and approve CSC Form 48 (DTR):** Every teacher opens **My DTR** (Web) or **Account -> Daily Time Record** (Mobile), confirms their monthly hours, prints a clean Form 48 sheet, and taps **Submit DTR**. Department Heads and Principals approve submitted sheets in one click.
4. **Check SARDO Early-Warning & Print Packs:** Open **SARDO & Safety** to review learners needing early support, or print official **Class Lists**, **Class Schedules**, **Student QR ID Cards**, and **Teacher Directories**.

> **Helpful Tip:** All times across SF2 and Form 48 follow `Asia/Manila` 12-hour AM/PM formatting automatically.

---

## 8. Quick Fixes & Common Questions

### How do parents request an excuse or early dismissal for their child?
Parents do not have login accounts in AttendSure. They submit a **physical hardcopy excuse letter** to the school. The student's **class adviser** (or Admin, Principal, or Department Head) reviews the hardcopy, optionally attaches a photo or PDF scan of it under **Exit & Travel Passes**, and issues a **Student Exit Pass** so the student is automatically marked **Excused**.

### Why does my Teacher Official Locator Slip say "Pending Approval" instead of "Active"?
For campus attendance integrity, locator slips submitted by non-leader teachers require review by an **Admin**, **Principal**, or **Department Head** before taking effect. While **Pending Approval**, you can still edit or delete the slip, and it does not override campus geofence checks. Once a school leader clicks **Approve**, it turns **Active** (`Authorized Off-Campus`).

### How do I update my profile photo or personal details on the mobile app?
Tap **Account -> Settings -> Profile & Alarms**. Use **Take Photo**, **Gallery**, or **Remove Photo** for your profile portrait, update your name, email, mobile number, or password below, and tap **Save Profile Changes**. Your updates immediately appear on Account, Dashboard, Settings, and your Digital Teacher ID Pass.

### My GPS shows weak signal or slightly outside campus while I am inside a concrete classroom.
Thick roofs and metal ceilings can bounce GPS signals. Turn on **Wi-Fi** (even if not connected) and **High Accuracy Location** in phone settings, step near a window or open corridor for 10 seconds, then tap **Refresh GPS** before tapping **Time In**.

### The app says my phone has no screen lock set up when I try to Time In.
Teacher Time In requires an active on-device lock for security. Open your phone **Settings -> Security / Lock Screen** and turn on Fingerprint, Face Unlock, PIN, or Pattern. Return to AttendSure and try again — zero face photos or fingerprints ever leave your phone.

### I bought a new phone or factory-reset my old phone, and Time In says my account is linked to another device.
AttendSure protects your DTR with 1-to-1 phone binding. Ask your School Admin or Principal to open **Teachers Directory**, find your name, and click **Reset Phone Lock**. Your very next verified Time In will automatically pair your new phone.

### School Wi-Fi went down while I was scanning student QR IDs. Did I lose those scans?
No. Offline scans and offline GPS duty pings are saved safely inside your device's local queue with their original timestamps. As soon as your connection returns, AttendSure uploads them automatically and shows the synced count.

### Why did a "Teacher Phone Signal Lost" alert appear for someone who is still inside campus?
That alert appears when an on-duty phone stops sending periodic heartbeats. Common causes are low battery power-saving mode, GPS turned off, or force-closing the app. Open AttendSure once to send a fresh heartbeat and check the battery/GPS badges.

### My session expired after being away for a long time. Will signing out sign me out on my other device?
AttendSure automatically refreshes your session in the background while active. If a refresh token eventually expires or you tap **Sign Out**, only that single device is signed out — your other signed-in computer or phone stays unaffected.

### A newly transferred-in student does not appear on my printed SF2 yet.
Confirm the student's status is set to **Enrolled** or **Transferred In** and that they are linked to your active section in **Students Directory**. Both statuses are automatically included in QR scanning, class lists, and DepEd reports.
