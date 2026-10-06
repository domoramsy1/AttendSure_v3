import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/client';
import { useAlert } from '../../context/AlertContext';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Navigation,
  RefreshCw,
  Layers,
  Lock,
  Save,
  CheckCircle2,
  Compass,
  Building2,
  WifiOff,
  BatteryCharging,
  Clock,
  Smartphone,
  RotateCcw,
} from 'lucide-react';

interface FacultyRosterItem {
  id: number;
  faculty_name: string;
  employee_id: string;
  position: string;
  status: 'VERIFIED_INSIDE' | 'AUTHORIZED_LEAVE' | 'HEARTBEAT_LOST' | 'PERIMETER_BREACH' | 'NOT_ON_DUTY' | 'OFF_CAMPUS';
  distance: string;
  battery: string;
  last_seen: string;
  device_model?: string | null;
  bound_device_id?: string | null;
  device_bound_at?: string | null;
}

interface GeofenceData {
  zone_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_configured: boolean;
  verified_inside: number;
  missing_heartbeats: number;
  spoof_attempts_blocked: number;
  incidents_today: number;
  faculty_roster: FacultyRosterItem[];
  recent_breaches: Array<{
    id: number;
    faculty_name: string;
    reason: string;
    status: string;
    time: string;
  }>;
}

declare global {
  interface Window {
    L: any;
  }
}

