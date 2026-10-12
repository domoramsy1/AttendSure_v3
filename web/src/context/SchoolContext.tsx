/**
 * AttendSure V3 - School Institutional Context
 * File: frontend/src/context/SchoolContext.tsx
 *
 * Provides institutional branding, IDs, principal signatures,
 * dynamic browser favicon/title synchronization, and exports both
 * useSchool and useSchoolContext hooks.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

export interface SchoolProfile {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  address: string;
  contact_number: string;
  email: string;
  principal_faculty?: number | string | null;
  principal_name: string;
  principal_title: string;
  school_logo: string | null;
  left_logo: string | null;
  right_logo: string | null;
  latitude: number;
  longitude: number;
  geofence_radius_meters: number;
  classroom_sms_mode?: 'INSTANT' | 'GATE_OUT_SUMMARY';
}

interface SchoolContextValue {
  school: SchoolProfile;
  loading: boolean;
  refreshSchool: () => Promise<void>;
  updateSchoolLocally: (data: Partial<SchoolProfile>) => void;
}

const defaultSchool: SchoolProfile = {
  school_id: '340964',
  school_name: 'Lapasan National High School',
  region: 'Region X',
  division: 'Cagayan de Oro',
  district: 'District II',
  address: 'Lapasan, Cagayan de Oro City, Northern Mindanao, 9000',
  contact_number: '(088) 856-1234',
  email: 'lapasan.nhs@deped.gov.ph',
  principal_faculty: null,
  principal_name: 'School Principal I',
  principal_title: 'Secondary School Principal IV',
  school_logo: null,
  left_logo: null,
  right_logo: null,
  latitude: 8.4858,
  longitude: 124.6567,
  geofence_radius_meters: 150,
  classroom_sms_mode: 'GATE_OUT_SUMMARY',
};

export const SchoolContext = createContext<SchoolContextValue>({
  school: defaultSchool,
  loading: false,
  refreshSchool: async () => {},
  updateSchoolLocally: () => {},
});

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [school, setSchool] = useState<SchoolProfile>(defaultSchool);
  const [loading, setLoading] = useState<boolean>(true);

  // Synchronizes browser favicon and document title
  const syncBrowserTabBranding = useCallback((profile: SchoolProfile) => {
    // 1. Dynamic Document Title Update
    if (profile.school_name) {
      document.title = `${profile.school_name} — AttendSure V3`;
    }

    // 2. Dynamic Favicon Update
    const rawLogo = profile.school_logo || profile.left_logo;
    if (!rawLogo) return;

    const applyFaviconLink = (iconDataUri: string) => {
      // Remove all existing icon tags to break Chromium cache latching
      const existingIcons = document.querySelectorAll("link[rel*='icon']");
      existingIcons.forEach((el) => el.remove());

      // Create and mount fresh link tags
      const link = document.createElement('link');
      link.id = 'app-favicon';
      link.rel = 'icon';
      link.type = 'image/png';
      link.href = iconDataUri;
      document.head.appendChild(link);

      const shortcutLink = document.createElement('link');
      shortcutLink.rel = 'shortcut icon';
      shortcutLink.type = 'image/png';
      shortcutLink.href = iconDataUri;
      document.head.appendChild(shortcutLink);
    };

    // Canvas Downscaling: Compress high-res logo into a 64x64 PNG (~4KB)
    // to bypass Chromium's silent buffer discard on large data URIs
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, 64, 64);
          ctx.drawImage(img, 0, 0, 64, 64);
          const compressedDataUrl = canvas.toDataURL('image/png');
          applyFaviconLink(compressedDataUrl);
          return;
        }
      } catch (err) {
        console.warn('[SchoolContext] Favicon canvas compression skipped:', err);
      }
      applyFaviconLink(rawLogo);
    };

    img.onerror = () => {
      applyFaviconLink(rawLogo);
    };

    img.src = rawLogo;
  }, []);

  const fetchSchoolProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/settings/school/');
      if (res.data) {
        const merged: SchoolProfile = {
          ...defaultSchool,
          ...res.data,
        };
        setSchool(merged);
        syncBrowserTabBranding(merged);
      }
    } catch (err) {
      console.warn('[SchoolContext] Using default institutional configuration:', err);
      syncBrowserTabBranding(defaultSchool);
    } finally {
      setLoading(false);
    }
  }, [syncBrowserTabBranding]);

  useEffect(() => {
    fetchSchoolProfile();
  }, [fetchSchoolProfile]);

  const refreshSchool = async () => {
    await fetchSchoolProfile();
  };

  const updateSchoolLocally = (data: Partial<SchoolProfile>) => {
    setSchool((prev) => {
      const updated = { ...prev, ...data };
      syncBrowserTabBranding(updated);
      return updated;
    });
  };

  return (
    <SchoolContext.Provider
      value={{
        school,
        loading,
        refreshSchool,
        updateSchoolLocally,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

// Primary hook
export const useSchool = () => useContext(SchoolContext);

// Backwards-compatible alias for tabs importing useSchoolContext
export const useSchoolContext = useSchool;

export default SchoolContext;