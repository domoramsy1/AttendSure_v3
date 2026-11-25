/**
 * AttendSure - Teacher Directory, School Settings & Attendance Log Service
 * File: mobile/src/services/teacherService.ts
 */

import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { getFriendlyErrorMessage } from '../constants/theme';
import { SchoolProfile, AttendanceLog, TeacherProfileObject } from '../types';

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

export async function fetchTeacherDirectory(
  signal?: AbortSignal
): Promise<TeacherProfileObject[]> {
  try {
    const response = await apiClient.get<
      TeacherProfileObject[] | { results?: TeacherProfileObject[] }
    >(ENDPOINTS.TEACHERS, { signal });

    if (Array.isArray(response.data)) {
      return response.data;
    }
    return Array.isArray(response.data?.results) ? response.data.results : [];
  } catch (err: unknown) {
    throw new Error(
      getFriendlyErrorMessage(err, 'Could not load the teacher directory right now.')
    );
  }
}

export async function fetchTodayAttendanceLogs(
  sectionId?: number,
  signal?: AbortSignal
): Promise<AttendanceLog[]> {
  const params: Record<string, number> = {};
  if (typeof sectionId === 'number' && Number.isFinite(sectionId) && sectionId > 0) {
    params.section_id = sectionId;
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

export interface TeacherWorkspaceSummary {
  school: SchoolProfile | null;
  teachers: TeacherProfileObject[];
  logs: AttendanceLog[];
}

export async function fetchTeacherWorkspaceSummary(
  sectionId?: number,
  signal?: AbortSignal
): Promise<TeacherWorkspaceSummary> {
  const [schoolRes, teachersRes, logsRes] = await Promise.allSettled([
    fetchSchoolSettings(signal),
    fetchTeacherDirectory(signal),
    fetchTodayAttendanceLogs(sectionId, signal),
  ]);

  return {
    school: schoolRes.status === 'fulfilled' ? schoolRes.value : null,
    teachers: teachersRes.status === 'fulfilled' ? teachersRes.value : [],
    logs: logsRes.status === 'fulfilled' ? logsRes.value : [],
  };
}
