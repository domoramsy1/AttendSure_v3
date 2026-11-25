/**
 * AttendSure - Centralized Role-Based Access Control (RBAC) Permission Matrix
 * File: web/src/utils/permissions.ts
 *
 * Enforces the exact 5-profile visibility & action matrix across the Web Portal:
 *  - ADMIN (System Administrator)
 *  - PRINCIPAL (School Principal)
 *  - DEPT_HEAD (Department Head)
 *  - TEACHER (can_handle_classes = true  / Teaching Staff & Homeroom Adviser)
 *  - TEACHER (can_handle_classes = false / Non-Teaching School Staff)
 */

export type StaffRole = 'ADMIN' | 'PRINCIPAL' | 'DEPT_HEAD' | 'TEACHER';

export type WebTabId =
  | 'dashboard'
  | 'classroom-scanner'
  | 'my-classes'
  | 'advisory-monitor'
  | 'geofence'
  | 'students'
  | 'gate-passes'
  | 'teachers'
  | 'dtr'
  | 'reports'
  | 'impact'
  | 'schedules'
  | 'users'
  | 'settings';

export interface PermissionUser {
  role?: string | null;
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
  const raw = String(user?.role || '').trim().toUpperCase() as StaffRole;
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

const TAB_ACCESS_BY_ROLE: Record<StaffRole, ReadonlyArray<WebTabId>> = {
  ADMIN: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'geofence',
    'students',
    'gate-passes',
    'teachers',
    'dtr',
    'reports',
    'impact',
    'schedules',
    'users',
    'settings',
  ],
  PRINCIPAL: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'geofence',
    'students',
    'gate-passes',
    'teachers',
    'dtr',
    'reports',
    'impact',
    'schedules',
    'settings',
  ],
  DEPT_HEAD: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'geofence',
    'students',
    'gate-passes',
    'teachers',
    'dtr',
    'reports',
    'impact',
  ],
  TEACHER: [
    'dashboard',
    'classroom-scanner',
    'my-classes',
    'advisory-monitor',
    'geofence',
    'students',
    'gate-passes',
    'dtr',
    'reports',
  ],
};

const NON_TEACHING_TEACHER_TABS: ReadonlyArray<WebTabId> = [
  'dashboard',
  'geofence',
  'gate-passes',
  'dtr',
];

export function getAllowedTabs(user?: PermissionUser | null): WebTabId[] {
  const role = normalizeRole(user);
  if (role === 'TEACHER' && !isTeachingStaff(user)) {
    return [...NON_TEACHING_TEACHER_TABS];
  }
  return [...TAB_ACCESS_BY_ROLE[role]];
}

export function canViewTab(user: PermissionUser | null | undefined, tabId: string): boolean {
  return getAllowedTabs(user).includes(tabId as WebTabId);
}

/** Staff User Accounts CRUD: ADMIN only */
export function canManageUsers(user?: PermissionUser | null): boolean {
  return isSystemAdmin(user);
}

/** Teachers Directory Create / Edit / Delete: ADMIN only */
export function canManageTeachers(user?: PermissionUser | null): boolean {
  return isSystemAdmin(user);
}

/** View school/department teacher directory & DTR switcher: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canViewTeacherDirectory(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** Reset 1-to-1 bound phone on a teacher profile: ADMIN & PRINCIPAL */
export function canResetBoundDevice(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Edit Campus Boundary / Radius / Duty Hours: ADMIN & PRINCIPAL */
export function canEditGeofence(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Resolve / Confirm / Excuse Loafing Incidents: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canResolveLoafing(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** Academic Setup (School Years, Grades, Departments, Sections, Subjects, Schedules) CRUD: ADMIN only */
export function canManageSchoolSetup(user?: PermissionUser | null): boolean {
  return isSystemAdmin(user);
}

/** View Academic Setup tab (ADMIN = full CRUD, PRINCIPAL = view-only) */
export function canViewAcademicSetup(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** View System Audit Logs sub-tab: ADMIN & PRINCIPAL */
export function canViewAuditLogs(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** View DepEd SF4 Monthly School Summary: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canViewSf4(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/** QR Scanner & Student QR Mode: Leaders + Teaching Teachers (hidden for non-teaching) */
export function canScanStudents(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user) || isTeachingStaff(user);
}

/** Issue Student Exit Passes: Leaders + Teaching Teachers (hidden for non-teaching) */
export function canIssueStudentExitPass(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user) || isTeachingStaff(user);
}

/** Approve / Cancel Teacher Official Locator Slips: ADMIN, PRINCIPAL, DEPT_HEAD */
export function canApproveOrCancelLocatorSlip(user?: PermissionUser | null): boolean {
  return isSchoolLeader(user);
}

/**
 * Add or Edit Student / Change Enrollment:
 * - ADMIN & PRINCIPAL: Full access across all sections
 * - DEPT_HEAD: Read-only (returns false)
 * - TEACHER (teaching): Allowed ONLY for sections where they are the assigned Homeroom Adviser
 * - TEACHER (non-teaching): Hidden (returns false)
 */
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

/** Delete Students: Strictly ADMIN & PRINCIPAL (hidden for Homeroom Advisers & DEPT_HEAD) */
export function canDeleteStudents(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

/** Bulk CSV Import Students: Strictly ADMIN & PRINCIPAL */
export function canBulkImportStudents(user?: PermissionUser | null): boolean {
  return isAdminOrPrincipal(user);
}

export function getCurrentUserFromStorage(): PermissionUser {
  try {
    const role = localStorage.getItem('attendsure_role') || 'TEACHER';
    const rawTeach = localStorage.getItem('attendsure_can_teach');
    const teacherId = localStorage.getItem('attendsure_teacher_id');
    const isSuper = localStorage.getItem('attendsure_is_superuser') === 'true';
    return {
      role,
      can_handle_classes: rawTeach === null ? true : rawTeach === 'true',
      can_teach: rawTeach === null ? true : rawTeach === 'true',
      teacher_id: teacherId ? Number(teacherId) : null,
      is_superuser: isSuper,
    };
  } catch {
    return { role: 'TEACHER', can_handle_classes: true, can_teach: true };
  }
}
