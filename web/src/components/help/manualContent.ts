// AttendSure Web - Searchable User Manual Content (Synced with docs/USER_MANUAL.md & Mobile)
// File: D:\AttendSure_V3\web\src\components\help\manualContent.ts

export type ManualRoleKey =
  | 'ALL'
  | 'ADMIN'
  | 'PRINCIPAL'
  | 'DEPT_HEAD'
  | 'TEACHER_TEACHING'
  | 'TEACHER_NON_TEACHING';

export type UserProfileKey = Exclude<ManualRoleKey, 'ALL'>;

export interface ManualRoleOption {
  key: ManualRoleKey;
  label: string;
}

export interface ManualStepItem {
  heading: string;
  detail: string;
}

export interface ManualFaqItem {
  question: string;
  answer: string;
  roles: UserProfileKey[];
}

export interface ManualSection {
  id: string;
  number: number;
  title: string;
  summary: string;
  roles: UserProfileKey[];
  highlights: string[];
  steps: ManualStepItem[];
  tip?: string;
  faqs?: ManualFaqItem[];
}

export const ALL_USER_PROFILES: UserProfileKey[] = [
  'ADMIN',
  'PRINCIPAL',
  'DEPT_HEAD',
  'TEACHER_TEACHING',
  'TEACHER_NON_TEACHING',
];

export const CLASSROOM_USER_PROFILES: UserProfileKey[] = [
  'ADMIN',
  'PRINCIPAL',
  'DEPT_HEAD',
  'TEACHER_TEACHING',
];

export const LEADER_USER_PROFILES: UserProfileKey[] = [
  'ADMIN',
  'PRINCIPAL',
  'DEPT_HEAD',
];

export const MANUAL_ROLE_OPTIONS: ManualRoleOption[] = [
  { key: 'ALL', label: 'All Roles' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'PRINCIPAL', label: 'Principal' },
  { key: 'DEPT_HEAD', label: 'Dept Head' },
  { key: 'TEACHER_TEACHING', label: 'Teaching Teacher' },
  { key: 'TEACHER_NON_TEACHING', label: 'Non-Teaching Staff' },
];

export const resolveUserProfileKey = (
  role?: string | null,
  canHandleClasses = true
): UserProfileKey => {
  const upper = String(role || '').trim().toUpperCase();
  if (upper === 'ADMIN') return 'ADMIN';
  if (upper === 'PRINCIPAL') return 'PRINCIPAL';
  if (upper === 'DEPT_HEAD') return 'DEPT_HEAD';
  return canHandleClasses ? 'TEACHER_TEACHING' : 'TEACHER_NON_TEACHING';
};

export const getProfileDisplayName = (profile: UserProfileKey): string => {
  switch (profile) {
    case 'ADMIN':
      return 'School System Admin';
    case 'PRINCIPAL':
      return 'School Principal';
    case 'DEPT_HEAD':
      return 'Department Head';
    case 'TEACHER_TEACHING':
      return 'Classroom Teacher / Adviser';
    case 'TEACHER_NON_TEACHING':
      return 'Non-Teaching School Staff';
  }
};

