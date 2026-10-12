/**
 * AttendSure V3 - IoT Kiosks & Hardware Scanners Management
 * File: frontend/src/components/tabs/ScannersTab.tsx
 *
 * Key Highlights:
 * 1. MODERN ALERTS: Uses showConfirm and showAlert from AlertContext instead of window.alert/confirm.
 * 2. LIVE DATABASE POLLING: Silent 3-second heartbeat tracks real-time terminal online/offline statuses.
 * 3. INTERACTION GUARD: Polling pauses automatically while modals and live verification tests run.
 * 4. DUAL-MODE HARDWARE INSPECTOR: Simulates live RFID taps and optical QR scans against backend endpoints.
 * 5. SERVER PAGINATION & TELEMETRY: Overview cards for online hardware and items-per-page selection.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useAlert } from '../../context/AlertContext';
import {
  Cpu,
  Wifi,
  WifiOff,
  Key,
  Pencil,
  Trash2,
  Loader2,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  MapPin,
  RefreshCw,
  Eye,
  EyeOff,
  Terminal,
  Radio,
  Server,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Send,
  Play,
  Plus,
  User,
} from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface IoTKiosk {
  id: number;
  kiosk_code: string;
  terminal_name: string;
  location: string;
  secret_key?: string;
  is_active: boolean;
  last_ping: string | null;
  is_online?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface TestSubject {
  id: number;
  name: string;
  type: 'STUDENT' | 'STAFF';
  rfid_uid?: string;
  qr_token?: string;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ScannersTab: React.FC = () => {
  const { showAlert, showConfirm } = useAlert();

  const [scanners, setScanners] = useState<IoTKiosk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Security & Modal States
  const [revealedSecrets, setRevealedSecrets] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inspectedScanner, setInspectedScanner] = useState<IoTKiosk | null>(null);

  // Dynamic Live Test State
  const [testSubjects, setTestSubjects] = useState<TestSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [activeTestMode, setActiveTestMode] = useState<'RFID' | 'QR'>('RFID');
  const [testExecuting, setTestExecuting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScanner, setEditingScanner] = useState<IoTKiosk | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    kiosk_code: '',
    terminal_name: '',
    location: '',
    secret_key: '',
    is_active: true,
  });

  // Guard flag: prevents silent background polling from interrupting open dialogs
  const isInteracting = useRef(false);
  isInteracting.current = isModalOpen || Boolean(inspectedScanner) || saving || testExecuting;

  // ============================================================================
  // DATABASE DATA FETCHING & LIVE POLLING
  // ============================================================================

  const fetchScanners = useCallback(
    async (page = 1, size = 25, query = '', silent = false) => {
      try {
        if (!silent) setLoading(true);
        setError(null);
        const res = await apiClient.get<PaginatedResponse<IoTKiosk> | IoTKiosk[]>('/scanners/', {
          params: {
            page,
            page_size: size,
            search: query.trim() || undefined,
          },
        });

        if (res.data && 'results' in res.data) {
          setScanners(res.data.results);
          setTotalCount(res.data.count);
          setTotalPages(res.data.total_pages || Math.ceil(res.data.count / size) || 1);
          setCurrentPage(res.data.current_page || page);
        } else if (Array.isArray(res.data)) {
          setScanners(res.data);
          setTotalCount(res.data.length);
          setTotalPages(1);
          setCurrentPage(1);
        }
      } catch (err: any) {
        if (!silent) {
          setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to load scanner terminals from database.');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    []
  );

  // Debounced search watcher
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchScanners(1, pageSize, search, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, pageSize, fetchScanners]);

  // LIVE ZERO-REFRESH POLLING: Syncs hardware online/standby pings every 3 seconds
  useEffect(() => {
    const liveInterval = setInterval(() => {
      if (!isInteracting.current) {
        fetchScanners(currentPage, pageSize, search, true);
      }
    }, 3000);

    return () => clearInterval(liveInterval);
  }, [currentPage, pageSize, search, fetchScanners]);

  // Dynamically load real registered records for dual-mode verification
  const loadDynamicTestSubjects = async () => {
    try {
      const [stuRes, facRes] = await Promise.all([
        apiClient.get('/students/?page_size=15'),
        apiClient.get('/facultys/?page_size=15'),
      ]);

      const stuList = (Array.isArray(stuRes.data) ? stuRes.data : stuRes.data?.results || []).map((s: any) => ({
        id: s.id,
        name: `${s.first_name} ${s.last_name} (LRN: ${s.lrn})`,
        type: 'STUDENT' as const,
        rfid_uid: s.rfid_uid || '',
        qr_token: s.qr_token || '',
      }));

      const facList = (Array.isArray(facRes.data) ? facRes.data : facRes.data?.results || []).map((f: any) => ({
        id: f.id + 100000,
        name: `${f.first_name} ${f.last_name} (${f.position || 'Faculty'})`,
        type: 'STAFF' as const,
        rfid_uid: f.rfid_uid || '',
        qr_token: f.qr_token || '',
      }));

      const combined = [...stuList, ...facList];
      setTestSubjects(combined);
      if (combined.length > 0) {
        setSelectedSubjectId(String(combined[0].id));
      }
    } catch (err) {
      console.error('Failed to load active identity subjects:', err);
    }
  };

  const handleOpenInspector = (scanner: IoTKiosk) => {
    setInspectedScanner(scanner);
    setTestResult(null);
    loadDynamicTestSubjects();
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchScanners(newPage, pageSize, search, false);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchScanners(1, newSize, search, false);
  };

  const getDeviceHealth = (lastPing: string | null, isActive: boolean) => {
    if (!isActive) {
      return { status: 'DISABLED', label: 'Disabled', color: '#64748b', bg: '#f1f5f9', border: '#cbd5e1' };
    }
    if (!lastPing) {
      return { status: 'STANDBY', label: 'Standby / No Taps', color: '#d97706', bg: '#fffbeb', border: '#fcd34d' };
    }

    const diffMinutes = (Date.now() - new Date(lastPing).getTime()) / (1000 * 60);
    if (diffMinutes <= 5) {
      return { status: 'ONLINE', label: 'Online', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
    }
    return { status: 'OFFLINE', label: 'Offline', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  };

  const metrics = useMemo(() => {
    const online = scanners.filter((s) => s.is_active && getDeviceHealth(s.last_ping, s.is_active).status === 'ONLINE').length;
    const active = scanners.filter((s) => s.is_active).length;
    const inactiveOrOffline = scanners.length - online;
    return { online, active, inactiveOrOffline };
  }, [scanners]);

  const createSecureToken = () => {
    try {
      const randomBuffer = new Uint8Array(12);
      window.crypto.getRandomValues(randomBuffer);
      const token = Array.from(randomBuffer, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
      return `SEC-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}`;
    } catch {
      return `SEC-${Date.now().toString(36).toUpperCase()}`;
    }
  };

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
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand('copy');
        textArea.remove();
      } catch (err) {
        console.error('Copy fallback failed:', err);
      }
    }
    if (success) {
      setCopiedKey(id);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  // ============================================================================
  // CRUD ACTIONS
  // ============================================================================

  const handleOpenCreate = () => {
    setEditingScanner(null);
    setFormData({
      kiosk_code: '',
      terminal_name: '',
      location: '',
      secret_key: createSecureToken(),
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (scanner: IoTKiosk) => {
    setEditingScanner(scanner);
    setFormData({
      kiosk_code: scanner.kiosk_code,
      terminal_name: scanner.terminal_name,
      location: scanner.location,
      secret_key: scanner.secret_key || '',
      is_active: scanner.is_active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        kiosk_code: formData.kiosk_code.trim(),
        terminal_name: formData.terminal_name.trim(),
        location: formData.location.trim(),
        is_active: formData.is_active,
      };

      if (formData.secret_key.trim()) {
        payload.secret_key = formData.secret_key.trim();
      }

      if (editingScanner) {
        await apiClient.put(`/scanners/${editingScanner.id}/`, payload);
        showAlert({
          title: 'Terminal Updated',
          message: `Scanner terminal "${formData.terminal_name}" updated successfully.`,
          type: 'success',
        });
      } else {
        await apiClient.post('/scanners/', payload);
        showAlert({
          title: 'Terminal Registered',
          message: `Scanner terminal "${formData.terminal_name}" (${formData.kiosk_code}) registered.`,
          type: 'success',
        });
      }

      setIsModalOpen(false);
      fetchScanners(currentPage, pageSize, search, true);
    } catch (err: any) {
      showAlert({
        title: 'Save Error',
        message: err?.response?.data?.detail || err?.response?.data?.error || 'Failed to save scanner terminal to database.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (scanner: IoTKiosk) => {
    showConfirm({
      title: 'Delete Scanner Terminal',
      message: `Permanently delete "${scanner.terminal_name}" (${scanner.kiosk_code})? Any gate card or QR code scans attempted at this terminal will be rejected immediately.`,
      confirmLabel: 'Delete Terminal',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/scanners/${scanner.id}/`);
          showAlert({
            title: 'Terminal Deleted',
            message: `Terminal ${scanner.kiosk_code} has been removed.`,
            type: 'info',
          });
          fetchScanners(currentPage, pageSize, search, true);
        } catch (err: any) {
          showAlert({
            title: 'Delete Failed',
            message: err?.response?.data?.detail || 'Failed to delete scanner terminal.',
            type: 'error',
          });
        }
      },
    });
  };

  // Resolve active testing target from database
  const activeSubject = testSubjects.find((s) => String(s.id) === String(selectedSubjectId));
  const activeIdentifier =
    activeTestMode === 'RFID'
      ? activeSubject?.rfid_uid || ''
      : activeSubject?.qr_token || '';

  const dynamicApiOrigin = window.location.origin;

  // Execute authentic live test against backend
  const handleExecuteLiveTest = async () => {
    if (!inspectedScanner) return;
    if (!activeIdentifier) {
      showAlert({
        title: 'Missing Identifier',
        message: `The selected record (${activeSubject?.name}) does not have an active ${activeTestMode} identifier stored in the database.`,
        type: 'warning',
      });
      return;
    }

    setTestExecuting(true);
    setTestResult(null);

    try {
      const res = await apiClient.post('/gate/scan/', {
        kiosk_code: inspectedScanner.kiosk_code,
        secret_key: inspectedScanner.secret_key || '',
        raw_identifier: activeIdentifier,
        scan_method: activeTestMode,
      });
      setTestResult({ success: true, data: res.data });
      fetchScanners(currentPage, pageSize, search, true);
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err?.response?.data || { detail: 'Request failed. Verify terminal secret key.' },
      });
    } finally {
      setTestExecuting(false);
    }
  };

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Hardware Metrics Overview */}
      <div style={statsGrid}>
        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>TOTAL TERMINALS</span>
            <Server size={18} color="#0284c7" />
          </div>
          <div style={statVal}>{totalCount}</div>
          <div style={statSub}>Registered database devices</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>ACTIVE HARDWARE</span>
            <ShieldCheck size={18} color="#059669" />
          </div>
          <div style={{ ...statVal, color: '#059669' }}>{metrics.active}</div>
          <div style={statSub}>Authorized for gate entry/exit</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>ONLINE ON THIS PAGE</span>
            <Radio size={18} color="#0284c7" />
          </div>
          <div style={{ ...statVal, color: '#0284c7' }}>{metrics.online}</div>
          <div style={statSub}>Tapped or pinged within 5 minutes</div>
        </div>

        <div style={statCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={statLabel}>STANDBY / OFFLINE</span>
            <WifiOff size={18} color={metrics.inactiveOrOffline > 0 ? '#d97706' : '#64748b'} />
          </div>
          <div style={{ ...statVal, color: metrics.inactiveOrOffline > 0 ? '#d97706' : '#059669' }}>
            {metrics.inactiveOrOffline}
          </div>
          <div style={statSub}>Idle or waiting for connection</div>
        </div>
      </div>

      {/* 2. Main Hardware List Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <ModuleTableLayout
          title="IoT Kiosks & Hardware Scanners"
          subtitle="Manage campus gate scanners, RFID readers, and microcontrollers registered in the database."
          searchPlaceholder="Search terminal code, name, or location..."
          searchValue={search}
          onSearchChange={setSearch}
          addButtonLabel="Register Terminal"
          onAdd={handleOpenCreate}
          loading={loading}
          error={error}
          data={scanners}
          keyExtractor={(s) => s.id}
          columns={[
            {
              header: 'Terminal Info',
              render: (s) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={terminalIconBox}>
                    <Cpu size={18} color="#0284c7" />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                      {s.terminal_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={codeBadge}>{s.kiosk_code}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(s.kiosk_code, `code-${s.id}`)}
                        title="Copy Kiosk Code"
                        style={copyMiniBtn}
                      >
                        {copiedKey === `code-${s.id}` ? <Check size={11} color="#059669" /> : <Copy size={11} color="#94a3b8" />}
                      </button>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              header: 'Location',
              render: (s) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#334155' }}>
                  <MapPin size={14} color="#64748b" />
                  <span style={{ fontWeight: 600 }}>{s.location || 'Unassigned'}</span>
                </div>
              ),
            },
            {
              header: 'Connection Status',
              render: (s) => {
                const health = getDeviceHealth(s.last_ping, s.is_active);
                return (
                  <div>
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        backgroundColor: health.bg,
                        color: health.color,
                        border: `1px solid ${health.border}`,
                      }}
                    >
                      {health.status === 'ONLINE' ? <Wifi size={12} /> : <WifiOff size={12} />}
                      <span>{health.label}</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 3 }}>
                      {s.last_ping
                        ? `Last tap: ${new Date(s.last_ping).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                        : 'No scans recorded today'}
                    </div>
                  </div>
                );
              },
            },
            {
              header: 'Secret Key',
              render: (s) => {
                const isRevealed = Boolean(revealedSecrets[s.id]);
                const displayKey = isRevealed ? (s.secret_key || 'PROTECTED-IN-DATABASE') : '••••••••••••••••';
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={secretBox}>
                      <Key size={12} color="#0284c7" />
                      <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
                        {displayKey}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setRevealedSecrets((prev) => ({ ...prev, [s.id]: !prev[s.id] }))}
                      title={isRevealed ? 'Hide Secret Key' : 'Reveal Secret Key'}
                      style={iconBtn}
                    >
                      {isRevealed ? <EyeOff size={13} color="#64748b" /> : <Eye size={13} color="#64748b" />}
                    </button>

                    {s.secret_key && (
                      <button
                        type="button"
                        onClick={() => handleCopy(s.secret_key!, `sec-${s.id}`)}
                        title="Copy Secret Key"
                        style={iconBtn}
                      >
                        {copiedKey === `sec-${s.id}` ? <Check size={13} color="#059669" /> : <Copy size={13} color="#64748b" />}
                      </button>
                    )}
                  </div>
                );
              },
            },
            {
              header: 'Gate Access',
              render: (s) => (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 12,
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    backgroundColor: s.is_active ? '#ecfdf5' : '#fef2f2',
                    color: s.is_active ? '#059669' : '#dc2626',
                  }}
                >
                  {s.is_active ? 'ENABLED' : 'BLOCKED'}
                </span>
              ),
            },
            {
              header: 'Actions',
              align: 'right',
              render: (s) => (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => handleOpenInspector(s)}
                    title="Live Dual-Mode Inspector & Hardware Config"
                    style={{ ...actionBtn, backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}
                  >
                    <Terminal size={13} color="#0284c7" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(s)}
                    title="Edit Terminal Settings"
                    style={actionBtn}
                  >
                    <Pencil size={13} color="#475569" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    title="Delete Terminal"
                    style={{ ...actionBtn, backgroundColor: '#fff1f2', borderColor: '#fee2e2' }}
                  >
                    <Trash2 size={13} color="#dc2626" />
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
                <strong>{totalCount}</strong> terminals
              </>
            ) : (
              'No terminals found'
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

      {/* 3. Register / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingScanner ? 'Edit Scanner Terminal' : 'Register New Scanner Terminal'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={infoBox}>
            <ShieldAlert size={18} color="#0284c7" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.74rem', color: '#1e293b', lineHeight: 1.35 }}>
              Each device needs a unique <strong>Kiosk Code</strong> and <strong>Secret Key</strong>. Gate taps without a matching secret key will be rejected by the server.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Terminal Device Code *</label>
            <input
              type="text"
              required
              value={formData.kiosk_code}
              onChange={(e) => setFormData({ ...formData, kiosk_code: e.target.value })}
              style={inputStyle}
              placeholder="Enter unique terminal code (e.g. KIOSK-MAIN-01)"
            />
          </div>

          <div>
            <label style={labelStyle}>Terminal Friendly Name *</label>
            <input
              type="text"
              required
              value={formData.terminal_name}
              onChange={(e) => setFormData({ ...formData, terminal_name: e.target.value })}
              style={inputStyle}
              placeholder="e.g. Main Gate Entrance Scanner"
            />
          </div>

          <div>
            <label style={labelStyle}>Installation Location *</label>
            <input
              type="text"
              required
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              style={inputStyle}
              placeholder="e.g. Senior High Building Gate"
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>
                Device Secret Key {editingScanner ? '(Leave blank to keep current)' : '*'}
              </label>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, secret_key: createSecureToken() })}
                style={regenBtn}
              >
                <RefreshCw size={11} />
                <span>Generate Key</span>
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                required={!editingScanner}
                value={formData.secret_key}
                onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600, paddingRight: 36 }}
                placeholder={editingScanner ? '•••••••••••••••• (Unchanged)' : 'Enter or generate hardware secret key'}
              />
              {formData.secret_key && (
                <button
                  type="button"
                  onClick={() => handleCopy(formData.secret_key, 'modal-key')}
                  title="Copy Secret Key"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                  }}
                >
                  {copiedKey === 'modal-key' ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
              Flash this secret token into your ESP32 or Raspberry Pi attendance firmware.
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <input
              type="checkbox"
              id="is_active_check"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <div>
              <label htmlFor="is_active_check" style={{ fontSize: '0.80rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                Allow Gate Attendance Scans
              </label>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                When checked, RFID and QR scans from this terminal are validated and recorded.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
              {editingScanner ? 'Save Changes' : 'Register Terminal'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. Strictly Dynamic Dual-Mode Live Inspector */}
      {inspectedScanner && (
        <Modal
          isOpen={Boolean(inspectedScanner)}
          onClose={() => setInspectedScanner(null)}
          title={`Dual-Mode Verification: ${inspectedScanner.terminal_name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Real Identity Selector with Neutral Avatar */}
            <div style={{ padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <User size={15} color="#0284c7" />
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                  Select Active Database Record:
                </label>
              </div>

              <select
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                style={{ ...inputStyle, backgroundColor: '#ffffff' }}
              >
                {testSubjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    [{sub.type}] {sub.name}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setActiveTestMode('RFID')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTestMode === 'RFID' ? '#0284c7' : '#cbd5e1',
                    backgroundColor: activeTestMode === 'RFID' ? '#f0f9ff' : '#ffffff',
                    color: activeTestMode === 'RFID' ? '#0284c7' : '#475569',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Mode 1: RFID Chip Tap
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTestMode('QR')}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: '1px solid',
                    borderColor: activeTestMode === 'QR' ? '#059669' : '#cbd5e1',
                    backgroundColor: activeTestMode === 'QR' ? '#ecfdf5' : '#ffffff',
                    color: activeTestMode === 'QR' ? '#059669' : '#475569',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Mode 2: Printed QR Scan
                </button>
              </div>
            </div>

            {/* Dynamic Hardware Payload Box */}
            <div style={codeBox}>
              <div style={codeHeader}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#38bdf8' }}>
                  {activeTestMode === 'RFID' ? 'HARDWARE RFID SCAN PAYLOAD' : 'OPTICAL QR SCAN PAYLOAD'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      JSON.stringify(
                        {
                          kiosk_code: inspectedScanner.kiosk_code,
                          secret_key: inspectedScanner.secret_key || '',
                          raw_identifier: activeIdentifier || '(NO_IDENTIFIER_ASSIGNED)',
                          scan_method: activeTestMode,
                        },
                        null,
                        2
                      ),
                      'payload-copy'
                    )
                  }
                  style={copyBtn}
                >
                  {copiedKey === 'payload-copy' ? <Check size={12} color="#10b981" /> : <Copy size={12} color="#cbd5e1" />}
                  <span>{copiedKey === 'payload-copy' ? 'Copied' : 'Copy Payload'}</span>
                </button>
              </div>
              <pre style={codeText}>
{JSON.stringify(
  {
    kiosk_code: inspectedScanner.kiosk_code,
    secret_key: inspectedScanner.secret_key || '(Protected)',
    raw_identifier: activeIdentifier || 'No UID registered for this record',
    scan_method: activeTestMode,
  },
  null,
  2
)}
              </pre>
            </div>

            {/* Dynamic cURL Command */}
            <div style={codeBox}>
              <div style={codeHeader}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fcd34d' }}>
                  LIVE CURL TERMINAL COMMAND
                </span>
                <button
                  type="button"
                  onClick={() =>
                    handleCopy(
                      `curl -X POST ${dynamicApiOrigin}/api/gate/scan/ \\\n -H "Content-Type: application/json" \\\n -d '{"kiosk_code":"${inspectedScanner.kiosk_code}","secret_key":"${inspectedScanner.secret_key || ''}","raw_identifier":"${activeIdentifier}","scan_method":"${activeTestMode}"}'`,
                      'curl-copy'
                    )
                  }
                  style={copyBtn}
                >
                  {copiedKey === 'curl-copy' ? <Check size={12} color="#10b981" /> : <Send size={12} color="#cbd5e1" />}
                  <span>{copiedKey === 'curl-copy' ? 'Copied' : 'Copy cURL'}</span>
                </button>
              </div>
              <pre style={{ ...codeText, color: '#fef08a' }}>
{`curl -X POST ${dynamicApiOrigin}/api/gate/scan/ \\
 -H "Content-Type: application/json" \\
 -d '{"kiosk_code":"${inspectedScanner.kiosk_code}","secret_key":"${inspectedScanner.secret_key || ''}","raw_identifier":"${activeIdentifier || 'UNDEFINED'}","scan_method":"${activeTestMode}"}'`}
              </pre>
            </div>

            {/* Live Server Response Display */}
            {testResult && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: testResult.success ? '#a7f3d0' : '#fecaca',
                  backgroundColor: testResult.success ? '#ecfdf5' : '#fef2f2',
                }}
              >
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: testResult.success ? '#059669' : '#dc2626' }}>
                  {testResult.success ? '✓ Scan Accepted by Server' : '✗ Server Rejected Scan'}
                </div>
                <pre style={{ margin: 0, marginTop: 4, fontSize: '0.70rem', color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(testResult.data || testResult.error, null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={handleExecuteLiveTest}
                disabled={testExecuting || !activeIdentifier}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {testExecuting ? <Loader2 className="animate-spin" size={15} /> : <Play size={15} />}
                Test Live Tap in Database
              </Button>

              <Button variant="secondary" size="md" type="button" onClick={() => setInspectedScanner(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ScannersTab;

// ============================================================================
// STYLES
// ============================================================================

const statsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 14,
};

const statCard: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '16px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
};

const statLabel: React.CSSProperties = {
  fontSize: '0.68rem',
  fontWeight: 700,
  color: '#64748b',
  letterSpacing: '0.3px',
};

const statVal: React.CSSProperties = {
  fontSize: '1.50rem',
  fontWeight: 800,
  color: '#0f172a',
  lineHeight: 1.1,
  marginTop: 6,
};

const statSub: React.CSSProperties = {
  fontSize: '0.70rem',
  color: '#94a3b8',
  marginTop: 4,
};

const terminalIconBox: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 8,
  backgroundColor: '#f0f9ff',
  border: '1px solid #bae6fd',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const codeBadge: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.70rem',
  fontWeight: 700,
  color: '#0284c7',
  backgroundColor: '#eff6ff',
  padding: '1px 6px',
  borderRadius: 4,
  border: '1px solid #bfdbfe',
};

const copyMiniBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 1,
  display: 'flex',
  alignItems: 'center',
};

const secretBox: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 6,
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
};

const iconBtn: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: 4,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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

const infoBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '10px 14px',
  backgroundColor: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: 8,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.84rem',
  outline: 'none',
  boxSizing: 'border-box',
  color: '#0f172a',
};

const regenBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: '0.70rem',
  color: '#0284c7',
  fontWeight: 700,
  padding: 0,
};

const codeBox: React.CSSProperties = {
  backgroundColor: '#0f172a',
  borderRadius: 8,
  overflow: 'hidden',
  border: '1px solid #1e293b',
};

const codeHeader: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  backgroundColor: '#1e293b',
  borderBottom: '1px solid #334155',
};

const copyBtn: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.70rem',
  color: '#cbd5e1',
};

const codeText: React.CSSProperties = {
  margin: 0,
  padding: '12px 14px',
  fontFamily: "'Fira Code', Consolas, monospace",
  fontSize: '0.74rem',
  color: '#38bdf8',
  overflowX: 'auto',
  lineHeight: 1.4,
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