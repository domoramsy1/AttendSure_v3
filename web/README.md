# AttendSure Web Portal

The **AttendSure Web Portal** is the pure-software browser app for school administrators, principals, department heads, teachers, and homeroom advisers. Built with **React 19**, **TypeScript**, and **Vite 8**, it runs on existing school laptops and desktop computers with built-in webcams — no extra scanner devices required.

---

## Quick Setup

Make sure the Django backend API is running first (default `http://127.0.0.1:8000`), then start the web portal from the `web/` directory:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Vite development server on port `5173` with `/api` and `/media` proxying to `http://127.0.0.1:8000`. |
| `npm run build` | Runs TypeScript build checks (`tsc -b`) and bundles the production app into `web/dist/`. |
| `npm run preview` | Serves the production build locally for final verification. |
| `npx tsc --noEmit` | Runs strict TypeScript typechecking without writing output files. |
| `npm run lint` | Runs ESLint across the web source tree. |

---

## Environment Variables

Create a `web/.env.local` file when connecting to a custom API server:

```env
# Optional: override the backend API origin (without trailing /api/v1)
VITE_API_BASE_URL=http://localhost:8000

# Optional: request timeout in milliseconds (default: 10000)
VITE_API_TIMEOUT_MS=10000
```

When `VITE_API_BASE_URL` is omitted:
- Local and LAN hosts (`localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `172.x.x.x`) automatically connect to port `8000` on the same host.
- Deployed production domains use the same origin (routed through Nginx).

> **Camera Note:** Browser webcam access (`navigator.mediaDevices.getUserMedia`) requires a secure context (`https://` or `http://localhost`).

---

## Key Capabilities

### 1. Built-In Webcam QR Scanning & Offline Sync
- Uses the computer's built-in webcam with `jsqr` to scan HMAC-SHA256 signed student QR ID cards (`ATTENDSURE:...`) directly in the browser (`ClassroomScanner.tsx`).
- Prioritizes class periods scheduled for the current weekday (`ALL_WEEKDAYS`, `MWF`, `TTH`, or single days) while keeping off-day periods selectable for make-up sessions.
- Saves scans automatically in browser `localStorage` (`attendsure_offline_qr_queue`) whenever school Wi-Fi drops, then uploads them cleanly through `POST /api/v1/attendance/offline-sync/` with duplicate-safe scan IDs once the connection returns.

### 2. Campus GPS Boundary Map Overview
- Uses locally bundled **Leaflet** maps (Roads and Satellite layers) in `GeofenceTab.tsx` to display the campus center pin, active school boundary circle, and live teacher status pins.
- Supports configurable campus boundary radii from **20 to 5000 meters** (matched across School Settings, Campus Geofence, Mobile, and backend validation).
- Displays live teacher duty states (**On Campus**, **Official Exit Pass**, **Outside Campus (Off Duty)**, **Offline**, and **Loafing Alert**), supports 1-to-1 bound phone reset for principals and admins, and exports campus location logs to CSV.
- Teacher Time In / Time Out itself happens on the teacher's bound mobile phone using on-device face/fingerprint/PIN verification and live campus GPS — zero raw face photos or biometric templates are stored on the server.

### 3. Official DepEd Forms & CSC Form 48 Exports
- **DepEd SF1 (School Register):** Section class list with learner details, addresses, and guardian contact information.
- **DepEd SF2 (Daily Attendance Report of Learners):** Monthly student attendance grid with automatic present, late, absent, and cutting totals.
- **DepEd SF4 (Monthly Learner Movement and Attendance):** School-wide summary for school leaders and department heads.
- **CSC Form 48 (Daily Time Record / DTR):** Monthly teacher check-in and check-out logs with teacher submission and Department Head / Principal approval.
- **Print & Export Packets:** Print-ready HTML/PDF and CSV exports for class schedules, class lists, student QR ID cards, and teacher directories, all branded with the school's uploaded seals from School Settings.

### 4. Role Access, Languages & Display Modes
- Enforces the shared 5-profile staff access control rules (`ADMIN`, `PRINCIPAL`, `DEPT_HEAD`, teaching `TEACHER`, and non-teaching `TEACHER`) in `src/utils/permissions.ts`.
- Includes **Light**, **Dark**, and **High-Contrast** color modes (`ThemeContext.tsx`) and **English / Filipino** labels (`ComplianceContext.tsx`).
