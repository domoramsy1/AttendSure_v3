// AttendSure Web - School Context
// File: D:\AttendSure_V3\web\src\context\SchoolContext.tsx

/**
 * AttendSure - Global School Settings & Branding Context
 * File: web/src/context/SchoolContext.tsx
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import apiClient, { peekApiCache } from '../api/client';
import { API_ROUTES } from '../api/routes';
import { isSafeImageUrl } from '../theme/tokens';

export interface SchoolData {
  school_id: string;
  deped_school_id?: string;
  school_name: string;
  short_name: string;
  region: string;
  division: string;
  district: string;
  address: string;
  contact_number: string;
  email: string;
  principal_name: string;
  principal_title: string;
  academic_year: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
  geofence_radius?: number | null;
  radius_meters?: number | null;
  school_logo: string | null;
  left_logo: string | null;
  right_logo: string | null;
  is_configured: boolean;
}

export interface SchoolContextValue {
  school: SchoolData;
  loading: boolean;
  refreshSchool: () => Promise<void>;
  updateSchoolInstantly: (partial: Record<string, unknown> | Partial<SchoolData>) => void;
}

const STORAGE_KEY = 'attendsure_school_branding_v2';

const EMPTY_SCHOOL: SchoolData = {
  school_id: '',
  deped_school_id: '',
  school_name: '',
  short_name: '',
  region: '',
  division: '',
  district: '',
  address: '',
  contact_number: '',
  email: '',
  principal_name: '',
  principal_title: '',
  academic_year: '',
  latitude: null,
  longitude: null,
  geofence_radius_meters: null,
  geofence_radius: null,
  radius_meters: null,
  school_logo: null,
  left_logo: null,
  right_logo: null,
  is_configured: false,
};

const sanitizeText = (val: unknown, maxLen = 180): string =>
  String(val ?? '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLen);

const pickNonEmpty = (primary: unknown, fallback: string, maxLen = 180): string => {
  const cleaned = sanitizeText(primary, maxLen);
  return cleaned || fallback;
};

const safeLogo = (val: unknown): string | null => {
  const str = typeof val === 'string' ? val.trim() : '';
  return str && isSafeImageUrl(str) ? str : null;
};

const normalizeSchoolPayload = (
  raw: Record<string, unknown> | null | undefined,
  prev: SchoolData
): SchoolData => {
  if (!raw || typeof raw !== 'object') return prev;

  const resolvedId = pickNonEmpty(
    raw.school_id || raw.deped_school_id || raw.code,
    prev.school_id,
    40
  );
  const resolvedName = pickNonEmpty(raw.school_name || raw.name, prev.school_name, 180);
  const resolvedShort = pickNonEmpty(raw.short_name, prev.short_name, 40);
  const resolvedRegion = pickNonEmpty(raw.region, prev.region, 100);
  const resolvedDivision = pickNonEmpty(raw.division, prev.division, 120);
  const resolvedDistrict = pickNonEmpty(raw.district, prev.district, 120);
  const resolvedAddress = pickNonEmpty(raw.address || raw.school_address, prev.address, 240);
  const resolvedContact = pickNonEmpty(
    raw.contact_number || raw.school_contact,
    prev.contact_number,
    60
  );
  const resolvedEmail = pickNonEmpty(raw.email || raw.school_email, prev.email, 120);
  const resolvedPrincipal = pickNonEmpty(
    raw.principal_name || raw.school_head,
    prev.principal_name,
    140
  );
  const resolvedPrincipalTitle = pickNonEmpty(
    raw.principal_title || raw.school_head_title,
    prev.principal_title,
    100
  );
  const resolvedAcademicYear = pickNonEmpty(
    raw.academic_year || raw.active_school_year || raw.school_year,
    prev.academic_year,
    30
  );

  const parsedLat =
    raw.latitude !== undefined && raw.latitude !== null && raw.latitude !== ''
      ? Number(raw.latitude)
      : prev.latitude;
  const parsedLng =
    raw.longitude !== undefined && raw.longitude !== null && raw.longitude !== ''
      ? Number(raw.longitude)
      : prev.longitude;

  const rawRad = raw.geofence_radius_meters ?? raw.geofence_radius ?? raw.radius_meters;
  const parsedRad =
    rawRad !== undefined && rawRad !== null && rawRad !== ''
      ? Number(rawRad)
      : prev.geofence_radius_meters;
  const cleanRad = typeof parsedRad === 'number' && Number.isFinite(parsedRad) ? parsedRad : null;

  const schoolLogo =
    raw.school_logo !== undefined || raw.school_logo_url !== undefined
      ? safeLogo(raw.school_logo_url ?? raw.school_logo)
      : prev.school_logo;

  const leftLogo =
    raw.left_logo !== undefined || raw.left_logo_url !== undefined
      ? safeLogo(raw.left_logo_url ?? raw.left_logo)
      : schoolLogo || prev.left_logo;

  const rightLogo =
    raw.right_logo !== undefined || raw.right_logo_url !== undefined
      ? safeLogo(raw.right_logo_url ?? raw.right_logo)
      : prev.right_logo;

  const isConfigured =
    typeof raw.is_configured === 'boolean'
      ? raw.is_configured
      : Boolean(resolvedId || resolvedName);

  return {
    school_id: resolvedId,
    deped_school_id: resolvedId,
    school_name: resolvedName,
    short_name: resolvedShort,
    region: resolvedRegion,
    division: resolvedDivision,
    district: resolvedDistrict,
    address: resolvedAddress,
    contact_number: resolvedContact,
    email: resolvedEmail,
    principal_name: resolvedPrincipal,
    principal_title: resolvedPrincipalTitle,
    academic_year: resolvedAcademicYear,
    latitude: typeof parsedLat === 'number' && Number.isFinite(parsedLat) ? parsedLat : null,
    longitude: typeof parsedLng === 'number' && Number.isFinite(parsedLng) ? parsedLng : null,
    geofence_radius_meters: cleanRad,
    geofence_radius: cleanRad,
    radius_meters: cleanRad,
    school_logo: schoolLogo,
    left_logo: leftLogo,
    right_logo: rightLogo,
    is_configured: isConfigured,
  };
};

const readWarmSchool = (): SchoolData => {
  try {
    const cachedSettings = peekApiCache<Record<string, unknown>>(API_ROUTES.school.settings);
    if (cachedSettings) {
      return normalizeSchoolPayload(cachedSettings, EMPTY_SCHOOL);
    }
    const cachedPublic = peekApiCache<Record<string, unknown>>(API_ROUTES.school.publicBranding);
    if (cachedPublic) {
      return normalizeSchoolPayload(cachedPublic, EMPTY_SCHOOL);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SCHOOL;
    return normalizeSchoolPayload(JSON.parse(raw) as Record<string, unknown>, EMPTY_SCHOOL);
  } catch {
    return EMPTY_SCHOOL;
  }
};

const SchoolContext = createContext<SchoolContextValue>({
  school: EMPTY_SCHOOL,
  loading: false,
  refreshSchool: async () => {},
  updateSchoolInstantly: () => {},
});

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [school, setSchool] = useState<SchoolData>(readWarmSchool);
  const [loading, setLoading] = useState<boolean>(() => !school.school_name);
  const abortRef = useRef<AbortController | null>(null);

  const updateSchoolInstantly = useCallback(
    (partial: Record<string, unknown> | Partial<SchoolData>) => {
      if (!partial || typeof partial !== 'object') return;
      setSchool((prev) => {
        const next = normalizeSchoolPayload(partial as Record<string, unknown>, prev);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota limits
        }
        return next;
      });
    },
    []
  );

  const refreshSchool = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const hasToken = Boolean(localStorage.getItem('attendsure_access'));

    try {
      const endpoint = hasToken ? API_ROUTES.school.settings : API_ROUTES.school.publicBranding;
      const res = await apiClient.get<Record<string, unknown>>(endpoint, {
        params: { nocache: 1 },
        signal: controller.signal,
      });
      if (controller.signal.aborted || !res.data) return;

      setSchool((prev) => {
        const next = normalizeSchoolPayload(res.data, prev);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage quota limits
        }
        return next;
      });
    } catch {
      if (controller.signal.aborted) return;
      if (hasToken) {
        try {
          const fallbackRes = await apiClient.get<Record<string, unknown>>(
            API_ROUTES.school.publicBranding,
            { params: { nocache: 1 }, signal: controller.signal }
          );
          if (!controller.signal.aborted && fallbackRes.data) {
            setSchool((prev) => {
              const next = normalizeSchoolPayload(fallbackRes.data, prev);
              try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
              } catch {
                // Ignore storage quota limits
              }
              return next;
            });
          }
        } catch {
          // Retain last known branding when offline
        }
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSchool();
    return () => {
      abortRef.current?.abort();
    };
  }, [refreshSchool]);

  useEffect(() => {
    const handleCustomUpdate = () => {
      void refreshSchool();
    };
    window.addEventListener('attendsure:school-updated', handleCustomUpdate);
    return () => {
      window.removeEventListener('attendsure:school-updated', handleCustomUpdate);
    };
  }, [refreshSchool]);

  return (
    <SchoolContext.Provider value={{ school, loading, refreshSchool, updateSchoolInstantly }}>
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = (): SchoolContextValue => useContext(SchoolContext);
