/**
 * AttendSure - Faculty Directory, School Settings & Attendance Log Service
 * File: mobile/src/services/facultyService.ts
 */

import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getFriendlyErrorMessage } from '../constants/theme';
import { SchoolProfile, AttendanceLog, FacultyProfileObject } from '../types';

const FACULTY_LIST_ENDPOINT = 'v1/accounts/faculty/';

export async function fetchSchoolSettings(signal?: AbortSignal): Promise<SchoolProfile> {
  try {
    const response = await apiClient.get<SchoolProfile>(ENDPOINTS.SCHOOL_PROFILE, { signal });
    return response.data;
  } catch (err: unknown) {
    throw new Error(
      getFriendlyErrorMessage(err, 'Could not load school profile settings right now.')
    );
  }
}

export async function fetchFacultyDirectory(
  signal?: AbortSignal
): Promise<FacultyProfileObject[]> {
  try {
    const response = await apiClient.get<
      FacultyProfileObject[] | { results?: FacultyProfileObject[] }
    >(FACULTY_LIST_ENDPOINT, { signal });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return Array.isArray(response.data?.results) ? response.data.results : [];
  } catch (err: unknown) {
    throw new Error(
      getFriendlyErrorMessage(err, 'Could not load the faculty list right now.')
    );
  }
}

export async function fetchTodayAttendanceLogs(
  facultyId?: number,
  signal?: AbortSignal
): Promise<AttendanceLog[]> {
  const params: Record<string, number> = {};
  if (typeof facultyId === 'number' && Number.isFinite(facultyId) && facultyId > 0) {
    params.faculty_id = facultyId;
  }

  try {
    const response = await apiClient.get<
      AttendanceLog[] | { results?: AttendanceLog[] }
    >(ENDPOINTS.ATTENDANCE_LOGS, { params, signal });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return Array.isArray(response.data?.results) ? response.data.results : [];
  } catch (err: unknown) {
    throw new Error(
      getFriendlyErrorMessage(err, 'Could not load today’s attendance logs right now.')
    );
  }
}

export interface FacultyWorkspaceSummary {
  school: SchoolProfile | null;
  faculty: FacultyProfileObject[];
  logs: AttendanceLog[];
}

export async function fetchFacultyWorkspaceSummary(
  facultyId?: number,
  signal?: AbortSignal
): Promise<FacultyWorkspaceSummary> {
  const [schoolRes, facultyRes, logsRes] = await Promise.allSettled([
    fetchSchoolSettings(signal),
    fetchFacultyDirectory(signal),
    fetchTodayAttendanceLogs(facultyId, signal),
  ]);

  return {
    school: schoolRes.status === 'fulfilled' ? schoolRes.value : null,
    faculty: facultyRes.status === 'fulfilled' ? facultyRes.value : [],
    logs: logsRes.status === 'fulfilled' ? logsRes.value : [],
  };
}
