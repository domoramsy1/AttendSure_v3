// AttendSure Web - Live Teachers Status & Phone Health Table
// File: D:\AttendSure_V3\web\src\components\tabs\geofence\GeofenceTeacherTable.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { ProfileAvatar } from '../../common/ProfileAvatar';
import {
  formatPhoneBatteryLabel,
  formatPhoneNetworkLabel,
} from '../../../utils/alertLabels';
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  BatteryLow,
  Check,
  LocateFixed,
  LocateOff,
  Network,
  Radio,
  RotateCcw,
  Signal,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { formatMeters, type TeacherBoundaryStatus } from './types';

interface GeofenceTeacherTableProps {
  teacherList: TeacherBoundaryStatus[];
  canResetPhone: boolean;
  resettingId: number | null;
  onResetDevice: (teacherId: number, teacherName: string) => void;
}

export const GeofenceTeacherTable: React.FC<GeofenceTeacherTableProps> = ({
  teacherList,
  canResetPhone,
  resettingId,
  onResetDevice,
}) => {
  const { tokens, brand, ui } = useTheme();

  const panelCard: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 12,
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
    overflow: 'hidden',
  };

  const badgePill = (bg: string, color: string, border: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
    fontSize: '0.64rem',
    fontWeight: 800,
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
  });

  const getStatusBadge = (s: TeacherBoundaryStatus) => {
    if (s.has_signal_lost || s.status === 'SIGNAL_LOST' || s.zone_status === 'SIGNAL_LOST') {
      return (
        <span style={badgePill(tokens.warningLight, brand.warning, brand.warning)}>
          <AlertTriangle size={11} /> Signal Lost
        </span>
      );
    }
    if (s.zone_status === 'AUTHORIZED_OUTSIDE' || s.status === 'AUTHORIZED_LEAVE') {
      return <span style={badgePill(tokens.primaryLight, brand.primary, brand.primary)}>Official Exit Pass</span>;
    }
    const inside = s.is_inside ?? s.is_inside_geofence;
    const hasCoordsToday = s.latitude !== null && s.latitude !== undefined;

    if (s.zone_status === 'INSIDE' || s.status === 'VERIFIED_INSIDE' || (hasCoordsToday && inside === true)) {
      return (
        <span style={badgePill(tokens.successLight, brand.success, brand.success)}>
          <Check size={11} /> On Campus
        </span>
      );
    }
    if (s.zone_status === 'LOAFING_ALERT' || s.status === 'PERIMETER_BREACH') {
      return <span style={badgePill(tokens.dangerLight, brand.danger, brand.danger)}>Outside Campus</span>;
    }
    if (hasCoordsToday && inside === false) {
      return (
        <span style={badgePill(tokens.warningLight, brand.warning, brand.warning)}>
          Outside Campus (Off Duty)
        </span>
      );
    }
    return <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textMuted, tokens.borderSubtle)}>Off Duty</span>;
  };

  const renderPhoneHealth = (s: TeacherBoundaryStatus) => {
    const hasBattery = typeof s.battery_percent === 'number' && Number.isFinite(s.battery_percent);
    const netCode = String(s.network_type || '').toUpperCase();
    const hasNetwork = netCode === 'WIFI' || netCode === 'CELLULAR' || netCode === 'NONE';
    const hasGps = typeof s.is_gps_enabled === 'boolean';

    if (!hasBattery && !hasNetwork && !hasGps) {
      return <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Waiting for ping</span>;
    }

    const lowBattery = hasBattery && (s.battery_percent as number) <= 20;
    const batteryBg = lowBattery
      ? tokens.dangerLight
      : s.is_charging
        ? tokens.successLight
        : tokens.bgSurfaceSubtle;
    const batteryColor = lowBattery
      ? brand.danger
      : s.is_charging
        ? brand.success
        : tokens.textSecondary;
    const batteryBorder = lowBattery
      ? brand.danger
      : s.is_charging
        ? brand.success
        : tokens.borderSubtle;

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {hasBattery && (
          <span style={badgePill(batteryBg, batteryColor, batteryBorder)} title="Teacher phone battery level">
            {s.is_charging ? (
              <BatteryCharging size={11} />
            ) : lowBattery ? (
              <BatteryLow size={11} />
            ) : (
              <Battery size={11} />
            )}
            <span>{formatPhoneBatteryLabel(s.battery_percent, s.is_charging)}</span>
          </span>
        )}

        {hasNetwork && (
          <span
            style={badgePill(
              netCode === 'NONE' ? tokens.warningLight : tokens.bgSurfaceSubtle,
              netCode === 'NONE' ? brand.warning : tokens.textSecondary,
              netCode === 'NONE' ? brand.warning : tokens.borderSubtle
            )}
            title="Teacher phone internet connection"
          >
            {netCode === 'WIFI' ? (
              <Wifi size={11} color={brand.primary} />
            ) : netCode === 'CELLULAR' ? (
              <Signal size={11} color={brand.primary} />
            ) : (
              <WifiOff size={11} color={brand.warning} />
            )}
            <span>{formatPhoneNetworkLabel(netCode)}</span>
          </span>
        )}

        {hasGps && (
          <span
            style={badgePill(
              s.is_gps_enabled ? tokens.successLight : tokens.dangerLight,
              s.is_gps_enabled ? brand.success : brand.danger,
              s.is_gps_enabled ? brand.success : brand.danger
            )}
            title="Teacher phone GPS setting"
          >
            {s.is_gps_enabled ? <LocateFixed size={11} /> : <LocateOff size={11} />}
            <span>{s.is_gps_enabled ? 'GPS On' : 'GPS Off'}</span>
          </span>
        )}

        {s.is_low_power_mode === true && (
          <span style={badgePill(tokens.warningLight, brand.warning, brand.warning)}>
            Battery Saver
          </span>
        )}
      </div>
    );
  };

  return (
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
            Teachers Live Status, Phone Health &amp; Bound Devices
          </div>
          <div style={{ fontSize: '0.70rem', color: tokens.textSecondary }}>
            Live GPS distance, boundary verdict, phone battery/network/GPS health, and 1-to-1 phone lock details.
          </div>
        </div>
        <span style={{ fontSize: '0.72rem', color: tokens.textSecondary }}>
          Total Teachers: <strong style={{ color: tokens.textPrimary }}>{teacherList.length}</strong>
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 960, borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.76rem' }}>
          <thead>
            <tr>
              <th style={ui.th}>Teacher</th>
              <th style={ui.th}>Status</th>
              <th style={ui.th}>Campus Boundary</th>
              <th style={ui.th}>Distance / GPS</th>
              <th style={ui.th}>Phone Health</th>
              <th style={ui.th}>Bound Phone</th>
              {canResetPhone && <th style={{ ...ui.th, textAlign: 'right' }}>Device Lock Action</th>}
            </tr>
          </thead>
          <tbody>
            {teacherList.length > 0 ? (
              teacherList.map((s) => {
                const isOnline = Boolean(s.is_online);
                return (
                  <tr key={s.id}>
                    <td style={ui.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                          <ProfileAvatar
                            photoUrl={s.photo_url || s.photo}
                            name={s.teacher_name}
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
                          <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.82rem' }}>
                            {s.teacher_name}
                          </div>
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
                              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: brand.success }} />
                              ONLINE
                            </span>
                          ) : (
                            <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textSecondary, tokens.borderStrong)}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: tokens.textMuted }} />
                              OFFLINE
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.68rem', color: isOnline ? brand.success : tokens.textMuted, fontWeight: 600 }}>
                          {s.last_seen === 'No ping yet' ? 'Not checked in yet' : s.last_seen || 'Not checked in yet'}
                        </span>
                      </div>
                    </td>

                    <td style={ui.td}>{getStatusBadge(s)}</td>

                    <td style={{ ...ui.td, fontFamily: 'monospace', color: tokens.textPrimary }}>
                      <div>{formatMeters(s.distance ?? s.distance_meters)}</div>
                      {s.accuracy_meters !== undefined && s.accuracy_meters !== null && (
                        <div
                          style={{
                            fontSize: '0.64rem',
                            color: s.accuracy_meters > 25 ? brand.warning : brand.success,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <Radio size={9} /> &plusmn;{Math.round(s.accuracy_meters)}m
                        </div>
                      )}
                    </td>

                    <td style={ui.td}>{renderPhoneHealth(s)}</td>

                    <td style={ui.td}>
                      {s.bound_device_id ? (
                        <div>
                          {s.device_model && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                color: tokens.textPrimary,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Network size={11} color={brand.primary} /> {s.device_model}
                            </div>
                          )}
                          <div style={{ fontSize: '0.64rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                            {s.bound_device_id}
                          </div>
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.68rem', color: tokens.textMuted }}>Unbound</span>
                      )}
                    </td>

                    {canResetPhone && (
                      <td style={{ ...ui.td, textAlign: 'right' }}>
                        {s.bound_device_id ? (
                          <button
                            type="button"
                            disabled={resettingId === s.id}
                            onClick={() => onResetDevice(s.id, s.teacher_name)}
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
                <td colSpan={canResetPhone ? 7 : 6} style={{ textAlign: 'center', padding: '24px', color: tokens.textMuted }}>
                  No active teachers are listed yet. Add teachers under Teachers to view live campus status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GeofenceTeacherTable;
