// Official Reports
export * from './SF1ReportTab';
export * from './SF2ReportTab';
export * from './SF4ReportTab';

// Explicit re-export from SF4ReportTab where MetricTriplet is declared
export type { MetricTriplet } from './SF4ReportTab';

// Gate Access & Hardware Scanners
export * from './GateLogsTab';
export * from './ScannersTab';
export * from './GatePassesTab';

// People & Accounts
export * from './StudentsTab';
export * from './TeachersTab';
export * from './UsersTab';

// Academics, Attendance & Schedules
export * from './DTRTab';
export * from './SchedulesTab';

// Campus Boundary & System Configuration
export * from './GeofenceTab';
export * from './SettingsTab';