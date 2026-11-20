/**
 * AttendSure - School Profile Context (Zero Mock Data & Public Pre-Login Branding)
 * File: web/src/context/SchoolContext.tsx
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import apiClient from '../api/client';
import { API_ROUTES } from '../api/routes';
import { isSafeImageUrl } from '../theme/tokens';

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
  if (merged.school_id === '55555' || merged.school_id === '000000') {
    merged.school_id = '';
  }
  merged.school_logo = isSafeImageUrl(merged.school_logo) ? merged.school_logo : null;
  merged.left_logo = isSafeImageUrl(merged.left_logo) ? merged.left_logo : null;
  merged.right_logo = isSafeImageUrl(merged.right_logo) ? merged.right_logo : null;
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

  const abortRef = useRef<AbortController | null>(null);

  const fetchSchoolData = useCallback(
    async (bypassCache = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const endpoint = hasActiveToken() ? API_ROUTES.school.settings : API_ROUTES.school.publicBranding;
      try {
        const res = await apiClient.get<SchoolData>(endpoint, {
          timeout: 6000,
          params: bypassCache ? { nocache: 1 } : undefined,
          signal: controller.signal,
        });
        if (!controller.signal.aborted && res.data) applySchoolUpdate(res.data);
      } catch {
        // Keep clean cached state if offline or canceled
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [applySchoolUpdate]
  );

  const refreshSchool = useCallback(async () => {
    await fetchSchoolData(true);
  }, [fetchSchoolData]);

  useEffect(() => {
    void fetchSchoolData(false);
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchSchoolData]);

  const contextValue = useMemo<SchoolContextValue>(
    () => ({
      school,
      loading,
      refreshSchool,
      updateSchool: applySchoolUpdate,
      updateSchoolInstantly: applySchoolUpdate,
    }),
    [school, loading, refreshSchool, applySchoolUpdate]
  );

  return (
    <SchoolContext.Provider value={contextValue}>
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => useContext(SchoolContext);
export default SchoolContext;