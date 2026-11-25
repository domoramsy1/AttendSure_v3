# AttendSure Mobile — Developer & Architecture Guide

This folder contains the **AttendSure Mobile** companion app for school staff (System Admin, School Principal, Department Head, Teaching Teachers / Advisers, and Non-Teaching School Staff).

It is built with **Expo SDK 58**, **React Native 0.88**, **React 19.3**, **TypeScript**, and **React Navigation (`@react-navigation/native` + `@react-navigation/native-stack`)**.

> **Important:** This app does **not** use Expo Router (`src/app/`). All navigation lives in `App.tsx`, `src/navigation/AppNavigator.tsx`, and `src/navigation/MainTabNavigator.tsx`.

---

## 1. Commands

Run commands inside `mobile/`:

```bash
npm install                   # Install dependencies
npx expo install <package>    # Add or update Expo-compatible native packages
npx expo start                # Start Expo dev server
npx expo start --android      # Launch on Android device / emulator
npx expo start --ios          # Launch on iOS simulator
npx tsc --noEmit              # Run TypeScript type checks
```

Always check `package.json` for exact package versions before adding or updating native modules, and run `npx tsc --noEmit` plus `python ../scripts/audit_codebase.py` before finishing changes.

---

## 2. Navigation Architecture

### Root Stack (`App.tsx` -> `src/navigation/AppNavigator.tsx`)
- `App.tsx` wraps the app in `SafeAreaProvider` -> `ThemeProvider` -> `AuthProvider` -> `NavigationContainer` with a branded `SplashScreen` overlay.
- `AppNavigator.tsx` wraps authenticated screens inside a single `TeacherDutyLocationProvider` (preventing duplicate foreground GPS watchers) and uses `createNativeStackNavigator<RootStackParamList>()`:
  - Signed out: `Login` (`LoginScreen`)
  - Signed in:
    - `Main` (`MainTabNavigator`)
    - `ProfileSettings` (`ProfileSettingsScreen`)
    - `Reports` (`ReportsScreen`)

### 5-Tab Bottom Navigation Dock (`src/navigation/MainTabNavigator.tsx`)
`MainTabNavigator.tsx` renders a floating 5-tab dock adapted to the signed-in staff member's permissions (`canScanStudentQr(user)` and `canViewTab(user, tab)`), plus the auto-launching `OnboardingGuideModal` (once on first sign-in, replayable anytime via `attendsure:open-onboarding-tour`) and `ScheduleAlarmModal`:

1. **`Overview`** (`home` -> `DashboardScreen`): Daily attendance summary, live teacher duty status from `TeacherDutyLocationContext`, and quick shortcuts.
2. **`Scanner`** / **`Time In/Out`** (`scanner` -> `ScannerScreen`):
   - Composed from focused sub-components under `src/components/scanner/`: `StudentQrScannerMode.tsx` (back-camera `expo-camera` student QR scanning with offline local queue auto-sync) and `TeacherCheckInMode.tsx` (on-device phone lock + Ed25519 challenge-response signing + campus GPS Time In / Time Out).
   - Non-teaching staff (`can_handle_classes=False`) see Teacher Time In/Out only (student QR mode is hidden).
3. **`Geofence`** (`geofence` -> `GeofenceStatusScreen`): Live campus GPS boundary distance, phone health indicators (battery percentage, charging status, network type, GPS on/off, battery saver), outside-campus alerts, and **`TEACHER_SIGNAL_LOST` ("Teacher Phone Signal Lost")** alert filters.
4. **`Passes`** (`gate_pass` -> `GatePassScreen`): Student Exit Passes (hidden for non-teaching staff) and Teacher Official Locator Slips.
5. **`Account`** (`menu` -> `MenuScreen`): Account menu and sub-screens rendered inside `MainTabNavigator`:
   - `class_list` -> `AdvisoryMatrixScreen` (hidden for non-teaching staff)
   - `students` -> `StudentsScreen` (hidden for non-teaching staff)
   - `teachers` -> `TeachersScreen` (school leaders only)
   - `schedules` -> `SchedulesScreen` (school leaders only)
   - `users` -> `UsersScreen` (`ADMIN` only)
   - `sardo_safety` -> `SardoSafetyScreen` (hidden for non-teaching staff)
   - `reports` -> `ReportsScreen` (DepEd SF1, SF2, SF4; SF4 restricted to school leaders; split with `src/components/reports/ReportPageSetupModal.tsx`, `ReportPackScopeFilter.tsx`, `ReportScheduleClassListPreview.tsx`)
   - `calendar` -> `CalendarScreen` (school holidays, suspensions, and schedules)
   - `dtr` -> `DTRReportView` (CSC Form 48 Daily Time Record with monthly submission and leader switcher)
   - `help` -> `UserManualScreen` (searchable everyday-English 8-section User Manual with role filters, expandable FAQs, and "Start Animated Walkthrough" launcher)
   - `settings` -> `SettingsScreen` (profile, password, 3 logos, maintenance, audit logs including `BULK_ABSENT`, alarms, theme mode, and help shortcuts)

