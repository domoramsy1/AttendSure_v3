/**
 * AttendSure - Campus GPS Boundary & Location Audit (Local Bundled Leaflet)
 * File: web/src/components/tabs/GeofenceTab.tsx
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, escapeHtml, extractApiError } from '../../api/routes';
import { isSafeImageUrl } from '../../theme/tokens';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { StatsCard } from '../common/StatsCard';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { exportToCsv } from '../common/Pagination';
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
    | 'OFFLINE'
    | 'SPOOF_ATTEMPT';
  is_online?: boolean;
  is_inside?: boolean;
  is_inside_geofence?: boolean;
  online_status?: 'ONLINE' | 'OFFLINE';
  status_duration?: string | null;
  connection_label?: string | null;
  distance: string | number | null;
  battery: string | number | null;
  battery_level?: number | null;
  last_seen: string | null;
  device_model?: string | null;
  bound_device_id?: string | null;
  device_bound_at?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  is_mock_location?: boolean;
  gps_accuracy_meters?: number | null;
  accuracy?: number | null;
  signal_strength?: string | null;
  signal_percentage?: number | null;
  ip_address?: string | null;
  mac_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface GeofenceData {
  zone_id?: string | null;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number | null;
  is_configured?: boolean;
  verified_inside: number;
  online_users_count?: number;
  offline_users_count?: number;
  missing_heartbeats?: number;
  spoof_attempts_blocked?: number;
  incidents_today: number;
  faculty_list: FacultyListItem[];
  faculty_class_list?: FacultyListItem[];
  recent_breaches: Array<{
    id: number;
    faculty_name: string;
    reason: string;
    trigger_reason?: string;
    status: string;
    time?: string;
    created_at?: string;
  }>;
}

export interface AuditRecord {
  id: number | string;
  faculty_id?: number;
  faculty_name: string;
  employee_id?: string;
  timestamp: string;
  time_only: string;
  date_only: string;
  latitude?: number;
  longitude?: number;
  distance?: string | number | null;
  distance_meters?: number | null;
  verdict?: string;
  is_inside: boolean;
  is_inside_geofence?: boolean;
  signal_strength?: string | null;
  signal_percentage?: number | null;
  ip_address?: string | null;
  mac_address?: string | null;
  battery?: string | number | null;
  battery_level?: number | null;
  device_model?: string | null;
  bound_device_id?: string | null;
}

const sanitizeInput = (raw: string, maxLength = 80): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

const formatMeters = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'number') {
    return Number.isFinite(val) ? `${Math.round(val)}m` : '—';
  }
  const str = String(val).trim();
  if (!str || str === 'null' || str === 'undefined') return '—';
  return str.endsWith('m') ? str : `${str}m`;
};

const formatBattery = (val: unknown): string => {
  if (val === null || val === undefined || val === '') return '—';
  const str = String(val).trim();
  if (!str || str === 'null' || str === 'undefined') return '—';
  return str.endsWith('%') ? str : `${str}%`;
};

export const GeofenceTab: React.FC = () => {
  const { school, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();
  const { mode, tokens, brand, ui } = useTheme();
  const successBtnBg = mode === 'dark' ? '#059669' : brand.success;

  const [activeScreen, setActiveScreen] = useState<'LIVE_MAP' | 'AUDIT_SCREEN'>('LIVE_MAP');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const circleInstanceRef = useRef<L.Circle | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);
  const userMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<(L.TileLayer & { _layerType?: string }) | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoAbortRef = useRef<AbortController | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);

  const cachedGeo = peekApiCache<GeofenceData>(API_ROUTES.campus.boundary);
  const [loading, setLoading] = useState(!cachedGeo);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [geoData, setGeoData] = useState<GeofenceData | null>(cachedGeo ?? null);

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [totalDatabaseRecords, setTotalDatabaseRecords] = useState<number>(0);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditFacultyFilter, setAuditFacultyFilter] = useState<string>('ALL');
  const [auditVerdictFilter, setAuditVerdictFilter] = useState<'ALL' | 'INSIDE' | 'OUTSIDE'>('ALL');
  const [dateFilterMode, setDateFilterMode] = useState<'ALL_LOGS' | 'SPECIFIC_DATE'>('ALL_LOGS');
  const [auditDate, setAuditDate] = useState<string>(() => new Date().toISOString().split('T')[0]);

  const [lat, setLat] = useState<number | null>(() => {
    const sLat = parseFloat(String(cachedGeo?.latitude ?? (school as any)?.latitude));
    return !isNaN(sLat) && sLat !== 0 ? sLat : null;
  });

  const [lng, setLng] = useState<number | null>(() => {
    const sLng = parseFloat(String(cachedGeo?.longitude ?? (school as any)?.longitude));
    return !isNaN(sLng) && sLng !== 0 ? sLng : null;
  });

  const [radius, setRadius] = useState<number | null>(() => {
    const sRad = parseInt(
      String(
        cachedGeo?.radius_meters ??
          (school as any)?.geofence_radius ??
          (school as any)?.geofence_radius_meters ??
          (school as any)?.radius_meters
      ),
      10
    );
    return !isNaN(sRad) && sRad > 0 ? sRad : null;
  });

  const isDirtyRef = useRef(false);
  const isInteracting = useRef(false);
  isInteracting.current = saving || resettingId !== null;

  const userRole = (localStorage.getItem('attendsure_role') || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN', 'FACULTY_ADMIN', 'PRINCIPAL'].includes(userRole);

  useEffect(() => {
    return () => {
      geoAbortRef.current?.abort();
      auditAbortRef.current?.abort();
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // Ignore teardown error
        }
        mapInstanceRef.current = null;
      }
    };
  }, []);

  const fetchGeofenceData = useCallback(
    async (silent = false, bypassCache = false) => {
      geoAbortRef.current?.abort();
      const controller = new AbortController();
      geoAbortRef.current = controller;

      const warmHit = !bypassCache ? peekApiCache<GeofenceData>(API_ROUTES.campus.boundary) : undefined;
      if (warmHit) {
        setGeoData(warmHit);
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const res = await apiClient.get<GeofenceData>(API_ROUTES.campus.boundary, {
          timeout: 8000,
          params: bypassCache || silent ? { nocache: 1 } : undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.data) {
          setGeoData(res.data);
          if (!isDirtyRef.current) {
            const recLat = res.data.latitude !== null ? parseFloat(String(res.data.latitude)) : null;
            const recLng = res.data.longitude !== null ? parseFloat(String(res.data.longitude)) : null;
            const recRad =
              res.data.radius_meters !== null ? parseInt(String(res.data.radius_meters), 10) : null;

            if (recLat !== null && !isNaN(recLat)) setLat(recLat);
            if (recLng !== null && !isNaN(recLng)) setLng(recLng);
            if (recRad !== null && !isNaN(recRad)) setRadius(recRad);
          }
        }
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          showAlert({
            title: 'Connection Notice',
            message: extractApiError(err, 'Unable to reach the school server for location updates.'),
            type: 'warning',
          });
        }
      } finally {
        if (!controller.signal.aborted && !silent) {
          setLoading(false);
        }
      }
    },
    [showAlert]
  );

  const fetchAuditHistory = useCallback(
    async (silent = false) => {
      auditAbortRef.current?.abort();
      const controller = new AbortController();
      auditAbortRef.current = controller;

      if (!silent) setAuditLoading(true);
      try {
        const params: Record<string, string | number> = { nocache: 1 };
        if (dateFilterMode === 'SPECIFIC_DATE' && auditDate) {
          params.date_from = auditDate;
          params.date_to = auditDate;
        }
        if (auditFacultyFilter !== 'ALL') {
          params.faculty_id = auditFacultyFilter;
        }
        if (auditVerdictFilter !== 'ALL') {
          params.status = auditVerdictFilter;
        }
        const cleanQuery = sanitizeInput(auditSearchQuery, 80);
        if (cleanQuery) {
          params.search = cleanQuery;
        }

        const res = await apiClient.get(API_ROUTES.campus.audit, {
          params,
          timeout: 8000,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.data?.records) {
          setAuditRecords(res.data.records);
          setTotalDatabaseRecords(res.data.count ?? res.data.total_heartbeats ?? res.data.records.length);
        }
      } catch (err: unknown) {
        const anyErr = err as { name?: string; code?: string };
        if (controller.signal.aborted || anyErr?.name === 'CanceledError' || anyErr?.code === 'ERR_CANCELED') {
          return;
        }
        if (!silent) {
          showAlert({
            title: 'Audit Log Error',
            message: extractApiError(err, 'Could not load campus location logs from the server.'),
            type: 'error',
          });
        }
      } finally {
        if (!controller.signal.aborted && !silent) {
          setAuditLoading(false);
        }
      }
    },
    [dateFilterMode, auditDate, auditFacultyFilter, auditVerdictFilter, auditSearchQuery, showAlert]
  );

  useEffect(() => {
    void fetchGeofenceData(false, false);
  }, [fetchGeofenceData]);

  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current && !isDirtyRef.current && document.visibilityState === 'visible') {
        if (activeScreen === 'LIVE_MAP') {
          void fetchGeofenceData(true, true);
        } else if (activeScreen === 'AUDIT_SCREEN') {
          void fetchAuditHistory(true);
        }
      }
    }, 6000);
    return () => clearInterval(liveInterval);
  }, [fetchGeofenceData, fetchAuditHistory, activeScreen]);

  useEffect(() => {
    if (activeScreen === 'AUDIT_SCREEN') {
      void fetchAuditHistory(false);
    }
  }, [activeScreen, fetchAuditHistory]);

  // Local Bundled Leaflet Initialization (works offline even when tile servers are unreachable)
  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !mapContainerRef.current) return;
    if (lat === null || lng === null) return;

    const getTileUrl = (layer: 'streets' | 'satellite') => {
      if (layer === 'satellite') {
        return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      }
      return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    };

    if (mapInstanceRef.current && mapInstanceRef.current.getContainer() !== mapContainerRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {
        // Ignore stale container cleanup
      }
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
      circleInstanceRef.current = null;
      userMarkersLayerRef.current = null;
      tileLayerRef.current = null;
    }

    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 17,
        zoomControl: true,
      });

      const tileLayer = L.tileLayer(getTileUrl(mapLayer), {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map) as L.TileLayer & { _layerType?: string };
      tileLayer._layerType = mapLayer;
      tileLayerRef.current = tileLayer;

      userMarkersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;

      resizeTimerRef.current = setTimeout(() => {
        map.invalidateSize();
      }, 250);

      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!isAdmin) return;
        isDirtyRef.current = true;
        setLat(parseFloat(e.latlng.lat.toFixed(6)));
        setLng(parseFloat(e.latlng.lng.toFixed(6)));
      });
    } else {
      resizeTimerRef.current = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
    }

    const currentMap = mapInstanceRef.current;

    if (tileLayerRef.current && tileLayerRef.current._layerType !== mapLayer) {
      currentMap.removeLayer(tileLayerRef.current);
      const nextTile = L.tileLayer(getTileUrl(mapLayer), { maxZoom: 19 }).addTo(currentMap) as L.TileLayer & {
        _layerType?: string;
      };
      nextTile._layerType = mapLayer;
      tileLayerRef.current = nextTile;
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

      markerInstanceRef.current.on('dragend', (e: L.DragEndEvent) => {
        isDirtyRef.current = true;
        const pos = (e.target as L.Marker).getLatLng();
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
          radius,
          color: '#0284c7',
          weight: 2.5,
          fillColor: '#38bdf8',
          fillOpacity: 0.14,
          dashArray: '6, 6',
        }).addTo(currentMap);
      }
    }
  }, [activeScreen, lat, lng, radius, mapLayer, isAdmin]);

  const renderSignalBars = (percentage: number | null | undefined) => {
    if (percentage === null || percentage === undefined) {
      return <span style={{ color: tokens.textMuted, fontSize: '0.68rem' }}>—</span>;
    }

    const bars = [25, 50, 75, 100];
    const color = percentage >= 75 ? brand.success : percentage >= 45 ? brand.warning : brand.danger;

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
                height,
                backgroundColor: isActive ? color : tokens.borderStrong,
                borderRadius: 1,
              }}
            />
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !mapInstanceRef.current || !userMarkersLayerRef.current) return;
    const layer = userMarkersLayerRef.current;
    layer.clearLayers();

    const faculty = geoData?.faculty_list || [];

    faculty.forEach((user: FacultyListItem) => {
      const userLat = parseFloat(String(user.latitude));
      const userLng = parseFloat(String(user.longitude));

      if (isNaN(userLat) || isNaN(userLng) || userLat === 0 || userLng === 0) return;

      const isOnline = Boolean(user.is_online);
      const insideFlag = user.is_inside ?? user.is_inside_geofence ?? user.status === 'VERIFIED_INSIDE';
      const isBreach =
        user.status === 'PERIMETER_BREACH' || user.status === 'OFF_CAMPUS' || insideFlag === false;
      const isSpoof = Boolean(user.is_mock_location || user.status === 'SPOOF_ATTEMPT');

      const safeName = escapeHtml(user.faculty_name);
      const safeEmpId = escapeHtml(user.employee_id);
      const safePos = escapeHtml(user.position || '—');
      const safeConn = escapeHtml(user.connection_label || (isOnline ? 'Online' : 'Offline'));
      const safeSignal = escapeHtml(user.signal_strength || '—');
      const safeDist = escapeHtml(formatMeters(user.distance));
      const safeBat = escapeHtml(formatBattery(user.battery ?? user.battery_level));
      const safeIp = escapeHtml(user.ip_address || '—');
      const safeDev = escapeHtml(user.mac_address || user.bound_device_id || '—');

      const rawAvatar = user.photo_url || user.photo;
      const safeAvatar = isSafeImageUrl(rawAvatar) ? escapeHtml(rawAvatar!.trim()) : '';
      const safeInitials = escapeHtml(
        (user.faculty_name || '')
          .split(' ')
          .map((n) => n[0] || '')
          .slice(0, 2)
          .join('')
          .toUpperCase()
      );

      if ((isBreach || isSpoof) && lat !== null && lng !== null) {
        const connectingLine = L.polyline(
          [
            [lat, lng],
            [userLat, userLng],
          ],
          {
            color: isSpoof ? '#dc2626' : isOnline ? '#e11d48' : '#94a3b8',
            weight: 2.5,
            opacity: isOnline ? 0.85 : 0.45,
            dashArray: '6, 8',
            lineCap: 'round',
          }
        ).addTo(layer);

        connectingLine.bindTooltip(
          `
            <div style="font-family: inherit; font-size: 11px; padding: 2px;">
              <strong style="color: #991b1b;">${safeName}</strong><br/>
              <span>Distance to School: <strong>${safeDist}</strong></span>
            </div>
          `,
          { sticky: true, opacity: 0.95 }
        );
      }

      const pinColor = isOnline ? (isBreach ? '#dc2626' : '#16a34a') : '#64748b';
      const ringBg = isOnline ? 'rgba(22, 163, 74, 0.35)' : 'rgba(100, 116, 139, 0.15)';
      const statusLabel = isSpoof
        ? 'Fake GPS Blocked'
        : isBreach
          ? 'Outside School Grounds'
          : 'Inside School Grounds';
      const onlineTag = isOnline ? '● Online' : '○ Offline';

      const avatarInnerHtml = safeAvatar
        ? `<img src="${safeAvatar}" alt="${safeName}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #f1f5f9; color: ${pinColor}; font-weight: 800; font-size: 14px;">${safeInitials}</div>`
        : `<div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: #f1f5f9; color: ${pinColor}; font-weight: 800; font-size: 14px;">${safeInitials}</div>`;

      const userLocationPinIcon = L.divIcon({
        className: 'user-location-pin-marker',
        html: `
          <div style="position: relative; width: 50px; height: 60px; display: flex; flex-direction: column; align-items: center; cursor: pointer; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.30));">
            ${
              isOnline
                ? `<div style="position: absolute; top: 0; left: 1px; width: 48px; height: 48px; border-radius: 50%; background-color: ${ringBg}; z-index: 0;"></div>`
                : ''
            }
            <svg width="50" height="60" viewBox="0 0 50 60" fill="none" style="position: absolute; top: 0; left: 0; z-index: 1;">
              <path d="M25 0C11.193 0 0 11.193 0 25C0 41.5 25 60 25 60C25 60 50 41.5 50 25C50 11.193 38.807 0 25 0Z" fill="${pinColor}"/>
              <circle cx="25" cy="25" r="21" fill="#ffffff"/>
            </svg>
            <div style="position: absolute; top: 4px; left: 4px; width: 42px; height: 42px; border-radius: 50%; overflow: hidden; background-color: #ffffff; z-index: 2;">
              ${avatarInnerHtml}
            </div>
            <div style="position: absolute; top: 32px; right: 4px; width: 12px; height: 12px; border-radius: 50%; background-color: ${pinColor}; border: 2px solid #ffffff; z-index: 4;"></div>
            <div style="position: absolute; top: 64px; z-index: 3; background-color: rgba(15, 23, 42, 0.94); color: #ffffff; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.30); border: 1px solid rgba(255, 255, 255, 0.15); pointer-events: none;">
              ${safeName} &bull; <span style="color: ${isOnline ? '#4ade80' : '#cbd5e1'}; font-weight: 800;">${onlineTag}</span> (${safeDist})
            </div>
          </div>
        `,
        iconSize: [50, 60],
        iconAnchor: [25, 60],
      });

      const marker = L.marker([userLat, userLng], { icon: userLocationPinIcon }).addTo(layer);

      const tooltipContent = `
        <div style="font-family: inherit; font-size: 11px; line-height: 1.4; min-width: 210px; padding: 4px;">
          <div style="font-weight: 800; font-size: 12px; color: #0f172a; margin-bottom: 2px;">${safeName}</div>
          <div style="color: #64748b; font-size: 10px; margin-bottom: 6px;">ID: ${safeEmpId} &bull; ${safePos}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Connection:</span>
            <strong style="color: ${isOnline ? '#16a34a' : '#64748b'};">${safeConn}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Signal Strength:</span>
            <strong style="color: #004b87;">${safeSignal}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Campus Boundary:</span>
            <strong style="color: ${isBreach ? '#dc2626' : '#16a34a'};">${escapeHtml(statusLabel)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Distance from School:</span>
            <strong>${safeDist}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Device Battery:</span>
            <strong>${safeBat}</strong>
          </div>
          <div style="color: #004b87; font-size: 9px; font-family: monospace; margin-top: 4px; border-top: 1px solid #e2e8f0; padding-top: 3px;">
            IP: ${safeIp} &bull; Device ID: ${safeDev}
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipContent, {
        direction: 'top',
        offset: [0, -60],
        opacity: 0.98,
      });
    });
  }, [activeScreen, geoData, lat, lng, radius]);

  const handleFitAllOnMap = () => {
    if (!mapInstanceRef.current || lat === null || lng === null) return;
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
        API_ROUTES.campus.boundary,
        {
          latitude: lat,
          longitude: lng,
          radius_meters: radius,
        },
        { timeout: 8000 }
      );

      isDirtyRef.current = false;
      showAlert({
        title: 'Boundary Saved',
        message: res.data?.message || 'School boundary updated successfully.',
        type: 'success',
      });
      await refreshSchool();
      await fetchGeofenceData(true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Save Failed',
        message: extractApiError(err, 'Could not update boundary settings.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDevice = (facultyId: number, facultyName: string) => {
    if (!isAdmin) return;

    showConfirm({
      title: 'Reset Phone Device Lock',
      message: `Unbind the registered phone for ${facultyName}? This clears their 1-to-1 device lock so they can register a replacement phone on their next check-in.`,
      confirmLabel: 'Reset Device Lock',
      isDestructive: true,
      onConfirm: async () => {
        setResettingId(facultyId);
        try {
          const res = await apiClient.post(`${API_ROUTES.accounts.faculty}${facultyId}/reset-device/`);
          showAlert({
            title: 'Device Lock Cleared',
            message: res.data?.message || `Phone binding for ${facultyName} has been cleared.`,
            type: 'success',
          });
          await fetchGeofenceData(true, true);
        } catch (err: unknown) {
          showAlert({
            title: 'Reset Failed',
            message: extractApiError(err, 'Could not clear device binding.'),
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
      showAlert({ title: 'Empty Export', message: 'No location records available to export.', type: 'warning' });
      return;
    }

    const headers = [
      'Timestamp',
      'Faculty Member',
      'Employee ID',
      'Presence Status',
      'Distance from School',
      'Signal Strength',
      'IP Address',
      'Device ID',
      'Battery',
      'Device Model',
    ];
    const rows = auditRecords.map((r) => {
      const inside = Boolean(r.is_inside ?? r.is_inside_geofence);
      return [
        r.timestamp,
        r.faculty_name,
        r.employee_id || '—',
        inside ? 'Inside School Grounds' : 'Outside School Grounds',
        formatMeters(r.distance),
        r.signal_strength || '—',
        r.ip_address || '—',
        r.mac_address || r.bound_device_id || '—',
        formatBattery(r.battery ?? r.battery_level),
        r.device_model || '—',
      ];
    });

    exportToCsv(
      `AttendSure_Campus_GPS_Logs_${dateFilterMode === 'ALL_LOGS' ? 'All_Logs' : auditDate}.csv`,
      headers,
      rows
    );
  };

  const badgePill = (bg: string, color: string, border: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
    fontSize: '0.64rem',
    fontWeight: 800,
    letterSpacing: '0.3px',
  });

  const getStatusBadge = (s: FacultyListItem) => {
    if (s.is_mock_location || s.status === 'SPOOF_ATTEMPT') {
      return (
        <span style={badgePill(tokens.dangerLight, brand.danger, brand.danger)}>
          <ShieldAlert size={11} style={{ marginRight: 3 }} /> Fake GPS Blocked
        </span>
      );
    }

    const inside = s.is_inside ?? s.is_inside_geofence;
    const hasCoords = s.latitude !== null && s.latitude !== undefined;

    if (s.status === 'VERIFIED_INSIDE' || (hasCoords && inside === true)) {
      return (
        <span style={badgePill(tokens.successLight, brand.success, brand.success)}>
          <Check size={11} style={{ marginRight: 3 }} /> Inside School Grounds
        </span>
      );
    }
    if (s.status === 'AUTHORIZED_LEAVE') {
      return <span style={badgePill(tokens.primaryLight, brand.primary, brand.primary)}>Official Exit Pass</span>;
    }
    if (s.status === 'PERIMETER_BREACH' || s.status === 'OFF_CAMPUS' || (hasCoords && inside === false)) {
      return <span style={badgePill(tokens.dangerLight, brand.danger, brand.danger)}>Outside School Grounds</span>;
    }
    if (s.status === 'HEARTBEAT_LOST') {
      return <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textSecondary, tokens.borderStrong)}>Signal Lost</span>;
    }
    return <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textMuted, tokens.borderSubtle)}>No Signal Today</span>;
  };

  const screenSwitchBtn = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    borderRadius: 5,
    border: 'none',
    backgroundColor: active ? brand.buttonBg : 'transparent',
    color: active ? '#ffffff' : tokens.textSecondary,
    fontWeight: active ? 800 : 600,
    fontSize: '0.72rem',
    cursor: 'pointer',
  });

  const layerToggleBtn = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 4,
    border: 'none',
    backgroundColor: active ? tokens.bgSurface : 'transparent',
    color: active ? brand.primary : tokens.textSecondary,
    fontWeight: active ? 800 : 600,
    fontSize: '0.66rem',
    cursor: 'pointer',
  });

  const panelCard: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 12,
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
    overflow: 'hidden',
  };

  return (
    <div style={{ padding: 'clamp(12px, 2.5vw, 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2
            style={{
              fontSize: '1.20rem',
              fontWeight: 800,
              color: tokens.textPrimary,
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Building2 size={20} color={brand.primary} />
            <span>Campus GPS Boundary &amp; Location Audit</span>
          </h2>
          <p style={{ fontSize: '0.76rem', color: tokens.textSecondary, margin: '3px 0 0 0' }}>
            Live faculty mobile GPS check-ins, 1-to-1 device locks, and campus boundary tracking.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 8, padding: 3, border: `1px solid ${tokens.borderSubtle}` }}>
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
              <span>Location Logs</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => (activeScreen === 'LIVE_MAP' ? void fetchGeofenceData(false, true) : void fetchAuditHistory(false))}
            disabled={loading || auditLoading}
            style={ui.btnSecondary}
          >
            <RefreshCw size={13} className={loading || auditLoading ? 'animate-spin' : ''} />
            <span>{activeScreen === 'LIVE_MAP' ? 'Refresh Map' : 'Refresh Logs'}</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: LIVE MAP */}
      <div style={{ display: activeScreen === 'LIVE_MAP' ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          <StatsCard
            label="ONLINE FACULTY"
            value={geoData?.online_users_count ?? 0}
            valueColor={brand.success}
            helpText="Active GPS signal"
            badge={<Wifi size={18} color={brand.success} />}
          />
          <StatsCard
            label="OFFLINE FACULTY"
            value={geoData?.offline_users_count ?? 0}
            valueColor={tokens.textSecondary}
            helpText="No recent GPS check-in"
            badge={<WifiOff size={18} color={tokens.textMuted} />}
          />
          <StatsCard
            label="INSIDE SCHOOL GROUNDS"
            value={geoData?.verified_inside ?? 0}
            valueColor={brand.success}
            helpText={radius !== null ? `Within ${radius}m boundary` : 'Boundary not set'}
            badge={<ShieldCheck size={18} color={brand.success} />}
          />
          <StatsCard
            label="BOUNDARY ALERTS TODAY"
            value={geoData?.incidents_today ?? 0}
            valueColor={geoData?.incidents_today ? brand.danger : tokens.textPrimary}
            helpText="Beyond allowed campus area"
            badge={<AlertTriangle size={18} color={geoData?.incidents_today ? brand.danger : tokens.textMuted} />}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: 16, alignItems: 'start' }}>
          <div style={panelCard}>
            <div
              style={{
                padding: '10px 16px',
                borderBottom: `1px solid ${tokens.borderSubtle}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: tokens.bgSurfaceSubtle,
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.80rem', fontWeight: 700, color: tokens.textPrimary }}>
                <Compass size={15} color={brand.primary} />
                <span>Campus Boundary Map</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleFitAllOnMap}
                  style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: '0.70rem', color: brand.primary }}
                  title="Zoom out to show school boundary and all faculty pins"
                >
                  <Maximize2 size={11} />
                  <span>Show All</span>
                </button>

                <div style={{ display: 'flex', backgroundColor: tokens.borderSubtle, borderRadius: 6, padding: 2 }}>
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
                    style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: '0.70rem', color: brand.primary }}
                    title="Center map to your computer's GPS"
                  >
                    <Navigation size={11} />
                    <span>Center</span>
                  </button>
                )}
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', height: 420, backgroundColor: tokens.bgSurfaceSubtle }}>
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
              <div
                style={{
                  position: 'absolute',
                  bottom: 10,
                  right: 10,
                  zIndex: 10,
                  backgroundColor: tokens.bgSurface,
                  border: `1px solid ${tokens.borderStrong}`,
                  padding: '4px 8px',
                  borderRadius: 6,
                  fontSize: '0.68rem',
                  fontFamily: 'monospace',
                  color: tokens.textPrimary,
                  boxShadow: tokens.cardShadow,
                }}
              >
                {lat !== null && lng !== null
                  ? `Center: ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E • Radius: ${radius ?? 0}m`
                  : 'Boundary Not Configured in Database'}
              </div>
            </div>

            <div style={{ padding: '8px 16px', backgroundColor: tokens.bgSurface, borderTop: `1px solid ${tokens.borderSubtle}`, fontSize: '0.72rem', color: tokens.textSecondary }}>
              <strong>Map Legend:</strong>
              <span style={{ color: brand.success, marginLeft: 8, fontWeight: 700 }}>&bull; Green Pin = Online</span>
              <span style={{ color: tokens.textMuted, marginLeft: 10, fontWeight: 700 }}>&bull; Gray Pin = Offline</span>
              <span style={{ marginLeft: 10, color: brand.danger, fontWeight: 600 }}>&bull; Dashed line = Outside school grounds</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...panelCard, padding: 18 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  borderBottom: `1px solid ${tokens.borderSubtle}`,
                  paddingBottom: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>Boundary Settings</div>
                  <div style={{ fontSize: '0.70rem', color: tokens.textSecondary }}>
                    Official school boundary coordinates saved in database.
                  </div>
                </div>
                {!isAdmin && (
                  <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textSecondary, tokens.borderSubtle)}>
                    <Lock size={10} style={{ marginRight: 4 }} /> Read-Only
                  </span>
                )}
              </div>

              <form onSubmit={handleSavePerimeter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                  <div>
                    <label style={ui.label}>Center Latitude (°N)</label>
                    <input
                      type="number"
                      step="any"
                      disabled={!isAdmin}
                      required
                      value={lat ?? ''}
                      onChange={(e) => {
                        isDirtyRef.current = true;
                        const parsed = parseFloat(e.target.value);
                        setLat(isNaN(parsed) ? null : parsed);
                      }}
                      style={ui.input}
                    />
                  </div>
                  <div>
                    <label style={ui.label}>Center Longitude (°E)</label>
                    <input
                      type="number"
                      step="any"
                      disabled={!isAdmin}
                      required
                      value={lng ?? ''}
                      onChange={(e) => {
                        isDirtyRef.current = true;
                        const parsed = parseFloat(e.target.value);
                        setLng(isNaN(parsed) ? null : parsed);
                      }}
                      style={ui.input}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label style={ui.label}>Boundary Radius</label>
                    <span style={{ fontSize: '0.80rem', fontWeight: 800, color: brand.primary, fontFamily: 'monospace' }}>
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
                    style={{ width: '100%', accentColor: brand.buttonBg, cursor: isAdmin ? 'pointer' : 'not-allowed' }}
                  />
                </div>

                {isAdmin && (
                  <button
                    type="submit"
                    disabled={saving || lat === null || lng === null || radius === null}
                    style={{ ...ui.btnPrimary, justifyContent: 'center', width: '100%', marginTop: 4 }}
                  >
                    <Save size={13} />
                    <span>{saving ? 'Saving...' : 'Save Boundary'}</span>
                  </button>
                )}
              </form>
            </div>

            <div style={{ ...panelCard, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: '0.80rem', fontWeight: 700, color: tokens.textPrimary }}>Boundary Alerts</div>
                <span style={{ fontSize: '0.66rem', color: tokens.textMuted }}>Automated Verification</span>
              </div>

              {geoData?.recent_breaches && geoData.recent_breaches.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {geoData.recent_breaches.map((b, idx) => (
                    <div
                      key={`${b.id}-${idx}`}
                      style={{
                        padding: '7px 10px',
                        borderRadius: 6,
                        backgroundColor: tokens.dangerLight,
                        border: `1px solid ${brand.danger}`,
                        fontSize: '0.70rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong style={{ color: brand.danger }}>{b.faculty_name}</strong>
                        <div style={{ fontSize: '0.64rem', color: tokens.textSecondary, marginTop: 1 }}>
                          {b.reason || b.trigger_reason}
                        </div>
                      </div>
                      <span style={badgePill(tokens.bgSurface, brand.danger, brand.danger)}>{b.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '10px 0', textAlign: 'center', color: tokens.textMuted, fontSize: '0.72rem' }}>
                  <CheckCircle2 size={16} color={brand.success} style={{ margin: '0 auto 4px auto', display: 'block' }} />
                  No boundary alerts or fake GPS attempts recorded today.
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={panelCard}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${tokens.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
                Faculty Live Status &amp; Bound Devices
              </div>
              <div style={{ fontSize: '0.70rem', color: tokens.textSecondary }}>
                Connection status, GPS distance, signal quality, and 1-to-1 phone lock details.
              </div>
            </div>
            <span style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
              Total Faculty: <strong style={{ color: tokens.textPrimary }}>{geoData?.faculty_list?.length || 0}</strong>
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 840, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Faculty Member</th>
                  <th style={ui.th}>Connection</th>
                  <th style={ui.th}>Signal Strength</th>
                  <th style={ui.th}>School Boundary</th>
                  <th style={ui.th}>Distance / GPS</th>
                  <th style={ui.th}>Bound Phone</th>
                  <th style={ui.th}>Battery</th>
                  {isAdmin && <th style={{ ...ui.th, textAlign: 'right' }}>Device Lock Action</th>}
                </tr>
              </thead>
              <tbody>
                {(geoData?.faculty_list || []).length > 0 ? (
                  geoData!.faculty_list.map((s) => {
                    const isOnline = Boolean(s.is_online);

                    return (
                      <tr key={s.id}>
                        <td style={ui.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                              <ProfileAvatar
                                photoUrl={s.photo_url || s.photo}
                                name={s.faculty_name}
                                size={36}
                                iconSize={16}
                              />
                              <span
                                style={{
                                  position: 'absolute',
                                  bottom: -1,
                                  right: -1,
                                  width: 10,
                                  height: 10,
                                  borderRadius: '50%',
                                  backgroundColor: isOnline ? brand.success : tokens.textMuted,
                                  border: `2px solid ${tokens.bgSurface}`,
                                }}
                              />
                            </div>
                            <div>
                              <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.82rem' }}>{s.faculty_name}</div>
                              <div style={{ fontSize: '0.66rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                                ID: {s.employee_id} &bull; {s.position || '—'}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={ui.td}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div>
                              {isOnline ? (
                                <span style={badgePill(tokens.successLight, brand.success, brand.success)}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: brand.success, marginRight: 5 }} />
                                  ONLINE
                                </span>
                              ) : (
                                <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textSecondary, tokens.borderStrong)}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: tokens.textMuted, marginRight: 5 }} />
                                  OFFLINE
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.68rem', color: isOnline ? brand.success : tokens.textMuted, fontWeight: 600 }}>
                              {s.status_duration || s.last_seen || '—'}
                            </span>
                          </div>
                        </td>

                        <td style={ui.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {renderSignalBars(s.signal_percentage)}
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isOnline ? tokens.textPrimary : tokens.textMuted }}>
                              {s.signal_strength || '—'}
                            </span>
                          </div>
                        </td>

                        <td style={ui.td}>{getStatusBadge(s)}</td>

                        <td style={{ ...ui.td, fontFamily: 'monospace', color: tokens.textPrimary }}>
                          <div>{formatMeters(s.distance)}</div>
                          {s.gps_accuracy_meters !== undefined && s.gps_accuracy_meters !== null && (
                            <div
                              style={{
                                fontSize: '0.64rem',
                                color: s.gps_accuracy_meters > 25 ? brand.warning : brand.success,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              <Radio size={9} /> &plusmn;{Math.round(s.gps_accuracy_meters)}m
                            </div>
                          )}
                        </td>

                        <td style={ui.td}>
                          {s.bound_device_id || s.ip_address ? (
                            <div>
                              {s.device_model && (
                                <div style={{ fontSize: '0.72rem', fontWeight: 600, color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Network size={11} color={brand.primary} /> {s.device_model}
                                </div>
                              )}
                              <div style={{ fontSize: '0.64rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                                {s.mac_address || s.bound_device_id || '—'}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Unbound</span>
                          )}
                        </td>

                        <td style={{ ...ui.td, color: tokens.textSecondary }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <BatteryCharging size={12} color={brand.primary} />
                            {formatBattery(s.battery ?? s.battery_level)}
                          </span>
                        </td>

                        {isAdmin && (
                          <td style={{ ...ui.td, textAlign: 'right' }}>
                            {s.bound_device_id ? (
                              <button
                                type="button"
                                disabled={resettingId === s.id}
                                onClick={() => handleResetDevice(s.id, s.faculty_name)}
                                title="Unbind phone device lock"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 8px',
                                  backgroundColor: tokens.dangerLight,
                                  border: `1px solid ${brand.danger}`,
                                  borderRadius: 6,
                                  color: brand.danger,
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                <RotateCcw size={11} className={resettingId === s.id ? 'animate-spin' : ''} />
                                <span>Reset Lock</span>
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.66rem', color: tokens.textMuted }}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} style={{ textAlign: 'center', padding: '24px', color: tokens.textMuted }}>
                      No faculty records found in database.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* VIEW 2: LOCATION LOGS */}
      <div style={{ display: activeScreen === 'AUDIT_SCREEN' ? 'flex' : 'none', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...panelCard, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <div style={{ minWidth: 200, flex: 1 }}>
                <label style={ui.label}>Search Faculty Name or ID</label>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Search name, ID, or GPS..."
                  value={auditSearchQuery}
                  onChange={(e) => setAuditSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void fetchAuditHistory(false)}
                  style={ui.input}
                />
              </div>

              <div>
                <label style={ui.label}>Filter Faculty</label>
                <select
                  value={auditFacultyFilter}
                  onChange={(e) => setAuditFacultyFilter(e.target.value)}
                  style={{ ...ui.input, width: 170 }}
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
                <label style={ui.label}>Log Date Filter</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => setDateFilterMode('ALL_LOGS')}
                    style={{
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: `1px solid ${dateFilterMode === 'ALL_LOGS' ? brand.buttonBg : tokens.borderStrong}`,
                      backgroundColor: dateFilterMode === 'ALL_LOGS' ? brand.buttonBg : tokens.bgSurface,
                      color: dateFilterMode === 'ALL_LOGS' ? '#ffffff' : tokens.textSecondary,
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
                      padding: '7px 10px',
                      borderRadius: 6,
                      border: `1px solid ${dateFilterMode === 'SPECIFIC_DATE' ? brand.buttonBg : tokens.borderStrong}`,
                      backgroundColor: dateFilterMode === 'SPECIFIC_DATE' ? brand.buttonBg : tokens.bgSurface,
                      color: dateFilterMode === 'SPECIFIC_DATE' ? '#ffffff' : tokens.textSecondary,
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
                  <label style={ui.label}>Select Date</label>
                  <input
                    type="date"
                    value={auditDate}
                    onChange={(e) => setAuditDate(e.target.value)}
                    style={{ ...ui.input, width: 145 }}
                  />
                </div>
              )}

              <div>
                <label style={ui.label}>Boundary Status</label>
                <select
                  value={auditVerdictFilter}
                  onChange={(e) => setAuditVerdictFilter(e.target.value as 'ALL' | 'INSIDE' | 'OUTSIDE')}
                  style={{ ...ui.input, width: 170 }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="INSIDE">Inside School Grounds</option>
                  <option value="OUTSIDE">Outside School Grounds</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                onClick={() => void fetchAuditHistory(false)}
                disabled={auditLoading}
                style={ui.btnPrimary}
              >
                <Search size={13} />
                <span>Search Logs</span>
              </button>

              <button
                type="button"
                onClick={exportAuditCSV}
                disabled={auditRecords.length === 0}
                style={{
                  ...ui.btnPrimary,
                  backgroundColor: successBtnBg,
                  opacity: auditRecords.length === 0 ? 0.55 : 1,
                }}
                title="Export location logs as CSV"
              >
                <FileSpreadsheet size={13} />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          <StatsCard
            label="TOTAL LOCATION RECORDS"
            value={totalDatabaseRecords}
            helpText={dateFilterMode === 'ALL_LOGS' ? 'Historical records' : `Records on ${auditDate}`}
          />
          <StatsCard
            label="INSIDE SCHOOL GROUNDS"
            value={auditRecords.filter((r) => Boolean(r.is_inside ?? r.is_inside_geofence)).length}
            valueColor={brand.success}
            helpText={radius !== null ? `Within ${radius}m boundary` : 'Boundary not set'}
          />
          <StatsCard
            label="OUTSIDE SCHOOL GROUNDS"
            value={auditRecords.filter((r) => !Boolean(r.is_inside ?? r.is_inside_geofence)).length}
            valueColor={brand.danger}
            helpText="Beyond allowed campus area"
          />
        </div>

        <div style={panelCard}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${tokens.borderSubtle}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Campus Location Logs</span>
                <span style={badgePill(tokens.successLight, brand.success, brand.success)}>Live Auto-Updating</span>
              </div>
              <div style={{ fontSize: '0.70rem', color: tokens.textSecondary, marginTop: 2 }}>
                Timestamped GPS check-ins, boundary status, distance, client IP, and battery level.
              </div>
            </div>
            <span style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
              Showing <strong style={{ color: tokens.textPrimary }}>{auditRecords.length}</strong> of{' '}
              <strong style={{ color: tokens.textPrimary }}>{totalDatabaseRecords}</strong> record(s)
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
              <thead>
                <tr>
                  <th style={ui.th}>Check-In Time</th>
                  <th style={ui.th}>Faculty Member</th>
                  <th style={ui.th}>Boundary Status</th>
                  <th style={ui.th}>Signal Strength</th>
                  <th style={ui.th}>Distance from School</th>
                  <th style={ui.th}>IP Address</th>
                  <th style={ui.th}>Device ID</th>
                  <th style={ui.th}>Battery</th>
                </tr>
              </thead>
              <tbody>
                {auditRecords.length > 0 ? (
                  auditRecords.map((r) => {
                    const inside = Boolean(r.is_inside ?? r.is_inside_geofence);
                    return (
                      <tr key={r.id}>
                        <td style={{ ...ui.td, fontFamily: 'monospace' }}>
                          <div style={{ fontWeight: 700, color: tokens.textPrimary }}>{r.time_only || r.timestamp}</div>
                          <div style={{ fontSize: '0.64rem', color: tokens.textMuted }}>{r.date_only || ''}</div>
                        </td>
                        <td style={ui.td}>
                          <strong style={{ color: tokens.textPrimary }}>{r.faculty_name}</strong>
                          {r.employee_id && (
                            <div style={{ fontSize: '0.64rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                              ID: {r.employee_id}
                            </div>
                          )}
                        </td>
                        <td style={ui.td}>
                          {inside ? (
                            <span style={badgePill(tokens.successLight, brand.success, brand.success)}>
                              <Check size={10} style={{ marginRight: 3 }} /> Inside School Grounds
                            </span>
                          ) : (
                            <span style={badgePill(tokens.dangerLight, brand.danger, brand.danger)}>
                              <AlertTriangle size={10} style={{ marginRight: 3 }} /> Outside School Grounds
                            </span>
                          )}
                        </td>
                        <td style={ui.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            {renderSignalBars(r.signal_percentage)}
                            <span style={{ fontSize: '0.72rem', color: tokens.textPrimary, fontWeight: 600 }}>
                              {r.signal_strength || '—'}
                            </span>
                          </div>
                        </td>
                        <td style={{ ...ui.td, fontFamily: 'monospace', fontWeight: 700, color: inside ? brand.success : brand.danger }}>
                          {formatMeters(r.distance)}
                        </td>
                        <td style={{ ...ui.td, fontFamily: 'monospace', color: brand.primary, fontSize: '0.72rem' }}>
                          {r.ip_address || '—'}
                        </td>
                        <td style={{ ...ui.td, fontFamily: 'monospace', color: tokens.textSecondary, fontSize: '0.72rem' }}>
                          {r.mac_address || r.bound_device_id || '—'}
                        </td>
                        <td style={{ ...ui.td, color: tokens.textSecondary }}>
                          {formatBattery(r.battery ?? r.battery_level)}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '30px', color: tokens.textMuted }}>
                      {auditLoading ? 'Loading location logs...' : 'No location logs found matching your filters.'}
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

export default GeofenceTab;