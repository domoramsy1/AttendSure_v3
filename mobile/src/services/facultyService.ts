import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { SchoolProfile, GateLog } from '../types';

export async function fetchSchoolSettings(): Promise<SchoolProfile> {
  const response = await apiClient.get<SchoolProfile>(ENDPOINTS.SCHOOL_PROFILE);
  return response.data;
}

export async function fetchTodayGatePunches(facultyId?: number): Promise<GateLog[]> {
  const params: Record<string, any> = {};
  if (facultyId) {
    params.faculty_id = facultyId;
  }
  const response = await apiClient.get<GateLog[] | { results: GateLog[] }>(
    ENDPOINTS.GATE_LOGS,
    { params }
  );
  
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.results || [];
}