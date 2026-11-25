/**
 * AttendSure Mobile - Centralized Role-Based Access Control (RBAC) Permission Matrix
 * File: mobile/src/utils/permissions.ts
 *
 * Mirrors web/src/utils/permissions.ts for the exact 5-profile visibility matrix:
 *  - ADMIN (System Administrator)
 *  - PRINCIPAL (School Principal)
 *  - DEPT_HEAD (Department Head)
 *  - TEACHER (can_handle_classes = true  / Teaching Staff & Homeroom Adviser)
 *  - TEACHER (can_handle_classes = false / Non-Teaching School Staff)
 */

export type StaffRole = 'ADMIN' | 'PRINCIPAL' | 'DEPT_HEAD' | 'TEACHER';

export type MobileTabId =
  | 'home'
  | 'scanner'
  | 'geofence'
  | 'gate_pass'
  | 'menu'
  | 'class_list'
  | 'students'
  | 'teachers'
  | 'schedules'
  | 'users'
  | 'reports'
  | 'calendar'
  | 'settings'
  | 'sardo_safety'
  | 'dtr';

export interface PermissionUser {
  role?: string | null;
  system_role?: string | null;
  can_handle_classes?: boolean | null;
  can_teach?: boolean | null;
  teacher_id?: number | string | null;
  is_superuser?: boolean | null;
}

const VALID_ROLES: ReadonlySet<StaffRole> = new Set([
  'ADMIN',
  'PRINCIPAL',
  'DEPT_HEAD',
  'TEACHER',
]);

export function normalizeRole(user?: PermissionUser | null): StaffRole {
  if (user?.is_superuser) return 'ADMIN';
  const raw = String(user?.role || user?.system_role || '')
    .trim()
    .toUpperCase() as StaffRole;
  return VALID_ROLES.has(raw) ? raw : 'TEACHER';
}

export function isTeachingStaff(user?: PermissionUser | null): boolean {
  const role = normalizeRole(user);
  if (role === 'ADMIN' || role === 'PRINCIPAL' || role === 'DEPT_HEAD') {
    return true;
  }
  if (user?.can_handle_classes !== undefined && user?.can_handle_classes !== null) {
    return Boolean(user.can_handle_classes);
  }
  if (user?.can_teach !== undefined && user?.can_teach !== null) {
    return Boolean(user.can_teach);
  }
  return true;
}

export function isSystemAdmin(user?: PermissionUser | null): boolean {
  return normalizeRole(user) === 'ADMIN';
}

export function isAdminOrPrincipal(user?: PermissionUser | null): boolean {
  const role = normalizeRole(user);
  return role === 'ADMIN' || role === 'PRINCIPAL';
}

export function isSchoolLeader(user?: PermissionUser | null): boolean {
  const role = normalizeRole(user);
  return role === 'ADMIN' || role === 'PRINCIPAL' || role === 'DEPT_HEAD';
}

/** Student QR Camera Scan Mode: Leaders + Teaching Teachers (hidden for non-teaching staff) */
export function canScanStudentQr(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user) || isTeachingStaff(user);
}

/** Student Exit Pass Issuance: Leaders + Teaching Teachers (hidden for non-teaching staff) */
export function canIssueStudentExitPass(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user) || isTeachingStaff(user);
}

/** Approve / Cancel Teacher Official Locator Slips: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canApproveOrCancelLocatorSlip(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** View Students: Leaders + Teaching Teachers (hidden for non-teaching staff) */
export function canViewClassList(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user) || isTeachingStaff(user);
}

/** View DepEd School Forms (SF1 / SF2): Leaders + Teaching Teachers (hidden for non-teaching staff) */
export function canViewReports(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user) || isTeachingStaff(user);
}

/** View DepEd SF4 Monthly School Summary: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canViewSf4(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** Edit Campus Boundary / Radius Controls: ADMIN & PRINCIPAL */
export function canEditGeofence(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Resolve / Confirm / Excuse Loafing Incidents: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canResolveLoafing(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** Academic Setup CRUD: ADMIN only */
export function canManageSchoolSetup(user?: PermissionUser | null): boolean {
  return isSystemAdmin(user);
}

/** Academic Setup View (ADMIN = CRUD, PRINCIPAL = view-only) */
export function canViewAcademicSetup(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Reset 1-to-1 Bound Phone: ADMIN & PRINCIPAL */
export function canResetBoundDevice(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Teachers Directory CRUD: ADMIN only */
export function canManageTeachers(user?: PermissionUser | null): boolean {
  return isSystemAdmin(user);
}

/** Staff User Accounts CRUD: ADMIN only */
export function canManageUsers(user?: PermissionUser | null): boolean {
  return isSystemAdmin(user);
}

/** View System Audit Logs: ADMIN & PRINCIPAL */
export function canViewAuditLogs(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** View school/department teacher directory & DTR switcher: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canViewTeacherDirectory(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** Add or Edit Student / Enrollment (ADMIN & PRINCIPAL = all sections; Homeroom Adviser = own sections) */
export function canManageStudents(
  user?: PermissionUser | null,
  advisedSectionIds?: ReadonlyArray<number> | null,
  targetSectionId?: number | null
): boolean {
  if (isAdminOrPrincipal(user)) return true;
  const role = normalizeRole(user);
  if (role !== 'TEACHER' || !isTeachingStaff(user)) return false;
  if (!advisedSectionIds || advisedSectionIds.length === 0) return false;
  if (targetSectionId !== undefined && targetSectionId !== null) {
    return advisedSectionIds.includes(Number(targetSectionId));
  }
  return true;
}

/** Delete Students: ADMIN & PRINCIPAL */
export function canDeleteStudents(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Mobile Tab Visibility Guard */
export function canViewTab(user: PermissionUser | null | undefined, tab: MobileTabId): boolean {
  if (tab === 'class_list' || tab === 'students' || tab === 'sardo_safety') return canViewClassList(user);
  if (tab === 'teachers') return canViewTeacherDirectory(user);
  if (tab === 'schedules') return canViewAcademicSetup(user);
  if (tab === 'users') return canManageUsers(user);
  if (tab === 'reports') return canViewReports(user);
  return true;
}
