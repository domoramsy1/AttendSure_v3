/**
 * AttendSure - Institutional Context Provider (Cache-First Fast Boot)
 * File: web/src/context/SchoolContext.tsx
 *
 * Performance:
 * 1. Loads instantly from localStorage on frame 1 (0ms wait time).
 * 2. Dismisses the SplashScreen without waiting for network transfers.
 * 3. Quietly refreshes school settings in the background.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

export interface SchoolData {
  school_id: string;
  school_name: string;
  division: string;
  region: string;
  district: string;
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
}

const SchoolContext = createContext<SchoolContextValue>({
  school: DEFAULT_SCHOOL,
  loading: false,
  refreshSchool: async () => {},
  updateSchool: () => {},
});

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load cached school profile instantly from localStorage
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

  // If cached data already exists, don't block the UI with the splash screen
  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem('attendsure_school_profile');
  });

  const fetchSchoolData = useCallback(async () => {
    try {
      const res = await apiClient.get<SchoolData>('/settings/school/', { timeout: 6000 });
      if (res.data) {
        setSchool((prev) => {
          const merged = { ...prev, ...res.data };
          try {
            localStorage.setItem('attendsure_school_profile', JSON.stringify(merged));
          } catch {
            // Ignore storage limits
          }
          return merged;
        });
      }
    } catch {
      // Retain existing cached state if request fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchoolData();
  }, [fetchSchoolData]);

  const updateSchool = useCallback((patch: Partial<SchoolData>) => {
    setSchool((prev) => {
      const updated = { ...prev, ...patch };
      try {
        localStorage.setItem('attendsure_school_profile', JSON.stringify(updated));
      } catch {
        // Ignore
      }
      return updated;
    });
  }, []);

  return (
    <SchoolContext.Provider value={{ school, loading, refreshSchool: fetchSchoolData, updateSchool }}>
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => useContext(SchoolContext);
export default SchoolContext;