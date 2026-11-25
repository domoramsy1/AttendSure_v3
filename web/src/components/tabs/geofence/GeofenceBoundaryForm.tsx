// AttendSure Web - Geofence Boundary Settings & Recent Alerts Sidebar Panel
// File: D:\AttendSure_V3\web\src\components\tabs\geofence\GeofenceBoundaryForm.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { formatTimeRange12h } from '../../../utils/timeFormat';
import { getCampusAlertLabel } from '../../../utils/alertLabels';
import { CheckCircle2, Lock, Save } from 'lucide-react';
import type { GeofenceOverviewData } from './types';

interface GeofenceBoundaryFormProps {
  geoData: GeofenceOverviewData | null;
  isAdmin: boolean;
  lat: number | null;
  lng: number | null;
  radius: number | null;
  saving: boolean;
  onChangeLat: (next: number | null) => void;
  onChangeLng: (next: number | null) => void;
  onChangeRadius: (next: number | null) => void;
  onSavePerimeter: (e: React.FormEvent) => void;
  onOpenAllAlerts: () => void;
}

export const GeofenceBoundaryForm: React.FC<GeofenceBoundaryFormProps> = ({
  geoData,
  isAdmin,
  lat,
  lng,
  radius,
  saving,
  onChangeLat,
  onChangeLng,
  onChangeRadius,
  onSavePerimeter,
  onOpenAllAlerts,
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
    padding: '2px 8px',
    borderRadius: 4,
    backgroundColor: bg,
    color,
    border: `1px solid ${border}`,
    fontSize: '0.64rem',
    fontWeight: 800,
    letterSpacing: '0.3px',
  });

  return (
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
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: tokens.textPrimary }}>
              Boundary Settings
            </div>
            <div style={{ fontSize: '0.70rem', color: tokens.textSecondary }}>
              Duty window:{' '}
              {formatTimeRange12h(
                geoData?.duty_start_time || '07:30',
                geoData?.duty_end_time || '17:00',
                { separator: ' – ' }
              )}{' '}
              &bull; Grace: {geoData?.loafing_grace_minutes ?? 10} min
            </div>
          </div>
          {!isAdmin && (
            <span style={badgePill(tokens.bgSurfaceSubtle, tokens.textSecondary, tokens.borderSubtle)}>
              <Lock size={10} style={{ marginRight: 4 }} /> Read-Only
            </span>
          )}
        </div>

        {isAdmin ? (
          <form onSubmit={onSavePerimeter} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Center Latitude (°N)</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={lat ?? ''}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    onChangeLat(isNaN(parsed) ? null : parsed);
                  }}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>Center Longitude (°E)</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={lng ?? ''}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    onChangeLng(isNaN(parsed) ? null : parsed);
                  }}
                  style={ui.input}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <label style={ui.label}>Boundary Radius (20–5000m)</label>
                <span style={{ fontSize: '0.80rem', fontWeight: 800, color: brand.primary, fontFamily: 'monospace' }}>
                  {radius !== null ? `${radius} meters` : 'Not set'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="range"
                  aria-label="Boundary radius slider"
                  min={20}
                  max={5000}
                  step={10}
                  value={Math.min(5000, Math.max(20, radius ?? 150))}
                  onChange={(e) => onChangeRadius(Number(e.target.value))}
                  style={{ flex: 1, accentColor: brand.buttonBg, cursor: 'pointer' }}
                />
                <input
                  type="number"
                  aria-label="Boundary radius in meters"
                  min={20}
                  max={5000}
                  required
                  value={radius ?? ''}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    onChangeRadius(Number.isNaN(parsed) ? null : parsed);
                  }}
                  placeholder="150"
                  style={{ ...ui.input, width: 92, textAlign: 'right', fontFamily: 'monospace' }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || lat === null || lng === null || radius === null}
              style={{ ...ui.btnPrimary, justifyContent: 'center', width: '100%', marginTop: 4 }}
            >
              <Save size={13} />
              <span>{saving ? 'Saving...' : 'Save Boundary'}</span>
            </button>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.76rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: tokens.textSecondary }}>
              <span>Center Coordinates</span>
              <strong style={{ color: tokens.textPrimary, fontFamily: 'monospace' }}>
                {lat !== null && lng !== null ? `${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E` : 'Not set'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: tokens.textSecondary }}>
              <span>Allowed Campus Radius</span>
              <strong style={{ color: brand.primary, fontFamily: 'monospace' }}>
                {radius !== null ? `${radius} meters` : 'Not set'}
              </strong>
            </div>
          </div>
        )}
      </div>

      <div style={{ ...panelCard, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ fontSize: '0.80rem', fontWeight: 700, color: tokens.textPrimary }}>
            Recent Campus &amp; Phone Signal Alerts
          </div>
          <button
            type="button"
            onClick={onOpenAllAlerts}
            style={{
              background: 'none',
              border: 'none',
              color: brand.primary,
              fontSize: '0.70rem',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Review All &rarr;
          </button>
        </div>

        {geoData?.loafing_incidents && geoData.loafing_incidents.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {geoData.loafing_incidents.slice(0, 4).map((b) => {
              const isSignalLost = b.incident_type === 'TEACHER_SIGNAL_LOST';
              const accentColor =
                b.status === 'OPEN'
                  ? isSignalLost
                    ? brand.warning
                    : brand.danger
                  : brand.success;
              const rowBg =
                b.status === 'OPEN'
                  ? isSignalLost
                    ? tokens.warningLight
                    : tokens.dangerLight
                  : tokens.bgSurfaceSubtle;

              return (
                <div
                  key={b.id}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 6,
                    backgroundColor: rowBg,
                    border: `1px solid ${b.status === 'OPEN' ? accentColor : tokens.borderSubtle}`,
                    fontSize: '0.70rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div>
                    <strong style={{ color: b.status === 'OPEN' ? accentColor : tokens.textPrimary }}>
                      {b.person_name}
                    </strong>
                    <div style={{ fontSize: '0.64rem', color: tokens.textSecondary, marginTop: 1 }}>
                      {getCampusAlertLabel(b.incident_type)}
                      {b.remarks ? ` • ${b.remarks}` : ''}
                    </div>
                  </div>
                  <span style={badgePill(tokens.bgSurface, accentColor, accentColor)}>
                    {b.status}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: '10px 0', textAlign: 'center', color: tokens.textMuted, fontSize: '0.72rem' }}>
            <CheckCircle2 size={16} color={brand.success} style={{ margin: '0 auto 4px auto', display: 'block' }} />
            No open campus or signal alerts recorded today.
          </div>
        )}
      </div>
    </div>
  );
};

export default GeofenceBoundaryForm;
