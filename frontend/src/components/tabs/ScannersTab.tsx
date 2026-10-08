import React, { useState, useEffect, useCallback, useMemo } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
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
} from 'lucide-react';

interface IoTKiosk {
  id: number;
  kiosk_code: string;
  terminal_name: string;
  location: string;
  secret_key?: string;
  is_active: boolean;
  last_ping: string | null;
  created_at?: string;
  updated_at?: string;
}

interface PaginatedResponse<T> {
  count: number;
  total_pages?: number;
  current_page?: number;
  results: T[];
}

export const ScannersTab: React.FC = () => {
  const [scanners, setScanners] = useState<IoTKiosk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Server Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Security, Inspection & Clipboard States
  const [revealedSecrets, setRevealedSecrets] = useState<Record<number, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [inspectedScanner, setInspectedScanner] = useState<IoTKiosk | null>(null);

  // Modal & Form States
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

  // Fetch real records from the database
  const fetchScanners = useCallback(async (page = 1, size = 25, query = '') => {
    try {
      setLoading(true);
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
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to load scanner terminals from database.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchScanners(1, pageSize, search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, pageSize, fetchScanners]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages) return;
    setCurrentPage(newPage);
    fetchScanners(newPage, pageSize, search);
  };

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    fetchScanners(1, newSize, search);
  };

  // Hardware health computed from real database ping time
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

  // Database metrics calculated from live loaded records
  const metrics = useMemo(() => {
    const online = scanners.filter((s) => s.is_active && getDeviceHealth(s.last_ping, s.is_active).status === 'ONLINE').length;
    const active = scanners.filter((s) => s.is_active).length;
    const inactiveOrOffline = scanners.length - online;
    return { online, active, inactiveOrOffline };
  }, [scanners]);

  // Generate secure token for new hardware setup
  const createSecureToken = () => {
    const randomBuffer = new Uint8Array(12);
    window.crypto.getRandomValues(randomBuffer);
    const token = Array.from(randomBuffer, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `SEC-${token.slice(0, 4)}-${token.slice(4, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}`;
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleOpenCreate = () => {
    setEditingScanner(null);
    setFormData({
      kiosk_code: `KIOSK-${Math.floor(1000 + Math.random() * 9000)}`,
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
      secret_key: '', // Left blank so existing secret is kept safe unless updated
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
      } else {
        await apiClient.post('/scanners/', payload);
      }

      setIsModalOpen(false);
      fetchScanners(currentPage, pageSize, search);
    } catch (err: any) {
      alert(err?.response?.data?.detail || err?.response?.data?.error || 'Failed to save scanner terminal to database.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scanner: IoTKiosk) => {
    if (!window.confirm(`Are you sure you want to delete "${scanner.terminal_name}" (${scanner.kiosk_code})? Any card or QR scans from this terminal will be rejected.`)) {
      return;
    }
    try {
      await apiClient.delete(`/scanners/${scanner.id}/`);
      fetchScanners(currentPage, pageSize, search);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to delete scanner terminal.');
    }
  };

  const startRecord = totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* 1. Real Hardware Metrics Overview */}
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
          title="IoT Kiosks &amp; Hardware Scanners"
          subtitle="Manage gate scanners, RFID readers, and microcontrollers registered in the database."
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
                    onClick={() => setInspectedScanner(s)}
                    title="View Device Setup Details"
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
                    style={{ ...actionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                  >
                    <Trash2 size={13} color="#dc2626" />
                  </button>
                </div>
              ),
            },
          ]}
        />

        {/* Real Pagination Bar */}
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
              Each device needs a unique <strong>Kiosk Code</strong> and <strong>Secret Key</strong>. Gate taps without a matching secret key will be blocked to stop unauthorized access[cite: 1, 8].
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
              placeholder="e.g. KIOSK-MAIN-01"
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
            <input
              type="text"
              required={!editingScanner}
              value={formData.secret_key}
              onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
              style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600 }}
              placeholder={editingScanner ? '•••••••••••••••• (Unchanged)' : 'SEC-XXXX-XXXX-XXXX'}
            />
            <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
              Set this token in your scanner hardware configuration so it can authenticate.
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
                When checked, RFID and QR scans from this terminal will be recorded in the database[cite: 8].
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              {editingScanner ? 'Save Changes' : 'Register Terminal'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. Terminal Payload Inspector Modal */}
      {inspectedScanner && (
        <Modal
          isOpen={Boolean(inspectedScanner)}
          onClose={() => setInspectedScanner(null)}
          title={`Device Config: ${inspectedScanner.terminal_name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: 1.4 }}>
              Use these values when flashing or configuring your Raspberry Pi, ESP32, or Windows attendance scanner:
            </div>

            <div style={codeBox}>
              <div style={codeHeader}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>API SCAN PAYLOAD SAMPLE</span>
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify({
                    kiosk_code: inspectedScanner.kiosk_code,
                    secret_key: inspectedScanner.secret_key || 'YOUR_SAVED_SECRET_KEY',
                    raw_identifier: '04A1B2C3D4',
                    scan_method: 'RFID',
                  }, null, 2), 'payload-json')}
                  style={copyBtn}
                >
                  {copiedKey === 'payload-json' ? <Check size={12} color="#10b981" /> : <Copy size={12} color="#cbd5e1" />}
                  <span>{copiedKey === 'payload-json' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre style={codeText}>
{JSON.stringify({
  kiosk_code: inspectedScanner.kiosk_code,
  secret_key: inspectedScanner.secret_key || 'SEC-STORED-IN-DB',
  raw_identifier: '04A1B2C3D4',
  scan_method: 'RFID',
}, null, 2)}
              </pre>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.74rem' }}>
              <div style={fieldInfoBox}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>POST Endpoint</div>
                <div style={{ fontFamily: 'monospace', color: '#0284c7', marginTop: 2 }}>/api/gate/scan/</div>
              </div>
              <div style={fieldInfoBox}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>Device Identifier</div>
                <div style={{ fontFamily: 'monospace', color: '#059669', marginTop: 2 }}>{inspectedScanner.kiosk_code}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
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

// Styles
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

const fieldInfoBox: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
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

export default ScannersTab;