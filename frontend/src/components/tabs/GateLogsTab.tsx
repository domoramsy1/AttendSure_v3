import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { 
  LogIn, 
  LogOut, 
  RefreshCw, 
  Radio, 
  QrCode, 
  GraduationCap, 
  Briefcase 
} from 'lucide-react';

interface GateLogEntry {
  log_id: string;
  person_type: 'STUDENT' | 'STAFF';
  identifier: string;
  name: string;
  direction: 'IN' | 'OUT';
  scan_method: string;
  kiosk_name: string;
  kiosk_code: string;
  scan_time: string;
  raw_time: string;
}

export const GateLogsTab: React.FC = () => {
  const [logs, setLogs] = useState<GateLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [personFilter, setPersonFilter] = useState<'ALL' | 'STUDENT' | 'STAFF'>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = useCallback(async () => {
    try {
      setError(null);
      const res = await apiClient.get<GateLogEntry[]>('/gate/logs/', {
        params: {
          person_type: personFilter,
          direction: directionFilter,
          q: search,
        },
      });
      setLogs(res.data);
    } catch (err: any) {
      setError('Unable to load gate scanner transactions.');
    } finally {
      setLoading(false);
    }
  }, [personFilter, directionFilter, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchLogs();
    }, 6000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogs]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Live Stream Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 24px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '0.78rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#059669', fontWeight: 700 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981',
              }}
            />
            <span>Gate Scanner Stream Active</span>
          </div>

          <div style={{ color: '#94a3b8' }}>|</div>

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
              Faculty
            </button>
          </div>

          <div style={{ color: '#94a3b8' }}>|</div>

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

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span>Auto-poll (6s)</span>
          </label>

          <button
            onClick={() => fetchLogs()}
            title="Refresh logs"
            style={{
              padding: '4px 8px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ModuleTableLayout
          title="Gate Logs"
          subtitle="Real-time audit ledger of RFID taps and QR scans at campus gate scanner kiosks."
          searchPlaceholder="Search by name, LRN, or Employee ID..."
          searchValue={search}
          onSearchChange={setSearch}
          loading={loading}
          error={error}
          data={logs}
          keyExtractor={(item) => item.log_id}
          columns={[
            {
              header: 'Timestamp',
              render: (item) => (
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>
                  {item.scan_time}
                </span>
              ),
            },
            {
              header: 'Person Type',
              render: (item) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 8px',
                    borderRadius: 12,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    backgroundColor: item.person_type === 'STUDENT' ? '#e0f2fe' : '#f3e8ff',
                    color: item.person_type === 'STUDENT' ? '#0369a1' : '#7e22ce',
                  }}
                >
                  {item.person_type === 'STUDENT' ? <GraduationCap size={13} /> : <Briefcase size={13} />}
                  {item.person_type}
                </span>
              ),
            },
            {
              header: 'Identifier',
              render: (item) => (
                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                  {item.identifier}
                </span>
              ),
            },
            {
              header: 'Individual Name',
              render: (item) => (
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.name}</span>
              ),
            },
            {
              header: 'Direction',
              render: (item) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    backgroundColor: item.direction === 'IN' ? '#ecfdf5' : '#fef3c7',
                    color: item.direction === 'IN' ? '#059669' : '#b45309',
                    border: `1px solid ${item.direction === 'IN' ? '#a7f3d0' : '#fde68a'}`,
                  }}
                >
                  {item.direction === 'IN' ? <LogIn size={13} /> : <LogOut size={13} />}
                  {item.direction}
                </span>
              ),
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
                    fontWeight: 600,
                    color: '#64748b',
                  }}
                >
                  {item.scan_method === 'RFID' ? <Radio size={13} color="#0284c7" /> : <QrCode size={13} color="#10b981" />}
                  {item.scan_method}
                </span>
              ),
            },
            {
              header: 'Scanner Kiosk',
              render: (item) => (
                <span style={{ fontSize: '0.78rem', color: '#475569' }}>
                  {item.kiosk_name} <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>({item.kiosk_code})</span>
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
};

const filterTabStyle = (active: boolean): React.CSSProperties => ({
  border: 'none',
  padding: '3px 8px',
  borderRadius: 4,
  fontSize: '0.72rem',
  fontWeight: active ? 700 : 500,
  backgroundColor: active ? '#0284c7' : 'transparent',
  color: active ? '#ffffff' : '#64748b',
  cursor: 'pointer',
  transition: 'all 0.15s ease',
});