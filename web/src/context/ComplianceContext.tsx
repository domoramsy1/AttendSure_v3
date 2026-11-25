// AttendSure Web - Compliance Context
// File: D:\AttendSure_V3\web\src\context\ComplianceContext.tsx

/**
 * AttendSure - School Compliance & Localization Context
 * File: web/src/context/ComplianceContext.tsx
 */

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export type ComplianceMode = 'DEPED_PH';
export type SupportedLocale = 'en' | 'fil';

export const LOCALE_OPTIONS: { code: SupportedLocale; label: string; shortLabel: string }[] = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'fil', label: 'Filipino', shortLabel: 'FIL' },
];

const TRANSLATIONS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    nav_dashboard: 'Dashboard',
    nav_impact: 'SARDO & Safety',
    nav_scanner: 'QR Scanner',
    nav_my_classes: 'My Classes',
    nav_advisory: 'Advisory',
    nav_students: 'Students',
    nav_teachers: 'Teachers',
    nav_schedules: 'Academic Setup',
    nav_gate_passes: 'Exit & Travel Passes',
    nav_dtr_deped: 'DTR',
    nav_my_dtr: 'My DTR',
    nav_geofence: 'Geofence & Loafing',
    nav_reports_deped: 'DepEd Reports',
    nav_users: 'User Accounts',
    nav_settings: 'System Settings',
    group_overview: 'OVERVIEW',
    group_classroom: 'CLASSROOM',
    group_monitoring: 'GEOFENCING & PASSES',
    group_admin: 'ADMINISTRATION',
    sign_in: 'Teacher Sign In',
    launch_demo: '1-Click School Role Preview',
    hero_badge: 'DEPED GEOFENCING ATTENDANCE & LOAFING MONITORING',
    hero_title: 'Every Teacher On Duty. Every Learner Accounted For.',
    hero_subtitle:
      'Pure-software DepEd school attendance and loafing monitoring using built-in classroom cameras, campus GPS boundaries, Phone Fingerprint / Biometric & Campus GPS teacher check-ins, and official DepEd SF1, SF2, SF4 & CSC Form 48.',
  },
  fil: {
    nav_dashboard: 'Dashboard',
    nav_impact: 'SARDO at Kaligtasan',
    nav_scanner: 'QR Scanner',
    nav_my_classes: 'Aking mga Klase',
    nav_advisory: 'Advisory',
    nav_students: 'Mga Klase at QR ID',
    nav_teachers: 'Mga Guro',
    nav_schedules: 'Academic Setup',
    nav_gate_passes: 'Mga Exit Pass',
    nav_dtr_deped: 'Mga Guro at DTR',
    nav_my_dtr: 'Aking DTR',
    nav_geofence: 'Geofence at Loafing',
    nav_reports_deped: 'Mga Ulat ng DepEd',
    nav_users: 'Mga Account',
    nav_settings: 'Mga Setting',
    group_overview: 'PANGKALAHATAN',
    group_classroom: 'SILID-ARALAN',
    group_monitoring: 'GEOFENCING AT PASS',
    group_admin: 'ADMINISTRASYON',
    sign_in: 'Mag-Sign In',
    launch_demo: '1-Click Role Preview',
    hero_badge: 'DEPED GEOFENCING ATTENDANCE AT LOAFING MONITORING',
    hero_title: 'Bawat Guro at Mag-aaral Nasusubaybayan.',
    hero_subtitle:
      'Purong software na attendance at loafing monitoring gamit ang built-in camera, campus GPS boundary, at opisyal na ulat ng DepEd SF1, SF2, SF4 at CSC Form 48.',
  },
};

interface ComplianceContextValue {
  complianceMode: ComplianceMode;
  setComplianceMode: (mode: ComplianceMode) => void;
  toggleComplianceMode: () => void;
  isGlobalMode: boolean;
  locale: SupportedLocale;
  setLocale: (lang: SupportedLocale) => void;
  t: (key: string, fallback?: string) => string;
  term: (altLabel: string, depedLabel: string) => string;
}

const ComplianceContext = createContext<ComplianceContextValue | undefined>(undefined);

export const ComplianceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const complianceMode: ComplianceMode = 'DEPED_PH';

  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    const saved = localStorage.getItem('attendsure_locale') as SupportedLocale | null;
    return saved && saved in TRANSLATIONS ? saved : 'en';
  });

  const setComplianceMode = useCallback((_mode: ComplianceMode) => {
    localStorage.setItem('attendsure_compliance_mode', 'DEPED_PH');
  }, []);

  const toggleComplianceMode = useCallback(() => {
    localStorage.setItem('attendsure_compliance_mode', 'DEPED_PH');
  }, []);

  const setLocale = useCallback((lang: SupportedLocale) => {
    setLocaleState(lang);
    localStorage.setItem('attendsure_locale', lang);
  }, []);

  const t = useCallback(
    (key: string, fallback?: string): string => {
      return TRANSLATIONS[locale]?.[key] || TRANSLATIONS.en[key] || fallback || key;
    },
    [locale]
  );

  const term = useCallback((_altLabel: string, depedLabel: string): string => {
    return depedLabel;
  }, []);

  const value = useMemo<ComplianceContextValue>(
    () => ({
      complianceMode,
      setComplianceMode,
      toggleComplianceMode,
      isGlobalMode: false,
      locale,
      setLocale,
      t,
      term,
    }),
    [setComplianceMode, toggleComplianceMode, locale, setLocale, t, term]
  );

  return <ComplianceContext.Provider value={value}>{children}</ComplianceContext.Provider>;
};

export const useCompliance = (): ComplianceContextValue => {
  const ctx = useContext(ComplianceContext);
  if (!ctx) {
    throw new Error('useCompliance must be used within a ComplianceProvider');
  }
  return ctx;
};

export default ComplianceContext;
