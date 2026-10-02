import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';

interface Zone {
  zone_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: string;
  status: string;
}

export const GeofenceTab: React.FC = () => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchGeofence();
  }, []);

  const fetchGeofence = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get<Zone[]>('/geofence/');
      setZones(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch campus perimeter coordinates');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModuleTableLayout
      title="Campus Boundary & Geofence"
      subtitle="GPS coordinates and perimeter radius registered for mobile teacher telemetry."
      searchPlaceholder="Search zone..."
      searchValue={search}
      onSearchChange={setSearch}
      loading={loading}
      error={error}
      data={zones}
      keyExtractor={(z) => z.zone_id}
      columns={[
        { header: 'Zone ID', render: (z) => <span style={{ fontWeight: 700 }}>{z.zone_id}</span> },
        { header: 'Perimeter Name', render: (z) => z.name },
        { header: 'GPS Coordinates', render: (z) => `${z.latitude.toFixed(5)}, ${z.longitude.toFixed(5)}` },
        { header: 'Radius', render: (z) => z.radius },
        {
          header: 'Boundary State',
          render: (z) => (
            <span style={{ padding: '3px 8px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, backgroundColor: '#ecfdf5', color: '#059669' }}>
              {z.status}
            </span>
          ),
        },
      ]}
    />
  );
};