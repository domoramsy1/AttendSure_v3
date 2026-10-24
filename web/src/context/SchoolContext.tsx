/**
 * AttendSure - Institutional Context Provider (Real Database Data)
 * File: web/src/context/SchoolContext.tsx
 *
 * Cybersecurity & Performance:
 * 1. Zero Mock Data: All school information is loaded strictly from the PostgreSQL database.
 * 2. Real-Time Cache Sync: Caches genuine database records in localStorage to ensure fast frame-1 boot.
 * 3. Quota Safety Guard: Strips excessive base64 payload strings before writing to browser storage.
 * 4. Simple English Terms: Clean data interfaces for school profile, head, and boundary settings.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

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
  geofence_radius_meters: 100,
  academic_year: '',
};

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
      if (cached) {
        return { ...EMPTY_SCHOOL, ...JSON.parse(cached) };
      }
    } catch {
      // Fallback to empty state
    }
    return EMPTY_SCHOOL;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem('attendsure_school_profile');
  });

  const applySchoolUpdate = useCallback((patch: Partial<SchoolData>) => {
    setSchool((prev) => {
      const updated = { ...prev, ...patch };
      try {
        const storageSafe = { ...updated };
        if (storageSafe.school_logo && storageSafe.school_logo.length > 300000) storageSafe.school_logo = null;
        if (storageSafe.left_logo && storageSafe.left_logo.length > 300000) storageSafe.left_logo = null;
        if (storageSafe.right_logo && storageSafe.right_logo.length > 300000) storageSafe.right_logo = null;
        localStorage.setItem('attendsure_school_profile', JSON.stringify(storageSafe));
      } catch {
        // Handle browser quota limit safely
      }
      return updated;
    });
  }, []);

  const fetchSchoolData = useCallback(async () => {
    try {
      const res = await apiClient.get<SchoolData>('/settings/school/', { timeout: 8000 });
      if (res.data) {
        applySchoolUpdate(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[SchoolContext] Database sync notice:', msg);
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