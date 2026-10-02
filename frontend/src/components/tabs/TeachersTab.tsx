import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

interface Teacher {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  department: string;
  contact_number?: string;
  rfid_uid?: string;
  is_active: boolean;
}

export const TeachersTab: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // CRUD Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    employee_id: '',
    first_name: '',
    last_name: '',
    position: 'Teacher I',
    department: 'Junior High School',
    contact_number: '',
    rfid_uid: '',
  });

  const fetchTeachers = useCallback(async (query = '') => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<Teacher[]>(`/teachers/?search=${encodeURIComponent(query)}`);
      setTeachers(res.data);
    } catch (err: any) {
      setError('Failed to fetch faculty records.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchTeachers(search), 300);
    return () => clearTimeout(timeout);
  }, [search, fetchTeachers]);

  const handleOpenCreate = () => {
    setEditingTeacher(null);
    setFormData({
      employee_id: '',
      first_name: '',
      last_name: '',
      position: 'Teacher I',
      department: 'Junior High School',
      contact_number: '',
      rfid_uid: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setFormData({
      employee_id: teacher.employee_id,
      first_name: teacher.first_name,
      last_name: teacher.last_name,
      position: teacher.position || 'Teacher I',
      department: teacher.department || 'Junior High School',
      contact_number: teacher.contact_number || '',
      rfid_uid: teacher.rfid_uid || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingTeacher) {
        const res = await apiClient.put<Teacher>(`/teachers/${editingTeacher.id}/`, formData);
        setTeachers((prev) => prev.map((t) => (t.id === editingTeacher.id ? res.data : t)));
      } else {
        const res = await apiClient.post<Teacher>('/teachers/', formData);
        setTeachers((prev) => [res.data, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save faculty record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (teacher: Teacher) => {
    if (!window.confirm(`Delete faculty record for ${teacher.full_name}?`)) return;
    try {
      await apiClient.delete(`/teachers/${teacher.id}/`);
      setTeachers((prev) => prev.filter((t) => t.id !== teacher.id));
    } catch (err) {
      alert('Failed to delete faculty member.');
    }
  };

  return (
    <>
      <ModuleTableLayout
        title="Faculty Directory"
        subtitle="Full CRUD management over teaching faculty and staff."
        searchPlaceholder="Search by Employee ID or Name..."
        searchValue={search}
        onSearchChange={setSearch}
        addButtonLabel="Add Faculty"
        onAdd={handleOpenCreate}
        loading={loading}
        error={error}
        data={teachers}
        keyExtractor={(t) => t.id}
        columns={[
          { header: 'Employee ID', render: (t) => <span style={{ fontWeight: 700 }}>{t.employee_id}</span> },
          { header: 'Faculty Name', render: (t) => t.full_name },
          { header: 'Position', render: (t) => t.position },
          { header: 'Department', render: (t) => t.department },
          {
            header: 'Status',
            render: (t) => (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: t.is_active ? '#ecfdf5' : '#fef2f2',
                  color: t.is_active ? '#059669' : '#dc2626',
                }}
              >
                {t.is_active ? 'ACTIVE' : 'INACTIVE'}
              </span>
            ),
          },
          {
            header: 'Actions',
            align: 'right',
            render: (t) => (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => handleOpenEdit(t)}
                  title="Edit Teacher"
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
                  onClick={() => handleDelete(t)}
                  title="Delete Teacher"
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
        title={editingTeacher ? 'Edit Faculty Record' : 'Register New Faculty'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Employee ID *
            </label>
            <input
              type="text"
              required
              value={formData.employee_id}
              onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
              style={inputStyle}
              placeholder="e.g. EMP-2026-004"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                First Name *
              </label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                Last Name *
              </label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                Position Title
              </label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                Department
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Contact Number
            </label>
            <input
              type="text"
              placeholder="09171234567"
              value={formData.contact_number}
              onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Assigned Faculty RFID UID
            </label>
            <input
              type="text"
              placeholder="Hexadecimal UID"
              value={formData.rfid_uid}
              onChange={(e) => setFormData({ ...formData, rfid_uid: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} /> : null}
              {editingTeacher ? 'Save Changes' : 'Add Faculty'}
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