---

## 3. Role-Based Access Control (`src/utils/permissions.ts`)

`mobile/src/utils/permissions.ts` mirrors `web/src/utils/permissions.ts` and `backend/common/permissions.py` across all **5 staff profiles**:
- `ADMIN`
- `PRINCIPAL`
- `DEPT_HEAD`
- `TEACHER` with `can_handle_classes=true` (teaching teacher / homeroom adviser)
- `TEACHER` with `can_handle_classes=false` (non-teaching school staff)

Never hardcode inline role string checks inside screens; always call the exported helpers (`canScanStudentQr`, `canIssueStudentExitPass`, `canApproveOrCancelLocatorSlip`, `canViewClassList`, `canViewReports`, `canViewSf4`, `canEditGeofence`, `canResolveLoafing`, `canResetBoundDevice`, `canViewTab`). Gate 3 of `scripts/audit_codebase.py` validates this file automatically.

---

## 4. Centralized Theme Tokens & UI Rules

- **Single Source of Truth:** `mobile/src/theme/tokens.ts` defines `PALETTES` (`light`, `dark`, `high-contrast`), `FONTS`, `SPACING`, `RADIUS`, `QR_COLORS`, and `SCANNER_OVERLAY_COLORS`.
- **Re-Export & Shared Styles:** `mobile/src/constants/theme.ts` re-exports all tokens from `../theme/tokens` and provides `createUiStyles(palette)`, `isSafeUrl()`, `cleanText()`, and `getFriendlyErrorMessage()`.
- **Strict Audit Gate 5 Rule:** **Never write hardcoded hex colors (`#xxxxxx`) inside `mobile/src/screens/*.tsx`.** Always read colors from `useThemeMode().palette` or exported tokens from `../constants/theme`.
- **Plain-English Vocabulary Rule:** Always use **teacher** (or **adviser**) and **class list** in UI copy, comments, and identifiers. Never introduce banned vocabulary or foreign acronyms.

---

## 5. Built-In Camera, On-Device Verification & Campus GPS Services

