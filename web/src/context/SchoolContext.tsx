/**
 * AttendSure - School Institutional Context
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
    if (profile.school_name) {
      document.title = `${profile.school_name} — AttendSure`;
    }

    const rawLogo = profile.school_logo || profile.left_logo;
    if (!rawLogo) return;

    const applyFaviconLink = (iconDataUri: string) => {
      const existingIcons = document.querySelectorAll("link[rel*='icon']");
      existingIcons.forEach((el) => el.remove());

      const mimeType = iconDataUri.includes('svg') ? 'image/svg+xml' : 'image/png';

      const link = document.createElement('link');
      link.id = 'app-favicon';
      link.rel = 'icon';
      link.type = mimeType;
      link.href = iconDataUri;
      document.head.appendChild(link);

      const shortcutLink = document.createElement('link');
      shortcutLink.rel = 'shortcut icon';
      shortcutLink.type = mimeType;
      shortcutLink.href = iconDataUri;
      document.head.appendChild(shortcutLink);
    };

    if (rawLogo.includes('.svg') || rawLogo.startsWith('data:image/svg+xml')) {
      applyFaviconLink(rawLogo);
      return;
    }

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

    // EXACT 5 SECONDS SPLASH SCREEN TIMER (5,000 ms)
    const SPLASH_DURATION_MS = 2500;
    const minDelayTimer = new Promise((resolve) => setTimeout(resolve, SPLASH_DURATION_MS));

    try {
      // Waits for BOTH the API fetch and the 5-second timer to resolve
      const [apiResult] = await Promise.allSettled([
        apiClient.get('/settings/school/'),
        minDelayTimer,
      ]);

      if (apiResult.status === 'fulfilled' && apiResult.value?.data) {
        const merged: SchoolProfile = {
          ...defaultSchool,
          ...apiResult.value.data,
        };
        setSchool(merged);
        syncBrowserTabBranding(merged);
      } else {
        syncBrowserTabBranding(defaultSchool);
      }
    } catch (err) {
      console.warn('[SchoolContext] Using default institutional configuration:', err);
      syncBrowserTabBranding(defaultSchool);
    } finally {
      setLoading(false);

      // Smooth 0.6s fade-out transition before removing from the DOM
      const splash = document.getElementById('web-splash');
      if (splash) {
        splash.style.transition = 'opacity 0.6s ease-out';
        splash.style.opacity = '0';
        setTimeout(() => {
          splash.remove();
        }, 600);
      }
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

export const useSchool = () => useContext(SchoolContext);
export const useSchoolContext = useSchool;

export default SchoolContext;