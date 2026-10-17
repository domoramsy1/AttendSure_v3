/**
 * AttendSure - My Assigned Teaching Schedules & Classroom Attendance
 * File: frontend/src/components/tabs/MyAssignedClassesTab.tsx
 */

import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { BookOpen, Users, Clock, MapPin, User } from 'lucide-react';

interface StudentRosterItem {
  id: number;
  lrn: string;
  name: string;
  gender: string;
  photo_url?: string | null;
  attendance_status: string;
}

interface AssignedClass {
  schedule_id: number;
  section_id: number;
  section_name: string;
  grade_level: string;
  display_name: string;
  subject_code: string;
  subject_title: string;
  start_time: string;
  end_time: string;
  room_number?: string;
  total_students: number;
  students: StudentRosterItem[];
}

export const MyAssignedClassesTab: React.FC = () => {
  const [classes, setClasses] = useState<AssignedClass[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedClass, setSelectedClass] = useState<AssignedClass | null>(null);

  useEffect(() => {
    const fetchClasses = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get<AssignedClass[]>('/classroom/my-classes/');
        setClasses(res.data);
        if (res.data.length > 0) {
          setSelectedClass(res.data[0]);
        }
      } catch (err) {
        console.error('Failed to load assigned classes', err);
      } finally {
        setLoading(false);
      }
    };
    fetchClasses();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
        Loading your assigned classes...
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div
        style={{
          margin: 20,
          padding: 48,
          textAlign: 'center',
          backgroundColor: '#ffffff',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
        }}
      >
        <BookOpen size={48} color="#94a3b8" />
        <h3 style={{ fontSize: '1.10rem', fontWeight: 800, color: '#0f172a', marginTop: 12 }}>
          No Teaching Schedules Assigned
        </h3>
        <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 460, margin: '6px auto 0' }}>
          You do not have any teaching classes assigned to your profile for this active school year.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, padding: 16 }}>
      {/* 1. Left: List of Assigned Classes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
          My Teaching Load ({classes.length})
        </h3>

        {classes.map((cls) => {
          const isSelected = selectedClass?.schedule_id === cls.schedule_id;
          return (
            <div
              key={cls.schedule_id}
              onClick={() => setSelectedClass(cls)}
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                {cls.subject_title} ({cls.subject_code})
              </div>
              <div style={{ fontSize: '0.80rem', color: '#0284c7', fontWeight: 700, marginTop: 2 }}>
                {cls.display_name}
              </div>
              <div
                style={{
                  fontSize: '0.74rem',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 6,
                }}
              >
                <Clock size={12} /> {cls.start_time} - {cls.end_time} &bull; <MapPin size={12} />{' '}
                {cls.room_number || 'Room TBD'}
              </div>
            </div>
          );
        })}
      </div>

      {/* 2. Right: Enrolled Students in Selected Class */}
      {selectedClass && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 10,
            border: '1px solid #e2e8f0',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid #e2e8f0',
              paddingBottom: 14,
              marginBottom: 16,
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                {selectedClass.display_name} — {selectedClass.subject_title}
              </h2>
              <span style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 3, display: 'inline-block' }}>
                <Users size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {selectedClass.total_students} Enrolled Students
              </span>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '8px 10px' }}>Student Name</th>
                <th style={{ padding: '8px 10px' }}>LRN</th>
                <th style={{ padding: '8px 10px' }}>Sex</th>
                <th style={{ padding: '8px 10px' }}>Today's Status</th>
              </tr>
            </thead>
            <tbody>
              {selectedClass.students.map((st) => (
                <tr key={st.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {st.photo_url ? (
                      <img
                        src={st.photo_url}
                        alt={st.name}
                        style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          backgroundColor: '#f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <User size={16} color="#94a3b8" />
                      </div>
                    )}
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{st.name}</span>
                  </td>
                  <td style={{ padding: '10px', fontFamily: 'monospace', color: '#334155' }}>{st.lrn}</td>
                  <td style={{ padding: '10px', color: '#64748b' }}>{st.gender}</td>
                  <td style={{ padding: '10px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: 12,
                        fontSize: '0.70rem',
                        fontWeight: 700,
                        backgroundColor: st.attendance_status === 'PRESENT' ? '#ecfdf5' : '#f1f5f9',
                        color: st.attendance_status === 'PRESENT' ? '#059669' : '#64748b',
                      }}
                    >
                      {st.attendance_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MyAssignedClassesTab;