| Service / Context File | What It Does |
|---|---|
| `src/services/biometricService.ts` | Uses `expo-local-authentication` (`getEnrolledLevelAsync`, `authenticateAsync` with `disableDeviceFallback: false`) so teachers verify identity via phone **Face Unlock, Fingerprint, or PIN/Pattern**. Generates and stores a per-user **Ed25519 asymmetric key pair** (`@noble/curves/ed25519.js` + `@noble/hashes/sha2.js`) inside `expo-secure-store`, sends only the public key & key ID during device enrollment, and signs every Time In / Time Out challenge payload (`userId:deviceId:timestampMs:action:nonce`) locally. Zero raw face photos or private keys ever leave the phone. |
| `src/services/deviceService.ts` | Creates and caches a 1-to-1 hardware-backed phone UUID (`attendsure_hardware_device_uuid`) in `expo-secure-store` (with Android ID / iOS Vendor ID or random cryptographic fallback) sent on teacher check-ins and GPS pings to prevent proxy clock-ins. |
| `src/context/TeacherDutyLocationContext.tsx` | Mounted once inside `AppNavigator.tsx` to manage the single foreground GPS watcher and heartbeat loop while a teacher is on duty, eliminating overlapping 45-second intervals across `DashboardScreen`, `GeofenceStatusScreen`, and `MainTabNavigator`, with clean stop on Time Out or sign-out. |
| `src/services/telemetryService.ts` | Collects live GPS coordinates + phone health telemetry (`battery_percent`, `is_charging`, `is_low_power_mode`, `network_type`, `is_gps_enabled`, `app_state`, `ping_source`) and sends pings (`POST /api/v1/campus/ping/`). Rejects mocked GPS (`loc.mocked`), invalid coordinates, and weak GPS accuracy (> 250 m), and queues failed pings into the unified offline GPS queue without stripping fields. |
| `src/services/backgroundLocation.ts` | Registers **`ATTENDSURE_TEACHER_DUTY_GPS_TASK`** via `expo-task-manager` and `expo-location` (`timeInterval: 60000` / 60s, `distanceInterval: 0` so stationary teachers inside classrooms still send periodic duty heartbeats) with an Android foreground notification. Uses the same unified offline GPS queue on failure and automatically stops on Time Out or sign-out. |
| `src/services/offlineQueue.ts` | Single unified offline queue for both student QR scans (`attendsure_offline_qr_scans`, synced via `POST /api/v1/attendance/offline-sync/` with `client_scan_uuid`) and foreground/background campus GPS heartbeats (`attendsure_unified_gps_queue_v3`, with automatic one-time migration/drain from legacy keys `attendsure_bg_gps_queue_v2` and ping items in `attendsure_offline_queue`). Preserves original `recorded_at`, `gps_timestamp_ms`, phone health telemetry, and sets `ping_source: 'OFFLINE_QUEUE'` on sync. |
| `src/context/AuthContext.tsx`, `src/services/authService.ts` & `src/api/client.ts` | Standardized on **JWT access + refresh tokens** stored in `expo-secure-store` with proactive expiry checks and single-flight silent `401` refresh (`/api/v1/accounts/token/refresh/`). Sign-out posts the device's `refresh` token to `/api/v1/accounts/logout/` (blacklisting only that device even if the access token already expired). |
| `src/services/soundService.ts` | Plays clear audio feedback cues on successful, duplicate, or invalid student QR camera scans and schedule alarms. |

---

## 6. Key Project Structure

```text
mobile/
├── App.tsx                          # Providers + NavigationContainer + SplashScreen
├── app.json                         # Expo SDK 58 config, camera/location/biometric permissions & plugins
├── package.json                     # Dependencies (@noble/curves, expo-*, react-native-svg, etc.)
└── src/
    ├── api/                         # client.ts (JWT Bearer + silent refresh), endpoints.ts (all /api/v1/)
    ├── branding/                    # AttendSureLogo, AttendSureBadge, BrandLogos
    ├── components/
    │   ├── common/                  # ChipRow, ImageUploadField, ScheduleAlarmModal, etc.
    │   ├── help/                    # manualContent, onboardingSteps, OnboardingIllustrations, OnboardingGuideModal
    │   ├── reports/                 # DTRReportView, ReportPageSetupModal, ReportPackScopeFilter, ReportScheduleClassListPreview
    │   ├── scanner/                 # StudentQrScannerMode, TeacherCheckInMode
    │   └── settings/                # AuditLogsSection, MaintenanceSection, SchoolSetupSection
    ├── constants/theme.ts           # Re-exports theme/tokens.ts + shared UI styles & error formatters
    ├── context/                     # AuthContext, ThemeContext, TeacherDutyLocationContext
    ├── navigation/                  # AppNavigator (native-stack + GPS provider), MainTabNavigator (5-tab dock)
    ├── screens/                     # Dashboard, Scanner, GeofenceStatus, GatePass, Menu, AdvisoryMatrix, Calendar, Reports, Students, Teachers, Schedules, Users, SardoSafety, Settings, UserManual, ProfileSettings, Login
    ├── services/                    # biometricService, deviceService, telemetryService, backgroundLocation, offlineQueue, authService, configService, soundService, scheduleAlarmService, teacherService
    ├── theme/tokens.ts              # Centralized color palettes (light, dark, high-contrast) & typography
    ├── types/                       # TypeScript interfaces
    └── utils/                       # permissions.ts, alertLabels.ts, formatters.ts, helpers.ts
```

---

## 7. Security & Native Build Rules

- Configure permissions and native plugins (`expo-local-authentication`, `expo-location`, `expo-splash-screen`) in `app.json`; do not hand-edit generated `ios/` or `android/` folders if Continuous Native Generation is used.
- Keep `isSafeUrl()` checks on all remote media URLs (`photo_url`, school logos) before rendering images.
- Never log auth tokens, `expo-secure-store` Ed25519 private keys, or raw student personal details to console output.
- Always enforce offline queue endpoint validation (`isAllowedRelativeEndpoint`) and discard mocked GPS coordinates locally before queuing or transmitting.
