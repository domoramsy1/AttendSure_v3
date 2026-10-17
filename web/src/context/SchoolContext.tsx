/**
 * AttendSure - Institutional Context Provider (Cache-First Fast Boot)
 * File: web/src/context/SchoolContext.tsx
 *
 * Cybersecurity & Performance:
 * 1. 0ms Fast Boot: Loads cached profile frame-1 from localStorage without network blocks.
 * 2. Unified Context Interface: Exports both updateSchool and updateSchoolInstantly.
 * 3. Safe Storage Quota Guard: Strips oversized base64 strings before localStorage writes.
 * 4. Zero Unused Variables: Clean TypeScript compilation.
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
  principal_faculty?: number | string | null;
  principal_name: string;
  principal_title: string;
  school_logo: string | null;
  left_logo: string | null;
  right_logo: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number;
}

const DEFAULT_SCHOOL: SchoolData = {
  school_id: '340964',
  school_name: 'Lapasan National High School',
  division: 'Cagayan de Oro City',
  region: 'Region X',
  district: 'East II District',
  principal_name: 'DR. JEREL EDUAVE',
  principal_title: 'School Principal I',
  school_logo: null,
  left_logo: null,
  right_logo: null,
  latitude: null,
  longitude: null,
  geofence_radius_meters: 150,
};

interface SchoolContextValue {
  school: SchoolData;
  loading: boolean;
  refreshSchool: () => Promise<void>;
  updateSchool: (data: Partial<SchoolData>) => void;
  updateSchoolInstantly: (data: Partial<SchoolData>) => void;
}

const SchoolContext = createContext<SchoolContextValue>({
  school: DEFAULT_SCHOOL,
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
        return { ...DEFAULT_SCHOOL, ...JSON.parse(cached) };
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_SCHOOL;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem('attendsure_school_profile');
  });

  // Instant optimistic updater (0ms latency UI update)
  const applySchoolUpdate = useCallback((patch: Partial<SchoolData>) => {
    setSchool((prev) => {
      const updated = { ...prev, ...patch };
      try {
        const storageSafe = { ...updated };
        // Prevent QuotaExceededError by omitting massive base64 text from localStorage
        if (storageSafe.school_logo && storageSafe.school_logo.length > 300000) storageSafe.school_logo = null;
        if (storageSafe.left_logo && storageSafe.left_logo.length > 300000) storageSafe.left_logo = null;
        if (storageSafe.right_logo && storageSafe.right_logo.length > 300000) storageSafe.right_logo = null;
        localStorage.setItem('attendsure_school_profile', JSON.stringify(storageSafe));
      } catch {
        // Ignore storage limits safely
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
      console.warn('[SchoolContext] Non-blocking sync notice:', msg);
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