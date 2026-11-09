/**
 * AttendSure - Zero-Mock Geofence Boundary & Telemetry Audit System
 * File: web/src/components/tabs/GeofenceTab.tsx
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
  Wifi,
  WifiOff,
  BatteryCharging,
  RotateCcw,
  Radio,
  Check,
  Maximize2,
  FileSpreadsheet,
  History,
  MapPin,
  Search,
  Network,
} from 'lucide-react';

export interface FacultyListItem {
  id: number;
  faculty_name: string;
  employee_id: string;
  position: string | null;
  status:
    | 'VERIFIED_INSIDE'
    | 'AUTHORIZED_LEAVE'
    | 'HEARTBEAT_LOST'
    | 'PERIMETER_BREACH'
    | 'NOT_ON_DUTY'
    | 'OFF_CAMPUS'
    | 'SPOOF_ATTEMPT';
  is_online?: boolean;
  online_status?: 'ONLINE' | 'OFFLINE';
  status_duration?: string | null;
  connection_label?: string | null;
  distance: string | null;
  battery: string | null;
  last_seen: string | null;
  device_model?: string | null;
  bound_device_id?: string | null;
  device_bound_at?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  is_mock_location?: boolean;
  gps_accuracy_meters?: number | null;
  signal_strength?: string | null;
  signal_percentage?: number | null;
  ip_address?: string | null;
  mac_address?: string | null;
  gate_tap_verified?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface GeofenceData {
  zone_id: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_configured: boolean;
  verified_inside: number;
  online_users_count?: number;
  offline_users_count?: number;
  missing_heartbeats: number;
  spoof_attempts_blocked: number;
  incidents_today: number;
  faculty_list: FacultyListItem[];
  faculty_class_list?: FacultyListItem[];
  recent_breaches: Array<{
    id: number;
    faculty_name: string;
    reason: string;
    status: string;
    time: string;
  }>;
}

export interface AuditRecord {
  id: number;
  faculty_id: number;
  faculty_name: string;
  employee_id: string;
  timestamp: string;
  time_only: string;
  date_only: string;
  latitude: number;
  longitude: number;
  distance: string | null;
  distance_meters: number | null;
  verdict: 'VERIFIED_INSIDE' | 'LOAFING_OUT_OF_BOUNDS';
  is_inside: boolean;
  signal_strength?: string | null;
  signal_percentage?: number | null;
  ip_address?: string | null;
  mac_address?: string | null;
  battery: string | null;
  device_model: string | null;
  bound_device_id?: string | null;
}

declare global {
  interface Window {
    L: any;
  }
}

export const GeofenceTab: React.FC = () => {
  const { school, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();

  const [activeScreen, setActiveScreen] = useState<'LIVE_MAP' | 'AUDIT_SCREEN'>('LIVE_MAP');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const circleInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const userMarkersLayerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [geoData, setGeoData] = useState<GeofenceData | null>(null);

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [totalDatabaseRecords, setTotalDatabaseRecords] = useState<number>(0);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditFacultyFilter, setAuditFacultyFilter] = useState<string>('ALL');
  const [auditVerdictFilter, setAuditVerdictFilter] = useState<'ALL' | 'INSIDE' | 'LOAFING'>('ALL');
  const [dateFilterMode, setDateFilterMode] = useState<'ALL_LOGS' | 'SPECIFIC_DATE'>('ALL_LOGS');
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  // Read coordinates directly from database records without mock fallbacks
  const [lat, setLat] = useState<number | null>(() => {
    const sLat = parseFloat(String((school as any)?.latitude));
    return !isNaN(sLat) && sLat !== 0 ? sLat : null;
  });

  const [lng, setLng] = useState<number | null>(() => {
    const sLng = parseFloat(String((school as any)?.longitude));
    return !isNaN(sLng) && sLng !== 0 ? sLng : null;
  });

  const [radius, setRadius] = useState<number | null>(() => {
    const sRad = parseInt(
      String((school as any)?.geofence_radius || (school as any)?.geofence_radius_meters || (school as any)?.radius_meters),
      10
    );
    return !isNaN(sRad) && sRad > 0 ? sRad : null;
  });

  const isDirtyRef = useRef(false);
  const isInteracting = useRef(false);
  isInteracting.current = saving || resettingId !== null;

  const userRole = (localStorage.getItem('attendsure_role') || '').toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userRole === 'PRINCIPAL' || userRole === 'SUPERUSER';

  useEffect(() => {
    if (window.L) {
      setLeafletReady(true);
      return;
    }

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setLeafletReady(true);
      document.head.appendChild(script);
    } else {
      const existing = document.getElementById('leaflet-js');
      existing?.addEventListener('load', () => setLeafletReady(true));
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const fetchGeofenceData = useCallback(
    async (silent: boolean = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await apiClient.get<GeofenceData>('/geofence/', { timeout: 8000 });
        if (res.data) {
          setGeoData(res.data);
          if (!isDirtyRef.current) {
            const recLat = res.data.latitude !== null ? parseFloat(String(res.data.latitude)) : null;
            const recLng = res.data.longitude !== null ? parseFloat(String(res.data.longitude)) : null;
            const recRad = res.data.radius_meters !== null ? parseInt(String(res.data.radius_meters), 10) : null;

            if (recLat !== null && !isNaN(recLat)) setLat(recLat);
            if (recLng !== null && !isNaN(recLng)) setLng(recLng);
            if (recRad !== null && !isNaN(recRad)) setRadius(recRad);
          }
        }
      } catch {
        if (!silent) {
          showAlert({
            title: 'Connection Notice',
            message: 'Unable to reach the school server for telemetry updates.',
            type: 'warning',
          });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showAlert]
  );

  const fetchAuditHistory = useCallback(
    async (silent: boolean = false) => {
      if (!silent) setAuditLoading(true);
      try {
        const params = new URLSearchParams();
        if (dateFilterMode === 'SPECIFIC_DATE' && auditDate) {
          params.append('date_from', auditDate);
        }
        if (auditFacultyFilter !== 'ALL') {
          params.append('faculty_id', auditFacultyFilter);
        }
        if (auditVerdictFilter !== 'ALL') {
          params.append('status', auditVerdictFilter);
        }
        if (auditSearchQuery.trim()) {
          params.append('search', auditSearchQuery.trim());
        }

        const res = await apiClient.get(`/geofence/audit/?${params.toString()}`, { timeout: 8000 });
        if (res.data?.records) {
          setAuditRecords(res.data.records);
          setTotalDatabaseRecords(res.data.total_heartbeats ?? res.data.records.length);
        }
      } catch {
        if (!silent) {
          showAlert({
            title: 'Audit Log Error',
            message: 'Could not load geofence records from the server.',
            type: 'error',
          });
        }
      } finally {
        if (!silent) setAuditLoading(false);
      }
    },
    [dateFilterMode, auditDate, auditFacultyFilter, auditVerdictFilter, auditSearchQuery, showAlert]
  );

  useEffect(() => {
    fetchGeofenceData(false);
  }, [fetchGeofenceData]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && !isDirtyRef.current) {
        if (activeScreen === 'LIVE_MAP') {
          fetchGeofenceData(true);
        } else if (activeScreen === 'AUDIT_SCREEN') {
          fetchAuditHistory(true);
        }
      }
    }, 5000);
    return () => clearInterval(liveInterval);
  }, [fetchGeofenceData, fetchAuditHistory, activeScreen]);

  useEffect(() => {
    if (activeScreen === 'AUDIT_SCREEN') {
      fetchAuditHistory(false);
    }
  }, [activeScreen, fetchAuditHistory]);

  // Leaflet Map Initialization with Tab Remount Recovery
  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !leafletReady || !mapContainerRef.current) return;
    if (lat === null || lng === null) return;
    const L = window.L;

    const getTileUrl = (layer: 'streets' | 'satellite') => {
      if (layer === 'satellite') {
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      }
      return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    };

    if (mapInstanceRef.current && mapInstanceRef.current.getContainer() !== mapContainerRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
      circleInstanceRef.current = null;
      userMarkersLayerRef.current = null;
      tileLayerRef.current = null;
    }

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

      userMarkersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);

      map.on('click', (e: any) => {
        if (!isAdmin) return;
        isDirtyRef.current = true;
        setLat(parseFloat(e.latlng.lat.toFixed(6)));
        setLng(parseFloat(e.latlng.lng.toFixed(6)));
      });
    } else {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    }

    const currentMap = mapInstanceRef.current;

    if (tileLayerRef.current && (tileLayerRef.current as any)._layerType !== mapLayer) {
      currentMap.removeLayer(tileLayerRef.current);
      tileLayerRef.current = L.tileLayer(getTileUrl(mapLayer), { maxZoom: 19 }).addTo(currentMap);
      (tileLayerRef.current as any)._layerType = mapLayer;
    }

    const campusCenterIcon = L.divIcon({
      className: 'campus-center-beacon',
      html: `
        <div style="width: 36px; height: 36px; background-color: #004b87; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,75,135,0.5); display: flex; align-items: center; justify-content: center; color: #ffffff;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
    });

    if (markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([lat, lng]);
    } else {
      markerInstanceRef.current = L.marker([lat, lng], {
        icon: campusCenterIcon,
        draggable: isAdmin,
      }).addTo(currentMap);

      markerInstanceRef.current.on('dragend', (e: any) => {
        isDirtyRef.current = true;
        const pos = e.target.getLatLng();
        setLat(parseFloat(pos.lat.toFixed(6)));
        setLng(parseFloat(pos.lng.toFixed(6)));
      });
    }

    if (radius !== null) {
      if (circleInstanceRef.current) {
        circleInstanceRef.current.setLatLng([lat, lng]);
        circleInstanceRef.current.setRadius(radius);
      } else {
        circleInstanceRef.current = L.circle([lat, lng], {
          radius: radius,
          color: '#0284c7',
          weight: 2.5,
          fillColor: '#38bdf8',
          fillOpacity: 0.14,
          dashArray: '6, 6',
        }).addTo(currentMap);
      }
    }
  }, [activeScreen, leafletReady, lat, lng, radius, mapLayer, isAdmin]);

  const renderSignalBars = (percentage: number | null | undefined) => {
    if (percentage === null || percentage === undefined) {
      return <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>—</span>;
    }

    const bars = [25, 50, 75, 100];
    const color = percentage >= 75 ? '#16a34a' : percentage >= 45 ? '#d97706' : '#dc2626';

    return (
      <div style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14 }}>
        {bars.map((thresh, idx) => {
          const isActive = percentage >= thresh;
          const height = 4 + idx * 3;
          return (
            <span
              key={idx}
              style={{
                width: 3,
                height: height,
                backgroundColor: isActive ? color : '#cbd5e1',
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !leafletReady || !mapInstanceRef.current || !userMarkersLayerRef.current) return;
    const L = window.L;
    const layer = userMarkersLayerRef.current;
    layer.clearLayers();

    const faculty = geoData?.faculty_list || [];

    faculty.forEach((user: FacultyListItem) => {
      const userLat = parseFloat(String(user.latitude));
      const userLng = parseFloat(String(user.longitude));

      if (isNaN(userLat) || isNaN(userLng) || userLat === 0 || userLng === 0) return;

      const isOnline = Boolean(user.is_online);
      const isBreach = user.status === 'PERIMETER_BREACH' || user.status === 'OFF_CAMPUS';
      const isSpoof = user.is_mock_location || user.status === 'SPOOF_ATTEMPT';

      if ((isBreach || isSpoof) && lat !== null && lng !== null) {
        const linePath = [
          [lat, lng],
          [userLat, userLng],
        ];

        const connectingLine = L.polyline(linePath, {
          color: isSpoof ? '#dc2626' : isOnline ? '#e11d48' : '#94a3b8',
          weight: 2.5,
          opacity: isOnline ? 0.85 : 0.45,
          dashArray: '6, 8',
          lineCap: 'round',
        }).addTo(layer);

        connectingLine.bindTooltip(
          `
            <div style="font-family: inherit; font-size: 11px; padding: 2px;">
              <strong style="color: #991b1b;">${user.faculty_name}</strong><br/>
              <span>Distance to School: <strong>${user.distance || '—'}</strong></span>
            </div>
          `,
          { sticky: true, opacity: 0.95 }
        );
      }

      const pinColor = isOnline ? '#16a34a' : '#64748b';
      const ringBg = isOnline ? 'rgba(22, 163, 74, 0.35)' : 'rgba(100, 116, 139, 0.15)';
      const statusLabel = isSpoof ? 'Fake GPS Blocked' : isBreach ? 'Outside School Grounds' : 'Inside School Grounds';
      const onlineTag = isOnline ? '● Online' : '○ Offline';

      const avatarSrc = user.photo_url || user.photo;
      const initials = (user.faculty_name || '')
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      const avatarInnerHtml = avatarSrc
        ? `<img src="${avatarSrc}" alt="${user.faculty_name}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #f1f5f9; color: ${pinColor}; font-weight: 800; font-size: 14px;">${initials}</div>`
        : `<div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #f1f5f9; color: ${pinColor}; font-weight: 800; font-size: 14px;">${initials}</div>`;

      const userLocationPinIcon = L.divIcon({
        className: 'user-location-pin-marker',
        html: `
          <div style="position: relative; width: 50px; height: 60px; display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.30));">
            ${
              isOnline
                ? `<div style="
                    position: absolute;
                    top: 0;
                    left: 1px;
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background-color: ${ringBg};
                    animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
                    z-index: 0;
                  "></div>`
                : ''
            }

            <svg width="50" height="60" viewBox="0 0 50 60" fill="none" style="position: absolute; top: 0; left: 0; z-index: 1;">
              <path d="M25 0C11.193 0 0 11.193 0 25C0 41.5 25 60 25 60C25 60 50 41.5 50 25C50 11.193 38.807 0 25 0Z" fill="${pinColor}"/>
              <circle cx="25" cy="25" r="21" fill="#ffffff"/>
            </svg>

            <div style="
              position: absolute;
              top: 4px;
              left: 4px;
              width: 42px;
              height: 42px;
              border-radius: 50%;
              overflow: hidden;
              background-color: #ffffff;
              z-index: 2;
            ">
              ${avatarInnerHtml}
            </div>

            <div style="
              position: absolute;
              top: 32px;
              right: 4px;
              width: 12px;
              height: 12px;
              border-radius: 50%;
              background-color: ${pinColor};
              border: 2px solid #ffffff;
              z-index: 4;
            "></div>

            <div style="
              position: absolute;
              top: 64px;
              z-index: 3;
              background-color: rgba(15, 23, 42, 0.94);
              color: #ffffff;
              font-size: 10px;
              font-weight: 800;
              padding: 2px 8px;
              border-radius: 4px;
              white-space: nowrap;
              box-shadow: 0 2px 6px rgba(0,0,0,0.30);
              border: 1px solid rgba(255, 255, 255, 0.15);
              pointer-events: none;
            ">
              ${user.faculty_name} &bull; <span style="color: ${isOnline ? '#4ade80' : '#cbd5e1'}; font-weight: 800;">${onlineTag}</span> (${user.distance || '—'})
            </div>
          </div>
        `,
        iconSize: [50, 60],
        iconAnchor: [25, 60],
      });

      const marker = L.marker([userLat, userLng], { icon: userLocationPinIcon }).addTo(layer);

      const tooltipContent = `
        <div style="font-family: inherit; font-size: 11px; line-height: 1.4; min-width: 210px; padding: 4px;">
          <div style="font-weight: 800; font-size: 12px; color: #0f172a; margin-bottom: 2px;">
            ${user.faculty_name}
          </div>
          <div style="color: #64748b; font-size: 10px; margin-bottom: 6px;">
            ID: ${user.employee_id} &bull; ${user.position || '—'}
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Connection:</span>
            <strong style="color: ${isOnline ? '#16a34a' : '#64748b'};">
              ${user.connection_label || (isOnline ? 'Online' : 'Offline')}
            </strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Signal Strength:</span>
            <strong style="color: #004b87;">${user.signal_strength || '—'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Campus Boundary:</span>
            <strong style="color: ${isBreach ? '#dc2626' : '#16a34a'};">${statusLabel}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Distance from School:</span>
            <strong>${user.distance || '—'}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Device Battery:</span>
            <strong>${user.battery || '—'}</strong>
          </div>
          <div style="color: #004b87; font-size: 9px; font-family: monospace; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px;">
            IP: ${user.ip_address || '—'} &bull; Device ID: ${user.mac_address || user.bound_device_id || '—'}
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -60],
        opacity: 0.98,
      });
    });
  }, [activeScreen, leafletReady, geoData, lat, lng, radius]);

  const handleFitAllOnMap = () => {
    if (!mapInstanceRef.current || !window.L || lat === null || lng === null) return;
    const L = window.L;
    const bounds = L.latLngBounds([[lat, lng]]);

    (geoData?.faculty_list || []).forEach((u) => {
      const uLat = parseFloat(String(u.latitude));
      const uLng = parseFloat(String(u.longitude));
      if (!isNaN(uLat) && !isNaN(uLng) && uLat !== 0) {
        bounds.extend([uLat, uLng]);
      }
    });

    mapInstanceRef.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      showAlert({ title: 'Hardware Error', message: 'GPS location is not supported by this browser.', type: 'error' });
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
    if (!isAdmin || lat === null || lng === null || radius === null) return;

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
        message: res.data?.message || 'School boundary updated successfully.',
        type: 'success',
      });
      refreshSchool();
      fetchGeofenceData(true);
    } catch (err: any) {
      showAlert({
        title: 'Save Failed',
        message: err.response?.data?.error || 'Could not update boundary parameters.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDevice = (facultyId: number, facultyName: string) => {
    if (!isAdmin) return;

    showConfirm({
      title: 'Reset Hardware Phone Lock',
      message: `Unbind the registered phone for ${facultyName}? This clears their device lock and allows them to pair a new phone on their next check-in.`,
      confirmLabel: 'Reset Device Lock',
      isDestructive: true,
      onConfirm: async () => {
        setResettingId(facultyId);
        try {
          const res = await apiClient.post(`/faculty/${facultyId}/reset-device/`);
          showAlert({
            title: 'Device Lock Cleared',
            message: res.data?.message || `Phone binding for ${facultyName} has been cleared.`,
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

  const exportAuditCSV = () => {
    if (auditRecords.length === 0) {
      showAlert({ title: 'Empty Export', message: 'No geofence records available to export.', type: 'warning' });
      return;
    }

    const headers = [
      'Timestamp (1m Interval)',
      'Faculty Member',
      'Employee ID',
      'Presence Verdict',
      'Distance from School',
      'Signal Strength',
      'IP Address',
      'MAC Address / Hardware ID',
      'Battery',
      'Device Model',
    ];
    const rows = auditRecords.map((r) => [
      `"${r.timestamp}"`,
      `"${r.faculty_name}"`,
      `"${r.employee_id}"`,
      `"${r.verdict === 'VERIFIED_INSIDE' ? 'Inside School Grounds' : 'Outside School Grounds'}"`,
      `"${r.distance || '—'}"`,
      `"${r.signal_strength || '—'}"`,
      `"${r.ip_address || '—'}"`,
      `"${r.mac_address || r.bound_device_id || '—'}"`,
      `"${r.battery || '—'}"`,
      `"${r.device_model || '—'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AttendSure_Geofence_Logs_${dateFilterMode === 'ALL_LOGS' ? 'All_Logs' : auditDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (s: FacultyListItem) => {
    if (s.is_mock_location || s.status === 'SPOOF_ATTEMPT') {
      return (
        <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>
          <ShieldAlert size={11} style={{ marginRight: 3 }} /> Fake GPS Blocked
        </span>
      );
    }

    switch (s.status) {
      case 'VERIFIED_INSIDE':
        return (
          <span style={statusBadgeStyle('#ecfdf5', '#059669', '#a7f3d0')}>
            <Check size={11} style={{ marginRight: 3 }} /> Inside School Grounds
          </span>
        );
      case 'AUTHORIZED_LEAVE':
        return <span style={statusBadgeStyle('#eff6ff', '#004b87', '#bfdbfe')}>Official Gate Pass</span>;
      case 'HEARTBEAT_LOST':
        return <span style={statusBadgeStyle('#f1f5f9', '#64748b', '#cbd5e1')}>Signal Lost</span>;
      case 'PERIMETER_BREACH':
      case 'OFF_CAMPUS':
        return <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>Outside School Grounds</span>;
      case 'NOT_ON_DUTY':
      default:
        return <span style={statusBadgeStyle('#f8fafc', '#94a3b8', '#e2e8f0')}>Off Duty</span>;
    }
  };

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Header with Screen Mode Switcher */}
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
            <span>Geofence Boundary &amp; Location Audit</span>
          </h2>
          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '3px 0 0 0' }}>
            Live GPS telemetry: 1-minute check-ins, IP &amp; MAC address records, and boundary tracking.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', backgroundColor: '#e2e8f0', borderRadius: 6, padding: 2 }}>
            <button
              type="button"
              onClick={() => setActiveScreen('LIVE_MAP')}
              style={screenSwitchBtn(activeScreen === 'LIVE_MAP')}
            >
              <MapPin size={12} />
              <span>Live Boundary Map</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('AUDIT_SCREEN')}
              style={screenSwitchBtn(activeScreen === 'AUDIT_SCREEN')}
            >
              <History size={12} />
              <span>Geofencing Logs</span>
            </button>
          </div>

          <button
            onClick={() => (activeScreen === 'LIVE_MAP' ? fetchGeofenceData(false) : fetchAuditHistory(false))}
            disabled={loading || auditLoading}
            style={refreshBtnStyle}
          >
            <RefreshCw size={13} className={loading || auditLoading ? 'animate-spin' : ''} />
            <span>{activeScreen === 'LIVE_MAP' ? 'Refresh Map' : 'Refresh Logs'}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: LIVE MAP (Preserved in DOM to prevent Leaflet blanking) */}
      <div style={{ display: activeScreen === 'LIVE_MAP' ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={kpiLabelStyle}>ONLINE USERS (GREEN)</span>
              <Wifi size={18} color="#16a34a" />
            </div>
            <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#16a34a', marginTop: 6 }}>
              {geoData?.online_users_count ?? 0}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
              Active GPS within 1 minute
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={kpiLabelStyle}>OFFLINE USERS (GRAY)</span>
              <WifiOff size={18} color="#64748b" />
            </div>
            <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#64748b', marginTop: 6 }}>
              {geoData?.offline_users_count ?? 0}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
              No signal or inactive &gt;1 minute
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={kpiLabelStyle}>INSIDE SCHOOL GROUNDS</span>
              <ShieldCheck size={18} color="#059669" />
            </div>
            <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
              {geoData?.verified_inside ?? 0}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
              {radius !== null ? `Within ${radius}m boundary` : 'Perimeter unconfigured'}
            </div>
          </div>

          <div style={kpiCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={kpiLabelStyle}>OUTSIDE SCHOOL GROUNDS</span>
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
              Beyond allowed campus area
            </div>
          </div>
        </div>

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
                <span>Campus Boundary Visualizer</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleFitAllOnMap}
                  style={gpsDetectBtn}
                  title="Zoom out to show school boundary and all faculty pins"
                >
                  <Maximize2 size={11} />
                  <span>Show All</span>
                </button>

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
                    title="Center map to your computer's GPS"
                  >
                    <Navigation size={11} />
                    <span>Center</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 420, backgroundColor: '#f1f5f9' }}>
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
                {lat !== null && lng !== null
                  ? `Center: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E • Radius: ${radius ?? 0}m`
                  : 'Perimeter Not Configured in Database'}
              </div>
            </div>

            <div style={{ padding: '8px 16px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#64748b' }}>
              <strong>Color Indicator:</strong>
              <span style={{ color: '#16a34a', marginLeft: 8, fontWeight: 700 }}>&bull; Green Pin = Online</span>
              <span style={{ color: '#64748b', marginLeft: 10, fontWeight: 700 }}>&bull; Gray Pin = Offline</span>
              <span style={{ marginLeft: 10, color: '#e11d48', fontWeight: 600 }}>&bull; Dashed line = Outside school grounds</span>
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
                      value={lat ?? ''}
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
                      value={lng ?? ''}
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
                      {radius !== null ? `${radius} meters` : 'Not set'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    step="25"
                    disabled={!isAdmin}
                    value={radius ?? 150}
                    onChange={(e) => {
                      isDirtyRef.current = true;
                      setRadius(Number(e.target.value));
                    }}
                    style={{ width: '100%', accentColor: '#004b87', cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                  />
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

            <div style={{ ...panelCardStyle, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a' }}>
                  Perimeter Alerts
                </div>
                <span style={{ fontSize: '0.66rem', color: '#64748b' }}>Automated Verification</span>
              </div>

              {geoData?.recent_breaches && geoData.recent_breaches.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {geoData.recent_breaches.map((b: any, idx: number) => (
                    <div
                      key={`${b.id}-${idx}`}
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
                  No boundary violations or fake GPS attempts recorded today.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={panelCardStyle}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                Faculty Live Status &amp; Device Information
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                Authentic connection status (green = online, gray = offline), signal strength, and hardware info.
              </div>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Total Faculty: <strong>{geoData?.faculty_list?.length || 0}</strong>
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '9px 14px' }}>Faculty Member</th>
                  <th style={{ padding: '9px 14px' }}>Connection</th>
                  <th style={{ padding: '9px 14px' }}>Signal Strength</th>
                  <th style={{ padding: '9px 14px' }}>School Boundary</th>
                  <th style={{ padding: '9px 14px' }}>Distance / GPS</th>
                  <th style={{ padding: '9px 14px' }}>IP &amp; Device Hardware</th>
                  <th style={{ padding: '9px 14px' }}>Battery</th>
                  {isAdmin && <th style={{ padding: '9px 14px', textAlign: 'right' }}>Device Lock Action</th>}
                </tr>
              </thead>
              <tbody>
                {(geoData?.faculty_list || []).length > 0 ? (
                  geoData!.faculty_list.map((s) => {
                    const avatarSrc = s.photo_url || s.photo;
                    const isOnline = Boolean(s.is_online);

                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ position: 'relative', width: 34, height: 34 }}>
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
                                }}
                              >
                                {avatarSrc ? (
                                  <img
                                    src={avatarSrc}
                                    alt={s.faculty_name}
                                    onError={(e) => {
                                      (e.target as HTMLElement).style.display = 'none';
                                    }}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <User size={16} color="#94a3b8" />
                                )}
                              </div>
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: -1,
                                  right: -1,
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: isOnline ? '#16a34a' : '#64748b',
                                  border: '2px solid #ffffff',
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.82rem' }}>
                                {s.faculty_name}
                              </div>
                              <div style={{ fontSize: '0.66rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                ID: {s.employee_id} &bull; {s.position || '—'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div>
                              {isOnline ? (
                                <span style={statusBadgeStyle('#ecfdf5', '#16a34a', '#a7f3d0')}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a', marginRight: 5 }} />
                                  ONLINE
                                </span>
                              ) : (
                                <span style={statusBadgeStyle('#f1f5f9', '#64748b', '#cbd5e1')}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#94a3b8', marginRight: 5 }} />
                                  OFFLINE
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.68rem', color: isOnline ? '#15803d' : '#64748b', fontWeight: 600 }}>
                              {s.status_duration || s.last_seen || '—'}
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {renderSignalBars(s.signal_percentage)}
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isOnline ? '#0f172a' : '#64748b' }}>
                                {s.signal_strength || '—'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '9px 14px' }}>{getStatusBadge(s)}</td>

                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#334155' }}>
                          <div>{s.distance || '—'}</div>
                          {s.gps_accuracy_meters !== undefined && s.gps_accuracy_meters !== null && (
                            <div style={{ fontSize: '0.64rem', color: s.gps_accuracy_meters > 25 ? '#d97706' : '#16a34a', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Radio size={9} /> &plusmn;{s.gps_accuracy_meters}m
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '9px 14px' }}>
                          {s.bound_device_id || s.ip_address ? (
                            <div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Network size={11} color="#004b87" /> {s.ip_address || '—'}
                              </div>
                              <div style={{ fontSize: '0.64rem', color: '#64748b', fontFamily: 'monospace' }}>
                                Device: {s.mac_address || s.bound_device_id || '—'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontStyle: 'italic' }}>
                              —
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '9px 14px', color: '#475569' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <BatteryCharging size={12} color="#004b87" />
                            {s.battery || '—'}
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
                    );
                  })
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

      {/* VIEW 2: GEOFENCING LOGS */}
      <div style={{ display: activeScreen === 'AUDIT_SCREEN' ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...panelCardStyle, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={fieldLabelStyle}>Search Faculty Name, ID, IP, or MAC</label>
                <input
                  type="text"
                  placeholder="Search name, ID, IP, or MAC..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchAuditHistory(false)}
                  style={fieldInputStyle}
                />
              </div>

              <div>
                <label style={fieldLabelStyle}>Filter Faculty</label>
                <select
                  value={auditFacultyFilter}
                  onChange={(e) => setAuditFacultyFilter(e.target.value)}
                  style={{ ...fieldInputStyle, width: 160 }}
                >
                  <option value="ALL">All Faculty Members</option>
                  {(geoData?.faculty_list || []).map((f) => (
                    <option key={f.id} value={String(f.id)}>
                      {f.faculty_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={fieldLabelStyle}>Log Date Filter</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setDateFilterMode('ALL_LOGS')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: dateFilterMode === 'ALL_LOGS' ? '#004b87' : '#ffffff',
                      color: dateFilterMode === 'ALL_LOGS' ? '#ffffff' : '#334155',
                      fontWeight: dateFilterMode === 'ALL_LOGS' ? 800 : 600,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    All Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateFilterMode('SPECIFIC_DATE')}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: '1px solid #cbd5e1',
                      backgroundColor: dateFilterMode === 'SPECIFIC_DATE' ? '#004b87' : '#ffffff',
                      color: dateFilterMode === 'SPECIFIC_DATE' ? '#ffffff' : '#334155',
                      fontWeight: dateFilterMode === 'SPECIFIC_DATE' ? 800 : 600,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    By Date
                  </button>
                </div>
              </div>

              {dateFilterMode === 'SPECIFIC_DATE' && (
                <div>
                  <label style={fieldLabelStyle}>Select Date</label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    style={{ ...fieldInputStyle, width: 140 }}
                  />
                </div>
              )}

              <div>
                <label style={fieldLabelStyle}>Boundary Verdict</label>
                <select
                  value={auditVerdictFilter}
                  onChange={(e) => setAuditVerdictFilter(e.target.value as any)}
                  style={{ ...fieldInputStyle, width: 160 }}
                >
                  <option value="ALL">All Verdicts</option>
                  <option value="INSIDE">Inside School Grounds</option>
                  <option value="LOAFING">Outside School Grounds</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => fetchAuditHistory(false)}
                disabled={auditLoading}
                style={primaryBtnStyle}
              >
                <Search size={13} />
                <span>Search Logs</span>
              </button>

              <button
                type="button"
                onClick={exportAuditCSV}
                disabled={auditRecords.length === 0}
                style={csvBtnStyle}
                title="Export geofencing logs as CSV"
              >
                <FileSpreadsheet size={13} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          <div style={kpiCardStyle}>
            <span style={kpiLabelStyle}>TOTAL GEOFENCE RECORDS</span>
            <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#0f172a', marginTop: 6 }}>
              {totalDatabaseRecords}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
              {dateFilterMode === 'ALL_LOGS' ? 'All historical records (1m interval)' : `Records on ${auditDate}`}
            </div>
          </div>

          <div style={kpiCardStyle}>
            <span style={kpiLabelStyle}>INSIDE SCHOOL GROUNDS</span>
            <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
              {auditRecords.filter((r) => r.is_inside).length}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
              {radius !== null ? `Within ${radius}m boundary` : 'Perimeter unconfigured'}
            </div>
          </div>

          <div style={kpiCardStyle}>
            <span style={kpiLabelStyle}>OUTSIDE SCHOOL GROUNDS</span>
            <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#dc2626', marginTop: 6 }}>
              {auditRecords.filter((r) => !r.is_inside).length}
            </div>
            <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
              Beyond allowed campus area
            </div>
          </div>
        </div>

        <div style={panelCardStyle}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Geofencing Logs (1-Minute Heartbeat Interval)</span>
                <span style={{ fontSize: '0.64rem', color: '#16a34a', backgroundColor: '#ecfdf5', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>
                  Live Auto-Updating
                </span>
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                Authentic records showing timestamp, signal quality, client IP address, and device ID.
              </div>
            </div>
            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
              Showing <strong>{auditRecords.length}</strong> of <strong>{totalDatabaseRecords}</strong> record(s)
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '9px 14px' }}>Heartbeat Time</th>
                  <th style={{ padding: '9px 14px' }}>Faculty Member</th>
                  <th style={{ padding: '9px 14px' }}>Presence Verdict</th>
                  <th style={{ padding: '9px 14px' }}>Signal Strength</th>
                  <th style={{ padding: '9px 14px' }}>Distance from School</th>
                  <th style={{ padding: '9px 14px' }}>IP Address</th>
                  <th style={{ padding: '9px 14px' }}>MAC Address / Device ID</th>
                  <th style={{ padding: '9px 14px' }}>Battery</th>
                </tr>
              </thead>
              <tbody>
                {auditRecords.length > 0 ? (
                  auditRecords.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#334155' }}>
                        <div style={{ fontWeight: 700 }}>{r.time_only}</div>
                        <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>{r.date_only}</div>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <strong style={{ color: '#0f172a' }}>{r.faculty_name}</strong>
                        <div style={{ fontSize: '0.64rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                          ID: {r.employee_id}
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        {r.is_inside ? (
                          <span style={statusBadgeStyle('#ecfdf5', '#059669', '#a7f3d0')}>
                            <Check size={10} style={{ marginRight: 3 }} /> Inside School Grounds
                          </span>
                        ) : (
                          <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>
                            <AlertTriangle size={10} style={{ marginRight: 3 }} /> Outside School Grounds
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {renderSignalBars(r.signal_percentage)}
                          <span style={{ fontSize: '0.72rem', color: '#334155', fontWeight: 600 }}>
                            {r.signal_strength || '—'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 700, color: r.is_inside ? '#059669' : '#dc2626' }}>
                        {r.distance || '—'}
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#004b87', fontSize: '0.72rem' }}>
                        {r.ip_address || '—'}
                      </td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#475569', fontSize: '0.72rem' }}>
                        {r.mac_address || r.bound_device_id || '—'}
                      </td>
                      <td style={{ padding: '9px 14px', color: '#475569' }}>{r.battery || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                      {auditLoading ? 'Loading geofence logs...' : 'No geofence logs found matching your filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

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

const screenSwitchBtn = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  borderRadius: 4,
  border: 'none',
  backgroundColor: active ? '#004b87' : 'transparent',
  color: active ? '#ffffff' : '#475569',
  fontWeight: active ? 800 : 600,
  fontSize: '0.72rem',
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

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  backgroundColor: '#004b87',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const csvBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  backgroundColor: '#059669',
  color: '#ffffff',
  border: 'none',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

export default GeofenceTab;