# AttendSure v3 — Project Rules

AttendSure v3 is a pure-software DepEd school attendance, campus GPS monitoring, and school reporting platform made of three apps:
- `backend/` — Django 6.1.1 + DRF + PostgreSQL 16 + Redis + Celery (apps: `accounts`, `school`, `students`, `attendance`, `campus`, `reports`; shared helpers in `common/`).
- `web/` — React 19 + Vite 8 + TypeScript (`web/src/api/client.ts`, `web/src/theme/tokens.ts`, `web/src/utils/permissions.ts`).
- `mobile/` — Expo SDK 58 + React Native 0.88 + TypeScript + React Navigation (`AppNavigator.tsx`, `MainTabNavigator.tsx`; not Expo Router).
- `scripts/audit_codebase.py` — 8 automated project checks that must always pass.

## Non-Negotiable Product & Language Rules
1. **Simple, clear English everywhere:** Use everyday words in all labels, alerts, comments, variable names, and explanations. Always use **teacher** (or **adviser** for homeroom advisers) and **class list**. Never use banned old staff or list words in code, comments, database columns, or screens.
2. **Pure software only:** Record student attendance strictly with the built-in camera on a teacher's laptop, PC webcam, or phone inside AttendSure using signed student QR IDs and offline local queue sync. Record teacher attendance strictly with on-device phone lock checks, 1-to-1 phone binding, and campus GPS check-ins on the teacher's own phone (never save raw face photos on the server). Send parent attendance and exit pass alerts strictly through real-time mobile app push notifications. Never add or suggest external scanning hardware, gate hardware, cards, extra guard roles, or text-message alerts.
3. **Real data only:** Never write fake data, mock records, or placeholder names unless explicitly asked. Always query the live database.
4. **Complete code only:** Always provide full, clean, ready-to-run code with no skipped placeholders.
5. **Security:** Validate all inputs and check image/file URLs (`isSafeImageUrl` on Web, `isSafeUrl` on Mobile), escape HTML in print templates (`escapeHtml`), and clean CSV cells (`sanitizeCsvCell`).

## Core Technical Rules
1. **Canonical API routes:** Put all API calls under `/api/v1/` (`backend/config/urls.py`). Do not add routes to `legacy_urls.py`.
2. **Synced 5-role permissions:** Keep `backend/common/permissions.py`, `web/src/utils/permissions.ts`, and `mobile/src/utils/permissions.ts` aligned for `ADMIN`, `PRINCIPAL`, `DEPT_HEAD`, teaching `TEACHER`, and non-teaching `TEACHER`.
3. **Active students:** Treat both `"ENROLLED"` and `"TRANSFERRED_IN"` as active enrolled students across QR scanning, class lists, adviser views, exit passes, QR cards, and reports.
4. **Manila timezone safety:** Never use `date.today()` or `field__date=...` on datetime fields. Always use `timezone.localdate()` and `common.time_utils.local_day_bounds()` / `local_month_bounds()`, and format times in 12-hour AM/PM.

## Required Checks Before Finishing Any Edit
Run these commands and fix any failures before finishing:
1. `.\backend\venv\Scripts\python.exe backend\manage.py test apps.accounts apps.attendance apps.campus apps.school apps.reports`
2. `cd web && npx tsc --noEmit`
3. `cd mobile && npx tsc --noEmit`
4. `.\backend\venv\Scripts\python.exe scripts\audit_codebase.py`