export const GeofenceTab: React.FC = () => {
  const { showAlert } = useAlert();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const circleInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [geoData, setGeoData] = useState<GeofenceData | null>(null);

  const [lat, setLat] = useState<number>(8.480190);
  const [lng, setLng] = useState<number>(124.663690);
  const [radius, setRadius] = useState<number>(250);

  const userRole = (localStorage.getItem('attendsure_role') || 'TEACHER').toUpperCase();
  const isAdmin = userRole === 'ADMIN';

  useEffect(() => {
    if (window.L) {
      setLeafletReady(true);
      return;
    }

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  const fetchGeofenceData = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/geofence/');
      setGeoData(res.data);
      const parsedLat = parseFloat(res.data.latitude) || 8.480190;
      const parsedLng = parseFloat(res.data.longitude) || 124.663690;
      const parsedRad = parseInt(res.data.radius_meters) || 250;

      setLat(parsedLat);
      setLng(parsedLng);
      setRadius(parsedRad);
    } catch {
      showAlert({
        title: 'Connection Offline',
        message: 'Could not connect to geofence server.',
        type: 'warning',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGeofenceData();
  }, []);

  useEffect(() => {
    if (!leafletReady || !mapContainerRef.current) return;

    const L = window.L;

    const getTileUrl = (layer: 'streets' | 'satellite') => {
      if (layer === 'satellite') {
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      }
      return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    };

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 16,
        zoomControl: true,
      });

      const tileLayer = L.tileLayer(getTileUrl(mapLayer), {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapInstanceRef.current = map;
      (map as any)._tileLayer = tileLayer;

      map.on('click', (e: any) => {
        if (!isAdmin) return;
        setLat(parseFloat(e.latlng.lat.toFixed(6)));
        setLng(parseFloat(e.latlng.lng.toFixed(6)));
      });
    }

    const currentMap = mapInstanceRef.current;

    if (currentMap && currentMap._tileLayer) {
      currentMap.removeLayer(currentMap._tileLayer);
      currentMap._tileLayer = L.tileLayer(getTileUrl(mapLayer), { maxZoom: 19 }).addTo(currentMap);
    }

    const campusPinIcon = L.divIcon({
      className: 'campus-pin',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background-color: #0284c7;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(2, 132, 199, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
        ">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
    });

    if (markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([lat, lng]);
    } else {
      markerInstanceRef.current = L.marker([lat, lng], {
        icon: campusPinIcon,
        draggable: isAdmin,
      }).addTo(currentMap);

      markerInstanceRef.current.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        setLat(parseFloat(pos.lat.toFixed(6)));
        setLng(parseFloat(pos.lng.toFixed(6)));
      });
    }

    if (circleInstanceRef.current) {
      circleInstanceRef.current.setLatLng([lat, lng]);
      circleInstanceRef.current.setRadius(radius);
    } else {
      circleInstanceRef.current = L.circle([lat, lng], {
        radius: radius,
        color: '#0284c7',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 0.16,
      }).addTo(currentMap);
    }

    currentMap.panTo([lat, lng]);
  }, [leafletReady, lat, lng, radius, mapLayer, isAdmin]);

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      showAlert({ title: 'Hardware Error', message: 'GPS is not available on this device.', type: 'error' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const detectedLat = parseFloat(pos.coords.latitude.toFixed(6));
        const detectedLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(detectedLat);
        setLng(detectedLng);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([detectedLat, detectedLng], 17);
        }
        showAlert({
          title: 'Location Synchronized',
          message: `Coordinates centered: ${detectedLat}°N, ${detectedLng}°E.`,
          type: 'success',
        });
      },
      (err) => {
        showAlert({ title: 'Location Error', message: err.message, type: 'warning' });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSavePerimeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    setSaving(true);
    try {
      const res = await apiClient.put('/geofence/', {
        latitude: lat,
        longitude: lng,
        radius_meters: radius,
      });

      showAlert({
        title: 'Perimeter Configuration Saved',
        message: res.data.message || 'Campus boundary successfully updated in database.',
        type: 'success',
      });
      fetchGeofenceData();
    } catch (err: any) {
      showAlert({
        title: 'Save Failed',
        message: err.response?.data?.error || 'Could not save perimeter parameters.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDevice = async (facultyId: number, facultyName: string) => {
    if (!isAdmin) return;

    setResettingId(facultyId);
    try {
      const res = await apiClient.post(`/teachers/${facultyId}/reset-device/`);
      showAlert({
        title: 'Device Binding Unlocked',
        message: res.data.message || `Device binding for ${facultyName} has been cleared.`,
        type: 'success',
      });
      fetchGeofenceData();
    } catch (err: any) {
      showAlert({
        title: 'Reset Failed',
        message: err.response?.data?.error || 'Could not reset device binding.',
        type: 'error',
      });
    } finally {
      setResettingId(null);
    }
  };

  const getStatusBadge = (status: FacultyRosterItem['status']) => {
    switch (status) {
      case 'VERIFIED_INSIDE':
        return <span style={statusBadgeStyle('#ecfdf5', '#059669', '#a7f3d0')}>VERIFIED ON SITE</span>;
      case 'AUTHORIZED_LEAVE':
        return <span style={statusBadgeStyle('#f0f9ff', '#0284c7', '#bae6fd')}>OFFICIAL LEAVE</span>;
      case 'HEARTBEAT_LOST':
        return <span style={statusBadgeStyle('#fffbeb', '#d97706', '#fde68a')}>SIGNAL LOST (&gt;15M)</span>;
      case 'PERIMETER_BREACH':
        return <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>UNAUTHORIZED DEPARTURE</span>;
      case 'OFF_CAMPUS':
        return <span style={statusBadgeStyle('#f1f5f9', '#64748b', '#cbd5e1')}>OFF CAMPUS</span>;
      default:
        return <span style={statusBadgeStyle('#f8fafc', '#94a3b8', '#e2e8f0')}>OFF DUTY</span>;
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={22} color="#0284c7" />
            <span>Campus Perimeter & Geofence Security</span>
          </h2>
          <p style={{ fontSize: '0.80rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Zero-trust spatial presence monitoring, device hardware binding, and automated gate cross-checking.
          </p>
        </div>

        <button
          onClick={fetchGeofenceData}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: 6,
            color: '#334155',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Sync Telemetry</span>
        </button>
      </div>

      {/* 2. Security Telemetry KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>VERIFIED ON CAMPUS</span>
            <ShieldCheck size={18} color="#059669" />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#059669', marginTop: 8 }}>
            {geoData?.verified_inside ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
            GPS inside boundary + Gate tap confirmed
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>SIGNAL LOST (&gt;15 MINS)</span>
            <WifiOff size={18} color={geoData?.missing_heartbeats ? '#d97706' : '#64748b'} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: geoData?.missing_heartbeats ? '#d97706' : '#0f172a', marginTop: 8 }}>
            {geoData?.missing_heartbeats ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
            Phone switched off or silent on desk
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>SPOOFING BLOCKS</span>
            <ShieldAlert size={18} color={geoData?.spoof_attempts_blocked ? '#dc2626' : '#059669'} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: geoData?.spoof_attempts_blocked ? '#dc2626' : '#059669', marginTop: 8 }}>
            {geoData?.spoof_attempts_blocked ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
            Fake GPS / Mock locations rejected
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>EXCEPTIONS LOGGED</span>
            <AlertTriangle size={18} color={geoData?.incidents_today ? '#dc2626' : '#64748b'} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: geoData?.incidents_today ? '#dc2626' : '#0f172a', marginTop: 8 }}>
            {geoData?.incidents_today ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
            Departures without an active Gate Pass
          </div>
        </div>
      </div>

      {/* 3. Map Canvas & Parameter Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.45fr 1fr', gap: 18, alignItems: 'start' }}>
        <div style={panelCardStyle}>
          <div
            style={{
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', fontWeight: 700, color: '#1e293b' }}>
              <Compass size={16} color="#0284c7" />
              <span>Campus Map Boundary</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', backgroundColor: '#e2e8f0', borderRadius: 6, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setMapLayer('streets')}
                  style={layerToggleBtn(mapLayer === 'streets')}
                >
                  <Layers size={12} />
                  <span>Roads</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayer('satellite')}
                  style={layerToggleBtn(mapLayer === 'satellite')}
                >
                  <Layers size={12} />
                  <span>Satellite</span>
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 10px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    color: '#0284c7',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Navigation size={12} />
                  <span>Current GPS</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', height: 420, backgroundColor: '#f1f5f9' }}>
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                border: '1px solid #cbd5e1',
                padding: '5px 10px',
                borderRadius: 6,
                fontSize: '0.70rem',
                fontFamily: 'monospace',
                color: '#334155',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
              }}
            >
              Center: {lat.toFixed(6)}°N, {lng.toFixed(6)}°E &bull; Radius: {radius}m
            </div>
          </div>

          <div style={{ padding: '10px 18px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#64748b' }}>
            {isAdmin ? (
              <span><strong>Admin Control:</strong> Click anywhere on the map or drag the blue marker to update the campus perimeter center.</span>
            ) : (
              <span>Coordinates are locked. Perimeter modifications are restricted to Administrators.</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...panelCardStyle, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>
              <div>
                <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#0f172a' }}>
                  Perimeter Parameters
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Lapasan NHS official geographic boundary settings.
                </div>
              </div>
              {!isAdmin && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.66rem', color: '#64748b', backgroundColor: '#f1f5f9', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                  <Lock size={11} /> Read-Only
                </span>
              )}
            </div>

            <form onSubmit={handleSavePerimeter} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={fieldLabelStyle}>Center Latitude (°N)</label>
                  <input
                    type="number"
                    step="any"
                    disabled={!isAdmin}
                    required
                    value={lat}
                    onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={fieldLabelStyle}>Center Longitude (°E)</label>
                  <input
                    type="number"
                    step="any"
                    disabled={!isAdmin}
                    required
                    value={lng}
                    onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                    style={fieldInputStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={fieldLabelStyle}>Boundary Radius</label>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0284c7', fontFamily: 'monospace' }}>
                    {radius} meters
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="25"
                  disabled={!isAdmin}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#0284c7', cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                />

                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {[
                    { label: 'Gate Turnstiles (100m)', val: 100 },
                    { label: 'Standard Campus (250m)', val: 250 },
                    { label: 'Entire Compound (400m)', val: 400 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => setRadius(preset.val)}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        backgroundColor: radius === preset.val ? '#e0f2fe' : '#ffffff',
                        color: radius === preset.val ? '#0369a1' : '#475569',
                        fontSize: '0.66rem',
                        fontWeight: radius === preset.val ? 700 : 500,
                        cursor: isAdmin ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    marginTop: 6,
                    padding: '9px 16px',
                    backgroundColor: '#0284c7',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontSize: '0.80rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <Save size={14} />
                  <span>{saving ? 'Updating Database...' : 'Save Perimeter Configuration'}</span>
                </button>
              )}
            </form>
          </div>

          <div style={{ ...panelCardStyle, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>
                Perimeter Exceptions Log
              </div>
              <span style={{ fontSize: '0.68rem', color: '#64748b' }}>Automated Checks</span>
            </div>

            {geoData?.recent_breaches && geoData.recent_breaches.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {geoData.recent_breaches.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      fontSize: '0.72rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#991b1b' }}>{b.faculty_name}</strong>
                      <div style={{ fontSize: '0.66rem', color: '#64748b', marginTop: 1 }}>{b.reason}</div>
                    </div>
                    <span style={{ fontSize: '0.64rem', fontWeight: 700, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '12px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.74rem' }}>
                <CheckCircle2 size={18} color="#10b981" style={{ margin: '0 auto 4px auto', display: 'block' }} />
                No perimeter exceptions recorded today.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Live Faculty Telemetry & Bound Device Table */}
      <div style={panelCardStyle}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.90rem', fontWeight: 800, color: '#0f172a' }}>
              Faculty Live Presence & Hardware Device Audit
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Displays registered mobile devices, device locks, GPS presence, and battery status.
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Total Faculty: <strong>{geoData?.faculty_roster?.length || 0}</strong>
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '10px 16px' }}>Faculty Name</th>
                <th style={{ padding: '10px 16px' }}>Registered Hardware Device</th>
                <th style={{ padding: '10px 16px' }}>Presence Status</th>
                <th style={{ padding: '10px 16px' }}>Distance</th>
                <th style={{ padding: '10px 16px' }}>Battery</th>
                <th style={{ padding: '10px 16px' }}>Last Signal</th>
                {isAdmin && <th style={{ padding: '10px 16px', textAlign: 'right' }}>Device Lock Action</th>}
              </tr>
            </thead>
            <tbody>
              {geoData?.faculty_roster && geoData.faculty_roster.length > 0 ? (
                geoData.faculty_roster.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#0f172a' }}>
                      {s.faculty_name}
                      <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                        ID: {s.employee_id} &bull; {s.position}
                      </div>
                    </td>

                    {/* Faculty Device Display */}
                    <td style={{ padding: '10px 16px' }}>
                      {s.bound_device_id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Smartphone size={14} color="#0284c7" />
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.74rem' }}>
                              {s.device_model || 'Bound Device'}
                            </div>
                            <div style={{ fontSize: '0.64rem', color: '#64748b', fontFamily: 'monospace' }}>
                              UUID: {s.bound_device_id.slice(0, 10)}... &bull; Paired: {s.device_bound_at || 'Active'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Smartphone size={13} color="#cbd5e1" /> No device paired yet
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '10px 16px' }}>{getStatusBadge(s.status)}</td>

                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: '#334155' }}>
                      {s.distance}
                    </td>

                    <td style={{ padding: '10px 16px', color: '#475569' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <BatteryCharging size={13} color="#0284c7" />
                        {s.battery}
                      </span>
                    </td>

                    <td style={{ padding: '10px 16px', color: '#64748b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={12} />
                        {s.last_seen}
                      </span>
                    </td>

                    {/* Admin Device Reset Action */}
                    {isAdmin && (
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        {s.bound_device_id ? (
                          <button
                            type="button"
                            disabled={resettingId === s.id}
                            onClick={() => handleResetDevice(s.id, s.faculty_name)}
                            title="Unbind this phone to allow pairing a new device"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '4px 8px',
                              backgroundColor: '#fff1f2',
                              border: '1px solid #fecdd3',
                              borderRadius: 4,
                              color: '#e11d48',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            <RotateCcw size={11} className={resettingId === s.id ? 'animate-spin' : ''} />
                            <span>Reset Device</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.66rem', color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No faculty records found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 8,
  padding: '16px 18px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
};

const panelCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
  overflow: 'hidden',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.80rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const layerToggleBtn = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  borderRadius: 4,
  border: 'none',
  backgroundColor: active ? '#ffffff' : 'transparent',
  color: active ? '#0284c7' : '#64748b',
  fontWeight: active ? 700 : 500,
  fontSize: '0.68rem',
  cursor: 'pointer',
  boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
});

const statusBadgeStyle = (bg: string, color: string, border: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 4,
  backgroundColor: bg,
  color: color,
  border: `1px solid ${border}`,
  fontSize: '0.64rem',
  fontWeight: 700,
  letterSpacing: '0.3px',
});

export default GeofenceTab;