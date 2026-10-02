import React, { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { ModuleTableLayout } from './ModuleTableLayout';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { 
  Clock, 
  MapPin, 
  UserCheck, 
  Pencil, 
  Trash2, 
  Loader2, 
  BookOpen, 
  Filter 
} from 'lucide-react';

interface ScheduleItem {
  id: number;
  schedule_id: string;
  section: number;
  section_name: string;
  grade_level_name: string;
  subject: number;
  subject_code: string;
  subject_title: string;
  teacher: number | null;
  teacher_name: string;
  room_number: string;
  start_time: string;
  end_time: string;
  time_slot: string;
}

interface DropdownItem {
  id: number;
  label: string;
}

export const SchedulesTab: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('ALL');

  // Dropdown master records for creation modal
  const [sections, setSections] = useState<DropdownItem[]>([]);
  const [subjects, setSubjects] = useState<DropdownItem[]>([]);
  const [teachers, setTeachers] = useState<DropdownItem[]>([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    section: '',
    subject: '',
    teacher: '',
    room_number: '',
    start_time: '07:30',
    end_time: '08:30',
  });

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<ScheduleItem[]>('/schedules/');
      setSchedules(res.data);
    } catch (err: any) {
      setError('Unable to load class timetables.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDropdownDependencies = async () => {
    try {
      const [secRes, subRes, teachRes] = await Promise.all([
        apiClient.get<any[]>('/sections/'),
        apiClient.get<any[]>('/subjects/'),
        apiClient.get<any[]>('/teachers/'),
      ]);

      setSections(
        secRes.data.map((s) => ({
          id: s.id,
          label: s.display_label || `${s.grade_level || 'Grade'} - ${s.name}`,
        }))
      );
      setSubjects(
        subRes.data.map((sub) => ({
          id: sub.id,
          label: `${sub.code} - ${sub.title}`,
        }))
      );
      setTeachers(
        teachRes.data.map((t) => ({
          id: t.id,
          label: `${t.last_name}, ${t.first_name} (${t.position || 'Faculty'})`,
        }))
      );
    } catch (err) {
      console.error('Failed to load schedule dependencies:', err);
    }
  };

  useEffect(() => {
    fetchSchedules();
    fetchDropdownDependencies();
  }, [fetchSchedules]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormData({
      section: sections[0]?.id ? String(sections[0].id) : '',
      subject: subjects[0]?.id ? String(subjects[0].id) : '',
      teacher: '',
      room_number: 'Room 101',
      start_time: '07:30',
      end_time: '08:30',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item: ScheduleItem) => {
    setEditingItem(item);
    setFormData({
      section: String(item.section),
      subject: String(item.subject),
      teacher: item.teacher ? String(item.teacher) : '',
      room_number: item.room_number || '',
      start_time: item.start_time ? item.start_time.substring(0, 5) : '07:30',
      end_time: item.end_time ? item.end_time.substring(0, 5) : '08:30',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload: any = {
        section: Number(formData.section),
        subject: Number(formData.subject),
        room_number: formData.room_number,
        start_time: formData.start_time.length === 5 ? `${formData.start_time}:00` : formData.start_time,
        end_time: formData.end_time.length === 5 ? `${formData.end_time}:00` : formData.end_time,
        teacher: formData.teacher ? Number(formData.teacher) : null,
      };

      if (editingItem) {
        const res = await apiClient.put<ScheduleItem>(`/schedules/${editingItem.id}/`, payload);
        setSchedules((prev) => prev.map((s) => (s.id === editingItem.id ? res.data : s)));
      } else {
        const res = await apiClient.post<ScheduleItem>('/schedules/', payload);
        setSchedules((prev) => [res.data, ...prev]);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to save class schedule period.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (item: ScheduleItem) => {
    if (!window.confirm(`Delete class period ${item.schedule_id} (${item.subject_title})?`)) return;
    try {
      await apiClient.delete(`/schedules/${item.id}/`);
      setSchedules((prev) => prev.filter((s) => s.id !== item.id));
    } catch (err) {
      alert('Unable to delete class schedule period.');
    }
  };

  const filtered = schedules.filter((s) => {
    const matchesSearch =
      s.schedule_id.toLowerCase().includes(search.toLowerCase()) ||
      s.section_name.toLowerCase().includes(search.toLowerCase()) ||
      s.subject_title.toLowerCase().includes(search.toLowerCase()) ||
      s.subject_code.toLowerCase().includes(search.toLowerCase()) ||
      s.teacher_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.room_number && s.room_number.toLowerCase().includes(search.toLowerCase()));

    const matchesSection = selectedSectionFilter === 'ALL' || String(s.section) === selectedSectionFilter;
    return matchesSearch && matchesSection;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Top Filter Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 24px',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          fontSize: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0284c7', fontWeight: 700 }}>
            <Filter size={15} />
            <span>Filter Section:</span>
          </div>

          <select
            value={selectedSectionFilter}
            onChange={(e) => setSelectedSectionFilter(e.target.value)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid #cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#334155',
              backgroundColor: '#f8fafc',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="ALL">All Sections ({schedules.length} periods)</option>
            {sections.map((sec) => (
              <option key={sec.id} value={String(sec.id)}>
                {sec.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
          Displaying <strong>{filtered.length}</strong> of <strong>{schedules.length}</strong> timetable slots
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ModuleTableLayout
          title="Classes, Sections & Schedules"
          subtitle="Manage academic section timetables, subject room assignments, and assigned faculty."
          searchPlaceholder="Search by section, subject code, teacher, or room..."
          searchValue={search}
          onSearchChange={setSearch}
          addButtonLabel="Add Schedule Period"
          onAdd={handleOpenCreate}
          loading={loading}
          error={error}
          data={filtered}
          keyExtractor={(s) => s.id}
          columns={[
            {
              header: 'Code',
              render: (s) => (
                <span style={{ fontFamily: 'monospace', fontWeight: 800, color: '#0284c7' }}>
                  {s.schedule_id}
                </span>
              ),
            },
            {
              header: 'Section',
              render: (s) => (
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{s.section_name}</div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.grade_level_name}</div>
                </div>
              ),
            },
            {
              header: 'Subject / Course',
              render: (s) => (
                <div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontWeight: 700,
                      color: '#1e293b',
                    }}
                  >
                    <BookOpen size={13} color="#0284c7" />
                    {s.subject_code}
                  </span>
                  <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{s.subject_title}</div>
                </div>
              ),
            },
            {
              header: 'Assigned Faculty',
              render: (s) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: s.teacher ? '#334155' : '#94a3b8',
                  }}
                >
                  <UserCheck size={13} color={s.teacher ? '#059669' : '#cbd5e1'} />
                  {s.teacher_name}
                </span>
              ),
            },
            {
              header: 'Time Period',
              render: (s) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    backgroundColor: '#f1f5f9',
                    color: '#334155',
                  }}
                >
                  <Clock size={12} color="#64748b" />
                  {s.time_slot}
                </span>
              ),
            },
            {
              header: 'Room',
              render: (s) => (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: '0.74rem',
                    color: '#475569',
                    fontWeight: 500,
                  }}
                >
                  <MapPin size={12} color="#94a3b8" />
                  {s.room_number || 'TBD'}
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
                    title="Edit Schedule"
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      padding: 5,
                      cursor: 'pointer',
                      color: '#0284c7',
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    title="Delete Schedule"
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fee2e2',
                      borderRadius: 6,
                      padding: 5,
                      cursor: 'pointer',
                      color: '#dc2626',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ),
            },
          ]}
        />
      </div>

      {/* Modal Dialog for Create & Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingItem ? `Edit Period: ${editingItem.schedule_id}` : 'Create Schedule Period'}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Target Section *</label>
            <select
              required
              value={formData.section}
              onChange={(e) => setFormData({ ...formData, section: e.target.value })}
              style={inputStyle}
            >
              <option value="">Select Section...</option>
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id}>
                  {sec.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Subject / Course *</label>
            <select
              required
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              style={inputStyle}
            >
              <option value="">Select Subject...</option>
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Assigned Faculty Teacher</label>
            <select
              value={formData.teacher}
              onChange={(e) => setFormData({ ...formData, teacher: e.target.value })}
              style={inputStyle}
            >
              <option value="">Unassigned (TBA)</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Classroom / Room Assignment</label>
            <input
              type="text"
              placeholder="e.g. Bldg A - Rm 101, Science Lab"
              value={formData.room_number}
              onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Start Time *</label>
              <input
                type="time"
                required
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>End Time *</label>
              <input
                type="time"
                required
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <Button variant="secondary" size="md" type="button" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" size={15} style={{ marginRight: 6 }} />}
              {editingItem ? 'Save Changes' : 'Create Schedule'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: '#334155',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #cbd5e1',
  fontSize: '0.85rem',
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: '#ffffff',
};