// AttendSure Web - Geofence Tab
// File: D:\AttendSure_V3\web\src\components\tabs\GeofenceTab.tsx

/**
 * AttendSure - Campus GPS Boundary, Phone Health Telemetry, Loafing Monitor & Location Audit
 * Modularized with GeofenceBoundaryForm, GeofenceTeacherTable, and GeofenceAuditHistoryView.
 * File: web/src/components/tabs/GeofenceTab.tsx
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import apiClient, { peekApiCache } from '../../api/client';
import { API_ROUTES, escapeHtml, extractApiError } from '../../api/routes';
import { isSafeImageUrl, MAP_STATUS_COLORS, SEAL_COLORS } from '../../theme/tokens';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { useTheme } from '../../context/ThemeContext';
import { StatsCard } from '../common/StatsCard';
import { exportToCsv } from '../common/Pagination';
import { LoafingMonitorPanel } from './LoafingMonitorPanel';
import { canEditGeofence, canResetBoundDevice, getCurrentUserFromStorage } from '../../utils/permissions';
import { formatPhoneBatteryLabel, formatPhoneNetworkLabel } from '../../utils/alertLabels';
import { GeofenceBoundaryForm } from './geofence/GeofenceBoundaryForm';
import { GeofenceTeacherTable } from './geofence/GeofenceTeacherTable';
import { GeofenceAuditHistoryView } from './geofence/GeofenceAuditHistoryView';
import {
  formatMeters,
  type AuditRecord,
  type GeofenceOverviewData,
  type TeacherBoundaryStatus,
} from './geofence/types';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Navigation,
  RefreshCw,
  Layers,
  Compass,
  Building2,
  Wifi,
  WifiOff,
  Maximize2,
  History,
  MapPin,
} from 'lucide-react';

export type { AuditRecord, GeofenceOverviewData, TeacherBoundaryStatus };

const sanitizeInput = (raw: string, maxLength = 80): string =>
  String(raw || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .trim()
    .slice(0, maxLength);

export const GeofenceTab: React.FC = () => {
  const { school, refreshSchool } = useSchool();
  const { showAlert, showConfirm } = useAlert();
  const { tokens, brand, ui } = useTheme();

  const [activeScreen, setActiveScreen] = useState<'LIVE_MAP' | 'LOAFING_ALERTS' | 'AUDIT_SCREEN'>('LIVE_MAP');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const circleInstanceRef = useRef<L.Circle | null>(null);
  const innerCircleInstanceRef = useRef<L.Circle | null>(null);
  const markerInstanceRef = useRef<L.Marker | null>(null);
  const hasFittedCircleRef = useRef<boolean>(false);
  const userMarkersLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<(L.TileLayer & { _layerType?: string }) | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const geoAbortRef = useRef<AbortController | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);

  const cachedGeo = peekApiCache<GeofenceOverviewData>(API_ROUTES.campus.overview);
  const [loading, setLoading] = useState(!cachedGeo);
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<number | null>(null);
  const [mapLayer, setMapLayer] = useState<'streets' | 'satellite'>('streets');
  const [geoData, setGeoData] = useState<GeofenceOverviewData | null>(cachedGeo ?? null);

  const [auditRecords, setAuditRecords] = useState<AuditRecord[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [totalDatabaseRecords, setTotalDatabaseRecords] = useState<number>(0);
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');
  const [auditTeacherFilter, setAuditTeacherFilter] = useState<string>('ALL');
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

  const currentUser = getCurrentUserFromStorage();
  const isAdmin = canEditGeofence(currentUser);
  const canResetPhone = canResetBoundDevice(currentUser);

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
        } catch {}
        mapInstanceRef.current = null;
        circleInstanceRef.current = null;
        innerCircleInstanceRef.current = null;
        markerInstanceRef.current = null;
        hasFittedCircleRef.current = false;
      }
    };
  }, []);

  const fetchGeofenceData = useCallback(
    async (silent = false, bypassCache = false) => {
      geoAbortRef.current?.abort();
      const controller = new AbortController();
      geoAbortRef.current = controller;

      const warmHit = !bypassCache ? peekApiCache<GeofenceOverviewData>(API_ROUTES.campus.overview) : undefined;
      if (warmHit) {
        setGeoData(warmHit);
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }

      try {
        const res = await apiClient.get<GeofenceOverviewData>(API_ROUTES.campus.overview, {
          timeout: 8000,
          params: bypassCache || silent ? { nocache: 1 } : undefined,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.data) {
          setGeoData(res.data);
          if (!isDirtyRef.current) {
            const recLat =
              res.data.latitude !== null && res.data.latitude !== undefined
                ? parseFloat(String(res.data.latitude))
                : null;
            const recLng =
              res.data.longitude !== null && res.data.longitude !== undefined
                ? parseFloat(String(res.data.longitude))
                : null;
            const recRad =
              res.data.radius_meters !== null && res.data.radius_meters !== undefined
                ? parseInt(String(res.data.radius_meters), 10)
                : null;

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
        if (auditTeacherFilter !== 'ALL') params.teacher_id = auditTeacherFilter;
        if (auditVerdictFilter !== 'ALL') params.status = auditVerdictFilter;

        const res = await apiClient.get(API_ROUTES.campus.audit, {
          params,
          timeout: 8000,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const rawRecords: AuditRecord[] = Array.isArray(res.data?.records) ? res.data.records : [];
        const cleanQuery = sanitizeInput(auditSearchQuery, 80).toLowerCase();
        const filtered = cleanQuery
          ? rawRecords.filter(
              (r) =>
                (r.teacher_name || '').toLowerCase().includes(cleanQuery) ||
                (r.employee_id || '').toLowerCase().includes(cleanQuery) ||
                (r.device_id || '').toLowerCase().includes(cleanQuery)
            )
          : rawRecords;
        setAuditRecords(filtered);
        setTotalDatabaseRecords(res.data?.count ?? filtered.length);
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
    [dateFilterMode, auditDate, auditTeacherFilter, auditVerdictFilter, auditSearchQuery, showAlert]
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
    }, 10000);
    return () => clearInterval(liveInterval);
  }, [fetchGeofenceData, fetchAuditHistory, activeScreen]);

  useEffect(() => {
    if (activeScreen === 'AUDIT_SCREEN') {
      void fetchAuditHistory(false);
    }
  }, [activeScreen, fetchAuditHistory]);

  // Local Bundled Leaflet Initialization
  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !mapContainerRef.current) return;
    if (lat === null || lng === null) return;

    const getTileUrl = (layer: 'streets' | 'satellite') =>
      layer === 'satellite'
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (mapInstanceRef.current && mapInstanceRef.current.getContainer() !== mapContainerRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {}
      mapInstanceRef.current = null;
      markerInstanceRef.current = null;
      circleInstanceRef.current = null;
      innerCircleInstanceRef.current = null;
      hasFittedCircleRef.current = false;
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

      resizeTimerRef.current = setTimeout(() => map.invalidateSize(), 250);

      map.on('click', (e: L.LeafletMouseEvent) => {
        if (!isAdmin) return;
        isDirtyRef.current = true;
        setLat(parseFloat(e.latlng.lat.toFixed(6)));
        setLng(parseFloat(e.latlng.lng.toFixed(6)));
      });
    } else {
      resizeTimerRef.current = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 150);
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

    const safeCampusTitle = escapeHtml(
      geoData?.campus_name || geoData?.name || school?.school_name || 'School Campus'
    );
    const radiusDisplay = radius !== null ? formatMeters(radius) : '—';

    const campusCenterIcon = L.divIcon({
      className: 'campus-center-beacon',
      html: `
        <div style="position: relative; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; border-radius: 50%; background-color: ${MAP_STATUS_COLORS.authorizedOutside}; opacity: 0.25;"></div>
          <div style="width: 34px; height: 34px; background-color: ${MAP_STATUS_COLORS.perimeterStroke}; border: 3px solid ${MAP_STATUS_COLORS.pinRing}; border-radius: 50%; box-shadow: 0 4px 14px rgba(0,75,135,0.55); display: flex; align-items: center; justify-content: center; color: ${MAP_STATUS_COLORS.pinRing}; position: relative; z-index: 2;">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
              <line x1="12" y1="2" x2="12" y2="5"/>
              <line x1="12" y1="19" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="5" y2="12"/>
              <line x1="19" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
          <div style="position: absolute; top: 50px; left: 50%; transform: translateX(-50%); background-color: rgba(15, 23, 42, 0.94); color: ${MAP_STATUS_COLORS.pinRing}; font-size: 10px; font-weight: 800; padding: 3px 9px; border-radius: 999px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.32); border: 1px solid rgba(255,255,255,0.18); pointer-events: none; z-index: 4;">
            SCHOOL CENTER &bull; ${safeCampusTitle} (${escapeHtml(radiusDisplay)})
          </div>
        </div>
      `,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (markerInstanceRef.current) {
      markerInstanceRef.current.setLatLng([lat, lng]);
      markerInstanceRef.current.setIcon(campusCenterIcon);
    } else {
      markerInstanceRef.current = L.marker([lat, lng], {
        icon: campusCenterIcon,
        draggable: isAdmin,
        zIndexOffset: 500,
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
          color: MAP_STATUS_COLORS.perimeterStroke,
          weight: 4,
          fillColor: MAP_STATUS_COLORS.authorizedOutside,
          fillOpacity: 0.22,
        }).addTo(currentMap);
      }

      const halfRadius = Math.max(10, Math.round(radius * 0.5));
      if (innerCircleInstanceRef.current) {
        innerCircleInstanceRef.current.setLatLng([lat, lng]);
        innerCircleInstanceRef.current.setRadius(halfRadius);
      } else {
        innerCircleInstanceRef.current = L.circle([lat, lng], {
          radius: halfRadius,
          color: MAP_STATUS_COLORS.perimeterStroke,
          weight: 1.5,
          opacity: 0.45,
          fillOpacity: 0,
          dashArray: '6, 8',
          interactive: false,
        }).addTo(currentMap);
      }

      if (!hasFittedCircleRef.current && circleInstanceRef.current) {
        hasFittedCircleRef.current = true;
        try {
          currentMap.fitBounds(circleInstanceRef.current.getBounds(), {
            padding: [48, 48],
            maxZoom: 18,
          });
        } catch {
          currentMap.setView([lat, lng], 17);
        }
      }
    }
  }, [activeScreen, lat, lng, radius, mapLayer, isAdmin, geoData?.campus_name, geoData?.name, school?.school_name]);

  useEffect(() => {
    if (activeScreen !== 'LIVE_MAP' || !mapInstanceRef.current || !userMarkersLayerRef.current) return;
    const layer = userMarkersLayerRef.current;
    layer.clearLayers();

    const teachers = geoData?.teacher_list || [];
    teachers.forEach((teacher: TeacherBoundaryStatus) => {
      const userLat = parseFloat(String(teacher.latitude));
      const userLng = parseFloat(String(teacher.longitude));
      if (isNaN(userLat) || isNaN(userLng) || userLat === 0 || userLng === 0) return;

      const isOnline = Boolean(teacher.is_online);
      const insideFlag = teacher.is_inside ?? teacher.is_inside_geofence ?? teacher.zone_status === 'INSIDE';
      const isLoafing = teacher.zone_status === 'LOAFING_ALERT' || teacher.status === 'PERIMETER_BREACH';
      const isAuthorizedPass =
        teacher.zone_status === 'AUTHORIZED_OUTSIDE' || teacher.status === 'AUTHORIZED_LEAVE';
      const isOutsideOffDuty = !isLoafing && !isAuthorizedPass && insideFlag === false;
      const isOutside = isLoafing || isOutsideOffDuty;

      const safeName = escapeHtml(teacher.teacher_name || teacher.full_name || 'Teacher');
      const safeEmpId = escapeHtml(teacher.employee_id);
      const safePos = escapeHtml(teacher.position || '—');
      const safeDist = escapeHtml(formatMeters(teacher.distance ?? teacher.distance_meters));
      const safeDev = escapeHtml(teacher.device_model || teacher.bound_device_id || 'Unbound');
      const safeBattery = escapeHtml(formatPhoneBatteryLabel(teacher.battery_percent, teacher.is_charging));
      const safeNet = escapeHtml(formatPhoneNetworkLabel(teacher.network_type));
      const safeGps =
        typeof teacher.is_gps_enabled === 'boolean'
          ? teacher.is_gps_enabled
            ? 'GPS On'
            : 'GPS Off'
          : '—';

      const rawAvatar = teacher.photo_url || teacher.photo;
      const safeAvatar = isSafeImageUrl(rawAvatar) ? escapeHtml(rawAvatar!.trim()) : '';
      const safeInitials = escapeHtml(
        (teacher.teacher_name || 'T')
          .split(' ')
          .map((n) => n[0] || '')
          .slice(0, 2)
          .join('')
          .toUpperCase()
      );

      if (isOutside && lat !== null && lng !== null) {
        const lineColor = isLoafing
          ? MAP_STATUS_COLORS.loafingAlert
          : isOnline
            ? brand.warning
            : SEAL_COLORS.mutedBorder;
        const connectingLine = L.polyline(
          [
            [lat, lng],
            [userLat, userLng],
          ],
          {
            color: lineColor,
            weight: 2.5,
            opacity: isOnline ? 0.85 : 0.45,
            dashArray: '6, 8',
            lineCap: 'round',
          }
        ).addTo(layer);

        connectingLine.bindTooltip(
          `
            <div style="font-family: inherit; font-size: 11px; padding: 2px;">
              <strong style="color: ${lineColor};">${safeName}</strong><br/>
              <span>Distance to Campus: <strong>${safeDist}</strong></span>
            </div>
          `,
          { sticky: true, opacity: 0.95 }
        );
      }

      const pinColor = isAuthorizedPass
        ? MAP_STATUS_COLORS.authorizedOutside
        : isOnline
          ? isLoafing
            ? MAP_STATUS_COLORS.loafingAlert
            : isOutsideOffDuty
              ? brand.warning
              : MAP_STATUS_COLORS.inside
          : MAP_STATUS_COLORS.offDuty;
      const ringBg = isOnline ? 'rgba(5, 150, 105, 0.35)' : 'rgba(100, 116, 139, 0.15)';
      const statusLabel = isAuthorizedPass
        ? 'Official Exit Pass'
        : isLoafing
          ? 'Outside Campus Alert'
          : isOutsideOffDuty
            ? 'Outside Campus (Off Duty)'
            : 'On Campus';
      const statusColor = isAuthorizedPass
        ? MAP_STATUS_COLORS.authorizedOutside
        : isLoafing
          ? MAP_STATUS_COLORS.loafingAlert
          : isOutsideOffDuty
            ? brand.warning
            : MAP_STATUS_COLORS.inside;
      const onlineTag = isOnline ? '● Online' : '○ Offline';

      const avatarInnerHtml = safeAvatar
        ? `<img src="${safeAvatar}" alt="${safeName}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: ${SEAL_COLORS.surface}; color: ${pinColor}; font-weight: 800; font-size: 14px;">${safeInitials}</div>`
        : `<div style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; background-color: ${SEAL_COLORS.surface}; color: ${pinColor}; font-weight: 800; font-size: 14px;">${safeInitials}</div>`;

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
              <circle cx="25" cy="25" r="21" fill="${MAP_STATUS_COLORS.pinRing}"/>
            </svg>
            <div style="position: absolute; top: 4px; left: 4px; width: 42px; height: 42px; border-radius: 50%; overflow: hidden; background-color: ${MAP_STATUS_COLORS.pinRing}; z-index: 2;">
              ${avatarInnerHtml}
            </div>
            <div style="position: absolute; top: 32px; right: 4px; width: 12px; height: 12px; border-radius: 50%; background-color: ${pinColor}; border: 2px solid ${MAP_STATUS_COLORS.pinRing}; z-index: 4;"></div>
            <div style="position: absolute; top: 64px; z-index: 3; background-color: rgba(15, 23, 42, 0.94); color: ${MAP_STATUS_COLORS.pinRing}; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.30); border: 1px solid rgba(255, 255, 255, 0.15); pointer-events: none;">
              ${safeName} &bull; <span style="color: ${isOnline ? MAP_STATUS_COLORS.inside : SEAL_COLORS.border}; font-weight: 800;">${onlineTag}</span> (${safeDist})
            </div>
          </div>
        `,
        iconSize: [50, 60],
        iconAnchor: [25, 60],
      });

      const marker = L.marker([userLat, userLng], { icon: userLocationPinIcon }).addTo(layer);
      const tooltipContent = `
        <div style="font-family: inherit; font-size: 11px; line-height: 1.4; min-width: 220px; padding: 4px;">
          <div style="font-weight: 800; font-size: 12px; color: ${SEAL_COLORS.ink}; margin-bottom: 2px;">${safeName}</div>
          <div style="color: ${MAP_STATUS_COLORS.offDuty}; font-size: 10px; margin-bottom: 6px;">ID: ${safeEmpId} &bull; ${safePos}</div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Campus Boundary:</span>
            <strong style="color: ${statusColor};">${escapeHtml(statusLabel)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Distance from Campus:</span>
            <strong>${safeDist}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>Phone Health:</span>
            <strong>${safeBattery} &bull; ${safeNet} &bull; ${safeGps}</strong>
          </div>
          <div style="color: ${SEAL_COLORS.navy}; font-size: 9px; font-family: monospace; margin-top: 4px; border-top: 1px solid ${SEAL_COLORS.subtleBorder}; padding-top: 3px;">
            Device: ${safeDev}
          </div>
        </div>
      `;

      marker.bindTooltip(tooltipContent, { direction: 'top', offset: [0, -60], opacity: 0.98 });
    });
  }, [activeScreen, geoData, lat, lng, radius, brand.warning]);

  const handleFitAllOnMap = () => {
    if (!mapInstanceRef.current || lat === null || lng === null) return;
    const bounds = L.latLngBounds([[lat, lng]]);
    (geoData?.teacher_list || []).forEach((u) => {
      const uLat = parseFloat(String(u.latitude));
      const uLng = parseFloat(String(u.longitude));
      if (!isNaN(uLat) && !isNaN(uLng) && uLat !== 0) bounds.extend([uLat, uLng]);
    });
    mapInstanceRef.current.fitBounds(bounds, { padding: [70, 70], maxZoom: 17 });
  };

  const handleDetectGPS = () => {
    if (!navigator.geolocation) {
      showAlert({ title: 'Location Unavailable', message: 'GPS location is not supported by this browser.', type: 'error' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        isDirtyRef.current = true;
        const detectedLat = parseFloat(pos.coords.latitude.toFixed(6));
        const detectedLng = parseFloat(pos.coords.longitude.toFixed(6));
        setLat(detectedLat);
        setLng(detectedLng);
        mapInstanceRef.current?.flyTo([detectedLat, detectedLng], 17);
        showAlert({
          title: 'Location Centered',
          message: `Coordinates centered: ${detectedLat}°N, ${detectedLng}°E.`,
          type: 'success',
        });
      },
      (err) => showAlert({ title: 'Location Error', message: err.message, type: 'warning' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSavePerimeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || lat === null || lng === null || radius === null) return;
    if (!Number.isFinite(radius) || radius < 20 || radius > 5000) {
      showAlert({
        title: 'Invalid Boundary Radius',
        message: 'Campus boundary radius must be between 20 and 5000 meters.',
        type: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.put(
        API_ROUTES.campus.boundary,
        {
          center_latitude: lat,
          center_longitude: lng,
          latitude: lat,
          longitude: lng,
          radius_meters: radius,
        },
        { timeout: 8000 }
      );
      isDirtyRef.current = false;
      showAlert({
        title: 'Boundary Saved',
        message: res.data?.message || 'Campus boundary updated successfully.',
        type: 'success',
      });
      await refreshSchool();
      await fetchGeofenceData(true, true);
    } catch (err: unknown) {
      showAlert({
        title: 'Save Failed',
        message: extractApiError(err, 'Could not update campus boundary settings.'),
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDevice = (teacherId: number, teacherName: string) => {
    if (!canResetPhone) return;
    showConfirm({
      title: 'Reset Phone Device Lock',
      message: `Unbind the registered phone for ${teacherName}? This clears their 1-to-1 phone lock so they can pair a replacement phone on their next Time In.`,
      confirmLabel: 'Reset Device Lock',
      isDestructive: true,
      onConfirm: async () => {
        setResettingId(teacherId);
        try {
          const res = await apiClient.post(`${API_ROUTES.accounts.teachers}${teacherId}/reset-device/`);
          showAlert({
            title: 'Device Lock Cleared',
            message: res.data?.message || `Phone binding for ${teacherName} has been cleared.`,
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
      'Teacher',
      'Employee ID',
      'Zone Status',
      'Distance from Campus',
      'Accuracy (m)',
      'Device ID',
    ];
    const rows = auditRecords.map((r) => [
      r.timestamp,
      r.teacher_name,
      r.employee_id || '—',
      r.status || (r.is_inside ? 'INSIDE' : 'OUTSIDE'),
      formatMeters(r.distance ?? r.distance_meters),
      r.accuracy_meters !== null && r.accuracy_meters !== undefined ? `${Math.round(r.accuracy_meters)}m` : '—',
      r.device_id || '—',
    ]);
    exportToCsv(
      `AttendSure_Campus_GPS_Logs_${dateFilterMode === 'ALL_LOGS' ? 'All_Logs' : auditDate}.csv`,
      headers,
      rows
    );
  };

  const screenSwitchBtn = (active: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '5px 10px',
    borderRadius: 5,
    border: 'none',
    backgroundColor: active ? brand.buttonBg : 'transparent',
    color: active ? tokens.onPrimary : tokens.textSecondary,
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

  const teacherList = geoData?.teacher_list || [];
  const openIncidentsCount = geoData?.open_incidents_count ?? 0;

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
            <span>Geofence &amp; Loafing Monitor</span>
          </h2>
          <p style={{ fontSize: '0.76rem', color: tokens.textSecondary, margin: '3px 0 0 0' }}>
            Protects teacher duty records with clear campus boundary checks, phone health visibility, 1-to-1 phone pairing, and fair alert review.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: tokens.bgSurfaceSubtle,
              borderRadius: 8,
              padding: 3,
              border: `1px solid ${tokens.borderSubtle}`,
            }}
          >
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
              onClick={() => setActiveScreen('LOAFING_ALERTS')}
              style={screenSwitchBtn(activeScreen === 'LOAFING_ALERTS')}
            >
              <ShieldAlert size={12} />
              <span>Campus Alerts {openIncidentsCount > 0 ? `(${openIncidentsCount})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveScreen('AUDIT_SCREEN')}
              style={screenSwitchBtn(activeScreen === 'AUDIT_SCREEN')}
            >
              <History size={12} />
              <span>Location History</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              activeScreen === 'AUDIT_SCREEN'
                ? void fetchAuditHistory(false)
                : void fetchGeofenceData(false, true)
            }
            disabled={loading || auditLoading}
            style={ui.btnSecondary}
          >
            <RefreshCw size={13} className={loading || auditLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* VIEW 1: LIVE MAP + BOUNDARY SETTINGS + LIVE TEACHERS TABLE */}
      <div style={{ display: activeScreen === 'LIVE_MAP' ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
          <StatsCard
            label="ONLINE TEACHERS"
            value={geoData?.online_users_count ?? 0}
            valueColor={brand.success}
            helpText="Active in app within last 5 min"
            badge={<Wifi size={18} color={brand.success} />}
          />
          <StatsCard
            label="OFFLINE TEACHERS"
            value={geoData?.offline_users_count ?? 0}
            valueColor={tokens.textSecondary}
            helpText="Not currently active in app"
            badge={<WifiOff size={18} color={tokens.textMuted} />}
          />
          <StatsCard
            label="ON CAMPUS TODAY"
            value={geoData?.verified_inside ?? 0}
            valueColor={brand.success}
            helpText={radius !== null ? `Inside ${radius}m school boundary` : 'Boundary not set'}
            badge={<ShieldCheck size={18} color={brand.success} />}
          />
          <StatsCard
            label="OPEN CAMPUS ALERTS"
            value={openIncidentsCount}
            valueColor={openIncidentsCount > 0 ? brand.danger : tokens.textPrimary}
            helpText={`${geoData?.incidents_today ?? 0} alert(s) logged today`}
            badge={<AlertTriangle size={18} color={openIncidentsCount > 0 ? brand.danger : tokens.textMuted} />}
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
                <span>{geoData?.campus_name || geoData?.name || 'Campus Boundary Map'}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleFitAllOnMap}
                  style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: '0.70rem', color: brand.primary }}
                  title="Zoom out to show campus boundary and all teacher pins"
                >
                  <Maximize2 size={11} />
                  <span>Show All</span>
                </button>

                <div style={{ display: 'flex', backgroundColor: tokens.borderSubtle, borderRadius: 6, padding: 2 }}>
                  <button type="button" onClick={() => setMapLayer('streets')} style={layerToggleBtn(mapLayer === 'streets')}>
                    <Layers size={11} />
                    <span>Roads</span>
                  </button>
                  <button type="button" onClick={() => setMapLayer('satellite')} style={layerToggleBtn(mapLayer === 'satellite')}>
                    <Layers size={11} />
                    <span>Satellite</span>
                  </button>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleDetectGPS}
                    style={{ ...ui.btnSecondary, padding: '4px 8px', fontSize: '0.70rem', color: brand.primary }}
                    title="Center map to your browser GPS"
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

            <div style={{ padding: '8px 16px', backgroundColor: tokens.bgSurface, borderTop: `1px solid ${tokens.borderSubtle}`, fontSize: '0.72rem', color: tokens.textSecondary, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <strong>Map Legend:</strong>
              <span style={{ color: brand.success, fontWeight: 700 }}>&bull; Green = On Campus</span>
              <span style={{ color: brand.primary, fontWeight: 700 }}>&bull; Blue = Official Exit Pass</span>
              <span style={{ color: brand.warning, fontWeight: 700 }}>&bull; Amber = Outside (Off Duty)</span>
              <span style={{ color: tokens.textMuted, fontWeight: 700 }}>&bull; Gray = Offline</span>
              <span style={{ color: brand.danger, fontWeight: 700 }}>&bull; Red = Outside Campus Alert</span>
            </div>
          </div>

          <GeofenceBoundaryForm
            geoData={geoData}
            isAdmin={isAdmin}
            lat={lat}
            lng={lng}
            radius={radius}
            saving={saving}
            onChangeLat={(next) => {
              isDirtyRef.current = true;
              setLat(next);
            }}
            onChangeLng={(next) => {
              isDirtyRef.current = true;
              setLng(next);
            }}
            onChangeRadius={(next) => {
              isDirtyRef.current = true;
              setRadius(next);
            }}
            onSavePerimeter={handleSavePerimeter}
            onOpenAllAlerts={() => setActiveScreen('LOAFING_ALERTS')}
          />
        </div>

        <LoafingMonitorPanel onIncidentUpdated={() => void fetchGeofenceData(true, true)} />

        <GeofenceTeacherTable
          teacherList={teacherList}
          canResetPhone={canResetPhone}
          resettingId={resettingId}
          onResetDevice={handleResetDevice}
        />
      </div>

      {/* VIEW 2: DEDICATED CAMPUS ALERTS PANEL */}
      {activeScreen === 'LOAFING_ALERTS' && (
        <LoafingMonitorPanel onIncidentUpdated={() => void fetchGeofenceData(true, true)} />
      )}

      {/* VIEW 3: LOCATION LOGS */}
      <GeofenceAuditHistoryView
        visible={activeScreen === 'AUDIT_SCREEN'}
        radius={radius}
        teacherList={teacherList}
        auditRecords={auditRecords}
        auditLoading={auditLoading}
        totalDatabaseRecords={totalDatabaseRecords}
        auditSearchQuery={auditSearchQuery}
        auditTeacherFilter={auditTeacherFilter}
        auditVerdictFilter={auditVerdictFilter}
        dateFilterMode={dateFilterMode}
        auditDate={auditDate}
        onChangeSearch={setAuditSearchQuery}
        onChangeTeacherFilter={setAuditTeacherFilter}
        onChangeVerdictFilter={setAuditVerdictFilter}
        onChangeDateMode={setDateFilterMode}
        onChangeAuditDate={setAuditDate}
        onSearch={() => void fetchAuditHistory(false)}
        onExportCsv={exportAuditCSV}
      />
    </div>
  );
};

export default GeofenceTab;
