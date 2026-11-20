/**
 * AttendSure - Dual Compliance Mode (Global Ed-Fi v6.0 / DepEd PH) & Multi-Language Context
 * File: web/src/context/ComplianceContext.tsx
 */

import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';

export type ComplianceMode = 'GLOBAL' | 'DEPED_PH';
export type SupportedLocale = 'en' | 'fil' | 'es' | 'fr';

export const LOCALE_OPTIONS: { code: SupportedLocale; label: string; shortLabel: string }[] = [
  { code: 'en', label: 'English', shortLabel: 'EN' },
  { code: 'fil', label: 'Filipino', shortLabel: 'FIL' },
  { code: 'es', label: 'Español', shortLabel: 'ES' },
  { code: 'fr', label: 'Français', shortLabel: 'FR' },
];

const TRANSLATIONS: Record<SupportedLocale, Record<string, string>> = {
  en: {
    nav_dashboard: 'Dashboard',
    nav_impact: 'Impact & Safety',
    nav_scanner: 'QR Scanner',
    nav_my_classes: 'My Classes',
    nav_advisory: 'Advisory Matrix',
    nav_students: 'Students',
    nav_faculty: 'Faculty & Staff',
    nav_schedules: 'Schedules',
    nav_messages: 'Parent Chat',
    nav_push: 'Push Alerts',
    nav_gate_passes: 'Exit Passes',
    nav_dtr_global: 'Staff Timesheets',
    nav_dtr_deped: 'Monthly DTR',
    nav_geofence: 'Campus GPS',
    nav_reports_global: 'Compliance Reports',
    nav_reports_deped: 'DepEd Reports',
    nav_users: 'User Accounts',
    nav_settings: 'School Settings',
    group_overview: 'OVERVIEW',
    group_classroom: 'CLASSROOM',
    group_alerts: 'ATTENDANCE & ALERTS',
    group_admin: 'ADMINISTRATION',
    sign_in: 'Staff Sign In',
    launch_demo: '1-Click Judge Demo',
    hero_badge: 'GLOBAL EDTECH • PURE-SOFTWARE CAMPUS OS',
    hero_title: 'Every Student Accounted For. Ready on Classroom Laptops.',
    hero_subtitle:
      'Pure-software school attendance with USB QR scanning, AI dropout early-warning, emergency campus roll-call, and real-time parent push alerts — deployable in 5 minutes.',
  },
  fil: {
    nav_dashboard: 'Dashboard',
    nav_impact: 'UN SDG at Kaligtasan',
    nav_scanner: 'QR Scanner',
    nav_my_classes: 'Aking mga Klase',
    nav_advisory: 'Advisory Matrix',
    nav_students: 'Mga Mag-aaral',
    nav_faculty: 'Mga Kawani at Fakultad',
    nav_schedules: 'Mga Iskedyul',
    nav_messages: 'Chat sa Magulang',
    nav_push: 'Push Alerts',
    nav_gate_passes: 'Exit Passes',
    nav_dtr_global: 'Orasan ng Kawani',
    nav_dtr_deped: 'Buwanang DTR',
    nav_geofence: 'Campus GPS',
    nav_reports_global: 'Mga Ulat (Ed-Fi)',
    nav_reports_deped: 'Mga Ulat ng DepEd',
    nav_users: 'Mga Account',
    nav_settings: 'Mga Setting',
    group_overview: 'PANGKALAHATAN',
    group_classroom: 'SILID-ARALAN',
    group_alerts: 'PAGDALO AT ALERTO',
    group_admin: 'ADMINISTRASYON',
    sign_in: 'Mag-Sign In',
    launch_demo: '1-Click Demo para sa Hurado',
    hero_badge: 'GLOBAL EDTECH • PURONG SOFTWARE NA SISTEMA',
    hero_title: 'Bawat Mag-aaral Ligtas at Nasusubaybayan.',
    hero_subtitle:
      'Purong software na attendance gamit ang USB QR scanner, maagang babala laban sa dropout, emergency roll-call, at agarang push alert sa magulang.',
  },
  es: {
    nav_dashboard: 'Panel Principal',
    nav_impact: 'Impacto ODS y Seguridad',
    nav_scanner: 'Escáner QR',
    nav_my_classes: 'Mis Clases',
    nav_advisory: 'Matriz de Asistencia',
    nav_students: 'Estudiantes',
    nav_faculty: 'Personal Académico',
    nav_schedules: 'Horarios',
    nav_messages: 'Chat de Padres',
    nav_push: 'Alertas Móviles',
    nav_gate_passes: 'Pases de Salida',
    nav_dtr_global: 'Registro de Personal',
    nav_dtr_deped: 'DTR Mensual',
    nav_geofence: 'GPS del Campus',
    nav_reports_global: 'Reportes Ed-Fi',
    nav_reports_deped: 'Reportes Oficiales',
    nav_users: 'Cuentas de Usuario',
    nav_settings: 'Configuración',
    group_overview: 'RESUMEN',
    group_classroom: 'AULA',
    group_alerts: 'ASISTENCIA Y ALERTAS',
    group_admin: 'ADMINISTRACIÓN',
    sign_in: 'Iniciar Sesión',
    launch_demo: 'Demo en 1 Clic',
    hero_badge: 'EDTECH GLOBAL • PLATAFORMA ESCOLAR 100% SOFTWARE',
    hero_title: 'Cada Estudiante Seguro. Listo en Laptops Escolares.',
    hero_subtitle:
      'Asistencia escolar con escáner QR USB, alerta temprana de deserción, lista de evacuación de emergencia y notificaciones móviles gratuitas para familias.',
  },
  fr: {
    nav_dashboard: 'Tableau de Bord',
    nav_impact: 'Impact ODD & Sécurité',
    nav_scanner: 'Scanner QR',
    nav_my_classes: 'Mes Classes',
    nav_advisory: 'Matrice de Présence',
    nav_students: 'Élèves',
    nav_faculty: 'Personnel Éducatif',
    nav_schedules: 'Emplois du Temps',
    nav_messages: 'Messagerie Parents',
    nav_push: 'Alertes Push',
    nav_gate_passes: 'Autorisations Sortie',
    nav_dtr_global: 'Feuilles de Présence',
    nav_dtr_deped: 'DTR Mensuel',
    nav_geofence: 'GPS du Campus',
    nav_reports_global: 'Rapports Ed-Fi',
    nav_reports_deped: 'Rapports Officiels',
    nav_users: 'Comptes',
    nav_settings: 'Paramètres',
    group_overview: 'APERÇU',
    group_classroom: 'CLASSE',
    group_alerts: 'PRÉSENCE & ALERTES',
    group_admin: 'ADMINISTRATION',
    sign_in: 'Connexion Personnel',
    launch_demo: 'Démo Jury 1-Clic',
    hero_badge: 'EDTECH MONDIAL • PLATEFORME SCOLAIRE 100% LOGICIELLE',
    hero_title: 'Chaque Élève Protégé. Prêt sur Ordinateur de Classe.',
    hero_subtitle:
      'Présence scolaire par scanner QR USB, prévention précoce du décrochage, appel d’urgence sur campus et alertes mobiles en temps réel pour les familles.',
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
  term: (globalLabel: string, depedLabel: string) => string;
}

const ComplianceContext = createContext<ComplianceContextValue | undefined>(undefined);

export const ComplianceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [complianceMode, setComplianceModeState] = useState<ComplianceMode>(() => {
    const saved = localStorage.getItem('attendsure_compliance_mode');
    return saved === 'DEPED_PH' || saved === 'GLOBAL' ? saved : 'GLOBAL';
  });

  const [locale, setLocaleState] = useState<SupportedLocale>(() => {
    const saved = localStorage.getItem('attendsure_locale') as SupportedLocale | null;
    return saved && saved in TRANSLATIONS ? saved : 'en';
  });

  const setComplianceMode = useCallback((mode: ComplianceMode) => {
    setComplianceModeState(mode);
    localStorage.setItem('attendsure_compliance_mode', mode);
  }, []);

  const toggleComplianceMode = useCallback(() => {
    setComplianceModeState((prev) => {
      const next: ComplianceMode = prev === 'GLOBAL' ? 'DEPED_PH' : 'GLOBAL';
      localStorage.setItem('attendsure_compliance_mode', next);
      return next;
    });
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

  const term = useCallback(
    (globalLabel: string, depedLabel: string): string => {
      return complianceMode === 'GLOBAL' ? globalLabel : depedLabel;
    },
    [complianceMode]
  );

  const value = useMemo<ComplianceContextValue>(
    () => ({
      complianceMode,
      setComplianceMode,
      toggleComplianceMode,
      isGlobalMode: complianceMode === 'GLOBAL',
      locale,
      setLocale,
      t,
      term,
    }),
    [complianceMode, setComplianceMode, toggleComplianceMode, locale, setLocale, t, term]
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
