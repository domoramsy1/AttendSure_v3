// AttendSure Mobile - Role-Tailored Interactive Onboarding Steps
// File: D:\AttendSure_V3\mobile\src\components\help\onboardingSteps.ts

import type { UserProfileKey } from './manualContent';

export type OnboardingIllustrationKey =
  | 'welcome'
  | 'qr-scan'
  | 'campus-gps'
  | 'offline-sync'
  | 'phone-lock'
  | 'exit-pass'
  | 'reports-pack'
  | 'school-setup';

export interface MobileOnboardingStep {
  id: string;
  badgeText: string;
  title: string;
  description: string;
  illustration: OnboardingIllustrationKey;
  tip?: string;
}

const STEPS_BY_PROFILE: Record<UserProfileKey, MobileOnboardingStep[]> = {
  ADMIN: [
    {
      id: 'm-admin-welcome',
      badgeText: 'School System Admin',
      title: 'Welcome to AttendSure Mobile',
      description:
        'Manage student QR attendance, verified teacher check-ins, live campus GPS status, and official DepEd forms right from your phone.',
      illustration: 'welcome',
      tip: 'You can open the searchable User Manual or replay this walkthrough anytime under Account -> User Manual.',
    },
    {
      id: 'm-admin-setup',
      badgeText: 'Step 1 • School Setup & Users',
      title: 'Manage Accounts, Seals & Phone Locks',
      description:
        'Use Account -> Settings and Teachers Directory to configure school branding, manage staff roles, or reset a teacher’s 1-to-1 phone lock when they switch phones.',
      illustration: 'school-setup',
    },
    {
      id: 'm-admin-gps',
      badgeText: 'Step 2 • Live Campus & Phone Health',
      title: 'Monitor Campus GPS & Signal Alerts',
      description:
        'Open the Geofence tab to see live on-duty teachers, battery/network/GPS phone health badges, and Teacher Phone Signal Lost alerts.',
      illustration: 'campus-gps',
    },
    {
      id: 'm-admin-offline',
      badgeText: 'Step 3 • Pure Software QR & Offline Sync',
      title: 'Scan Student QR IDs Anywhere',
      description:
        'Teachers scan signed student QR IDs using their phone camera. If school Wi-Fi drops, scans and duty GPS heartbeats save safely offline and sync automatically.',
      illustration: 'offline-sync',
    },
    {
      id: 'm-admin-reports',
      badgeText: 'Step 4 • Official Reports & Passes',
      title: 'DepEd Forms & Exit Pass Records',
      description:
        'Review SF1, SF2, SF4, and Form 48 DTRs under Account, and track approved teacher locator slips and student exit passes backed by hardcopy parent excuse letters.',
      illustration: 'reports-pack',
    },
  ],

  PRINCIPAL: [
    {
      id: 'm-principal-welcome',
      badgeText: 'School Principal',
      title: 'Welcome, School Principal',
      description:
        'See live school-wide attendance, on-duty teachers, SARDO early warnings, and official DepEd reports wherever you are on campus.',
      illustration: 'welcome',
      tip: 'Open Account -> User Manual anytime for step-by-step guides and quick fixes.',
    },
    {
      id: 'm-principal-gps',
      badgeText: 'Campus Monitoring',
      title: 'Check Live Campus Presence & Phone Health',
      description:
        'Tap Geofence on the bottom bar to inspect teacher campus distance, battery/network/GPS badges, and outside-campus or Teacher Phone Signal Lost alerts.',
      illustration: 'campus-gps',
    },
    {
      id: 'm-principal-passes',
      badgeText: 'Approvals & Exit Passes',
      title: 'Approve Passes & Locator Slips',
      description:
        'Tap Passes to approve teacher official business locator slips and issue student exit passes after verifying a parent’s hardcopy excuse letter.',
      illustration: 'exit-pass',
    },
    {
      id: 'm-principal-reports',
      badgeText: 'DepEd Forms & Safety',
      title: 'Review SF4, DTR Approvals & Roll-Call',
      description:
        'Open Account to inspect SF1, SF2, and SF4 reports, approve teacher CSC Form 48 DTRs, or launch Emergency Campus Roll-Call during drills.',
      illustration: 'reports-pack',
    },
  ],

  DEPT_HEAD: [
    {
      id: 'm-dept-welcome',
      badgeText: 'Department Head',
      title: 'Welcome to Your Department Hub',
      description:
        'Coordinate class lists, scan student QR IDs, verify teacher presence, and approve monthly Form 48 time records from one mobile app.',
      illustration: 'welcome',
    },
    {
      id: 'm-dept-qr',
      badgeText: 'Classroom Attendance',
      title: 'Scan Student QR IDs with Your Phone Camera',
      description:
        'Tap Scanner -> Student QR to record class attendance in seconds. Offline scans queue automatically when signal drops.',
      illustration: 'qr-scan',
    },
    {
      id: 'm-dept-lock',
      badgeText: 'Daily Check-In',
      title: 'Private Phone Lock & Campus GPS',
      description:
        'Record your own Time In and Time Out inside campus using your phone Face Unlock, Fingerprint, or PIN — zero face photos ever leave your phone.',
      illustration: 'phone-lock',
    },
    {
      id: 'm-dept-reports',
      badgeText: 'Monitoring & Approvals',
      title: 'Check Phone Health & Approve Form 48 DTRs',
      description:
        'Watch campus status under Geofence, approve monthly DTRs under Account -> Daily Time Record, and open the User Manual anytime you need help.',
      illustration: 'reports-pack',
    },
  ],

  TEACHER_TEACHING: [
    {
      id: 'm-teacher-welcome',
      badgeText: 'Classroom Teacher / Adviser',
      title: 'Welcome to AttendSure Mobile',
      description:
        'Scan student QR IDs with your phone camera, record your own Time In/Out inside campus, and keep your advisory class lists and Form 48 up to date.',
      illustration: 'welcome',
      tip: 'No extra hardware needed — your personal phone handles everything cleanly.',
    },
    {
      id: 'm-teacher-lock',
      badgeText: 'Step 1 • Your Daily Time In / Out',
      title: 'Verify with Phone Lock & Campus GPS',
      description:
        'When you arrive at school, tap Scanner -> Teacher Time In/Out and unlock with your phone Face Unlock, Fingerprint, or PIN. Zero face photos ever leave your phone.',
      illustration: 'phone-lock',
      tip: 'Your personal phone links 1-to-1 with your account on your very first verified Time In.',
    },
    {
      id: 'm-teacher-qr',
      badgeText: 'Step 2 • Classroom QR Scanning',
      title: 'Scan Signed Student QR IDs',
      description:
        'Switch to Student QR, pick your active class period, and point your phone camera at each student QR ID. Attendance updates your class list and DepEd forms right away.',
      illustration: 'qr-scan',
    },
    {
      id: 'm-teacher-offline',
      badgeText: 'Step 3 • Works Without Internet',
      title: 'Safe Offline Queue Auto-Sync',
      description:
        'If classroom Wi-Fi drops, keep scanning! Every scan and duty GPS ping stays saved with its exact Manila time and uploads automatically once signal returns.',
      illustration: 'offline-sync',
    },
    {
      id: 'm-teacher-reports',
      badgeText: 'Step 4 • Class Lists, Passes & Forms',
      title: 'Advisory Matrix, Exit Passes & DepEd Forms',
      description:
        'Issue student Exit Passes under Passes, review class lists and SF1/SF2 reports under Account, and open Account -> User Manual anytime for quick fixes.',
      illustration: 'reports-pack',
    },
  ],

  TEACHER_NON_TEACHING: [
    {
      id: 'm-staff-welcome',
      badgeText: 'Non-Teaching School Staff',
      title: 'Welcome to AttendSure Mobile',
      description:
        'Record verified campus Time In and Time Out, file official travel locator slips, and submit your monthly CSC Form 48 DTR in just a few taps.',
      illustration: 'welcome',
    },
    {
      id: 'm-staff-lock',
      badgeText: 'Step 1 • Private Phone Check-In',
      title: 'Use Your Phone Lock & Campus GPS',
      description:
        'Tap Time In/Out on the bottom bar while inside school grounds and confirm with Face Unlock, Fingerprint, or PIN. Zero raw face photos are ever stored on the server.',
      illustration: 'phone-lock',
      tip: 'Your phone pairs 1-to-1 with your account automatically on your first Time In.',
    },
    {
      id: 'm-staff-gps',
      badgeText: 'Step 2 • Campus Status & Offline Sync',
      title: 'Smart Battery-Safe Duty Heartbeats',
      description:
        'While on duty, AttendSure keeps campus GPS status updated efficiently and queues pings safely offline if mobile data drops, then stops right away on Time Out.',
      illustration: 'campus-gps',
    },
    {
      id: 'm-staff-passes-dtr',
      badgeText: 'Step 3 • Locator Slips & Form 48',
      title: 'File Locator Slips & Submit Form 48 DTR',
      description:
        'Submit official business Locator Slips under Passes, review your monthly DTR under Account -> Daily Time Record, and open User Manual anytime for quick fixes.',
      illustration: 'reports-pack',
    },
  ],
};

export const getMobileOnboardingSteps = (profile: UserProfileKey): MobileOnboardingStep[] =>
  STEPS_BY_PROFILE[profile] || STEPS_BY_PROFILE.TEACHER_TEACHING;
