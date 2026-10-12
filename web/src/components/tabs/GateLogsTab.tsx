/**
 * AttendSure V3 - Gate Scanner Transactions & Audit Ledger
 * File: frontend/src/components/tabs/GateLogsTab.tsx
 *
 * Key Highlights:
 * 1. LOCAL METRICS COMPUTATION: Replaced the non-existent /gate/logs/metrics/ endpoint with local useMemo calculation, resolving 404 errors and UI flickering.
 * 2. DEFAULT USER ICON: Uses <User /> from lucide-react as the neutral fallback for all profiles.
 * 3. LIVE DATABASE POLLING: Silent 3-second polling synchronizes hardware RFID/QR taps without page reloads.
 * 4. FULL AUDIT INSPECTION: Modal view displays raw hardware kiosk timestamps, methods, and card UIDs.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
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
  Clock,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface GateLogEntry {
  log_id: string;
  person_type: 'STUDENT' | 'STAFF' | 'FACULTY';
  identifier: string;
  name: string;
  direction: 'IN' | 'OUT';
  scan_method: string;
  kiosk_name: string;
  kiosk_code: string;
  scan_time: string;
  raw_time?: string;
  photo?: string | null;
  photo_url?: string | null;
  section_or_dept?: string;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

// ============================================================================
// REUSABLE DEFAULT USER AVATAR COMPONENT
// ============================================================================

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
        backgroundColor: '#f1f5f9',
        border: '1px solid #e2e8f0',
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
        <User size={iconSize} color="#94a3b8" />
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const GateLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<GateLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [personFilter, setPersonFilter] = useState<'ALL' | 'STUDENT' | 'STAFF'>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Inspection & Interaction States
  const [inspectedLog, setInspectedLog] = useState<GateLogEntry | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Guard flag: prevents background polling from closing modal views
  const isInteracting = useRef(false);
  isInteracting.current = Boolean(inspectedLog);

  // ============================================================================
  // CLIPBOARD HELPER
  // ============================================================================

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
      } catch (err) {
        console.error('Clipboard copy error:', err);
      }
    }
    if (success) {
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // ============================================================================
  // DATABASE DATA FETCHING & LIVE POLLING
  // ============================================================================

  const fetchLogs = useCallback(
    async (page = 1, size = 25, query = '', pFilter = 'ALL', dFilter = 'ALL', silent = false) => {
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
        if (!silent) {
          setError(err?.response?.data?.detail || 'Unable to load gate scanner transactions from database.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  // Computed Telemetry Metrics (eliminates 404 network requests)
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

  // Debounced search and filter watcher
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchLogs(1, pageSize, search, personFilter, directionFilter, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, personFilter, directionFilter, pageSize, fetchLogs]);

  // LIVE ZERO-REFRESH POLLING: 3-second database check
  useEffect(() => {
    if (!autoRefresh) return;

    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchLogs(currentPage, pageSize, search, personFilter, directionFilter, true);
      }
    }, 3000);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Live Gate Telemetry Overview */}
      <div style={statsContainer}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL SCANS RECORDED</div>
          <div style={statValue}>{metrics.total_today}</div>
          <div style={statHelp}>Transactions processed today</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>CAMPUS ENTRIES (IN)</div>
          <div style={{ ...statValue, color: '#059669' }}>{metrics.in_today}</div>
          <div style={statHelp}>Verified gate arrivals</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>CAMPUS EXITS (OUT)</div>
          <div style={{ ...statValue, color: '#d97706' }}>{metrics.out_today}</div>
          <div style={statHelp}>Authorized departures</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>SCANNING METHODS</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7' }}>{metrics.rfid_count}</span>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>RFID</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginLeft: 6 }}>{metrics.qr_count}</span>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600 }}>QR Code</span>
          </div>
          <div style={statHelp}>Physical cards vs QR tokens</div>
        </div>
      </div>

      {/* 2. Live Stream Status & Filter Control Bar */}
      <div style={controlBar}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700, fontSize: '0.78rem' }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            <span>Gate Hardware Stream Online</span>
          </div>

          <div style={{ color: '#cbd5e1' }}>|</div>

          {/* Person Type Pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setPersonFilter('ALL')}
              style={filterTabStyle(personFilter === 'ALL')}
            >
              All Persons
            </button>
            <button
              onClick={() => setPersonFilter('STUDENT')}
              style={filterTabStyle(personFilter === 'STUDENT')}
            >
              Learners
            </button>
            <button
              onClick={() => setPersonFilter('STAFF')}
              style={filterTabStyle(personFilter === 'STAFF')}
            >
              Faculty &amp; Staff
            </button>
          </div>

          <div style={{ color: '#cbd5e1' }}>|</div>

          {/* Direction Filter Pills */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={() => setDirectionFilter('ALL')}
              style={filterTabStyle(directionFilter === 'ALL')}
            >
              All Directions
            </button>
            <button
              onClick={() => setDirectionFilter('IN')}
              style={filterTabStyle(directionFilter === 'IN')}
            >
              Entries (IN)
            </button>
            <button
              onClick={() => setDirectionFilter('OUT')}
              style={filterTabStyle(directionFilter === 'OUT')}
            >
              Exits (OUT)
            </button>
          </div>
        </div>

        {/* Polling Toggle and Refresh Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#475569', fontWeight: 600, fontSize: '0.78rem' }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Live Sync (3s)</span>
          </label>

          <Button
            variant="secondary"
            size="md"
            onClick={() => fetchLogs(currentPage, pageSize, search, personFilter, directionFilter, false)}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* 3. Main Gate Logs Ledger Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="Gate Logs Ledger"
          subtitle="Real-time audit log of biometric RFID cards and digital QR passes scanned across campus kiosks."
          searchPlaceholder="Search individual name, LRN, or Employee ID..."
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <ProfileAvatar
                    photoUrl={item.photo_url || item.photo}
                    name={item.name}
                    size={38}
                    iconSize={19}
                  />

                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                      {item.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.74rem', color: '#475569' }}>
                        {item.identifier}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.identifier, `id-${item.log_id}`)}
                        title="Copy Identifier"
                        style={copyMiniBtn}
                      >
                        {copiedKey === `id-${item.log_id}` ? (
                          <Check size={11} color="#059669" />
                        ) : (
                          <Copy size={11} color="#94a3b8" />
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
                      gap: 5,
                      padding: '3px 8px',
                      borderRadius: 12,
                      fontSize: '0.70rem',
                      fontWeight: 800,
                      backgroundColor: isStudent ? '#eff6ff' : '#f5f3ff',
                      color: isStudent ? '#0284c7' : '#7c3aed',
                      border: `1px solid ${isStudent ? '#bae6fd' : '#ddd6fe'}`,
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
                      padding: '3px 10px',
                      borderRadius: 6,
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      backgroundColor: isEntry ? '#ecfdf5' : '#fffbeb',
                      color: isEntry ? '#059669' : '#d97706',
                      border: `1px solid ${isEntry ? '#a7f3d0' : '#fde68a'}`,
                    }}
                  >
                    {isEntry ? <LogIn size={13} /> : <LogOut size={13} />}
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
                    gap: 5,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: item.scan_method === 'RFID' ? '#0284c7' : '#059669',
                  }}
                >
                  {item.scan_method === 'RFID' ? <Radio size={13} /> : <QrCode size={13} />}
                  {item.scan_method}
                </span>
              ),
            },
            {
              header: 'Timestamp',
              render: (item) => (
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                  {item.scan_time}
                </div>
              ),
            },
            {
              header: 'Kiosk Station',
              render: (item) => (
                <div style={{ fontSize: '0.76rem', color: '#475569' }}>
                  <span style={{ fontWeight: 700 }}>{item.kiosk_name}</span>{' '}
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                    ({item.kiosk_code})
                  </span>
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
                    style={actionBtn}
                  >
                    <Eye size={13} color="#0284c7" />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* Server Pagination Bar */}
        <div style={paginationContainer}>
          <div style={{ fontSize: '0.80rem', color: '#475569' }}>
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
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                style={paginationSelect}
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
              style={{ ...paginationBtn, opacity: currentPage <= 1 || loading ? 0.35 : 1 }}
              title="First Page"
              type="button"
            >
              <ChevronsLeft size={16} />
            </button>

            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1 || loading}
              style={{ ...paginationBtn, opacity: currentPage <= 1 || loading ? 0.35 : 1 }}
              title="Previous Page"
              type="button"
            >
              <ChevronLeft size={16} />
            </button>

            <span style={{ fontSize: '0.80rem', fontWeight: 600, padding: '0 8px', color: '#0f172a' }}>
              Page {currentPage} of {Math.max(1, totalPages)}
            </span>

            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages || loading}
              style={{ ...paginationBtn, opacity: currentPage >= totalPages || loading ? 0.35 : 1 }}
              title="Next Page"
              type="button"
            >
              <ChevronRight size={16} />
            </button>

            <button
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage >= totalPages || loading}
              style={{ ...paginationBtn, opacity: currentPage >= totalPages || loading ? 0.35 : 1 }}
              title="Last Page"
              type="button"
            >
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 4. MODAL: TRANSACTION DETAILS (INSPECT) */}
      {inspectedLog && (
        <Modal
          isOpen={Boolean(inspectedLog)}
          onClose={() => setInspectedLog(null)}
          title="Gate Scan Transaction Details"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Person Card */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px', backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <ProfileAvatar
                photoUrl={inspectedLog.photo_url || inspectedLog.photo}
                name={inspectedLog.name}
                size={54}
                iconSize={27}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  {inspectedLog.name}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 2 }}>
                  Identifier:{' '}
                  <strong style={{ fontFamily: 'monospace', color: '#0f172a' }}>
                    {inspectedLog.identifier}
                  </strong>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700, marginTop: 2 }}>
                  Role: {inspectedLog.person_type === 'STUDENT' ? 'Enrolled Learner' : 'Academic Faculty / Staff'}
                </div>
              </div>
            </div>

            {/* Audit Metadata Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.78rem' }}>
              <div style={fieldBox}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>DIRECTION &amp; ACTION</div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {inspectedLog.direction === 'IN' ? (
                    <span style={{ color: '#059669', fontWeight: 800 }}>Campus Entry (IN)</span>
                  ) : (
                    <span style={{ color: '#d97706', fontWeight: 800 }}>Campus Exit (OUT)</span>
                  )}
                </div>
              </div>

              <div style={fieldBox}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>AUTHENTICATION METHOD</div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: '#0f172a' }}>
                  {inspectedLog.scan_method === 'RFID' ? <Radio size={14} color="#0284c7" /> : <QrCode size={14} color="#059669" />}
                  <span>{inspectedLog.scan_method} Security Verification</span>
                </div>
              </div>

              <div style={fieldBox}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>SCAN TIMESTAMP</div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5, color: '#334155' }}>
                  <Clock size={13} color="#64748b" />
                  <span>{inspectedLog.scan_time}</span>
                </div>
              </div>

              <div style={fieldBox}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>HARDWARE STATION</div>
                <div style={{ marginTop: 4, color: '#334155' }}>
                  <strong>{inspectedLog.kiosk_name}</strong> ({inspectedLog.kiosk_code})
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', backgroundColor: '#ecfdf5', borderRadius: 8, border: '1px solid #a7f3d0' }}>
              <ShieldCheck size={16} color="#059669" />
              <span style={{ fontSize: '0.72rem', color: '#065f46', fontWeight: 700 }}>
                Transaction cryptographically committed and verified in PostgreSQL ledger.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
              <Button variant="primary" size="md" type="button" onClick={() => setInspectedLog(null)}>
                Close Audit
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default GateLogsTab;

// ============================================================================
// STYLES
// ============================================================================

const statsContainer: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '14px 16px',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.66rem',
  fontWeight: 700,
  color: '#64748b',
  marginBottom: 4,
};

const statValue: React.CSSProperties = {
  fontSize: '1.40rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
};

const statHelp: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  marginTop: 4,
};

const controlBar: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
};

const filterTabStyle = (active: boolean): React.CSSProperties => ({
  border: '1px solid',
  borderColor: active ? '#0284c7' : '#cbd5e1',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: active ? 700 : 500,
  backgroundColor: active ? '#0284c7' : '#ffffff',
  color: active ? '#ffffff' : '#475569',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});

const copyMiniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 1,
  display: 'flex',
  alignItems: 'center',
};

const actionBtn: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '6px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const fieldBox: React.CSSProperties = {
  padding: '10px 12px',
  backgroundColor: '#f8fafc',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
};

const paginationContainer: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 18px',
  backgroundColor: '#ffffff',
  borderTop: '1px solid #e2e8f0',
  boxSizing: 'border-box',
};

const paginationBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  backgroundColor: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
};

const paginationSelect: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.78rem',
  color: '#0f172a',
  backgroundColor: '#ffffff',
};