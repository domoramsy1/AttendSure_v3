// AttendSure Web - Role-Tailored Interactive Onboarding Steps
// File: D:\AttendSure_V3\web\src\components\help\onboardingSteps.ts

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

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  illustration: OnboardingIllustrationKey;
  targetSelector?: string;
  tip?: string;
  badgeText: string;
}

const STEPS_BY_PROFILE: Record<UserProfileKey, OnboardingStep[]> = {
  ADMIN: [
    {
      id: 'admin-welcome',
      badgeText: 'School System Admin',
      title: 'Welcome to AttendSure',
      description:
        'Everything your school needs for student QR attendance, verified teacher mobile Time In/Out, campus GPS safety, and DepEd forms runs cleanly in one place.',
      illustration: 'welcome',
      targetSelector: '[data-tour="dashboard"]',
      tip: 'You can replay this guided tour or open the searchable User Manual anytime from the Help button at the top.',
    },
    {
      id: 'admin-school-setup',
      badgeText: 'Step 1 • School Setup',
      title: 'Configure School Info, Seals & Accounts',
      description:
        'Start in System Settings and User Accounts to upload your school logos, verify your school year, and set up accounts for Principals, Department Heads, and Teachers.',
      illustration: 'school-setup',
      targetSelector: '[data-tour="settings"]',
      tip: 'You can also reset a teacher’s 1-to-1 phone lock in Teachers Directory whenever a staff member replaces their phone.',
    },
    {
      id: 'admin-geofence',
      badgeText: 'Step 2 • Campus GPS & Health',
      title: 'Set Campus Boundary & Watch Phone Health',
      description:
        'Open Geofence & Loafing to draw your school GPS perimeter, monitor live teacher battery/network/GPS status, and catch Teacher Phone Signal Lost alerts early.',
      illustration: 'campus-gps',
      targetSelector: '[data-tour="geofence"]',
    },
    {
      id: 'admin-qr-offline',
      badgeText: 'Step 3 • Pure Software QR',
      title: 'Camera QR Scanning & Offline Sync',
      description:
        'Teachers record student attendance using only their built-in laptop webcam or phone camera. Scans work even without internet and sync automatically once back online.',
      illustration: 'offline-sync',
      targetSelector: '[data-tour="classroom-scanner"]',
    },
    {
      id: 'admin-reports',
      badgeText: 'Step 4 • Official DepEd Forms',
      title: 'Generate SF1, SF2, SF4 & CSC Form 48',
      description:
        'Open DepEd Reports and DTR anytime to review real-time attendance summaries, SARDO early warnings, and ready-to-print official school forms.',
      illustration: 'reports-pack',
      targetSelector: '[data-tour="reports"]',
    },
    {
      id: 'admin-manual',
      badgeText: 'Always Available',
      title: 'Open the User Manual Anytime',
      description:
        'Click the Help / User Manual button in the top bar whenever you want quick fixes, role guides, or to replay this walkthrough.',
      illustration: 'exit-pass',
      targetSelector: '[data-tour="help-manual"]',
    },
  ],

  PRINCIPAL: [
    {
      id: 'principal-welcome',
      badgeText: 'School Principal',
      title: 'Welcome, School Leader',
      description:
        'Monitor campus-wide student attendance, verified teacher presence, SARDO early warnings, and official DepEd reports from one real-time dashboard.',
      illustration: 'welcome',
      targetSelector: '[data-tour="dashboard"]',
      tip: 'All counts and charts come straight from live verified scans and check-ins.',
    },
    {
      id: 'principal-geofence',
      badgeText: 'Campus Monitoring',
      title: 'Live Campus Presence & Phone Health',
      description:
        'In Geofence & Loafing, track on-duty teachers inside campus, inspect phone battery and GPS health, and review outside-campus or Teacher Phone Signal Lost alerts.',
      illustration: 'campus-gps',
      targetSelector: '[data-tour="geofence"]',
    },
    {
      id: 'principal-passes',
      badgeText: 'Approvals & Safety',
      title: 'Approve Locator Slips & Exit Passes',
      description:
        'Use Exit & Travel Passes to approve official teacher locator slips and issue student exit passes after reviewing a parent’s hardcopy excuse letter.',
      illustration: 'exit-pass',
      targetSelector: '[data-tour="gate-passes"]',
    },
    {
      id: 'principal-reports',
      badgeText: 'DepEd & CSC Forms',
      title: 'Review SF1, SF2, SF4 & Teacher DTRs',
      description:
        'Inspect school-wide SF4 monthly movement, approve submitted CSC Form 48 Daily Time Records, and run Emergency Roll-Calls under SARDO & Safety.',
      illustration: 'reports-pack',
      targetSelector: '[data-tour="reports"]',
    },
    {
      id: 'principal-manual',
      badgeText: 'Help & Walkthrough',
      title: 'Searchable User Manual Ready Anytime',
      description:
        'Need a quick refresher or want to show a new teacher how AttendSure works? Click User Manual in the top bar anytime.',
      illustration: 'school-setup',
      targetSelector: '[data-tour="help-manual"]',
    },
  ],

  DEPT_HEAD: [
    {
      id: 'dept-welcome',
      badgeText: 'Department Head',
      title: 'Welcome to Your Department Hub',
      description:
        'Coordinate class schedules, verify teacher attendance, check class lists, and review official attendance reports smoothly.',
      illustration: 'welcome',
      targetSelector: '[data-tour="dashboard"]',
    },
    {
      id: 'dept-schedules',
      badgeText: 'Schedules & Classes',
      title: 'Manage Class Lists & Schedules',
      description:
        'Use Academic Setup and Students to organize sections, subjects, rooms, and enrolled or transferred-in learners across your department.',
      illustration: 'school-setup',
      targetSelector: '[data-tour="schedules"]',
    },
    {
      id: 'dept-scanner',
      badgeText: 'Classroom Attendance',
      title: 'Scan Student QR IDs with Built-In Camera',
      description:
        'Open QR Scanner to take period attendance using your laptop webcam or phone camera. If Wi-Fi drops, scans queue locally and sync automatically.',
      illustration: 'qr-scan',
      targetSelector: '[data-tour="classroom-scanner"]',
    },
    {
      id: 'dept-geofence-dtr',
      badgeText: 'Duty & DTR Approval',
      title: 'Track Campus GPS & Approve Form 48 DTRs',
      description:
        'Check live teacher campus status and phone health in Geofence & Loafing, then review and approve monthly CSC Form 48 time sheets under DTR.',
      illustration: 'campus-gps',
      targetSelector: '[data-tour="dtr"]',
    },
    {
      id: 'dept-reports',
      badgeText: 'Reports & Help',
      title: 'Print DepEd Forms & Open Manual Anytime',
      description:
        'Export clean SF1, SF2, and SF4 reports under DepEd Reports, and click User Manual at the top whenever you need quick answers.',
      illustration: 'reports-pack',
      targetSelector: '[data-tour="help-manual"]',
    },
  ],

  TEACHER_TEACHING: [
    {
      id: 'teacher-welcome',
      badgeText: 'Classroom Teacher / Adviser',
      title: 'Welcome to AttendSure',
      description:
        'Take fast student QR attendance using your built-in camera, track your advisory class list, and keep your monthly Form 48 DTR automatically updated.',
      illustration: 'welcome',
      targetSelector: '[data-tour="dashboard"]',
      tip: 'No extra hardware needed — everything works with your laptop webcam and personal phone.',
    },
    {
      id: 'teacher-qr-scan',
      badgeText: 'Step 1 • Student Attendance',
      title: 'Scan Student QR IDs in Seconds',
      description:
        'Open QR Scanner, pick your active class period, and show each student’s signed QR ID to your webcam or phone camera. Your class list and DepEd forms update right away.',
      illustration: 'qr-scan',
      targetSelector: '[data-tour="classroom-scanner"]',
    },
    {
      id: 'teacher-offline',
      badgeText: 'Step 2 • Works Even Offline',
      title: 'Offline Queue Protects Every Scan',
      description:
        'If classroom Wi-Fi disconnects, keep scanning! AttendSure saves each scan safely with its exact Manila timestamp and uploads everything automatically once online.',
      illustration: 'offline-sync',
      targetSelector: '[data-tour="my-classes"]',
    },
    {
      id: 'teacher-phone-lock',
      badgeText: 'Step 3 • Your Daily Time In / Out',
      title: 'Private Phone Lock & Campus GPS on Mobile',
      description:
        'Record your own Time In and Time Out on the AttendSure mobile app inside school grounds using your phone lock. Zero face photos or private keys ever leave your phone.',
      illustration: 'phone-lock',
      targetSelector: '[data-tour="dtr"]',
    },
    {
      id: 'teacher-advisory-reports',
      badgeText: 'Step 4 • Advisory & DepEd Forms',
      title: 'Spot Class Cutting & Print SF1 / SF2',
      description:
        'Check Advisory to see period-by-period student attendance, issue Student Exit Passes when needed, and print ready-to-sign SF1, SF2, and Form 48 sheets.',
      illustration: 'reports-pack',
      targetSelector: '[data-tour="reports"]',
    },
    {
      id: 'teacher-help',
      badgeText: 'Need a Quick Fix?',
      title: 'Your User Manual Is One Click Away',
      description:
        'Click User Manual in the top bar anytime for step-by-step instructions, GPS tips, or to replay this animated guide.',
      illustration: 'exit-pass',
      targetSelector: '[data-tour="help-manual"]',
    },
  ],

  TEACHER_NON_TEACHING: [
    {
      id: 'staff-welcome',
      badgeText: 'Non-Teaching School Staff',
      title: 'Welcome to AttendSure',
      description:
        'AttendSure makes your daily campus Time In/Out, official travel locator slips, and monthly CSC Form 48 DTR quick and paperless.',
      illustration: 'welcome',
      targetSelector: '[data-tour="dashboard"]',
    },
    {
      id: 'staff-phone-lock',
      badgeText: 'Step 1 • Mobile Time In / Out',
      title: 'Verify with Your Own Phone Lock & GPS',
      description:
        'Use the AttendSure mobile app inside school grounds to tap Time In and Time Out with your phone Face Unlock, Fingerprint, or PIN. Zero face photos ever leave your phone.',
      illustration: 'phone-lock',
      targetSelector: '[data-tour="dtr"]',
      tip: 'Your phone pairs 1-to-1 with your account on your very first verified Time In.',
    },
    {
      id: 'staff-passes',
      badgeText: 'Step 2 • Official Business Travel',
      title: 'File Official Locator Slips Online',
      description:
        'Leaving campus for division errands or official business? Submit a Locator Slip under Exit & Travel Passes so campus monitoring marks you as Authorized Off-Campus.',
      illustration: 'campus-gps',
      targetSelector: '[data-tour="gate-passes"]',
    },
    {
      id: 'staff-dtr',
      badgeText: 'Step 3 • Monthly DTR',
      title: 'Review & Submit Your Form 48 DTR',
      description:
        'Open My DTR at the end of the month to check your verified Manila-time arrival and departure logs and send your CSC Form 48 for approval.',
      illustration: 'reports-pack',
      targetSelector: '[data-tour="dtr"]',
    },
    {
      id: 'staff-help',
      badgeText: 'Always Here to Help',
      title: 'Open the User Manual Anytime',
      description:
        'Click User Manual in the top bar anytime for phone setup tips, GPS troubleshooting, or to replay this guide.',
      illustration: 'exit-pass',
      targetSelector: '[data-tour="help-manual"]',
    },
  ],
};

export const getOnboardingStepsForProfile = (profile: UserProfileKey): OnboardingStep[] =>
  STEPS_BY_PROFILE[profile] || STEPS_BY_PROFILE.TEACHER_TEACHING;
