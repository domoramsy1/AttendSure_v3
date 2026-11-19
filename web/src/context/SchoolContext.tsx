/**
 * AttendSure - School Profile Context (Zero Mock Data & Public Pre-Login Branding)
 * File: web/src/context/SchoolContext.tsx
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { API_ROUTES } from '../api/routes';

export interface SchoolData {
  school_id: string;
  school_name: string;
  division: string;
  region: string;
  district: string;
  address?: string;
  contact_number?: string;
  email?: string;
  website?: string;
  principal_faculty?: number | string | null;
  principal_name: string;
  principal_title: string;
  superintendent_name?: string;
  school_logo: string | null;
  left_logo: string | null;
  right_logo: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
  academic_year?: string;
}

const EMPTY_SCHOOL: SchoolData = {
  school_id: '',
  school_name: '',
  division: '',
  region: '',
  district: '',
  address: '',
  contact_number: '',
  email: '',
  website: '',
  principal_faculty: null,
  principal_name: '',
  principal_title: '',
  superintendent_name: '',
  school_logo: null,
  left_logo: null,
  right_logo: null,
  latitude: null,
  longitude: null,
  geofence_radius_meters: 150,
  academic_year: '',
};

const sanitizeCachedSchool = (raw: Partial<SchoolData>): SchoolData => {
  const merged = { ...EMPTY_SCHOOL, ...raw };
  // Purge legacy mock placeholder ID if present in browser storage
  if (merged.school_id === '55555' || merged.school_id === '000000') {
    merged.school_id = '';
  }
  return merged;
};

const hasActiveToken = (): boolean =>
  Boolean(localStorage.getItem('attendsure_access') || localStorage.getItem('attendsure_token'));

interface SchoolContextValue {
  school: SchoolData;
  loading: boolean;
  refreshSchool: () => Promise<void>;
  updateSchool: (data: Partial<SchoolData>) => void;
  updateSchoolInstantly: (data: Partial<SchoolData>) => void;
}

const SchoolContext = createContext<SchoolContextValue>({
  school: EMPTY_SCHOOL,
  loading: false,
  refreshSchool: async () => {},
  updateSchool: () => {},
  updateSchoolInstantly: () => {},
});

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [school, setSchool] = useState<SchoolData>(() => {
    try {
      const cached = localStorage.getItem('attendsure_school_profile');
      if (cached) return sanitizeCachedSchool(JSON.parse(cached));
    } catch {
      // Ignore malformed cache
    }
    return EMPTY_SCHOOL;
  });

  const [loading, setLoading] = useState<boolean>(
    () => hasActiveToken() && !localStorage.getItem('attendsure_school_profile')
  );

  const applySchoolUpdate = useCallback((patch: Partial<SchoolData>) => {
    setSchool((prev) => {
      const updated = sanitizeCachedSchool({ ...prev, ...patch });
      try {
        const storageSafe = { ...updated };
        if (storageSafe.school_logo && storageSafe.school_logo.length > 300000) storageSafe.school_logo = null;
        if (storageSafe.left_logo && storageSafe.left_logo.length > 300000) storageSafe.left_logo = null;
        if (storageSafe.right_logo && storageSafe.right_logo.length > 300000) storageSafe.right_logo = null;
        localStorage.setItem('attendsure_school_profile', JSON.stringify(storageSafe));
      } catch {
        // Ignore quota limits
      }
      return updated;
    });
  }, []);

  const fetchSchoolData = useCallback(async () => {
    const endpoint = hasActiveToken()
      ? API_ROUTES.school.settings
      : '/v1/school/public-branding/';
    try {
      const res = await apiClient.get<SchoolData>(endpoint, { timeout: 6000 });
      if (res.data) applySchoolUpdate(res.data);
    } catch {
      // Keep clean cached state if offline
    } finally {
      setLoading(false);
    }
  }, [applySchoolUpdate]);

  useEffect(() => {
    fetchSchoolData();
  }, [fetchSchoolData]);

  return (
    <SchoolContext.Provider
      value={{
        school,
        loading,
        refreshSchool: fetchSchoolData,
        updateSchool: applySchoolUpdate,
        updateSchoolInstantly: applySchoolUpdate,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => useContext(SchoolContext);
export default SchoolContext;