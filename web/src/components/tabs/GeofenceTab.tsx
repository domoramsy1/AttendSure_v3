/**
 * AttendSure - Geofence & Campus Perimeter Security (Real Data)
 * File: web/src/components/tabs/GeofenceTab.tsx
 *
 * Cybersecurity & Performance:
 * 1. Fluid Responsive Grid: Map and perimeter configuration stack cleanly on smaller screens.
 * 2. Real PostgreSQL Telemetry: Pulls live device pairings, GPS coordinates, and gate scan confirmations.
 * 3. Sanitized Device Lock Management: Administrators can clear hardware device locks with one tap.
 * 4. SVG Vector Standards: All visual indicators use Lucide icons with zero emojis.
 * 5. Simple English Terms: Clean labels for "Campus map", "Boundary radius", and "Device pairing".
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import {
  User,
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
  Radio,
  Check,
  X,
} from 'lucide-react';

export interface FacultyListItem {
  id: number;
  faculty_name: string;
  employee_id: string;
  position: string;
  status:
    | 'VERIFIED_INSIDE'
    | 'AUTHORIZED_LEAVE'
    | 'HEARTBEAT_LOST'
    | 'PERIMETER_BREACH'
    | 'NOT_ON_DUTY'
    | 'OFF_CAMPUS'
    | 'SPOOF_ATTEMPT';
  distance: string;
  battery: string;
  last_seen: string;
  device_model?: string | null;
  bound_device_id?: string | null;
  device_bound_at?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  is_mock_location?: boolean;
  gps_accuracy_meters?: number | null;
  gate_tap_verified?: boolean;
}

export interface GeofenceData {
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
  faculty_list: FacultyListItem[];
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
  const { school, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const circleInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [geoData, setGeoData] = useState<GeofenceData | null>(null);

  const [lat, setLat] = useState<number>(() => {
    const sLat = parseFloat(String((school as any)?.latitude));
    return !isNaN(sLat) && sLat !== 0 ? sLat : 8.4828;
  });

  const [lng, setLng] = useState<number>(() => {
    const sLng = parseFloat(String((school as any)?.longitude));
    return !isNaN(sLng) && sLng !== 0 ? sLng : 124.6617;
  });

  const [radius, setRadius] = useState<number>(() => {
    const sRad = parseInt(String((school as any)?.geofence_radius || (school as any)?.radius_meters), 10);
    return !isNaN(sRad) && sRad > 0 ? sRad : 150;
  });

  const isDirtyRef = useRef(false);
  const isInteracting = useRef(false);
  isInteracting.current = saving || resettingId !== null;

  const abortControllerRef = useRef<AbortController | null>(null);

  const userRole = (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userRole === 'PRINCIPAL' || userRole === 'SUPERUSER';

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

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const fetchGeofenceData = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const res = await apiClient.get<GeofenceData>('/geofence/', {
          timeout: 6000,
          signal: abortControllerRef.current.signal,
        });

        if (res.data) {
          setGeoData(res.data);
          if (!isDirtyRef.current) {
            setLat(res.data.latitude);
            setLng(res.data.longitude);
            setRadius(res.data.radius_meters);
          }
        }
      } catch (err: any) {
        if (err?.name !== 'CanceledError' && err?.name !== 'AbortError' && !silent) {
          showAlert({
            title: 'Telemetry Notice',
            message: 'Unable to reach telemetry service. Retrying in background...',
            type: 'warning',
          });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showAlert]
  );

  useEffect(() => {
    fetchGeofenceData(false);
  }, [fetchGeofenceData]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && !isDirtyRef.current) {
        fetchGeofenceData(true);
      }
    }, 5000);

    return () => clearInterval(liveInterval);
  }, [fetchGeofenceData]);

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
        zoom: 17,
        zoomControl: true,
      });

      tileLayerRef.current = L.tileLayer(getTileUrl(mapLayer), {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      mapInstanceRef.current = map;

      map.on('click', (e: any) => {
        if (!isAdmin) return;
        isDirtyRef.current = true;
        setLat(parseFloat(e.latlng.lat.toFixed(6)));
        setLng(parseFloat(e.latlng.lng.toFixed(6)));
      });
    }

    const currentMap = mapInstanceRef.current;

    if (tileLayerRef.current && (tileLayerRef.current as any)._layerType !== mapLayer) {
      currentMap.removeLayer(tileLayerRef.current);
      tileLayerRef.current = L.tileLayer(getTileUrl(mapLayer), { maxZoom: 19 }).addTo(currentMap);
      (tileLayerRef.current as any)._layerType = mapLayer;
    }

    const campusPinIcon = L.divIcon({
      className: 'campus-pin',
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background-color: #004b87;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0, 75, 135, 0.45);
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
        isDirtyRef.current = true;
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
        color: '#004b87',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 0.16,
      }).addTo(currentMap);
    }
  }, [leafletReady, lat, lng, radius, mapLayer, isAdmin]);

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      showAlert({ title: 'Hardware Error', message: 'GPS is not available on this device.', type: 'error' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        isDirtyRef.current = true;
        const detectedLat = parseFloat(pos.coords.latitude.toFixed(6));
        const detectedLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(detectedLat);
        setLng(detectedLng);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([detectedLat, detectedLng], 17);
        }
        showAlert({
          title: 'Location Centered',
          message: `Coordinates centered to your location: ${detectedLat}°N, ${detectedLng}°E.`,
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

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showAlert({
        title: 'Invalid Coordinates',
        message: 'Latitude must be between -90 and 90, and longitude between -180 and 180.',
        type: 'error',
      });
      return;
    }

    if (radius < 25 || radius > 1500) {
      showAlert({
        title: 'Invalid Radius',
        message: 'Radius must be between 25 meters and 1,500 meters.',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.put(
        '/geofence/',
        {
          latitude: lat,
          longitude: lng,
          radius_meters: radius,
        },
        { timeout: 8000 }
      );

      isDirtyRef.current = false;
      showAlert({
        title: 'Perimeter Saved',
        message: res.data?.message || 'Campus boundary updated successfully.',
        type: 'success',
      });
      refreshSchool();
      fetchGeofenceData(true);
    } catch (err: any) {
      showAlert({
        title: 'Save Failed',
        message: err.response?.data?.error || 'Could not update perimeter parameters.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDevice = (facultyId: number, facultyName: string) => {
    if (!isAdmin) return;

    showConfirm({
      title: 'Reset Hardware Device Lock',
      message: `Unbind the registered mobile phone for ${facultyName}? This clears their device lock and allows them to pair a new phone on their next check-in.`,
      confirmLabel: 'Reset Device Lock',
      isDestructive: true,
      onConfirm: async () => {
        setResettingId(facultyId);
        try {
          const res = await apiClient.post(`/faculty/${facultyId}/reset-device/`);
          showAlert({
            title: 'Device Lock Cleared',
            message: res.data?.message || `Device binding for ${facultyName} has been cleared.`,
            type: 'success',
          });
          fetchGeofenceData(true);
        } catch (err: any) {
          showAlert({
            title: 'Reset Failed',
            message: err.response?.data?.error || 'Could not clear device binding.',
            type: 'error',
          });
        } finally {
          setResettingId(null);
        }
      },
    });
  };

  const getStatusBadge = (s: FacultyListItem) => {
    if (s.is_mock_location || s.status === 'SPOOF_ATTEMPT') {
      return (
        <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>
          <ShieldAlert size={11} style={{ marginRight: 3 }} /> FAKE GPS BLOCKED
        </span>
      );
    }

    switch (s.status) {
      case 'VERIFIED_INSIDE':
        return (
          <span style={statusBadgeStyle('#ecfdf5', '#059669', '#a7f3d0')}>
            <Check size={11} style={{ marginRight: 3 }} /> VERIFIED ON SITE
          </span>
        );
      case 'AUTHORIZED_LEAVE':
        return <span style={statusBadgeStyle('#eff6ff', '#004b87', '#bfdbfe')}>OFFICIAL LEAVE</span>;
      case 'HEARTBEAT_LOST':
        return <span style={statusBadgeStyle('#fffbeb', '#d97706', '#fde68a')}>SIGNAL LOST (&gt;15M)</span>;
      case 'PERIMETER_BREACH':
        return <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>OUT OF BOUNDS</span>;
      case 'OFF_CAMPUS':
        return <span style={statusBadgeStyle('#f1f5f9', '#64748b', '#cbd5e1')}>OFF CAMPUS</span>;
      default:
        return <span style={statusBadgeStyle('#f8fafc', '#94a3b8', '#e2e8f0')}>OFF DUTY</span>;
    }
  };

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2
            style={{
              fontSize: '1.20rem',
              fontWeight: 800,
              color: '#0f172a',
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Building2 size={20} color="#004b87" />
            <span>Geofence &amp; Perimeter Security</span>
          </h2>
          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '3px 0 0 0' }}>
            Real-time telemetry: Live GPS verification, phone hardware pairing locks, and gate arrival confirmation.
          </p>
        </div>

        <button
          onClick={() => fetchGeofenceData(false)}
          disabled={loading}
          style={refreshBtnStyle}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Sync Telemetry</span>
        </button>
      </div>

      {/* 2. Real Telemetry KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>VERIFIED ON CAMPUS</span>
            <ShieldCheck size={18} color="#059669" />
          </div>
          <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
            {geoData?.verified_inside ?? 0}
          </div>
          <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
            GPS inside perimeter + Gate scan confirmed
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>SIGNAL LOST (&gt;15 MINS)</span>
            <WifiOff size={18} color={geoData?.missing_heartbeats ? '#d97706' : '#64748b'} />
          </div>
          <div
            style={{
              fontSize: '1.30rem',
              fontWeight: 800,
              color: geoData?.missing_heartbeats ? '#d97706' : '#0f172a',
              marginTop: 6,
            }}
          >
            {geoData?.missing_heartbeats ?? 0}
          </div>
          <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
            Phone disconnected or low battery
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>FAKE GPS BLOCKS</span>
            <ShieldAlert size={18} color={geoData?.spoof_attempts_blocked ? '#dc2626' : '#059669'} />
          </div>
          <div
            style={{
              fontSize: '1.30rem',
              fontWeight: 800,
              color: geoData?.spoof_attempts_blocked ? '#dc2626' : '#059669',
              marginTop: 6,
            }}
          >
            {geoData?.spoof_attempts_blocked ?? 0}
          </div>
          <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
            Mock location applications blocked
          </div>
        </div>

        <div style={kpiCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={kpiLabelStyle}>PERIMETER BREACHES</span>
            <AlertTriangle size={18} color={geoData?.incidents_today ? '#dc2626' : '#64748b'} />
          </div>
          <div
            style={{
              fontSize: '1.30rem',
              fontWeight: 800,
              color: geoData?.incidents_today ? '#dc2626' : '#0f172a',
              marginTop: 6,
            }}
          >
            {geoData?.incidents_today ?? 0}
          </div>
          <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
            Outside perimeter during duty hours
          </div>
        </div>
      </div>

      {/* 3. Real Leaflet Map & Database Parameter Controls */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={panelCardStyle}>
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', fontWeight: 700, color: '#1e293b' }}>
              <Compass size={15} color="#004b87" />
              <span>Campus Map Boundary</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', backgroundColor: '#e2e8f0', borderRadius: 6, padding: 2 }}>
                <button
                  type="button"
                  onClick={() => setMapLayer('streets')}
                  style={layerToggleBtn(mapLayer === 'streets')}
                >
                  <Layers size={11} />
                  <span>Roads</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMapLayer('satellite')}
                  style={layerToggleBtn(mapLayer === 'satellite')}
                >
                  <Layers size={11} />
                  <span>Satellite</span>
                </button>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={handleDetectGPS}
                  style={gpsDetectBtn}
                >
                  <Navigation size={11} />
                  <span>Center GPS</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', height: 380, backgroundColor: '#f1f5f9' }}>
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
            <div
              style={{
                position: 'absolute',
                bottom: 10,
                right: 10,
                zIndex: 10,
                backgroundColor: 'rgba(255, 255, 255, 0.94)',
                border: '1px solid #cbd5e1',
                padding: '4px 8px',
                borderRadius: 6,
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                color: '#334155',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
              }}
            >
              Center: {lat.toFixed(6)}°N, {lng.toFixed(6)}°E &bull; Radius: {radius}m
            </div>
          </div>

          <div style={{ padding: '8px 16px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', fontSize: '0.70rem', color: '#64748b' }}>
            {isAdmin ? (
              <span><strong>Admin:</strong> Drag the blue pin or click on the map to set the campus center point.</span>
            ) : (
              <span>Coordinates locked. Perimeter changes require Administrator permissions.</span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ ...panelCardStyle, padding: 18 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                borderBottom: '1px solid #f1f5f9',
                paddingBottom: 8,
              }}
            >
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  Perimeter Configuration
                </div>
                <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                  Official school boundary coordinates in database.
                </div>
              </div>
              {!isAdmin && (
                <span style={readOnlyBadgeStyle}>
                  <Lock size={10} /> Read-Only
                </span>
              )}
            </div>

            <form onSubmit={handleSavePerimeter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div>
                  <label style={fieldLabelStyle}>Center Latitude (°N)</label>
                  <input
                    type="number"
                    step="any"
                    disabled={!isAdmin}
                    required
                    value={lat}
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setLat(parseFloat(e.target.value) || 0);
                    }}
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
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setLng(parseFloat(e.target.value) || 0);
                    }}
                    style={fieldInputStyle}
                  />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={fieldLabelStyle}>Boundary Radius</label>
                  <span style={{ fontSize: '0.80rem', fontWeight: 800, color: '#004b87', fontFamily: 'monospace' }}>
                    {radius} meters
                  </span>
                </div>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="25"
                  disabled={!isAdmin}
                  value={radius}
                  onChange={(e) => {
                    isDirtyRef.current = true;
                    setRadius(Number(e.target.value));
                  }}
                  style={{ width: '100%', accentColor: '#004b87', cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                />

                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Gate Scanners (100m)', val: 100 },
                    { label: 'Campus Area (150m)', val: 150 },
                    { label: 'Compound (250m)', val: 250 },
                  ].map((preset) => (
                    <button
                      key={preset.val}
                      type="button"
                      disabled={!isAdmin}
                      onClick={() => {
                        isDirtyRef.current = true;
                        setRadius(preset.val);
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid #cbd5e1',
                        backgroundColor: radius === preset.val ? '#e0f2fe' : '#ffffff',
                        color: radius === preset.val ? '#004b87' : '#475569',
                        fontSize: '0.66rem',
                        fontWeight: radius === preset.val ? 800 : 600,
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
                  style={savePerimeterBtn}
                >
                  <Save size={13} />
                  <span>{saving ? 'Saving...' : 'Save Perimeter'}</span>
                </button>
              )}
            </form>
          </div>

          {/* Exceptions & Alerts Log */}
          <div style={{ ...panelCardStyle, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                Perimeter Exceptions &amp; Alerts
              </div>
              <span style={{ fontSize: '0.66rem', color: '#64748b' }}>Automated Verification</span>
            </div>

            {geoData?.recent_breaches && geoData.recent_breaches.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {geoData.recent_breaches.map((b) => (
                  <div
                    key={b.id}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 6,
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      fontSize: '0.70rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#991b1b' }}>{b.faculty_name}</strong>
                      <div style={{ fontSize: '0.64rem', color: '#64748b', marginTop: 1 }}>{b.reason}</div>
                    </div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#dc2626', backgroundColor: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '10px 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.72rem' }}>
                <CheckCircle2 size={16} color="#059669" style={{ margin: '0 auto 4px auto', display: 'block' }} />
                No perimeter violations or fake GPS attempts recorded today.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Live Real Faculty Database Table */}
      <div style={panelCardStyle}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
              Faculty Live Presence &amp; Device Pairing Audit
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
              Real-time hardware locks, distance verification, and gate scan confirmations.
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
            Total Faculty: <strong>{geoData?.faculty_list?.length || 0}</strong>
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: '9px 14px' }}>Faculty Member</th>
                <th style={{ padding: '9px 14px' }}>Registered Hardware Device</th>
                <th style={{ padding: '9px 14px' }}>Gate Scanner Status</th>
                <th style={{ padding: '9px 14px' }}>Presence Status</th>
                <th style={{ padding: '9px 14px' }}>Distance / Accuracy</th>
                <th style={{ padding: '9px 14px' }}>Battery</th>
                <th style={{ padding: '9px 14px' }}>Last Signal</th>
                {isAdmin && <th style={{ padding: '9px 14px', textAlign: 'right' }}>Device Lock Action</th>}
              </tr>
            </thead>
            <tbody>
              {(geoData?.faculty_list || []).length > 0 ? (
                geoData!.faculty_list.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            backgroundColor: '#f1f5f9',
                            border: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            flexShrink: 0,
                          }}
                        >
                          {s.photo_url || s.photo ? (
                            <img
                              src={s.photo_url || s.photo || ''}
                              alt={s.faculty_name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <User size={16} color="#94a3b8" />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.82rem' }}>
                            {s.faculty_name}
                          </div>
                          <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                            ID: {s.employee_id} &bull; {s.position}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '9px 14px' }}>
                      {s.bound_device_id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Smartphone size={13} color="#004b87" />
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.72rem' }}>
                              {s.device_model || 'Registered Phone'}
                            </div>
                            <div style={{ fontSize: '0.64rem', color: '#64748b', fontFamily: 'monospace' }}>
                              UUID: {s.bound_device_id.slice(0, 10)}...
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Smartphone size={12} color="#cbd5e1" /> No device paired
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '9px 14px' }}>
                      {s.gate_tap_verified ? (
                        <span style={{ color: '#059669', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.70rem' }}>
                          <Check size={12} /> Gate Tap Confirmed
                        </span>
                      ) : (
                        <span style={{ color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.70rem' }}>
                          <X size={12} /> No Gate Scan
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '9px 14px' }}>{getStatusBadge(s)}</td>

                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#334155' }}>
                      <div>{s.distance}</div>
                      {s.gps_accuracy_meters !== undefined && s.gps_accuracy_meters !== null && (
                        <div style={{ fontSize: '0.64rem', color: s.gps_accuracy_meters > 25 ? '#d97706' : '#059669', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Radio size={9} /> &plusmn;{s.gps_accuracy_meters}m
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '9px 14px', color: '#475569' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <BatteryCharging size={12} color="#004b87" />
                        {s.battery}
                      </span>
                    </td>

                    <td style={{ padding: '9px 14px', color: '#64748b' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        {s.last_seen}
                      </span>
                    </td>

                    {isAdmin && (
                      <td style={{ padding: '9px 14px', textAlign: 'right' }}>
                        {s.bound_device_id ? (
                          <button
                            type="button"
                            disabled={resettingId === s.id}
                            onClick={() => handleResetDevice(s.id, s.faculty_name)}
                            title="Unbind phone hardware lock"
                            style={resetDeviceBtnStyle}
                          >
                            <RotateCcw size={11} className={resettingId === s.id ? 'animate-spin' : ''} />
                            <span>Reset Lock</span>
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
                  <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                    No faculty records found in database.
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

// Styles
const kpiCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 8,
  padding: '14px 16px',
  border: '1px solid #e2e8f0',
};

const kpiLabelStyle: React.CSSProperties = {
  fontSize: '0.64rem',
  fontWeight: 800,
  color: '#64748b',
  letterSpacing: '0.4px',
};

const panelCardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  overflow: 'hidden',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.70rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const layerToggleBtn = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  borderRadius: 4,
  border: 'none',
  backgroundColor: active ? '#ffffff' : 'transparent',
  color: active ? '#004b87' : '#64748b',
  fontWeight: active ? 800 : 500,
  fontSize: '0.66rem',
  cursor: 'pointer',
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
  fontWeight: 800,
  letterSpacing: '0.3px',
});

const refreshBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 12px',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  color: '#334155',
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const gpsDetectBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  color: '#004b87',
  fontSize: '0.70rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const readOnlyBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: '0.64rem',
  color: '#64748b',
  backgroundColor: '#f1f5f9',
  padding: '2px 6px',
  borderRadius: 4,
  fontWeight: 700,
};

const savePerimeterBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  marginTop: 4,
  padding: '8px 14px',
  backgroundColor: '#004b87',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.78rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const resetDeviceBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '3px 8px',
  backgroundColor: '#fff1f2',
  border: '1px solid #fecdd3',
  borderRadius: 4,
  color: '#dc2626',
  fontSize: '0.66rem',
  fontWeight: 700,
  cursor: 'pointer',
};

export default GeofenceTab;