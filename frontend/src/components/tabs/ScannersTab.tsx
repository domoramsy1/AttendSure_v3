import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

interface Scanner {
  id: number;
  kiosk_code: string;
  terminal_name: string;
  location: string;
  is_online: boolean;
  is_active: boolean;
  last_ping?: string;
}

export const ScannersTab: React.FC = () => {
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScanner, setEditingScanner] = useState<Scanner | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    kiosk_code: '',
    terminal_name: '',
    location: '',
    secret_hash: '',
  });

  const fetchScanners = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<Scanner[]>('/scanners/');
      setScanners(res.data);
    } catch (err: any) {
      setError('Failed to fetch hardware terminals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchScanners();
  }, [fetchScanners]);

  const handleOpenCreate = () => {
    setEditingScanner(null);
    setFormData({ kiosk_code: '', terminal_name: '', location: '', secret_hash: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (scanner: Scanner) => {
    setEditingScanner(scanner);
    setFormData({
      kiosk_code: scanner.kiosk_code,
      terminal_name: scanner.terminal_name,
      location: scanner.location,
      secret_hash: '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingScanner) {
        const payload = formData.secret_hash ? formData : {
          kiosk_code: formData.kiosk_code,
          terminal_name: formData.terminal_name,
          location: formData.location
        };
        const res = await apiClient.put<Scanner>(`/scanners/${editingScanner.id}/`, payload);
        setScanners((prev) => prev.map((s) => (s.id === editingScanner.id ? res.data : s)));
      } else {
        const res = await apiClient.post<Scanner>('/scanners/', formData);
        setScanners((prev) => [...prev, res.data]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save terminal configuration.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scanner: Scanner) => {
    if (!window.confirm(`De-register hardware node ${scanner.kiosk_code}?`)) return;
    try {
      await apiClient.delete(`/scanners/${scanner.id}/`);
      setScanners((prev) => prev.filter((s) => s.id !== scanner.id));
    } catch (err) {
      alert('Failed to remove scanner terminal.');
    }
  };

  const filtered = scanners.filter((s) =>
    s.kiosk_code.toLowerCase().includes(search.toLowerCase()) ||
    s.terminal_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <ModuleTableLayout
        title="Gate Scanners & Kiosks"
        subtitle="Manage paired Raspberry Pi and ESP32 turnstile terminals."
        searchPlaceholder="Search terminal..."
        searchValue={search}
        onSearchChange={setSearch}
        addButtonLabel="Register Terminal"
        onAdd={handleOpenCreate}
        loading={loading}
        error={error}
        data={filtered}
        keyExtractor={(s) => s.id}
        columns={[
          { header: 'Terminal Code', render: (s) => <span style={{ fontWeight: 700 }}>{s.kiosk_code}</span> },
          { header: 'Name', render: (s) => s.terminal_name },
          { header: 'Placement', render: (s) => s.location },
          {
            header: 'Health',
            render: (s) => (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: s.is_online ? '#ecfdf5' : '#fef2f2',
                  color: s.is_online ? '#059669' : '#dc2626',
                }}
              >
                {s.is_online ? 'ONLINE' : 'OFFLINE'}
              </span>
            ),
          },
          {
            header: 'Actions',
            align: 'right',
            render: (s) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleOpenEdit(s)}
                  title="Edit Terminal"
                  style={{
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    padding: 5,
                    cursor: 'pointer',
                    color: '#0284c7',
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  title="Remove Terminal"
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #fee2e2',
                    borderRadius: 6,
                    padding: 5,
                    cursor: 'pointer',
                    color: '#dc2626',
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ),
          },
        ]}
      />

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingScanner ? 'Edit Kiosk Configuration' : 'Register New Kiosk Node'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Kiosk Code Identifier *
            </label>
            <input
              type="text"
              required
              placeholder="KIOSK-GATE-01"
              value={formData.kiosk_code}
              onChange={(e) => setFormData({ ...formData, kiosk_code: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Terminal Name *
            </label>
            <input
              type="text"
              required
              placeholder="Main Gate Turnstile A"
              value={formData.terminal_name}
              onChange={(e) => setFormData({ ...formData, terminal_name: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Placement Location
            </label>
            <input
              type="text"
              placeholder="Main Gate East Entrance"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              API Secret Key {editingScanner ? '(Leave blank to keep current)' : '*'}
            </label>
            <input
              type="password"
              required={!editingScanner}
              placeholder="Pre-shared hardware key"
              value={formData.secret_hash}
              onChange={(e) => setFormData({ ...formData, secret_hash: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              {editingScanner ? 'Save Changes' : 'Register Node'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.85rem',
  outline: 'none',
  boxSizing: 'border-box',
};