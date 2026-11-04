/**
 * AttendSure V3 - Gate Logs Ledger & Telemetry Monitor
 * Real-time transaction history with full light/dark color mode adaptation.
 * File: web/src/components/tabs/GateLogsTab.tsx
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  User,
  LogIn,
  LogOut,
  RefreshCw,
  Radio,
  QrCode,
  GraduationCap,
  Briefcase,
  Copy,
  Check,
  Eye,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface GateLogEntry {
  log_id: string;
  person_type: 'STUDENT' | 'STAFF' | 'FACULTY';
  identifier: string;
  name: string;
  direction: 'IN' | 'OUT';
  scan_method: string;
  kiosk_name?: string;
  kiosk?: string;
  kiosk_code?: string;
  scan_time: string;
  raw_time?: string;
  photo?: string | null;
  photo_url?: string | null;
  snapshot_url?: string | null;
  section_or_dept?: string;
}

export type GateLogItem = GateLogEntry;

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
}

const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Person',
  size = 38,
  iconSize = 19,
}) => {
  const { tokens } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const hasPhoto = Boolean(
    photoUrl &&
    typeof photoUrl === 'string' &&
    photoUrl.trim() !== '' &&
    photoUrl.trim().toLowerCase() !== 'null' &&
    photoUrl.trim().toLowerCase() !== 'undefined'
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: tokens.bgSurfaceSubtle,
        border: `1px solid ${tokens.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={name}
    >
      {hasPhoto && !imageFailed ? (
        <img
          src={photoUrl!}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <User size={iconSize} color={tokens.textMuted} />
      )}
    </div>
  );
};

export const GateLogsTab: React.FC = () => {
  const { tokens, brand } = useTheme();

  const [logs, setLogs] = useState<GateLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [personFilter, setPersonFilter] = useState<'ALL' | 'STUDENT' | 'STAFF'>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [inspectedLog, setInspectedLog] = useState<GateLogEntry | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const activeAbortController = useRef<AbortController | null>(null);
  const isInteracting = useRef(false);
  isInteracting.current = Boolean(inspectedLog);

  const handleCopy = async (text: string, id: string) => {
    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        success = true;
      } catch {
        success = false;
      }
    }
    if (!success) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        textArea.remove();
      } catch {
        success = false;
      }
    }
    if (success) {
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const fetchLogs = useCallback(
    async (page = 1, size = 25, query = '', pFilter = 'ALL', dFilter = 'ALL', silent = false) => {
      if (activeAbortController.current) {
        activeAbortController.current.abort();
      }
      const controller = new AbortController();
      activeAbortController.current = controller;

      try {
        if (!silent) setLoading(true);
        setError(null);

        const res = await apiClient.get<PaginatedResponse<GateLogEntry> | GateLogEntry[]>('/gate/logs/', {
          params: {
            page,
            page_size: size,
            person_type: pFilter !== 'ALL' ? pFilter : undefined,
            direction: dFilter !== 'ALL' ? dFilter : undefined,
            q: query.trim() || undefined,
          },
          signal: controller.signal,
        });

        const raw = res.data;
        if (raw && 'results' in raw) {
          setLogs(raw.results);
          setTotalCount(raw.count);
          setTotalPages(raw.total_pages || Math.ceil(raw.count / size) || 1);
          setCurrentPage(raw.current_page || page);
        } else if (Array.isArray(raw)) {
          setLogs(raw);
          setTotalCount(raw.length);
          setTotalPages(1);
          setCurrentPage(1);
        }
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        if (!silent) {
          setError(err?.response?.data?.detail || 'Unable to load gate scanner transactions from database.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  const metrics = useMemo(() => {
    const safeLogs = Array.isArray(logs) ? logs : [];
    return {
      total_today: totalCount || safeLogs.length,
      in_today: safeLogs.filter((l) => l.direction === 'IN').length,
      out_today: safeLogs.filter((l) => l.direction === 'OUT').length,
      rfid_count: safeLogs.filter((l) => l.scan_method === 'RFID').length,
      qr_count: safeLogs.filter((l) => l.scan_method !== 'RFID').length,
    };
  }, [logs, totalCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchLogs(1, pageSize, search, personFilter, directionFilter, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, personFilter, directionFilter, pageSize, fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;

    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchLogs(currentPage, pageSize, search, personFilter, directionFilter, true);
      }
    }, 4000);

    return () => clearInterval(liveInterval);
  }, [autoRefresh, currentPage, pageSize, search, personFilter, directionFilter, fetchLogs]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchLogs(newPage, pageSize, search, personFilter, directionFilter, false);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchLogs(1, newSize, search, personFilter, directionFilter, false);
  };

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  const dynamicStyles = useMemo(() => {
    return {
      container: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: 14,
        padding: 'clamp(12px, 2.5vw, 20px)',
        backgroundColor: tokens.bgSurfaceSubtle,
        minHeight: '100%',
        boxSizing: 'border-box' as const,
        transition: 'background-color 0.2s ease',
      },
      statsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
        gap: 12,
      },
      statCard: {
        backgroundColor: tokens.bgSurface,
        borderRadius: 14,
        border: `1px solid ${tokens.borderSubtle}`,
        padding: '14px 18px',
        boxShadow: tokens.cardShadow,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      },
      statLabel: {
        fontSize: '0.64rem',
        fontWeight: 800,
        color: tokens.textMuted,
        marginBottom: 4,
        letterSpacing: '0.4px',
        textTransform: 'uppercase' as const,
      },
      statValue: {
        fontSize: '1.45rem',
        fontWeight: 800,
        color: tokens.textPrimary,
        lineHeight: 1.1,
      },
      statHelp: {
        fontSize: '0.68rem',
        color: tokens.textSecondary,
        marginTop: 3,
      },
      controlBar: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        backgroundColor: tokens.bgSurface,
        borderRadius: 12,
        border: `1px solid ${tokens.borderSubtle}`,
        boxShadow: tokens.cardShadow,
        flexWrap: 'wrap' as const,
        gap: 10,
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      },
      tableCard: {
        backgroundColor: tokens.bgSurface,
        borderRadius: 14,
        border: `1px solid ${tokens.borderSubtle}`,
        boxShadow: tokens.cardShadow,
        overflow: 'hidden',
        transition: 'background-color 0.2s ease, border-color 0.2s ease',
      },
      paginationContainer: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderTop: `1px solid ${tokens.borderSubtle}`,
        backgroundColor: tokens.bgSurface,
        flexWrap: 'wrap' as const,
        gap: 10,
      },
      paginationSelect: {
        padding: '4px 8px',
        borderRadius: 6,
        border: `1px solid ${tokens.borderStrong}`,
        fontSize: '0.76rem',
        color: tokens.textPrimary,
        backgroundColor: tokens.bgSurfaceSubtle,
        outline: 'none',
        cursor: 'pointer',
      },
      paginationBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '5px',
        border: `1px solid ${tokens.borderStrong}`,
        borderRadius: 6,
        backgroundColor: tokens.bgSurfaceSubtle,
        color: tokens.textPrimary,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      },
      fieldBox: {
        padding: '10px 14px',
        backgroundColor: tokens.bgSurfaceSubtle,
        borderRadius: 8,
        border: `1px solid ${tokens.borderSubtle}`,
      },
      actionBtn: {
        background: tokens.bgSurfaceSubtle,
        border: `1px solid ${tokens.borderStrong}`,
        borderRadius: 6,
        padding: '5px 7px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.15s ease',
      },
    };
  }, [tokens]);

  const getFilterTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    borderRadius: 6,
    border: active ? `1px solid ${brand.primary}` : `1px solid ${tokens.borderStrong}`,
    backgroundColor: active ? brand.primary : tokens.bgSurfaceSubtle,
    color: active ? '#ffffff' : tokens.textSecondary,
    fontSize: '0.74rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={dynamicStyles.container}>
      {/* 1. Live Gate Telemetry Metrics */}
      <div style={dynamicStyles.statsContainer}>
        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>TOTAL SCANS TODAY</div>
          <div style={dynamicStyles.statValue}>{metrics.total_today.toLocaleString()}</div>
          <div style={dynamicStyles.statHelp}>Transactions processed</div>
        </div>

        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>CAMPUS ENTRIES (IN)</div>
          <div style={{ ...dynamicStyles.statValue, color: brand.success }}>{metrics.in_today.toLocaleString()}</div>
          <div style={dynamicStyles.statHelp}>Verified gate arrivals</div>
        </div>

        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>CAMPUS EXITS (OUT)</div>
          <div style={{ ...dynamicStyles.statValue, color: brand.warning }}>{metrics.out_today.toLocaleString()}</div>
          <div style={dynamicStyles.statHelp}>Authorized departures</div>
        </div>

        <div style={dynamicStyles.statCard}>
          <div style={dynamicStyles.statLabel}>SCAN METHODS (TODAY)</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: brand.primary }}>{metrics.rfid_count}</span>
            <span style={{ fontSize: '0.74rem', color: tokens.textSecondary, fontWeight: 600 }}>RFID</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: brand.success, marginLeft: 6 }}>{metrics.qr_count}</span>
            <span style={{ fontSize: '0.74rem', color: tokens.textSecondary, fontWeight: 600 }}>QR Code</span>
          </div>
          <div style={dynamicStyles.statHelp}>Card taps vs. QR scans</div>
        </div>
      </div>

      {/* 2. Control & Real-time Filter Bar */}
      <div style={dynamicStyles.controlBar}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: brand.success, fontWeight: 700, fontSize: '0.76rem' }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: brand.success,
                boxShadow: `0 0 6px ${brand.success}`,
              }}
            />
            <span>Gate Hardware Stream Online</span>
          </div>

          <div style={{ color: tokens.borderStrong }}>|</div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setPersonFilter('ALL')}
              style={getFilterTabStyle(personFilter === 'ALL')}
            >
              All Persons
            </button>
            <button
              type="button"
              onClick={() => setPersonFilter('STUDENT')}
              style={getFilterTabStyle(personFilter === 'STUDENT')}
            >
              Learners
            </button>
            <button
              type="button"
              onClick={() => setPersonFilter('STAFF')}
              style={getFilterTabStyle(personFilter === 'STAFF')}
            >
              Faculty &amp; Staff
            </button>
          </div>

          <div style={{ color: tokens.borderStrong }}>|</div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setDirectionFilter('ALL')}
              style={getFilterTabStyle(directionFilter === 'ALL')}
            >
              All Directions
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('IN')}
              style={getFilterTabStyle(directionFilter === 'IN')}
            >
              Entries (IN)
            </button>
            <button
              type="button"
              onClick={() => setDirectionFilter('OUT')}
              style={getFilterTabStyle(directionFilter === 'OUT')}
            >
              Exits (OUT)
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: tokens.textSecondary, fontWeight: 600, fontSize: '0.76rem' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: brand.primary }}
            />
            <span>Live Sync (4s)</span>
          </label>

          <Button
            variant="secondary"
            size="md"
            type="button"
            onClick={() => fetchLogs(currentPage, pageSize, search, personFilter, directionFilter, false)}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 3. Main Ledger Table Card */}
      <div style={dynamicStyles.tableCard}>
        <ModuleTableLayout
          title="Gate Logs Ledger"
          subtitle="Real-time transaction history of RFID card taps and QR passes recorded at school gate terminals."
          searchPlaceholder="Search by name, LRN, or Employee ID..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          error={error}
          data={logs}
          keyExtractor={(item) => item.log_id}
          columns={[
            {
              header: 'Individual Profile', 
              render: (item) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <ProfileAvatar
                    photoUrl={item.photo_url || item.photo}
                    name={item.name}
                    size={38}
                    iconSize={19}
                  />

                  <div>
                    <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.86rem' }}>
                      {item.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.74rem', color: tokens.textSecondary }}>
                        {item.identifier}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.identifier, `id-${item.log_id}`)}
                        title="Copy Identifier"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, display: 'flex', alignItems: 'center' }}
                      >
                        {copiedKey === `id-${item.log_id}` ? (
                          <Check size={11} color={brand.success} />
                        ) : (
                          <Copy size={11} color={tokens.textMuted} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Person Type',
              render: (item) => {
                const isStudent = item.person_type === 'STUDENT';
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.70rem',
                      fontWeight: 800,
                      backgroundColor: isStudent ? tokens.primaryLight : 'rgba(124, 58, 237, 0.15)',
                      color: isStudent ? brand.primary : '#a78bfa',
                      border: `1px solid ${isStudent ? 'rgba(0, 75, 135, 0.3)' : 'rgba(124, 58, 237, 0.3)'}`,
                    }}
                  >
                    {isStudent ? <GraduationCap size={12} /> : <Briefcase size={12} />}
                    {isStudent ? 'STUDENT' : 'FACULTY'}
                  </span>
                );
              },
            },
            {
              header: 'Direction',
              render: (item) => {
                const isEntry = item.direction === 'IN';
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '3px 9px',
                      borderRadius: 6,
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      backgroundColor: isEntry ? 'rgba(16, 185, 129, 0.15)' : 'rgba(217, 119, 6, 0.15)',
                      color: isEntry ? brand.success : brand.warning,
                      border: `1px solid ${isEntry ? 'rgba(16, 185, 129, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`,
                    }}
                  >
                    {isEntry ? <LogIn size={12} /> : <LogOut size={12} />}
                    {item.direction}
                  </span>
                );
              },
            },
            {
              header: 'Scan Method',
              render: (item) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: item.scan_method === 'RFID' ? brand.primary : brand.success,
                  }}
                >
                  {item.scan_method === 'RFID' ? <Radio size={12} /> : <QrCode size={12} />}
                  {item.scan_method}
                </span>
              ),
            },
            {
              header: 'Timestamp',
              render: (item) => (
                <div style={{ fontSize: '0.76rem', fontWeight: 600, color: tokens.textSecondary }}>
                  {item.scan_time}
                </div>
              ),
            },
            {
              header: 'Station Terminal',
              render: (item) => (
                <div style={{ fontSize: '0.76rem', color: tokens.textSecondary }}>
                  <span style={{ fontWeight: 700 }}>{item.kiosk_name || item.kiosk || 'Terminal'}</span>{' '}
                  {item.kiosk_code && (
                    <span style={{ fontSize: '0.68rem', color: tokens.textMuted, fontFamily: 'monospace' }}>
                      ({item.kiosk_code})
                    </span>
                  )}
                </div>
              ),
            },
            {
              header: 'Actions',
              align: 'right',
              render: (item) => (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setInspectedLog(item)}
                    title="Inspect Scan Details"
                    style={dynamicStyles.actionBtn}
                  >
                    <Eye size={13} color={brand.primary} />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* 4. Ledger Pagination Bar */}
        <div style={dynamicStyles.paginationContainer}>
          <div style={{ fontSize: '0.78rem', color: tokens.textSecondary }}>
            {totalCount > 0 ? (
              <>
                Showing <strong>{startRecord}</strong> to <strong>{endRecord}</strong> of{' '}
                <strong>{totalCount}</strong> gate transactions
              </>
            ) : (
              'No transactions recorded'
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 8 }}>
              <span style={{ fontSize: '0.76rem', color: tokens.textMuted }}>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                style={dynamicStyles.paginationSelect}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            <button
              onClick={() => handlePageChange(1)}
              disabled={currentPage <= 1 || loading}
              style={{ ...dynamicStyles.paginationBtn, opacity: currentPage <= 1 || loading ? 0.35 : 1 }}
              title="First Page"
              type="button"
            >
              <ChevronsLeft size={16} />
            </button>

            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              style={{ ...dynamicStyles.paginationBtn, opacity: currentPage <= 1 || loading ? 0.35 : 1 }}
              title="Previous Page"
              type="button"
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '0 8px', color: tokens.textPrimary }}>
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              style={{ ...dynamicStyles.paginationBtn, opacity: currentPage >= totalPages || loading ? 0.35 : 1 }}
              title="Next Page"
              type="button"
            >
              <ChevronRight size={16} />
            </button>

            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages || loading}
              style={{ ...dynamicStyles.paginationBtn, opacity: currentPage >= totalPages || loading ? 0.35 : 1 }}
              title="Last Page"
              type="button"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 5. Inspection Modal */}
      {inspectedLog && (
        <Modal
          isOpen={Boolean(inspectedLog)}
          onClose={() => setInspectedLog(null)}
          title="Gate Transaction Verification"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', backgroundColor: tokens.bgSurfaceSubtle, borderRadius: 10, border: `1px solid ${tokens.borderSubtle}` }}>
              <ProfileAvatar
                photoUrl={inspectedLog.photo_url || inspectedLog.photo}
                name={inspectedLog.name}
                size={54}
                iconSize={27}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.98rem', fontWeight: 800, color: tokens.textPrimary }}>
                  {inspectedLog.name}
                </div>
                <div style={{ fontSize: '0.74rem', color: tokens.textSecondary, marginTop: 2 }}>
                  Identifier:{' '}
                  <strong style={{ fontFamily: 'monospace', color: tokens.textPrimary }}>
                    {inspectedLog.identifier}
                  </strong>
                </div>
                <div style={{ fontSize: '0.72rem', color: brand.primary, fontWeight: 700, marginTop: 2 }}>
                  Role: {inspectedLog.person_type === 'STUDENT' ? 'Enrolled Student' : 'Faculty / Staff'}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
              <div style={dynamicStyles.fieldBox}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: tokens.textMuted }}>DIRECTION &amp; ACTION</div>
                <div style={{ marginTop: 3, fontWeight: 800, color: inspectedLog.direction === 'IN' ? brand.success : brand.warning }}>
                  Campus {inspectedLog.direction === 'IN' ? 'Entry (Arrival)' : 'Exit (Departure)'}
                </div>
              </div>

              <div style={dynamicStyles.fieldBox}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: tokens.textMuted }}>SECURITY METHOD</div>
                <div style={{ marginTop: 3, fontWeight: 700, color: tokens.textPrimary, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {inspectedLog.scan_method === 'RFID' ? <Radio size={13} color={brand.primary} /> : <QrCode size={13} color={brand.success} />}
                  <span>{inspectedLog.scan_method} Verified</span>
                </div>
              </div>

              <div style={dynamicStyles.fieldBox}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: tokens.textMuted }}>TERMINAL STATION</div>
                <div style={{ marginTop: 3, fontWeight: 700, color: tokens.textPrimary }}>
                  {inspectedLog.kiosk_name || inspectedLog.kiosk || 'Main Gate'}
                </div>
              </div>

              <div style={dynamicStyles.fieldBox}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, color: tokens.textMuted }}>TIMESTAMP</div>
                <div style={{ marginTop: 3, fontWeight: 700, color: tokens.textPrimary }}>
                  {inspectedLog.scan_time}
                </div>
              </div>
            </div>

            {inspectedLog.snapshot_url && (
              <div style={{ width: '100%', height: 220, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000000' }}>
                <img
                  src={inspectedLog.snapshot_url}
                  alt="Gate Snapshot"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
              <Button variant="secondary" size="md" onClick={() => setInspectedLog(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GateLogsTab; 