// AttendSure Mobile - Single Shared Teacher Duty GPS Context
// File: D:\AttendSure_V3\mobile\src\context\TeacherDutyLocationContext.tsx

/**
 * Runs one shared GPS watcher and one heartbeat timer for the whole app.
 * Saves phone battery, blocks sudden indoor GPS jumps, and keeps
 * Dashboard, Geofence, and Scanner screens in sync.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, DeviceEventEmitter, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { apiClient } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { useAuth } from './AuthContext';
import { getFriendlyErrorMessage } from '../constants/theme';
import { calculateDistanceMeters } from '../utils/helpers';
import { toTimeInputValue } from '../utils/formatters';
import {
  isTeacherOnDutyStored,
  setTeacherOnDutyFlag,
  stopTeacherBackgroundTracking,
} from '../services/backgroundLocation';
import {
  ADAPTIVE_PING_INTERVAL_MS,
  format12HourTime,
  sendLiveHeartbeat,
} from '../services/telemetryService';
import { teacherGpsJumpFilter } from '../services/gpsJumpFilter';
import type { TeacherPhoneHealthFields } from '../utils/alertLabels';

export interface LiveGpsCoords {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  mocked: boolean;
  timestampMs: number;
  timestamp: string;
}

export interface CampusBoundarySnapshot {
  today_date?: string;
  campus_name: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  loafing_grace_minutes: number;
  duty_start_time: string;
  duty_end_time: string;
}

export interface LiveTeacherOverviewRow extends TeacherPhoneHealthFields {
  id?: number;
  teacher_id?: number;
  user_id?: number;
  employee_id?: string;
  teacher_name?: string;
  full_name?: string;
  department?: string;
  photo?: string | null;
  photo_url?: string | null;
  is_clocked_in?: boolean;
  has_timed_out?: boolean;
  time_in?: string | null;
  time_out?: string | null;
  is_inside?: boolean;
  is_online?: boolean;
  has_signal_lost?: boolean;
  zone_status?: string;
  status?: string;
  distance_meters?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  last_seen?: string;
  has_bound_device?: boolean;
  is_device_bound?: boolean;
  bound_device_id?: string | null;
}

export interface TeacherDutyLocationValue {
  liveCoords: LiveGpsCoords | null;
  boundary: CampusBoundarySnapshot | null;
  liveTeachers: LiveTeacherOverviewRow[];
  isOnDuty: boolean;
  hasTimedOutToday: boolean;
  zoneStatus: string;
  distanceMeters: number | null;
  isInsideCampus: boolean | null;
  accuracyMeters: number | null;
  mockBlocked: boolean;
  gpsError: string | null;
  lastPingTime: string;
  pinging: boolean;
  loadingOverview: boolean;
  refreshCampusOverview: () => Promise<boolean>;
  checkCampusNow: (force?: boolean) => Promise<void>;
  setLocalOnDuty: (nextOnDuty: boolean) => Promise<void>;
}

type HeartbeatServerReply = {
  ignored?: boolean;
  saved?: boolean;
  distance_meters?: number | null;
  zone_status?: string;
  is_clocked_in?: boolean;
  in_grace_period?: boolean;
  message?: string;
};

const GEOFENCE_CACHE_KEY = 'attendsure_cached_geofence';
const OVERVIEW_DEDUPE_MS = 2500;
const LAST_KNOWN_MAX_AGE_MS = 25_000;
const LAST_KNOWN_MAX_ACCURACY_METERS = 60;

const TeacherDutyLocationContext = createContext<TeacherDutyLocationValue | undefined>(undefined);

const getLocalTodayStr = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseBoundarySnapshot = (raw: Record<string, unknown>): CampusBoundarySnapshot => {
  const lat = raw.latitude !== null && raw.latitude !== undefined ? Number(raw.latitude) : null;
  const lon = raw.longitude !== null && raw.longitude !== undefined ? Number(raw.longitude) : null;
  const radius = Number(raw.radius_meters);
  const grace = Number(raw.loafing_grace_minutes);

  return {
    today_date: typeof raw.today_date === 'string' ? raw.today_date : undefined,
    campus_name:
      (typeof raw.campus_name === 'string' && raw.campus_name.trim()) ||
      (typeof raw.name === 'string' && raw.name.trim()) ||
      'Main School Campus',
    latitude: lat !== null && Number.isFinite(lat) ? lat : null,
    longitude: lon !== null && Number.isFinite(lon) ? lon : null,
    radius_meters: Number.isFinite(radius) && radius > 0 ? radius : 150,
    loafing_grace_minutes: Number.isFinite(grace) && grace >= 0 ? grace : 10,
    duty_start_time: toTimeInputValue(
      typeof raw.duty_start_time === 'string' ? raw.duty_start_time : undefined,
      '07:30'
    ),
    duty_end_time: toTimeInputValue(
      typeof raw.duty_end_time === 'string' ? raw.duty_end_time : undefined,
      '16:30'
    ),
  };
};

const toLiveCoords = (position: Location.LocationObject): LiveGpsCoords => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy:
    typeof position.coords.accuracy === 'number' && Number.isFinite(position.coords.accuracy)
      ? position.coords.accuracy
      : null,
  speed:
    typeof position.coords.speed === 'number' &&
    Number.isFinite(position.coords.speed) &&
    position.coords.speed >= 0
      ? position.coords.speed
      : null,
  mocked: Boolean(position.mocked),
  timestampMs: Math.round(position.timestamp || Date.now()),
  timestamp: format12HourTime(new Date()),
});

export const TeacherDutyLocationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { user } = useAuth();

  const [liveCoords, setLiveCoords] = useState<LiveGpsCoords | null>(null);
  const [boundary, setBoundary] = useState<CampusBoundarySnapshot | null>(null);
  const [liveTeachers, setLiveTeachers] = useState<LiveTeacherOverviewRow[]>([]);
  const [isOnDuty, setIsOnDuty] = useState<boolean>(false);
  const [hasTimedOutToday, setHasTimedOutToday] = useState<boolean>(false);
  const [zoneStatus, setZoneStatus] = useState<string>('OFF_DUTY');
  const [serverDistanceMeters, setServerDistanceMeters] = useState<number | null>(null);
  const [mockBlocked, setMockBlocked] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [lastPingTime, setLastPingTime] = useState<string>('');
  const [pinging, setPinging] = useState<boolean>(false);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);
  const [isAppActive, setIsAppActive] = useState<boolean>(
    (AppState.currentState || 'active') === 'active'
  );

  const isMountedRef = useRef<boolean>(true);
  const appStateRef = useRef<AppStateStatus>(
    (AppState.currentState as AppStateStatus | null | undefined) || 'active'
  );
  const isOnDutyRef = useRef<boolean>(false);
  isOnDutyRef.current = isOnDuty;

  const anchorCoordsRef = useRef<LiveGpsCoords | null>(null);
  const lastHeartbeatSentRef = useRef<number>(0);
  const heartbeatInFlightRef = useRef<boolean>(false);
  const overviewAbortRef = useRef<AbortController | null>(null);
  const overviewInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastOverviewFetchRef = useRef<number>(0);

  const applyStationaryFilter = useCallback((raw: LiveGpsCoords): LiveGpsCoords => {
    const anchor = anchorCoordsRef.current;
    if (!anchor) {
      anchorCoordsRef.current = raw;
      return raw;
    }

    const displacement = calculateDistanceMeters(
      anchor.latitude,
      anchor.longitude,
      raw.latitude,
      raw.longitude
    );

    if (displacement < 6) {
      return {
        ...raw,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        accuracy: raw.accuracy ?? anchor.accuracy,
      };
    }

    anchorCoordsRef.current = raw;
    return raw;
  }, []);

  /**
   * Checks a raw GPS reading for fake/mock GPS and sudden indoor jumps.
   * Returns stabilized coordinates if trusted, or null if the reading should be ignored.
   */
  const acceptSafeGpsReading = useCallback(
    (raw: LiveGpsCoords, showWaitNote = false): LiveGpsCoords | null => {
      if (raw.mocked) {
        if (isMountedRef.current) {
          setMockBlocked(true);
          setGpsError(
            'A mock location app or setting is turned on. Turn it off in your phone settings to update your campus status.'
          );
        }
        return null;
      }

      const jumpDecision = teacherGpsJumpFilter.checkReading({
        latitude: raw.latitude,
        longitude: raw.longitude,
        accuracyMeters: raw.accuracy ?? 50,
        recordedAtMs: raw.timestampMs,
      });

      if (!jumpDecision.allowSend) {
        if (isMountedRef.current && showWaitNote) {
          setGpsError(jumpDecision.message);
        }
        return null;
      }

      const stabilized = applyStationaryFilter(raw);
      if (isMountedRef.current) {
        setLiveCoords(stabilized);
        setMockBlocked(false);
        setGpsError(null);
      }
      return stabilized;
    },
    [applyStationaryFilter]
  );

  const setLocalOnDuty = useCallback(async (nextOnDuty: boolean) => {
    isOnDutyRef.current = nextOnDuty;
    if (!nextOnDuty) {
      teacherGpsJumpFilter.reset();
    }
    if (isMountedRef.current) {
      setIsOnDuty(nextOnDuty);
      if (!nextOnDuty) {
        setZoneStatus('OFF_DUTY');
      }
    }
    await setTeacherOnDutyFlag(nextOnDuty);
  }, []);

  const transmitDutyHeartbeat = useCallback(
    async (coords?: LiveGpsCoords | null, force = false): Promise<void> => {
      if (!isMountedRef.current || !user) return;
      if (!force && (!isOnDutyRef.current || appStateRef.current !== 'active')) {
        return;
      }
      if (heartbeatInFlightRef.current && !force) {
        return;
      }

      const now = Date.now();
      if (
        !force &&
        lastHeartbeatSentRef.current !== 0 &&
        now - lastHeartbeatSentRef.current < ADAPTIVE_PING_INTERVAL_MS
      ) {
        return;
      }

      heartbeatInFlightRef.current = true;
      try {
        let activeCoords = coords || anchorCoordsRef.current;

        if (force || !activeCoords) {
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (!isMountedRef.current) return;
            if (status !== 'granted') {
              setGpsError('Location permission is needed to check the school boundary.');
              return;
            }
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            });
            if (!isMountedRef.current) return;

            const safeCoords = acceptSafeGpsReading(toLiveCoords(loc), force);
            if (!safeCoords) {
              // Keep the last trusted reading instead of sending a bad indoor jump
              if (force) return;
              if (!activeCoords) return;
            } else {
              activeCoords = safeCoords;
            }
          } catch (err: unknown) {
            if (isMountedRef.current && force) {
              setGpsError(getFriendlyErrorMessage(err, 'Waiting for GPS signal...'));
            }
            if (!activeCoords) return;
          }
        }

        if (activeCoords.mocked) {
          if (isMountedRef.current) {
            setMockBlocked(true);
            setGpsError(
              'A mock location app or setting is turned on. Turn it off in your phone settings to update your campus status.'
            );
          }
          return;
        }

        if (!isOnDutyRef.current) {
          if (isMountedRef.current) {
            setZoneStatus('OFF_DUTY');
            setLastPingTime(format12HourTime(new Date()));
          }
          return;
        }

        const rawRes = await sendLiveHeartbeat(
          {
            latitude: activeCoords.latitude,
            longitude: activeCoords.longitude,
            accuracy: activeCoords.accuracy,
            speed: activeCoords.speed,
            mocked: false,
            timestampMs: activeCoords.timestampMs,
          },
          force
        );

        if (!isMountedRef.current) return;
        const res = rawRes as HeartbeatServerReply;

        lastHeartbeatSentRef.current = Date.now();
        setLastPingTime(format12HourTime(new Date()));

        // Do not overwrite duty or zone state when the server ignored a sudden GPS jump
        if (res.ignored) {
          if (force && res.message) {
            setGpsError(res.message);
          }
          return;
        }

        if (typeof res.distance_meters === 'number' && Number.isFinite(res.distance_meters)) {
          setServerDistanceMeters(Math.round(res.distance_meters));
        }

        if (res.zone_status && res.zone_status !== 'THROTTLED') {
          setZoneStatus(res.zone_status);
          const serverEndedDuty =
            res.is_clocked_in === false ||
            (res.zone_status === 'OFF_DUTY' && !res.in_grace_period && res.is_clocked_in !== true);
          if (serverEndedDuty) {
            await setLocalOnDuty(false);
          }
        }
      } catch (err: unknown) {
        if (!isMountedRef.current) return;
        const msg = getFriendlyErrorMessage(
          err,
          'Could not check your campus location right now.'
        );
        const lower = msg.toLowerCase();
        if (
          force ||
          lower.includes('lock') ||
          lower.includes('mismatch') ||
          lower.includes('permission') ||
          lower.includes('mock') ||
          lower.includes('jump')
        ) {
          setGpsError(msg);
        }
      } finally {
        heartbeatInFlightRef.current = false;
      }
    },
    [user, acceptSafeGpsReading, setLocalOnDuty]
  );

  const checkCampusNow = useCallback(
    async (force = true): Promise<void> => {
      if (!isMountedRef.current) return;
      setPinging(true);
      setGpsError(null);
      try {
        await transmitDutyHeartbeat(null, force);
      } finally {
        if (isMountedRef.current) setPinging(false);
      }
    },
    [transmitDutyHeartbeat]
  );

  const refreshCampusOverview = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    const now = Date.now();
    if (overviewInFlightRef.current && now - lastOverviewFetchRef.current < OVERVIEW_DEDUPE_MS) {
      return overviewInFlightRef.current;
    }

    overviewAbortRef.current?.abort();
    const controller = new AbortController();
    overviewAbortRef.current = controller;
    lastOverviewFetchRef.current = now;

    const requestPromise = (async (): Promise<boolean> => {
      try {
        const [overviewRes, storedDuty] = await Promise.all([
          apiClient.get(ENDPOINTS.CAMPUS_OVERVIEW, { signal: controller.signal }).catch(() => null),
          isTeacherOnDutyStored(),
        ]);

        if (!isMountedRef.current || controller.signal.aborted) return storedDuty;

        let effectiveDuty = storedDuty;
        if (overviewRes?.data && typeof overviewRes.data === 'object') {
          const d = overviewRes.data as Record<string, unknown>;
          const nextBoundary = parseBoundarySnapshot(d);
          setBoundary(nextBoundary);
          AsyncStorage.setItem(GEOFENCE_CACHE_KEY, JSON.stringify(d)).catch(() => {});

          const rows: LiveTeacherOverviewRow[] = Array.isArray(d.teacher_list)
            ? (d.teacher_list as LiveTeacherOverviewRow[])
            : [];
          setLiveTeachers(rows);

          const todayStr = getLocalTodayStr();
          const isToday = !nextBoundary.today_date || nextBoundary.today_date === todayStr;
          if (isToday) {
            const ownRow =
              rows.find(
                (t) =>
                  (user.teacher_id &&
                    (Number(t.teacher_id) === Number(user.teacher_id) ||
                      Number(t.id) === Number(user.teacher_id))) ||
                  (user.id && t.user_id && Number(t.user_id) === Number(user.id)) ||
                  (user.employee_id &&
                    t.employee_id &&
                    String(t.employee_id).toLowerCase() === String(user.employee_id).toLowerCase())
              ) ||
              (rows.length === 1 && String(user.role || '').toUpperCase() === 'TEACHER'
                ? rows[0]
                : undefined);

            if (ownRow) {
              const timedOut = Boolean(ownRow.has_timed_out || (ownRow.time_in && ownRow.time_out));
              const clockedIn =
                !timedOut && Boolean(ownRow.is_clocked_in || (ownRow.time_in && !ownRow.time_out));
              effectiveDuty = clockedIn;
              setHasTimedOutToday(timedOut);
              if (ownRow.zone_status) {
                setZoneStatus(ownRow.zone_status);
              }
            }
          }
        }

        isOnDutyRef.current = effectiveDuty;
        setIsOnDuty(effectiveDuty);
        await setTeacherOnDutyFlag(effectiveDuty);
        return effectiveDuty;
      } finally {
        if (overviewInFlightRef.current === requestPromise) {
          overviewInFlightRef.current = null;
        }
        if (isMountedRef.current) setLoadingOverview(false);
      }
    })();

    overviewInFlightRef.current = requestPromise;
    return requestPromise;
  }, [user]);

  // Clean up pending requests when unmounted
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      overviewAbortRef.current?.abort();
    };
  }, []);

  // Load saved boundary, sync live duty state, and wipe local data on sign-out
  useEffect(() => {
    if (!user) {
      isOnDutyRef.current = false;
      anchorCoordsRef.current = null;
      lastHeartbeatSentRef.current = 0;
      teacherGpsJumpFilter.reset();
      setIsOnDuty(false);
      setHasTimedOutToday(false);
      setLiveCoords(null);
      setLiveTeachers([]);
      setBoundary(null);
      setServerDistanceMeters(null);
      setZoneStatus('OFF_DUTY');
      setGpsError(null);
      setMockBlocked(false);
      void AsyncStorage.removeItem(GEOFENCE_CACHE_KEY).catch(() => {});
      void stopTeacherBackgroundTracking().catch(() => {});
      return;
    }

    void AsyncStorage.getItem(GEOFENCE_CACHE_KEY)
      .then((cached) => {
        if (!cached || !isMountedRef.current) return;
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') {
          setBoundary(parseBoundarySnapshot(parsed as Record<string, unknown>));
        }
      })
      .catch(() => {});

    void refreshCampusOverview().then((onDutyNow) => {
      if (onDutyNow && isMountedRef.current && appStateRef.current === 'active') {
        void transmitDutyHeartbeat(null, true);
      }
    });

    const appSub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const wasInactive = appStateRef.current !== 'active';
      appStateRef.current = nextState;
      const activeNow = nextState === 'active';
      setIsAppActive(activeNow);
      if (wasInactive && activeNow && isMountedRef.current) {
        void refreshCampusOverview().then((onDutyNow) => {
          if (onDutyNow && isMountedRef.current) {
            void transmitDutyHeartbeat(null, true);
          }
        });
      }
    });

    const attSub = DeviceEventEmitter.addListener('attendsure:attendance-updated', () => {
      void refreshCampusOverview();
    });

    return () => {
      appSub.remove();
      attSub.remove();
    };
  }, [user, refreshCampusOverview, transmitDutyHeartbeat]);

  // Single foreground GPS watcher with fast initial lock and jump filtering
  useEffect(() => {
    if (!user || !isAppActive) return;

    let subscription: Location.LocationSubscription | null = null;
    let active = true;

    const startWatcher = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== 'granted') {
          setGpsError('Location access is needed for Teacher Time In / Time Out.');
          return;
        }

        const servicesOn = await Location.hasServicesEnabledAsync();
        if (!active) return;
        if (!servicesOn) {
          setGpsError('Phone GPS is turned off.');
          return;
        }

        setGpsError(null);

        // Show a recent accurate phone fix right away for faster startup
        const quickFix = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
          requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_METERS,
        }).catch(() => null);
        if (!active) return;
        if (quickFix) {
          acceptSafeGpsReading(toLiveCoords(quickFix), false);
        }

        // Follow up with a fresh high-accuracy fix
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }).catch(() => null);
        if (!active) return;
        if (initial) {
          acceptSafeGpsReading(toLiveCoords(initial), false);
        }

        if (!active) return;
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 8000,
            distanceInterval: 5,
          },
          (position) => {
            if (!active) return;
            acceptSafeGpsReading(toLiveCoords(position), false);
          }
        );

        if (!active) {
          sub.remove();
          return;
        }
        subscription = sub;
      } catch (err: unknown) {
        if (active) {
          setGpsError(getFriendlyErrorMessage(err, 'Searching for GPS signal...'));
        }
      }
    };

    void startWatcher();

    return () => {
      active = false;
      if (subscription) {
        subscription.remove();
        subscription = null;
      }
    };
  }, [user, isAppActive, acceptSafeGpsReading]);

  // Single adaptive foreground heartbeat timer (runs only while on duty and app is open)
  useEffect(() => {
    if (!user || !isOnDuty || !isAppActive) return;

    const timer = setInterval(() => {
      if (isMountedRef.current && isOnDutyRef.current && appStateRef.current === 'active') {
        void transmitDutyHeartbeat(anchorCoordsRef.current, false);
      }
    }, ADAPTIVE_PING_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [user, isOnDuty, isAppActive, transmitDutyHeartbeat]);

  const localDistanceMeters = useMemo(() => {
    if (!liveCoords || boundary?.latitude === null || boundary?.longitude === null || !boundary) {
      return serverDistanceMeters;
    }
    return Math.round(
      calculateDistanceMeters(
        liveCoords.latitude,
        liveCoords.longitude,
        boundary.latitude,
        boundary.longitude
      )
    );
  }, [liveCoords, boundary, serverDistanceMeters]);

  const isInsideCampus = useMemo(() => {
    if (localDistanceMeters === null || !boundary?.radius_meters) return null;
    const driftBuffer = Math.min(Math.max(liveCoords?.accuracy || 0, 0), 35);
    return localDistanceMeters <= boundary.radius_meters + driftBuffer;
  }, [localDistanceMeters, boundary?.radius_meters, liveCoords?.accuracy]);

  const accuracyMeters = useMemo(
    () =>
      liveCoords?.accuracy !== null && liveCoords?.accuracy !== undefined
        ? Math.round(liveCoords.accuracy)
        : null,
    [liveCoords?.accuracy]
  );

  const value = useMemo<TeacherDutyLocationValue>(
    () => ({
      liveCoords,
      boundary,
      liveTeachers,
      isOnDuty,
      hasTimedOutToday,
      zoneStatus,
      distanceMeters: localDistanceMeters,
      isInsideCampus,
      accuracyMeters,
      mockBlocked,
      gpsError,
      lastPingTime,
      pinging,
      loadingOverview,
      refreshCampusOverview,
      checkCampusNow,
      setLocalOnDuty,
    }),
    [
      liveCoords,
      boundary,
      liveTeachers,
      isOnDuty,
      hasTimedOutToday,
      zoneStatus,
      localDistanceMeters,
      isInsideCampus,
      accuracyMeters,
      mockBlocked,
      gpsError,
      lastPingTime,
      pinging,
      loadingOverview,
      refreshCampusOverview,
      checkCampusNow,
      setLocalOnDuty,
    ]
  );

  return (
    <TeacherDutyLocationContext.Provider value={value}>
      {children}
    </TeacherDutyLocationContext.Provider>
  );
};

export function useTeacherDutyLocation(): TeacherDutyLocationValue {
  const ctx = useContext(TeacherDutyLocationContext);
  if (!ctx) {
    throw new Error('useTeacherDutyLocation must be used within TeacherDutyLocationProvider');
  }
  return ctx;
}

export default TeacherDutyLocationContext;