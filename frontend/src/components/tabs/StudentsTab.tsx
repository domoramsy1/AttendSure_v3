import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  Pencil,
  Trash2,
  Loader2,
  CreditCard,
  QrCode,
  Copy,
  Check,
  Phone,
  Printer,
  Upload,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';

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
  photo?: string | null;
  is_active: boolean;
}

export const StudentsTab: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [copiedLrn, setCopiedLrn] = useState<string | null>(null);
  const [badgeStudent, setBadgeStudent] = useState<Student | null>(null);
  const [imgErrorMap, setImgErrorMap] = useState<Record<string | number, boolean>>({});

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    lrn: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    sex: 'Male',
    parent_contact: '',
    rfid_uid: '',
    photo: null as string | null,
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

  // Real database counts
  const totalStudents = students.length;
  const totalBoys = students.filter((s) => s.sex === 'Male' || s.sex === 'M').length;
  const totalGirls = students.filter((s) => s.sex === 'Female' || s.sex === 'F').length;
  const pairedCards = students.filter((s) => Boolean(s.rfid_uid && s.rfid_uid.trim().length > 0)).length;
  const unpairedCards = totalStudents - pairedCards;

  const handleCopyLrn = (lrn: string) => {
    navigator.clipboard.writeText(lrn);
    setCopiedLrn(lrn);
    setTimeout(() => setCopiedLrn(null), 2000);
  };

  // Convert uploaded image to base64
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Photo must be less than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        photo: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleOpenCreate = () => {
    setEditingStudent(null);
    setFormData({
      lrn: '',
      first_name: '',
      middle_name: '',
      last_name: '',
      sex: 'Male',
      parent_contact: '',
      rfid_uid: '',
      photo: null,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      lrn: student.lrn || '',
      first_name: student.first_name || '',
      middle_name: student.middle_name || '',
      last_name: student.last_name || '',
      sex: student.sex === 'Female' || student.sex === 'F' ? 'Female' : 'Male',
      parent_contact: student.parent_contact || '',
      rfid_uid: student.rfid_uid || '',
      photo: student.photo || null,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // 1. Clean the payload before sending
      const payload: any = {
        lrn: formData.lrn.trim(),
        first_name: formData.first_name.trim(),
        middle_name: formData.middle_name.trim() || '',
        last_name: formData.last_name.trim(),
        sex: formData.sex === 'Female' ? 'Female' : 'Male',
        parent_contact: formData.parent_contact.trim() || '',
        // Send null if empty so unique constraint check succeeds
        rfid_uid: formData.rfid_uid && formData.rfid_uid.trim() !== '' ? formData.rfid_uid.trim() : null,
      };

      // 2. Only send photo if a new base64 picture was selected
      if (formData.photo && formData.photo.startsWith('data:image')) {
        payload.photo = formData.photo;
      }

      if (editingStudent) {
        // UPDATE (PUT)
        const res = await apiClient.put<Student>(`/students/${editingStudent.id}/`, payload);
        setStudents((prev) => prev.map((s) => (s.id === editingStudent.id ? res.data : s)));
      } else {
        // CREATE (POST)
        const res = await apiClient.post<Student>('/students/', payload);
        setStudents((prev) => [res.data, ...prev]);
      }

      setIsModalOpen(false);
    } catch (err: any) {
      const backendErrors = err.response?.data;
      if (backendErrors && typeof backendErrors === 'object') {
        const errorList = Object.entries(backendErrors)
          .map(([field, msg]) => `${field}: ${Array.isArray(msg) ? msg.join(', ') : msg}`)
          .join('\n');
        alert(`Could not save student:\n${errorList}`);
      } else {
        alert(err.response?.data?.detail || 'Failed to save student record.');
      }
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
    } catch {
      alert('Failed to delete student record.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      
      {/* 1. Quick Stats Header */}
      <div style={statsContainer}>
        <div style={statCard}>
          <div style={statLabel}>TOTAL STUDENTS</div>
          <div style={statValue}>{totalStudents}</div>
          <div style={statHelp}>Enrolled learners in database</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>GENDER RATIO</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: '1.40rem', fontWeight: 800, color: '#0284c7' }}>{totalBoys}</span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Boys</span>
            <span style={{ fontSize: '1.40rem', fontWeight: 800, color: '#ec4899', marginLeft: 6 }}>{totalGirls}</span>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Girls</span>
          </div>
          <div style={statHelp}>DepEd classroom balance</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>RFID CARDS PAIRED</div>
          <div style={{ fontSize: '1.40rem', fontWeight: 800, color: '#059669' }}>
            {pairedCards}
            <span style={{ fontSize: '0.80rem', color: '#94a3b8', fontWeight: 500 }}> / {totalStudents}</span>
          </div>
          <div style={statHelp}>Ready for gate card tap</div>
        </div>

        <div style={statCard}>
          <div style={statLabel}>NEEDS RFID CARD</div>
          <div style={{ fontSize: '1.40rem', fontWeight: 800, color: unpairedCards > 0 ? '#d97706' : '#059669' }}>
            {unpairedCards}
          </div>
          <div style={statHelp}>Learners without linked card</div>
        </div>
      </div>

      {/* 2. Main Table */}
      <ModuleTableLayout
        title="Student Management"
        subtitle="Manage master student records, photos, RFID cards, and gate passes."
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
          {
            header: 'Photo & Learner Name',
            render: (s) => {
              const hasPhoto = Boolean(s.photo && !s.photo.includes('default_avatar.png') && !imgErrorMap[s.id]);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={avatarStyle}>
                    {hasPhoto ? (
                      <img
                        src={s.photo!}
                        alt={s.full_name}
                        onError={() => setImgErrorMap((prev) => ({ ...prev, [s.id]: true }))}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span>
                        {s.first_name ? s.first_name.charAt(0).toUpperCase() : 'S'}
                        {s.last_name ? s.last_name.charAt(0).toUpperCase() : ''}
                      </span>
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.86rem' }}>
                      {s.full_name || `${s.last_name}, ${s.first_name}`}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontFamily: 'monospace' }}>
                        LRN: {s.lrn}
                      </span>
                      <button
                        onClick={() => handleCopyLrn(s.lrn)}
                        title="Copy LRN"
                        style={copyBtnStyle}
                        type="button"
                      >
                        {copiedLrn === s.lrn ? <Check size={11} color="#059669" /> : <Copy size={11} color="#94a3b8" />}
                      </button>
                      {copiedLrn === s.lrn && (
                        <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 700 }}>Copied!</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            },
          },
          {
            header: 'Sex',
            render: (s) => {
              const isMale = s.sex === 'Male' || s.sex === 'M';
              return (
                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    backgroundColor: isMale ? '#eff6ff' : '#fdf2f8',
                    color: isMale ? '#0284c7' : '#db2777',
                  }}
                >
                  {isMale ? 'Male' : 'Female'}
                </span>
              );
            },
          },
          {
            header: 'Section',
            render: (s) => (
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                }}
              >
                {s.current_section || 'Unassigned'}
              </span>
            ),
          },
          {
            header: 'Gate RFID Card',
            render: (s) =>
              s.rfid_uid ? (
                <div style={rfidChipStyle}>
                  <CreditCard size={12} color="#059669" />
                  <span>{s.rfid_uid}</span>
                </div>
              ) : (
                <div style={unlinkedChipStyle}>
                  <CreditCard size={12} color="#d97706" />
                  <span>No Card</span>
                </div>
              ),
          },
          {
            header: 'Parent Phone (SMS)',
            render: (s) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#334155' }}>
                <Phone size={12} color="#64748b" />
                <span>{s.parent_contact || '—'}</span>
              </div>
            ),
          },
          {
            header: 'Status',
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
                  onClick={() => setBadgeStudent(s)}
                  title="View Student Gate Pass & QR Badge"
                  style={iconActionBtn}
                  type="button"
                >
                  <QrCode size={13} color="#0284c7" />
                </button>
                <button
                  onClick={() => handleOpenEdit(s)}
                  title="Edit Student Information"
                  style={iconActionBtn}
                  type="button"
                >
                  <Pencil size={13} color="#475569" />
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  title="Delete Student"
                  style={{ ...iconActionBtn, backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}
                  type="button"
                >
                  <Trash2 size={13} color="#dc2626" />
                </button>
              </div>
            ),
          },
        ]}
      />

      {/* 3. Enroll / Edit Modal with Profile Photo Upload */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingStudent ? 'Edit Student Details' : 'Enroll New Student'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          
          {/* Profile Photo Uploader */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <div style={photoUploadBox}>
              {formData.photo ? (
                <img
                  src={formData.photo}
                  alt="Student Preview"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <Camera size={24} color="#94a3b8" />
              )}
            </div>
            <div>
              <label style={uploadPhotoBtn}>
                <Upload size={12} />
                <span>Upload Profile Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  style={{ display: 'none' }}
                />
              </label>
              <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 4 }}>
                Square photo recommended (JPG or PNG, max 2MB).
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Learner Reference Number (LRN) *</label>
            <input
              type="text"
              required
              maxLength={12}
              value={formData.lrn}
              onChange={(e) => setFormData({ ...formData, lrn: e.target.value })}
              style={inputStyle}
              placeholder="12-digit LRN (e.g. 128930491029)"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={inputStyle}
                placeholder="Juan"
              />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={inputStyle}
                placeholder="Dela Cruz"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Middle Name</label>
              <input
                type="text"
                value={formData.middle_name}
                onChange={(e) => setFormData({ ...formData, middle_name: e.target.value })}
                style={inputStyle}
                placeholder="Optional"
              />
            </div>
            <div>
              <label style={labelStyle}>Sex *</label>
              <select
                value={formData.sex}
                onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                style={inputStyle}
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Parent Contact Number (For Instant SMS)</label>
            <input
              type="text"
              placeholder="09171234567"
              value={formData.parent_contact}
              onChange={(e) => setFormData({ ...formData, parent_contact: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Assigned RFID Card UID</label>
            <input
              type="text"
              placeholder="Card UID (e.g. 8A3F29C1)"
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
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : null}
              {editingStudent ? 'Save Changes' : 'Enroll Student'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* 4. Student QR Pass Modal with Real Photo */}
      {badgeStudent && (
        <Modal
          isOpen={Boolean(badgeStudent)}
          onClose={() => setBadgeStudent(null)}
          title="Official Student ID Pass"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '10px 0' }}>
            <div
              style={{
                width: 290,
                backgroundColor: '#ffffff',
                border: '2px solid #0284c7',
                borderRadius: 12,
                padding: '16px 14px',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#0284c7', letterSpacing: '0.5px' }}>
                ATTENDSURE STUDENT PASS
              </div>
              <div style={{ fontSize: '0.58rem', color: '#64748b', marginBottom: 12 }}>
                Official Campus Entry Pass
              </div>

              {/* Student Real Photo on ID Card */}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  backgroundColor: '#f1f5f9',
                  border: '2px solid #0284c7',
                  overflow: 'hidden',
                  margin: '0 auto 10px auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {badgeStudent.photo && !badgeStudent.photo.includes('default_avatar.png') && !imgErrorMap[badgeStudent.id] ? (
                  <img
                    src={badgeStudent.photo}
                    alt={badgeStudent.full_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <ImageIcon size={28} color="#94a3b8" />
                )}
              </div>

              <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {badgeStudent.full_name || `${badgeStudent.first_name} ${badgeStudent.last_name}`}
              </div>

              <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#64748b', marginTop: 3 }}>
                Section: {badgeStudent.current_section || 'Unassigned'}
              </div>

              <div
                style={{
                  display: 'inline-block',
                  margin: '8px 0',
                  padding: '3px 8px',
                  backgroundColor: '#f1f5f9',
                  borderRadius: 6,
                  fontFamily: 'monospace',
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  color: '#0f172a',
                }}
              >
                LRN: {badgeStudent.lrn}
              </div>

              {/* Student QR Code */}
              <div
                style={{
                  margin: '8px auto',
                  padding: 6,
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  width: 110,
                  height: 110,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(badgeStudent.lrn)}`}
                  alt="Student QR Code"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>

              <div style={{ fontSize: '0.64rem', color: '#94a3b8', marginTop: 4 }}>
                RFID: <strong style={{ color: badgeStudent.rfid_uid ? '#059669' : '#d97706' }}>
                  {badgeStudent.rfid_uid || 'No Card Linked'}
                </strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, width: '100%', justifyContent: 'center' }}>
              <Button variant="secondary" size="md" type="button" onClick={() => setBadgeStudent(null)}>
                Close
              </Button>
              <Button variant="primary" size="md" type="button" onClick={() => window.print()}>
                <Printer size={15} style={{ marginRight: 6 }} />
                Print Student ID
              </Button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
};

// Styles
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

const avatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  backgroundColor: '#e0f2fe',
  color: '#0284c7',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 800,
  fontSize: '0.78rem',
  overflow: 'hidden',
  flexShrink: 0,
};

const photoUploadBox: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 8,
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const uploadPhotoBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '5px 10px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const copyBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: 1,
  display: 'flex',
  alignItems: 'center',
};

const rfidChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  borderRadius: 6,
  backgroundColor: '#ecfdf5',
  color: '#059669',
  fontSize: '0.70rem',
  fontWeight: 700,
  fontFamily: 'monospace',
  border: '1px solid #a7f3d0',
};

const unlinkedChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 8px',
  borderRadius: 6,
  backgroundColor: '#fffbeb',
  color: '#d97706',
  fontSize: '0.70rem',
  fontWeight: 600,
  border: '1px dashed #fcd34d',
};

const iconActionBtn: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  padding: '5px 7px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
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

export default StudentsTab;