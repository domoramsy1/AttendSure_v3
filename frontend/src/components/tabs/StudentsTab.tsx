import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Pencil, Trash2, Loader2 } from 'lucide-react';

interface Student {
  id: number;
  lrn: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  sex: string;
  parent_contact: string;
  rfid_uid?: string;
  current_section?: string;
  is_active: boolean;
}

export const StudentsTab: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    sex: 'M',
    parent_contact: '',
    rfid_uid: '',
  });

  const fetchStudents = useCallback(async (query = '') => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<Student[]>(`/students/?search=${encodeURIComponent(query)}`);
      setStudents(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load students.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => fetchStudents(search), 300);
    return () => clearTimeout(timeout);
  }, [search, fetchStudents]);

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setFormData({
      lrn: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      sex: 'M',
      parent_contact: '',
      rfid_uid: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      lrn: student.lrn,
      first_name: student.first_name,
      middle_name: student.middle_name || '',
      last_name: student.last_name,
      sex: student.sex,
      parent_contact: student.parent_contact || '',
      rfid_uid: student.rfid_uid || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingStudent) {
        // UPDATE (PUT)
        const res = await apiClient.put<Student>(`/students/${editingStudent.id}/`, formData);
        setStudents((prev) => prev.map((s) => (s.id === editingStudent.id ? res.data : s)));
      } else {
        // CREATE (POST)
        const res = await apiClient.post<Student>('/students/', formData);
        setStudents((prev) => [res.data, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save student record.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (student: Student) => {
    if (!window.confirm(`Are you sure you want to delete student "${student.full_name}" (LRN: ${student.lrn})?`)) {
      return;
    }
    try {
      await apiClient.delete(`/students/${student.id}/`);
      setStudents((prev) => prev.filter((s) => s.id !== student.id));
    } catch (err: any) {
      alert('Failed to delete student record.');
    }
  };

  return (
    <>
      <ModuleTableLayout
        title="Student Management"
        subtitle="Full CRUD management over officially enrolled learners."
        searchPlaceholder="Search by LRN or Name..."
        searchValue={search}
        onSearchChange={setSearch}
        addButtonLabel="Enroll Student"
        onAdd={handleOpenCreate}
        loading={loading}
        error={error}
        data={students}
        keyExtractor={(s) => s.id}
        columns={[
          { header: 'LRN', render: (s) => <span style={{ fontWeight: 700 }}>{s.lrn}</span> },
          { header: 'Learner Name', render: (s) => s.full_name },
          { header: 'Sex', render: (s) => (s.sex === 'M' ? 'Male' : 'Female') },
          { header: 'Section', render: (s) => s.current_section || 'Unassigned' },
          { header: 'Parent Contact', render: (s) => s.parent_contact || '—' },
          {
            header: 'Status',
            render: (s) => (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 12,
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  backgroundColor: s.is_active ? '#ecfdf5' : '#fef2f2',
                  color: s.is_active ? '#059669' : '#dc2626',
                }}
              >
                {s.is_active ? 'ACTIVE' : 'INACTIVE'}
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
                  title="Edit Student"
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
                  title="Delete Student"
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

      {/* CRUD Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? 'Edit Student Details' : 'Enroll New Student'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Learner Reference Number (LRN) *
            </label>
            <input
              type="text"
              required
              maxLength={12}
              value={formData.lrn}
              onChange={(e) => setFormData({ ...formData, lrn: e.target.value })}
              style={inputStyle}
              placeholder="e.g. 128930491029"
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
                Middle Name
              </label>
              <input
                type="text"
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
                Sex *
              </label>
              <select
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                style={inputStyle}
              >
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Parent Contact Number (for SMS Alerts)
            </label>
            <input
              type="text"
              placeholder="09171234567"
              value={formData.parent_contact}
              onChange={(e) => setFormData({ ...formData, parent_contact: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>
              Assigned RFID Card UID
            </label>
            <input
              type="text"
              placeholder="Hexadecimal UID (e.g. 8A3F29C1)"
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
              {editingStudent ? 'Save Changes' : 'Enroll Student'}
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