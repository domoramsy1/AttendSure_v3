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
- `AppNavigator.tsx` uses `createNativeStackNavigator<RootStackParamList>()`:
  - Signed out: `Login` (`LoginScreen`)
  - Signed in:
    - `Main` (`MainTabNavigator`)
    - `ProfileSettings` (`ProfileSettingsScreen`)
    - `Reports` (`ReportsScreen`)

### 5-Tab Bottom Navigation Dock (`src/navigation/MainTabNavigator.tsx`)
`MainTabNavigator.tsx` renders a floating 5-tab dock adapted to the signed-in staff member's permissions (`canScanStudentQr(user)` and `canViewTab(user, tab)`):

1. **`Overview`** (`home` -> `DashboardScreen`): Daily attendance summary, quick shortcuts, and live status.
2. **`Scanner`** / **`Check-In`** (`scanner` -> `ScannerScreen`):
   - Label shows **`Scanner`** for school leaders and teaching teachers (`can_handle_classes=True`), offering dual-mode Student QR back-camera scanning (`expo-camera`) and Teacher Phone Lock + Campus GPS Check-In.
   - Label shows **`Check-In`** for non-teaching staff (`can_handle_classes=False`), showing Teacher Phone Lock + Campus GPS Check-In only (student QR mode is hidden).
3. **`Geofence`** (`geofence` -> `GeofenceStatusScreen`): Live campus GPS boundary distance, signal strength, duty pings, and outside-campus alert status.
4. **`Passes`** (`gate_pass` -> `GatePassScreen`): Student Exit Passes (hidden for non-teaching staff) and Teacher Official Locator Slips.
5. **`Account`** (`menu` -> `MenuScreen`): Account menu and sub-views rendered inside `MainTabNavigator`:
   - `class_list` -> `AdvisoryMatrixScreen` (hidden for non-teaching staff)
   - `reports` -> `ReportsScreen` (DepEd SF1, SF2, SF4; SF4 restricted to school leaders, hidden for non-teaching staff)
   - `calendar` -> `CalendarScreen` (school holidays, suspensions, and schedules)
   - `dtr` -> `DTRReportView` (CSC Form 48 Daily Time Record with monthly submission)
   - `settings` -> `SettingsScreen` (profile, password, server URL, and theme mode)

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

| Service File | What It Does |
|---|---|
| `src/services/biometricService.ts` | Uses `expo-local-authentication` (`getEnrolledLevelAsync`, `authenticateAsync` with `disableDeviceFallback: false`) so teachers verify identity via phone **Face Unlock, Fingerprint, or PIN/Pattern**. Generates a per-user secret inside `expo-secure-store` and computes a SHA-256 `keyId` and non-replayable `proofHash` via `expo-crypto`. Zero raw face photos or biometric data ever leave the phone. |
| `src/services/deviceService.ts` | Creates and caches a 1-to-1 hardware-backed phone UUID (`attendsure_hardware_device_uuid`) in `expo-secure-store` (with Android ID / iOS Vendor ID or random cryptographic fallback) sent on teacher check-ins and GPS pings to prevent proxy clock-ins. |
| `src/services/telemetryService.ts` | Sends live campus GPS pings (`POST v1/campus/ping/`) throttled to `ADAPTIVE_PING_INTERVAL_MS = 45000` (45 seconds). Rejects mocked GPS (`loc.mocked`), invalid coordinates, and weak GPS accuracy (> 250 m) before calling the API. Queues pings offline on transient network failure. |
| `src/services/backgroundLocation.ts` | Registers `ATTENDSURE_BACKGROUND_GEOFENCE` via `expo-task-manager` and `expo-location` (`timeInterval: 45000`, `distanceInterval: 10`) with an Android foreground notification. Only transmits while `attendsure_teacher_on_duty === 'true'` (automatically stops on clock-out). |
| `src/services/offlineQueue.ts` | Persists offline student QR scans (`attendsure_offline_qr_scans`, synced in batches via `POST v1/attendance/offline-sync/` using unique `client_scan_uuid`) and offline campus pings/actions (`attendsure_offline_queue`) in `AsyncStorage`. Drops pings older than 24 hours, drops permanent 4xx errors (`400`, `403`, `404`, `409`), pauses on `401`, and retries transient network failures up to 8 times. |
| `src/services/authService.ts` & `src/api/client.ts` | Manages JWT / DRF token storage, dynamic school server URL (`configService.ts`), request timeouts, and automatic token refresh. |
| `src/services/soundService.ts` | Plays clear audio feedback cues on successful, duplicate, or invalid student QR camera scans. |

---

## 6. Key Project Structure

```text
mobile/
├── App.tsx                          # Providers + NavigationContainer + SplashScreen
├── app.json                         # Expo SDK 58 config, camera/location/biometric permissions & plugins
├── package.json                     # Dependencies and npm scripts
└── src/
    ├── api/                         # client.ts, endpoints.ts
    ├── branding/                    # AttendSureLogo, AttendSureBadge, BrandLogos
    ├── components/                  # ScreenWrapper, ServerConfigModal, SplashScreen, common/*, reports/*
    ├── constants/theme.ts           # Re-exports theme/tokens.ts + shared UI styles & error formatters
    ├── context/                     # AuthContext, ThemeContext
    ├── navigation/                  # AppNavigator (native-stack), MainTabNavigator (5-tab dock)
    ├── screens/                     # Dashboard, Scanner, GeofenceStatus, GatePass, Menu, AdvisoryMatrix, Calendar, Reports, DTR, Settings, ProfileSettings, Login
    ├── services/                    # biometricService, deviceService, telemetryService, backgroundLocation, offlineQueue, authService, configService, soundService, teacherService
    ├── theme/tokens.ts              # Centralized color palettes (light, dark, high-contrast) & typography
    ├── types/                       # TypeScript interfaces
    └── utils/                       # permissions.ts, formatters.ts
```

---

## 7. Security & Native Build Rules

- Configure permissions and native plugins (`expo-local-authentication`, `expo-location`, `expo-splash-screen`) in `app.json`; do not hand-edit generated `ios/` or `android/` folders if Continuous Native Generation is used.
- Keep `isSafeUrl()` checks on all remote media URLs (`photo_url`, school logos) before rendering images.
- Never log auth tokens, `expo-secure-store` biometric secrets, or raw student personal details to console output.
- Always enforce offline queue endpoint validation (`isAllowedRelativeEndpoint`) and discard mocked GPS coordinates locally before queuing or transmitting.