export const USER_MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'first-time-setup',
    number: 1,
    title: 'First-Time Sign-In, Personal Profile & Phone Setup',
    summary:
      'Sign in safely on Web or Mobile, update your personal information and profile photo, and prepare your personal phone for 1-to-1 campus check-ins.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'Only the 5 school staff roles sign in to AttendSure — there is no parent user account or parent login.',
      'Your session refreshes automatically and signs out cleanly on just the device you choose (including Sign Out on first-login setup).',
      'Your phone pairs 1-to-1 with your account on your very first verified Time In.',
    ],
    steps: [
      {
        heading: 'Sign in with your school account',
        detail:
          'Open AttendSure on your school computer or mobile app, enter your username and password from the school admin, and tap Sign In.',
      },
      {
        heading: 'Complete or edit your personal details',
        detail:
          'On first login — or anytime via My Profile (Web header) or Account -> Settings -> Profile & Alarms (Mobile) — update your First Name, Middle Name, Last Name, Email, Mobile Number (Philippine or international + format), and password (minimum 8 characters with confirmation).',
      },
      {
        heading: 'Add, change, or remove your profile photo',
        detail:
          'On Mobile, tap Take Photo (camera), Gallery (photo library with square crop), or Remove Photo, then tap Save Profile Changes. Your updated info and portrait immediately sync across Account, Dashboard, Settings, and Digital Teacher ID Pass.',
      },
      {
        heading: 'Turn on your phone screen lock & permissions',
        detail:
          'Before your first mobile Time In, make sure your phone has Face Unlock, Fingerprint, PIN, or Pattern turned on in phone settings, and grant Location permission ("Allow while using" / "Allow all the time") plus Camera permission for scanning student QR IDs.',
      },
    ],
    tip: 'If you replace or reset your phone later, ask your School Admin or Principal to click "Reset Phone Lock" in the Teachers Directory so your new phone can pair smoothly.',
  },
  {
    id: 'teacher-time-in-out',
    number: 2,
    title: 'Teacher Time In & Time Out',
    summary:
      'Record your daily Time In and Time Out inside the AttendSure mobile app using your phone lock and school campus GPS — zero face photos or fingerprints are ever stored on the server.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'Uses your own phone lock (Face Unlock, Fingerprint, or PIN) + a private signing key kept inside your phone.',
      'Zero raw face photos or biometric scans are ever uploaded or saved on the school server.',
      'Confirms you are standing inside the approved school campus GPS boundary (or holds a leader-approved Locator Slip).',
    ],
    steps: [
      {
        heading: 'Open Scanner / Time In-Out on Mobile',
        detail:
          'When you arrive on school grounds, open the AttendSure mobile app and tap Scanner (or Time In/Out for non-teaching staff) on the bottom 5-tab dock.',
      },
      {
        heading: 'Confirm GPS shows Inside Campus',
        detail:
          'Wait a few seconds for your GPS pin to lock inside the green school boundary ring. Step near a window or open hallway if indoor walls weaken GPS accuracy.',
      },
      {
        heading: 'Tap Time In and unlock with your phone',
        detail:
          'Tap the green Time In button and confirm your identity with your phone Face Unlock, Fingerprint, or PIN. Your phone signs the one-time check-in challenge with its private key and sends only the verified proof to the server.',
      },
      {
        heading: 'Tap Time Out before leaving school',
        detail:
          'At the end of your duty hours, open the same screen inside campus, tap Time Out, and unlock your phone once more. Background campus GPS pings stop right away after Time Out.',
      },
    ],
    tip: 'Only your bound personal phone can record your Time In and Time Out. Signing in on someone else’s phone will not pass the 1-to-1 phone check.',
  },
  {
    id: 'student-attendance-qr',
    number: 3,
    title: 'Taking Student Attendance (Camera QR & Offline Sync)',
    summary:
      'Scan signed student QR IDs with your built-in laptop webcam, PC webcam, or mobile phone camera — even when school internet drops.',
    roles: CLASSROOM_USER_PROFILES,
    highlights: [
      'Pure software: uses only the built-in camera on your laptop, PC webcam, or mobile phone.',
      'Every student QR ID carries a tamper-proof school signature tied to their 12-digit DepEd LRN.',
      'If Wi-Fi or mobile data disconnects, scans save safely on your device and auto-sync once back online.',
    ],
    steps: [
      {
        heading: 'Pick your active class period',
        detail:
          'Open QR Scanner on Web or Scanner -> Student QR on Mobile, then select the subject and section class list you are teaching right now.',
      },
      {
        heading: 'Point the camera at each student QR ID',
        detail:
          'Hold the printed or screen QR ID inside the camera box. AttendSure automatically records Present or Late using Manila time and plays a clear chime.',
      },
      {
        heading: 'Keep scanning even without internet',
        detail:
          'If the connection drops mid-class, keep scanning as usual. Each scan is stamped with its exact time and queued locally until signal returns, then uploaded automatically.',
      },
      {
        heading: 'Mark remaining unscanned students absent (Web & Mobile)',
        detail:
          'After checking the room, use "Mark Unscanned Absent" in Web QR Scanner / My Classes or in Mobile Classes (Class List) — where you can switch sections, toggle Today / Previous Day, and pick a class period. Students with an active Exit Pass are marked Excused automatically.',
      },
    ],
    tip: 'If a student forgot their QR ID card, use the manual class list search inside QR Scanner or My Classes to mark them Present, Late, or Excused.',
  },
  {
    id: 'class-lists-directories-setup',
    number: 4,
    title: 'Class Lists, Directories, Schedules & Settings',
    summary:
      'Manage student enrollments, teacher records, academic schedules, school letterhead logos, and interface tools across Web and Mobile.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'Both Enrolled and Transferred-In students stay active across every class list, QR scan, exit pass, and DepEd form.',
      'Web header tools include Theme Mode (Light/Dark/High-Contrast), Language (EN/FIL), Schedule Alarms, User Manual, Guided Tour, and My Profile.',
      'Mobile uses a 5-tab bottom dock (Home, Scanner, Classes, Passes, Account) with full directories and setup tools inside Account.',
    ],
    steps: [
      {
        heading: 'Review your assigned class lists & cutting flags',
        detail:
          'Teaching teachers open My Classes and Advisory (Web) or Classes (Mobile) to check enrolled students, switch sections, compare Today vs Previous Day, export class lists, and spot cutting flags.',
      },
      {
        heading: 'Manage Students & Teachers Directories',
        detail:
          'Authorized staff open Students (3-tab DepEd SF1 form with portrait photo Camera/Gallery/Remove, live 12-digit LRN check, and Student QR ID pass) and Teachers (portrait photo, department, teaching toggle, and Reset Phone Lock).',
      },
      {
        heading: 'Keep schedules, rooms, and holidays updated (School Leaders)',
        detail:
          'Admins and authorized leaders manage school years, grade levels, sections, subjects, rooms, holidays, and class periods under Academic Setup (Web) or Account -> Academic Setup & Schedules and School Calendar (Mobile).',
      },
      {
        heading: 'Configure School Profile, 3 Logos, Maintenance & Audit Logs',
        detail:
          'Admins open System Settings (Web) or Account -> Settings (Mobile) to update school details, assign the School Principal, upload or remove all 3 official letterhead logos, run maintenance checks, unlock locked accounts, and review Audit Logs.',
      },
    ],
    tip: 'Save buttons wait until live duplicate checks (LRN, Username, Employee ID, Email, Mobile Number) finish verifying so duplicate records cannot slip through.',
  },
  {
    id: 'student-excuse-exit-passes',
    number: 5,
    title: 'Student Excuse & Exit Pass Process + Teacher Locator Slips',
    summary:
      'Issue Student Exit Passes from parents’ physical hardcopy excuse letters and manage school-leader approval of Teacher Official Locator Slips with photo or PDF proof.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'No parent user accounts: parents submit a physical hardcopy excuse letter to the school, and the class adviser or school leader issues the Student Exit Pass.',
      'Attach proof via Camera Photo, Gallery Image, or PDF / Document Picker (up to 2 MB), replace or remove proof when editing, and view PDFs cleanly.',
      'Teacher Locator Slips submitted by non-leaders start as Pending Approval and require school leader approval before taking effect.',
    ],
    steps: [
      {
        heading: 'Student Excuse & Exit Pass Process (Hardcopy Excuse Letter)',
        detail:
          'When parents want their child excused from class or released early, they submit a physical hardcopy excuse letter to the school. The student’s class adviser (for students in their advised section) or a school leader (Admin, Principal, or Department Head) reviews the hardcopy, opens Exit & Travel Passes (Web) or Passes (Mobile), optionally attaches a photo, gallery image, or PDF scan under "Hardcopy Excuse Letter / Proof (Photo or PDF)", and issues the Student Exit Pass.',
      },
      {
        heading: 'Submit a Teacher Official Locator Slip',
        detail:
          'Any teacher leaving campus during duty hours for official DepEd business creates an Official Locator Slip with destination, reason, duration, and optional travel order proof (Camera, Gallery, or PDF/File). Requests by non-leaders start with a Pending Approval badge.',
      },
      {
        heading: 'Approve a Teacher Locator Slip (School Leaders)',
        detail:
          'An Admin, Principal, or Department Head filters by Pending Approval, reviews the slip and any attached proof photo or PDF, and clicks Approve. Once approved, the slip becomes Active (Authorized Off-Campus) and locked against edits or deletion by non-leaders.',
      },
      {
        heading: 'Inspect proof documents & mark Returned',
        detail:
          'Open any pass to preview attached photos or tap Open / View on attached PDF documents, replace or remove proof when editing, and click Mark Returned as soon as the student or teacher comes back to campus.',
      },
    ],
    tip: 'Remember to mark passes as Returned when the student or teacher comes back on campus so overdue pass alerts stay accurate.',
  },
  {
    id: 'campus-alerts-roll-call',
    number: 6,
    title: 'Monitoring Campus Alerts, Phone Health & Emergency Roll-Call',
    summary:
      'Watch live teacher campus presence, phone health status, outside-campus alerts, Signal Lost warnings, and run one-tap emergency evacuation roll-calls.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'Shows live teacher phone health: battery level, charging state, network type, GPS on/off, and Battery Saver mode.',
      'Displays a Signal Lost warning badge (SIGNAL_LOST) when a timed-in teacher goes offline with an open lost-signal alert.',
      'Emergency Campus Roll-Call gives school heads an instant headcount during drills or emergencies.',
    ],
    steps: [
      {
        heading: 'Check the live Geofence & Loafing board',
        detail:
          'Open Geofence & Loafing (Web) or Account -> Campus Geofence Status (Mobile) to see every on-duty teacher’s distance from campus center along with their latest battery, network, GPS, and Signal Lost badges.',
      },
      {
        heading: 'Understand "Teacher Phone Signal Lost" alerts',
        detail:
          'If an on-duty teacher’s phone stops sending campus heartbeats for too long (for example, battery drained, GPS turned off, or app closed), AttendSure raises a "Teacher Phone Signal Lost" alert and displays the Signal Lost status badge so leaders can check in.',
      },
      {
        heading: 'Run Campus Audits & resolve alerts with review notes',
        detail:
          'Leaders on both Web and Mobile can tap Run Campus Audit to check for student cutting, expired passes, and lost phone signals; filter by Open, Resolved, or All; enter optional review remarks; and tap Excuse or Confirm.',
      },
      {
        heading: 'Use Emergency Roll-Call during drills',
        detail:
          'Under SARDO & Safety, tap Emergency Roll-Call to verify every student and teacher currently on campus in real time.',
      },
    ],
    tip: 'Keeping GPS enabled and disabling strict battery killing for AttendSure prevents accidental "Teacher Phone Signal Lost" alerts during duty hours.',
  },
  {
    id: 'official-reports',
    number: 7,
    title: 'Printing Official Reports (SF1, SF2, SF4, Form 48, SARDO)',
    summary:
      'Generate ready-to-sign DepEd school forms, Civil Service Form 48 Daily Time Records, printable school packs, and SARDO early-warning reports directly from live attendance records.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'DepEd SF1 (School Register, storing parent/guardian contact details strictly as DepEd demographic records), SF2 (Daily Attendance), and SF4 (Monthly Movement for school leaders).',
      'CSC Form 48 Daily Time Record prints cleanly from the top of Page 1 with verified Manila-time mobile Time In and Time Out logs.',
      'SARDO early-warning highlights students at risk of dropping out based on 30-day absence trends.',
    ],
    steps: [
      {
        heading: 'Open DepEd Reports (SF1, SF2, SF4)',
        detail:
          'Teaching teachers and advisers open DepEd Reports (Web) or Account -> DepEd Forms (Mobile) to pick their section and month, inspect live attendance totals, adjust paper margins, and print or export to PDF, Excel, Word, or CSV.',
      },
      {
        heading: 'Review SF4 school-wide movement (Leaders only)',
        detail:
          'Admins, Principals, and Department Heads can switch to SF4 for school-wide monthly movement, enrollment parity, and division export packets.',
      },
      {
        heading: 'Submit, print, and approve CSC Form 48 (DTR)',
        detail:
          'Every teacher opens My DTR (Web) or Account -> Daily Time Record (Mobile), confirms their monthly hours, prints a clean Form 48 sheet, and taps Submit DTR. Department Heads and Principals approve submitted sheets in one click.',
      },
      {
        heading: 'Check SARDO Early-Warning & Print Packs weekly',
        detail:
          'Open SARDO & Safety to review learners with repeated absences or tardiness, and print official Class Lists, Schedules, Student QR ID Cards, and Teacher Directories.',
      },
    ],
    tip: 'All times across SF2 and Form 48 follow Asia/Manila 12-hour AM/PM formatting automatically.',
  },
  {
    id: 'quick-fixes-faq',
    number: 8,
    title: 'Quick Fixes & Common Questions',
    summary:
      'Fast, everyday answers to the most common excuse letter, locator slip approval, profile photo, GPS, phone lock, offline sync, and sign-in questions.',
    roles: ALL_USER_PROFILES,
    highlights: [
      'Step-by-step fixes you can do in under a minute without waiting for tech support.',
      'Covers parent hardcopy excuse letters, Pending Approval locator slips, mobile profile photos, GPS drift, replacement phones, and offline sync.',
    ],
    steps: [
      {
        heading: 'Check the common fixes below first',
        detail:
          'Tap any question card below to expand the quick fix. If a setting requires a school leader (like resetting a bound phone or approving a locator slip), contact your Principal, Department Head, or System Admin.',
      },
    ],
    faqs: [
      {
        question: 'How do parents request an excuse or early dismissal for their child?',
        answer:
          'Parents do not sign in to AttendSure. They submit a physical hardcopy excuse letter to the school. The student’s class adviser (or Admin, Principal, or Department Head) reviews the hardcopy, optionally attaches a photo or PDF scan under Exit & Travel Passes, and issues a Student Exit Pass so the student is automatically marked Excused.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'Why does my Teacher Official Locator Slip say "Pending Approval" instead of "Active"?',
        answer:
          'Locator slips submitted by non-leader teachers require approval from an Admin, Principal, or Department Head before taking effect. While Pending Approval, you can still edit or delete the slip, and it does not override campus geofence checks. Once approved, it becomes Active (Authorized Off-Campus).',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'How do I update my profile photo or personal details on the mobile app?',
        answer:
          'Tap Account -> Settings -> Profile & Alarms. Choose Take Photo, Gallery, or Remove Photo for your profile portrait, update your name, email, mobile number, or password below, and tap Save Profile Changes. Your updates immediately sync across Account, Dashboard, Settings, and your Digital Teacher ID Pass.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'My GPS shows weak signal or slightly outside campus while I am inside a concrete classroom.',
        answer:
          'Thick roofs and metal ceilings can bounce GPS signals. Turn on Wi-Fi (even if not connected) and High Accuracy Location in phone settings, step near a window or open corridor for 10 seconds, then tap Refresh GPS before tapping Time In.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'The app says my phone has no screen lock set up when I try to Time In.',
        answer:
          'Teacher Time In requires an active on-device lock for security. Open your phone Settings -> Security / Lock Screen and turn on Fingerprint, Face Unlock, PIN, or Pattern. Return to AttendSure and try again — zero face photos or fingerprints ever leave your phone.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'I bought a new phone or factory-reset my old phone, and Time In says my account is linked to another device.',
        answer:
          'AttendSure protects your DTR with 1-to-1 phone binding. Ask your School Admin or Principal to open Teachers Directory, find your name, and click "Reset Phone Lock". Your very next verified Time In will automatically pair your new phone.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'School Wi-Fi went down while I was scanning student QR IDs. Did I lose those scans?',
        answer:
          'No! Offline scans and offline GPS duty pings are saved safely inside your device’s local queue with their original timestamps. As soon as your connection returns, AttendSure uploads them automatically and shows the synced count.',
        roles: CLASSROOM_USER_PROFILES,
      },
      {
        question: 'Why did a "Teacher Phone Signal Lost" alert appear for someone who is still inside campus?',
        answer:
          'That alert appears when an on-duty phone stops sending periodic heartbeats. Common causes are low battery power-saving mode, GPS turned off, or force-closing the app. Open AttendSure once to send a fresh heartbeat and check the battery/GPS badges.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'My session expired after being away for a long time. Will signing out sign me out on my other device?',
        answer:
          'AttendSure automatically refreshes your session in the background while active. If a refresh token eventually expires or you tap Sign Out, only that single device is signed out — your other signed-in computer or phone stays unaffected.',
        roles: ALL_USER_PROFILES,
      },
      {
        question: 'A newly transferred-in student does not appear on my printed SF2 yet.',
        answer:
          'Confirm the student’s status is set to "Enrolled" or "Transferred In" and that they are linked to your active section in Students Directory. Both statuses are automatically included in QR scanning, class lists, and DepEd reports.',
        roles: CLASSROOM_USER_PROFILES,
      },
    ],
  },
];
