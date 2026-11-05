/**
 * AttendSure - Geofence Boundary & Telemetry Audit System
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
  Smartphone,
  RotateCcw,
  Radio,
  Check,
  Maximize2,
  FileSpreadsheet,
  History,
  MapPin,
  Search,
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
  is_online?: boolean;
  online_status?: 'ONLINE' | 'OFFLINE';
  status_duration?: string;
  connection_label?: string;
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
  latitude?: number | null;
  longitude?: number | null;
}

export interface GeofenceData {
  zone_id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  is_configured: boolean;
  verified_inside: number;
  online_users_count?: number;
  offline_users_count?: number;
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
  distance: string;
  distance_meters: number;
  verdict: 'VERIFIED_INSIDE' | 'LOAFING_OUT_OF_BOUNDS';
  is_inside: boolean;
  battery: string;
  device_model: string;
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

  // Search & Filter State
  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditFacultyFilter, setAuditFacultyFilter] = useState<string>('ALL');
  const [auditVerdictFilter, setAuditVerdictFilter] = useState<'ALL' | 'INSIDE' | 'LOAFING'>('ALL');
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [lat, setLat] = useState<number>(() => {
    const sLat = parseFloat(String((school as any)?.latitude));
    return !isNaN(sLat) && sLat !== 0 ? sLat : 8.480241;
  });

  const [lng, setLng] = useState<number>(() => {
    const sLng = parseFloat(String((school as any)?.longitude));
    return !isNaN(sLng) && sLng !== 0 ? sLng : 124.650152;
  });

  const [radius, setRadius] = useState<number>(() => {
    const sRad = parseInt(
      String((school as any)?.geofence_radius || (school as any)?.geofence_radius_meters || (school as any)?.radius_meters),
      10
    );
    return !isNaN(sRad) && sRad > 0 ? sRad : 200;
  });

  const isDirtyRef = useRef(false);
  const isInteracting = useRef(false);
  isInteracting.current = saving || resettingId !== null;

  const userRole = (localStorage.getItem('attendsure_role') || 'FACULTY').toUpperCase();
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
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await apiClient.get<GeofenceData>('/geofence/', { timeout: 8000 });
        if (res.data) {
          setGeoData(res.data);
          if (!isDirtyRef.current) {
            const recLat = parseFloat(String(res.data.latitude));
            const recLng = parseFloat(String(res.data.longitude));
            const recRad = parseInt(String(res.data.radius_meters), 10);

            if (!isNaN(recLat) && recLat !== 0) setLat(recLat);
            if (!isNaN(recLng) && recLng !== 0) setLng(recLng);
            if (!isNaN(recRad) && recRad > 0) setRadius(recRad);
          }
        }
      } catch {
        if (!silent) {
          showAlert({
            title: 'Connection Notice',
            message: 'Unable to sync telemetry. Retrying...',
            type: 'warning',
          });
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [showAlert]
  );

  const fetchAuditHistory = useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams();
      if (auditDate) params.append('date_from', auditDate);
      if (auditFacultyFilter !== 'ALL') params.append('faculty_id', auditFacultyFilter);
      if (auditVerdictFilter !== 'ALL') params.append('status', auditVerdictFilter);
      if (auditSearchQuery.trim()) params.append('search', auditSearchQuery.trim());

      const res = await apiClient.get(`/geofence/audit/?${params.toString()}`, { timeout: 8000 });
      if (res.data?.records) {
        setAuditRecords(res.data.records);
      }
    } catch {
      showAlert({
        title: 'Audit Log Error',
        message: 'Could not load historical telemetry from database.',
        type: 'error',
      });
    } finally {
      setAuditLoading(false);
    }
  }, [auditDate, auditFacultyFilter, auditVerdictFilter, auditSearchQuery, showAlert]);

  useEffect(() => {
    fetchGeofenceData(false);
  }, [fetchGeofenceData]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && !isDirtyRef.current && activeScreen === 'LIVE_MAP') {
        fetchGeofenceData(true);
      }
    }, 10000);
    return () => clearInterval(liveInterval);
  }, [fetchGeofenceData, activeScreen]);

  useEffect(() => {
    if (activeScreen === 'AUDIT_SCREEN') {
      fetchAuditHistory();
    }
  }, [activeScreen, fetchAuditHistory]);

  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !leafletReady || !mapContainerRef.current) return;
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
  }, [activeScreen, leafletReady, lat, lng, radius, mapLayer, isAdmin]);

  // Plot Custom Teardrop Location Pin Markers with Real User Photos
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

      const isBreach = user.status === 'PERIMETER_BREACH' || user.status === 'OFF_CAMPUS';
      const isSpoof = user.is_mock_location || user.status === 'SPOOF_ATTEMPT';

      // 1. Draw Connecting Line for Outside Campus Devices
      if (isBreach || isSpoof) {
        const linePath = [
          [lat, lng],
          [userLat, userLng],
        ];

        const connectingLine = L.polyline(linePath, {
          color: isSpoof ? '#dc2626' : '#e11d48',
          weight: 2.5,
          opacity: 0.85,
          dashArray: '6, 8',
          lineCap: 'round',
        }).addTo(layer);

        connectingLine.bindTooltip(
          `
            <div style="font-family: inherit; font-size: 11px; padding: 2px;">
              <strong style="color: #991b1b;">${user.faculty_name}</strong><br/>
              <span>Distance to Campus: <strong>${user.distance}</strong></span>
            </div>
          `,
          { sticky: true, opacity: 0.95 }
        );
      }

      // 2. Set Pin Color (Red for Outside, Green for Inside)
      const isOutside = isBreach || isSpoof;
      const pinColor = isOutside ? '#dc2626' : '#16a34a';
      const statusLabel = isSpoof ? 'FAKE GPS BLOCKED' : isBreach ? 'OUTSIDE CAMPUS' : 'INSIDE CAMPUS';
      const onlineTag = user.is_online ? '● ONLINE' : '○ OFFLINE';

      const avatarSrc = user.photo_url || user.photo;
      const initials = (user.faculty_name || 'U')
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      const avatarInnerHtml = avatarSrc
        ? `<img src="${avatarSrc}" alt="${user.faculty_name}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #fee2e2; color: ${pinColor}; font-weight: 800; font-size: 14px;">${initials}</div>`
        : `<div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #fee2e2; color: ${pinColor}; font-weight: 800; font-size: 14px;">${initials}</div>`;

      // 3. SVG Location Pin with User Image Embedded inside
      const userLocationPinIcon = L.divIcon({
        className: 'user-location-pin-marker',
        html: `
          <div style="position: relative; width: 50px; height: 60px; display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.40));">
            <div style="
              position: absolute;
              top: 0;
              left: 1px;
              width: 48px;
              height: 48px;
              border-radius: 50%;
              background-color: ${isOutside ? 'rgba(220, 38, 38, 0.35)' : 'rgba(22, 163, 74, 0.35)'};
              animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
              z-index: 0;
            "></div>

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
              top: 64px;
              z-index: 3;
              background-color: rgba(15, 23, 42, 0.92);
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
              ${user.faculty_name} &bull; <span style="color: ${user.is_online ? '#4ade80' : '#94a3b8'};">${onlineTag}</span> (${user.distance})
            </div>
          </div>
        `,
        iconSize: [50, 60],
        iconAnchor: [25, 60],
      });

      const marker = L.marker([userLat, userLng], { icon: userLocationPinIcon }).addTo(layer);

      const tooltipContent = `
        <div style="font-family: inherit; font-size: 11px; line-height: 1.4; min-width: 195px; padding: 4px;">
          <div style="font-weight: 800; font-size: 12px; color: #0f172a; margin-bottom: 2px;">
            ${user.faculty_name}
          </div>
          <div style="color: #64748b; font-size: 10px; margin-bottom: 6px;">
            ID: ${user.employee_id} &bull; ${user.position}
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Connection:</span>
            <strong style="color: ${user.is_online ? '#16a34a' : '#64748b'};">
              ${user.connection_label || (user.is_online ? 'Online' : 'Offline')}
            </strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Campus Boundary:</span>
            <strong style="color: ${pinColor};">${statusLabel}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Distance from Center:</span>
            <strong>${user.distance}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Device Battery:</span>
            <strong>${user.battery}</strong>
          </div>
          <div style="color: #004b87; font-size: 9px; font-family: monospace; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px;">
            Device: ${user.device_model || 'Registered Phone'}
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
    if (!mapInstanceRef.current || !window.L) return;
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
    if (window.isSecureContext === false && window.location.hostname !== 'localhost') {
      showAlert({
        title: 'Secure Context Required',
        message: 'Browser GPS requires HTTPS or http://localhost:5173. Centered to official school campus coordinates instead.',
        type: 'warning',
      });
      if (mapInstanceRef.current) {
        mapInstanceRef.current.flyTo([lat, lng], 17);
      }
      return;
    }

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
          message: `Coordinates centered to your location: ${detectedLat}°N, ${detectedLng}°E.`,
          type: 'success',
        });
      },
      (err) => {
        if (err.message && err.message.includes('secure origins')) {
          showAlert({
            title: 'Origin Notice',
            message: 'Open the dashboard via http://localhost:5173 to use browser GPS location.',
            type: 'warning',
          });
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo([lat, lng], 17);
          }
        } else {
          showAlert({ title: 'Location Error', message: err.message, type: 'warning' });
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSavePerimeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

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

  const exportAuditCSV = () => {
    if (auditRecords.length === 0) {
      showAlert({ title: 'Empty Export', message: 'No telemetry records available to export.', type: 'warning' });
      return;
    }

    const headers = [
      'Timestamp',
      'Faculty Name',
      'Employee ID',
      'Verdict',
      'Distance from Campus',
      'Latitude',
      'Longitude',
      'Battery',
      'Device Model',
    ];
    const rows = auditRecords.map((r) => [
      `"${r.timestamp}"`,
      `"${r.faculty_name}"`,
      `"${r.employee_id}"`,
      `"${r.verdict === 'VERIFIED_INSIDE' ? 'VERIFIED ON CAMPUS' : 'LOAFING / OUT OF BOUNDS'}"`,
      `"${r.distance}"`,
      r.latitude,
      r.longitude,
      `"${r.battery}"`,
      `"${r.device_model}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AttendSure_Geofencing_Audit_${auditDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      case 'OFF_CAMPUS':
        return <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>OUT OF BOUNDS</span>;
      case 'NOT_ON_DUTY':
      default:
        return <span style={statusBadgeStyle('#f8fafc', '#94a3b8', '#e2e8f0')}>OFF DUTY</span>;
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
            <span>Geofence Boundary &amp; Telemetry Audit</span>
          </h2>
          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '3px 0 0 0' }}>
            Real-time telemetry: Live GPS verification, phone hardware pairing locks, and permanent boundary logs.
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
              <span>Live Perimeter Map</span>
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
            onClick={() => (activeScreen === 'LIVE_MAP' ? fetchGeofenceData(false) : fetchAuditHistory())}
            disabled={loading || auditLoading}
            style={refreshBtnStyle}
          >
            <RefreshCw size={13} className={loading || auditLoading ? 'animate-spin' : ''} />
            <span>{activeScreen === 'LIVE_MAP' ? 'Sync Telemetry' : 'Refresh Logs'}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: LIVE MAP & PERIMETER RADAR */}
      {activeScreen === 'LIVE_MAP' && (
        <>
          {/* 2. Telemetry KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <div style={kpiCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={kpiLabelStyle}>ONLINE DEVICES</span>
                <Wifi size={18} color="#059669" />
              </div>
              <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
                {geoData?.online_users_count ?? 0}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                Transmitting GPS within last 15m
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={kpiLabelStyle}>OFFLINE DEVICES</span>
                <WifiOff size={18} color="#64748b" />
              </div>
              <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#475569', marginTop: 6 }}>
                {geoData?.offline_users_count ?? 0}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                Disconnected or inactive &gt;15m
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={kpiLabelStyle}>INSIDE CAMPUS (GREEN PINS)</span>
                <ShieldCheck size={18} color="#059669" />
              </div>
              <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
                {geoData?.verified_inside ?? 0}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                Active within {radius}m boundary
              </div>
            </div>

            <div style={kpiCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={kpiLabelStyle}>OUTSIDE CAMPUS (RED PINS)</span>
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
                Connected by lines outside boundary
              </div>
            </div>
          </div>

          {/* 3. Map View with Location Pins & Controls */}
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
                  <span>Campus Perimeter Boundary Visualizer</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleFitAllOnMap}
                    style={gpsDetectBtn}
                    title="Zoom out to show campus circle and all connecting lines"
                  >
                    <Maximize2 size={11} />
                    <span>Show All on Map</span>
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
                  Center: {lat.toFixed(6)}°N, {lng.toFixed(6)}°E &bull; Radius: {radius}m
                </div>
              </div>

              <div style={{ padding: '8px 16px', backgroundColor: '#ffffff', borderTop: '1px solid #f1f5f9', fontSize: '0.72rem', color: '#64748b' }}>
                <strong>Map Legend:</strong>
                <span style={{ color: '#16a34a', marginLeft: 8, fontWeight: 700 }}>&bull; Green Pin = Inside Campus</span>
                <span style={{ color: '#dc2626', marginLeft: 10, fontWeight: 700 }}>&bull; Red Pin + User Image = Outside Boundary</span>
                <span style={{ marginLeft: 10, color: '#475569' }}>Connecting lines show the path from school center to remote devices.</span>
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
                      <label style={fieldLabelStyle}>Boundary Radius (Big Circle)</label>
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
                        { label: 'Compound (200m)', val: 200 },
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
                    No perimeter violations or fake GPS attempts recorded today.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4. Live Faculty Table */}
          <div style={panelCardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  Faculty Live Presence &amp; Device Pairing Audit
                </div>
                <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                  Real-time connection states, elapsed online/offline durations, and boundary audits.
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Total Faculty: <strong>{geoData?.faculty_list?.length || 0}</strong>
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '9px 14px' }}>Faculty Member</th>
                    <th style={{ padding: '9px 14px' }}>Registered Hardware Device</th>
                    <th style={{ padding: '9px 14px' }}>Connection Status</th>
                    <th style={{ padding: '9px 14px' }}>Campus Boundary</th>
                    <th style={{ padding: '9px 14px' }}>Distance / Accuracy</th>
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div>
                                {isOnline ? (
                                  <span style={statusBadgeStyle('#ecfdf5', '#059669', '#a7f3d0')}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981', marginRight: 5 }} />
                                    ONLINE
                                  </span>
                                ) : (
                                  <span style={statusBadgeStyle('#f1f5f9', '#64748b', '#cbd5e1')}>
                                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#94a3b8', marginRight: 5 }} />
                                    OFFLINE
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: isOnline ? '#047857' : '#64748b', fontWeight: 600 }}>
                                {s.status_duration || s.last_seen}
                              </span>
                            </div>
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
                      <td colSpan={isAdmin ? 7 : 6} style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                        No faculty records found in database.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: DEDICATED TELEMETRY AUDIT SCREEN (GEOFENCE LOGS ONLY) */}
      {activeScreen === 'AUDIT_SCREEN' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Geofencing Search & Filter Bar */}
          <div style={{ ...panelCardStyle, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
                <div style={{ minWidth: 200, flex: 1 }}>
                  <label style={fieldLabelStyle}>Search Faculty Name or ID</label>
                  <input
                    type="text"
                    placeholder="Enter name or employee ID..."
                    value={auditSearchQuery}
                    onChange={(e) => setAuditSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && fetchAuditHistory()}
                    style={fieldInputStyle}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>Audit Date</label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    style={{ ...fieldInputStyle, width: 140 }}
                  />
                </div>

                <div>
                  <label style={fieldLabelStyle}>Campus Boundary Verdict</label>
                  <select
                    value={auditVerdictFilter}
                    onChange={(e) => setAuditVerdictFilter(e.target.value as any)}
                    style={{ ...fieldInputStyle, width: 170 }}
                  >
                    <option value="ALL">All Boundary Verdicts</option>
                    <option value="INSIDE">Verified On-Site Only</option>
                    <option value="LOAFING">Loafing / Out of Bounds Only</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  onClick={fetchAuditHistory}
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
                  title="Export official geofencing audit report as CSV"
                >
                  <FileSpreadsheet size={13} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* KPI Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>TOTAL GEOFENCE RECORDS</span>
              <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#0f172a', marginTop: 6 }}>
                {auditRecords.length}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                Permanent PostgreSQL records
              </div>
            </div>

            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>VERIFIED ON-SITE</span>
              <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#059669', marginTop: 6 }}>
                {auditRecords.filter((r) => r.is_inside).length}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                Within {radius}m boundary
              </div>
            </div>

            <div style={kpiCardStyle}>
              <span style={kpiLabelStyle}>LOAFING / OUT OF BOUNDS</span>
              <div style={{ fontSize: '1.30rem', fontWeight: 800, color: '#dc2626', marginTop: 6 }}>
                {auditRecords.filter((r) => !r.is_inside).length}
              </div>
              <div style={{ fontSize: '0.70rem', color: '#64748b', marginTop: 2 }}>
                Beyond allowed campus area
              </div>
            </div>
          </div>

          {/* Historical Table */}
          <div style={panelCardStyle}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  Permanent Geofencing Logs
                </div>
                <div style={{ fontSize: '0.70rem', color: '#64748b' }}>
                  Immutable telemetry log: exact locations, campus distances, and duty compliance.
                </div>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Found: <strong>{auditRecords.length}</strong> record(s)
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 740, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '9px 14px' }}>Recorded Time</th>
                    <th style={{ padding: '9px 14px' }}>Faculty Member</th>
                    <th style={{ padding: '9px 14px' }}>Presence Verdict</th>
                    <th style={{ padding: '9px 14px' }}>Distance from School</th>
                    <th style={{ padding: '9px 14px' }}>GPS Coordinates</th>
                    <th style={{ padding: '9px 14px' }}>Battery</th>
                    <th style={{ padding: '9px 14px' }}>Device Hardware</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRecords.length > 0 ? (
                    auditRecords.map((r) => (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#334155' }}>
                          <div>{r.time_only}</div>
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
                              <Check size={10} style={{ marginRight: 3 }} /> VERIFIED ON CAMPUS
                            </span>
                          ) : (
                            <span style={statusBadgeStyle('#fef2f2', '#dc2626', '#fecaca')}>
                              <AlertTriangle size={10} style={{ marginRight: 3 }} /> LOAFING / OUT OF BOUNDS
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 700, color: r.is_inside ? '#059669' : '#dc2626' }}>
                          {r.distance}
                        </td>
                        <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#475569', fontSize: '0.72rem' }}>
                          {r.latitude.toFixed(6)}°N, {r.longitude.toFixed(6)}°E
                        </td>
                        <td style={{ padding: '9px 14px', color: '#475569' }}>{r.battery}</td>
                        <td style={{ padding: '9px 14px' }}>
                          <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.72rem' }}>{r.device_model}</div>
                          {r.bound_device_id && (
                            <div style={{ fontSize: '0.62rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                              UUID: {r.bound_device_id.slice(0, 12)}...
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                        {auditLoading ? 'Loading geofence logs...' : 'No geofence logs found matching your search.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// UI Styles
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