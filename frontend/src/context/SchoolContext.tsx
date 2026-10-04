import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';

export interface SchoolProfileState {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  address: string;
  contact_number: string;
  email: string;
  principal_name: string;
  principal_title: string;
  kagawaran_logo: string | null;
  deped_logo: string | null;
  school_logo: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
}

interface SchoolContextValue {
  profile: SchoolProfileState;
  loading: boolean;
  refreshSchoolProfile: () => Promise<void>;
  updateLocalProfile: (newProfile: Partial<SchoolProfileState>) => void;
}

const defaultProfile: SchoolProfileState = {
  school_id: '304033',
  school_name: 'Lapasan NHS',
  region: 'Region X',
  division: 'Cagayan de Oro City',
  district: 'District II',
  address: 'Sta. Cruz II Road, Lapasan, Cagayan de Oro City, 9000 Misamis Oriental',
  contact_number: '(088) 850-0846',
  email: 'lapasannhs@gmail.com',
  principal_name: 'Jacqueline Galupo',
  principal_title: 'Secondary Principal II',
  kagawaran_logo: null,
  deped_logo: null,
  school_logo: null,
  latitude: null,
  longitude: null,
  geofence_radius_meters: 250,
};

const SchoolContext = createContext<SchoolContextValue>({
  profile: defaultProfile,
  loading: false,
  refreshSchoolProfile: async () => {},
  updateLocalProfile: () => {},
});

export const SchoolProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<SchoolProfileState>(defaultProfile);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<SchoolProfileState>('/settings/school/');
      if (res.data) {
        setProfile({
          school_id: res.data.school_id || defaultProfile.school_id,
          school_name: res.data.school_name || defaultProfile.school_name,
          region: res.data.region || defaultProfile.region,
          division: res.data.division || defaultProfile.division,
          district: res.data.district || defaultProfile.district,
          address: res.data.address || defaultProfile.address,
          contact_number: res.data.contact_number || defaultProfile.contact_number,
          email: res.data.email || defaultProfile.email,
          principal_name: res.data.principal_name || defaultProfile.principal_name,
          principal_title: res.data.principal_title || defaultProfile.principal_title,
          kagawaran_logo: res.data.kagawaran_logo || (res.data as any).left_logo || null,
          deped_logo: res.data.deped_logo || (res.data as any).right_logo || null,
          school_logo: res.data.school_logo || null,
          latitude: res.data.latitude ?? null,
          longitude: res.data.longitude ?? null,
          geofence_radius_meters: res.data.geofence_radius_meters ?? 250,
        });
      }
    } catch {
      // Fallback cleanly to default profile if offline or initializing
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateLocalProfile = (newProfile: Partial<SchoolProfileState>) => {
    setProfile((prev) => ({ ...prev, ...newProfile }));
  };

  return (
    <SchoolContext.Provider
      value={{
        profile,
        loading,
        refreshSchoolProfile: fetchProfile,
        updateLocalProfile,
      }}
    >
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchoolProfile = () => useContext(SchoolContext);