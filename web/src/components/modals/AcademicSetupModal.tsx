/**
 * AttendSure - Academic Structure Setup Modal
 * File: web/src/components/modals/AcademicSetupModal.tsx
 */

import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useTheme } from '../../context/ThemeContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Calendar,
  BookOpen,
  DoorOpen,
  Layers,
  Loader2,
  AlertCircle,
  Trash2,
} from 'lucide-react';

export type TabType =
  | 'YEARS'
  | 'GRADES'
  | 'ROOMS'
  | 'SUBJECTS'
  | 'SECTIONS'
  | 'SCHEDULE'
  | 'SECTION'
  | 'ROOM'
  | 'SUBJECT';

export interface AcademicSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onSuccess?: () => void;
  initialTab?: TabType;
  editItem?: any;
}

const normalizeTab = (tab: TabType): 'YEARS' | 'GRADES' | 'ROOMS' | 'SUBJECTS' => {
  if (tab === 'ROOM' || tab === 'ROOMS') return 'ROOMS';
  if (tab === 'SUBJECT' || tab === 'SUBJECTS') return 'SUBJECTS';
  if (tab === 'GRADES') return 'GRADES';
  return 'YEARS';
};

export const AcademicSetupModal: React.FC<AcademicSetupModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  onSuccess,
  initialTab = 'YEARS',
}) => {
  const { tokens, brand } = useTheme();

  const [activeSubTab, setActiveSubTab] = useState<'YEARS' | 'GRADES' | 'ROOMS' | 'SUBJECTS'>(
    normalizeTab(initialTab)
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [years, setYears] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);

  const [formInput, setFormInput] = useState({
    code: '',
    name: '',
    building: '',
    capacity: 45,
    title: '',
    units: 1,
  });

  useEffect(() => {
    if (initialTab) {
      setActiveSubTab(normalizeTab(initialTab));
    }
  }, [initialTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [yRes, gRes, rRes, sRes] = await Promise.all([
        apiClient.get('/academic-years/').catch(() => ({ data: [] })),
        apiClient.get('/grade-levels/').catch(() => ({ data: [] })),
        apiClient.get('/rooms/').catch(() => ({ data: [] })),
        apiClient.get('/subjects/').catch(() => ({ data: [] })),
      ]);

      setYears(Array.isArray(yRes.data) ? yRes.data : yRes.data?.results || []);
      setGrades(Array.isArray(gRes.data) ? gRes.data : gRes.data?.results || []);
      setRooms(Array.isArray(rRes.data) ? rRes.data : rRes.data?.results || []);
      setSubjects(Array.isArray(sRes.data) ? sRes.data : sRes.data?.results || []);
    } catch {
      setError('Could not fetch academic records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (activeSubTab === 'ROOMS') {
        await apiClient.post('/rooms/', {
          name: formInput.name.trim(),
          building: formInput.building.trim(),
          capacity: Number(formInput.capacity) || 45,
        });
      } else if (activeSubTab === 'SUBJECTS') {
        await apiClient.post('/subjects/', {
          code: formInput.code.trim().toUpperCase(),
          title: formInput.title.trim(),
          units: Number(formInput.units) || 1,
        });
      } else if (activeSubTab === 'GRADES') {
        await apiClient.post('/grade-levels/', {
          code: formInput.code.trim().toUpperCase(),
          name: formInput.name.trim(),
        });
      }

      setFormInput({ code: '', name: '', building: '', capacity: 45, title: '', units: 1 });
      loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save new record.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteItem = async (endpoint: string, id: number) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await apiClient.delete(`/${endpoint}/${id}/`);
      loadData();
      if (onUpdated) onUpdated();
      if (onSuccess) onSuccess();
    } catch {
      alert('Could not delete record.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Academic Structure Setup">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, borderBottom: `1px solid ${tokens.borderSubtle}`, paddingBottom: 8, overflowX: 'auto' }}>
          <button
            type="button"
            onClick={() => setActiveSubTab('YEARS')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: activeSubTab === 'YEARS' ? tokens.primaryLight : 'transparent',
              color: activeSubTab === 'YEARS' ? brand.primary : tokens.textSecondary,
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Calendar size={14} /> School Years
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('GRADES')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: activeSubTab === 'GRADES' ? tokens.primaryLight : 'transparent',
              color: activeSubTab === 'GRADES' ? brand.primary : tokens.textSecondary,
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Layers size={14} /> Grade Levels
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ROOMS')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: activeSubTab === 'ROOMS' ? tokens.primaryLight : 'transparent',
              color: activeSubTab === 'ROOMS' ? brand.primary : tokens.textSecondary,
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <DoorOpen size={14} /> Classrooms
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('SUBJECTS')}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              backgroundColor: activeSubTab === 'SUBJECTS' ? tokens.primaryLight : 'transparent',
              color: activeSubTab === 'SUBJECTS' ? brand.primary : tokens.textSecondary,
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <BookOpen size={14} /> Subjects
          </button>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 6,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: brand.danger,
              fontSize: '0.78rem',
            }}
          >
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {activeSubTab !== 'YEARS' && (
          <form onSubmit={handleAddItem} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {activeSubTab === 'ROOMS' && (
              <>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ display: 'block', fontSize: '0.70rem', color: tokens.textSecondary, marginBottom: 2 }}>
                    Room Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Room 101"
                    value={formInput.name}
                    onChange={(e) => setFormInput({ ...formInput, name: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ display: 'block', fontSize: '0.70rem', color: tokens.textSecondary, marginBottom: 2 }}>
                    Building
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Science Wing"
                    value={formInput.building}
                    onChange={(e) => setFormInput({ ...formInput, building: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary }}
                  />
                </div>
              </>
            )}

            {activeSubTab === 'GRADES' && (
              <>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label style={{ display: 'block', fontSize: '0.70rem', color: tokens.textSecondary, marginBottom: 2 }}>
                    Grade Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. G7"
                    value={formInput.code}
                    onChange={(e) => setFormInput({ ...formInput, code: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary }}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 140 }}>
                  <label style={{ display: 'block', fontSize: '0.70rem', color: tokens.textSecondary, marginBottom: 2 }}>
                    Grade Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Grade 7"
                    value={formInput.name}
                    onChange={(e) => setFormInput({ ...formInput, name: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary }}
                  />
                </div>
              </>
            )}

            {activeSubTab === 'SUBJECTS' && (
              <>
                <div style={{ flex: 1, minWidth: 100 }}>
                  <label style={{ display: 'block', fontSize: '0.70rem', color: tokens.textSecondary, marginBottom: 2 }}>
                    Subject Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MATH7"
                    value={formInput.code}
                    onChange={(e) => setFormInput({ ...formInput, code: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary }}
                  />
                </div>
                <div style={{ flex: 2, minWidth: 140 }}>
                  <label style={{ display: 'block', fontSize: '0.70rem', color: tokens.textSecondary, marginBottom: 2 }}>
                    Subject Title
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mathematics 7"
                    value={formInput.title}
                    onChange={(e) => setFormInput({ ...formInput, title: e.target.value })}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: `1px solid ${tokens.borderStrong}`, backgroundColor: tokens.bgSurface, color: tokens.textPrimary }}
                  />
                </div>
              </>
            )}

            <Button variant="primary" size="sm" type="submit" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={14} /> : 'Add Record'}
            </Button>
          </form>
        )}

        <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${tokens.borderSubtle}`, borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${tokens.borderSubtle}`, backgroundColor: tokens.bgSurfaceSubtle }}>
                <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Item Name / Code</th>
                <th style={{ padding: '8px 10px', color: tokens.textMuted }}>Details</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', color: tokens.textMuted }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {activeSubTab === 'YEARS' &&
                years.map((y) => (
                  <tr key={y.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{y.code}</td>
                    <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                      {y.is_active ? (
                        <span style={{ color: brand.success, fontWeight: 700 }}>Active School Year</span>
                      ) : (
                        'Archived'
                      )}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <span style={{ fontSize: '0.70rem', color: tokens.textMuted }}>Locked</span>
                    </td>
                  </tr>
                ))}

              {activeSubTab === 'GRADES' &&
                grades.map((g) => (
                  <tr key={g.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{g.code}</td>
                    <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>{g.name}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('grade-levels', g.id)}
                        style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

              {activeSubTab === 'ROOMS' &&
                rooms.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{r.name}</td>
                    <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>
                      {r.building ? `${r.building} • ` : ''}Cap: {r.capacity}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('rooms', r.id)}
                        style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}

              {activeSubTab === 'SUBJECTS' &&
                subjects.map((s) => (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${tokens.borderSubtle}` }}>
                    <td style={{ padding: '8px 10px', fontWeight: 700, color: tokens.textPrimary }}>{s.code}</td>
                    <td style={{ padding: '8px 10px', color: tokens.textSecondary }}>{s.title}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('subjects', s.id)}
                        style={{ background: 'none', border: 'none', color: brand.danger, cursor: 'pointer' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default AcademicSetupModal;