/**
 * AttendSure V3 - School Profile & Administration Settings
 * File: frontend/src/components/tabs/SettingsTab.tsx
 *
 * Branding Structure:
 * 1. SCHOOL PROFILE PHOTO (school_logo): Main institutional avatar for sidebar, header & gate passes.
 * 2. REPORT SEALS (left_logo & right_logo): Dual seals for official DepEd report letterheads (SF1, SF2, SF4).
 * 3. VIEWPORT & SCROLL REPAIR: Clean top-aligned scrolling container prevents card clipping.
 */

import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/client';
import { useSchool } from '../../context/SchoolContext';
import { useAlert } from '../../context/AlertContext';
import { Button } from '../ui/Button';
import {
  Building2,
  UserCheck,
  Save,
  Loader2,
  Upload,
  Trash2,
  ShieldCheck,
  User,
  Image as ImageIcon,
} from 'lucide-react';

interface FacultyOption {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  position: string;
  department: string;
  photo_url?: string | null;
}

export const SettingsTab: React.FC = () => {
  const { refreshSchool } = useSchool();
  const { showAlert } = useAlert();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [facultyList, setFacultyList] = useState<FacultyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [formData, setFormData] = useState({
    school_id: '',
    school_name: '',
    region: '',
    division: '',
    district: '',
    address: '',
    contact_number: '',
    email: '',
    principal_faculty: '' as string | number,
    principal_name: '',
    principal_title: '',
    school_logo: '' as string | null,
    left_logo: '' as string | null,
    right_logo: '' as string | null,
    latitude: 8.4858,
    longitude: 124.6567,
    geofence_radius_meters: 150,
  });

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, []);

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const [schoolRes, facultyRes] = await Promise.all([
          apiClient.get('/settings/school/'),
          apiClient.get('/facultys/'),
        ]);

        const sData = schoolRes.data;
        setFormData({
          school_id: sData.school_id || '',
          school_name: sData.school_name || '',
          region: sData.region || '',
          division: sData.division || '',
          district: sData.district || '',
          address: sData.address || '',
          contact_number: sData.contact_number || '',
          email: sData.email || '',
          principal_faculty: sData.principal_faculty || '',
          principal_name: sData.principal_name || '',
          principal_title: sData.principal_title || 'Secondary School Principal IV',
          school_logo: sData.school_logo || null,
          left_logo: sData.left_logo || null,
          right_logo: sData.right_logo || null,
          latitude: sData.latitude ?? 8.4858,
          longitude: sData.longitude ?? 124.6567,
          geofence_radius_meters: sData.geofence_radius_meters ?? 150,
        });

        const fData = Array.isArray(facultyRes.data)
          ? facultyRes.data
          : facultyRes.data.results || [];
        setFacultyList(fData);
      } catch (err) {
        console.error('Failed to load school settings:', err);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  const handleFacultyChange = (facultyIdStr: string) => {
    if (!facultyIdStr) {
      setFormData((prev) => ({
        ...prev,
        principal_faculty: '',
      }));
      return;
    }

    const fid = Number(facultyIdStr);
    const chosen = facultyList.find((f) => f.id === fid);

    if (chosen) {
      setFormData((prev) => ({
        ...prev,
        principal_faculty: fid,
        principal_name: `${chosen.first_name} ${chosen.last_name}`.trim(),
        principal_title: chosen.position || 'Secondary School Principal IV',
      }));
    }
  };

  const selectedFacultyObj = facultyList.find(
    (f) => String(f.id) === String(formData.principal_faculty)
  );

  const handleLogoUpload = (
    field: 'school_logo' | 'left_logo' | 'right_logo',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      showAlert({
        title: 'Invalid Image Format',
        message: 'Only PNG, JPG, and WebP images are allowed.',
        type: 'error',
      });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({ ...prev, [field]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    const payload = {
      ...formData,
      principal_faculty: formData.principal_faculty ? Number(formData.principal_faculty) : null,
    };

    try {
      try {
        await apiClient.put('/settings/school/', payload);
      } catch (putErr: any) {
        if (putErr?.response?.status === 405) {
          await apiClient.post('/settings/school/', payload);
        } else {
          throw putErr;
        }
      }

      await refreshSchool();
      setSaveSuccess(true);
      showAlert({
        title: 'Settings Saved',
        message: 'School profile, photos, and report seals updated successfully.',
        type: 'success',
      });
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      showAlert({
        title: 'Update Failed',
        message: err?.response?.data?.detail || 'Failed to update school profile.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Loader2 className="animate-spin" size={32} color="#0284c7" />
      </div>
    );
  }

  return (
    <div
      ref={scrollContainerRef}
      style={{
        width: '100%',
        height: '100%',
        flex: '1 1 auto',
        alignSelf: 'stretch',
        overflowY: 'auto',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        backgroundColor: '#f8fafc',
      }}
    >
      <div
        style={{
          maxWidth: '1080px',
          margin: '0 auto',
          padding: '24px 24px 48px 24px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Header Block */}
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            School Profile &amp; Administration
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 4, margin: '4px 0 0 0' }}>
            Manage official school identity, principal credentials, and official DepEd report seals.
          </p>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 1: School Head Assignment */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <UserCheck size={20} color="#0284c7" />
              <h2 style={cardTitleStyle}>School Head / Principal Assignment</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Assign from Faculty &amp; Staff Directory *</label>
                  <select
                    value={formData.principal_faculty || ''}
                    onChange={(e) => handleFacultyChange(e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">-- Select Faculty Member --</option>
                    {facultyList.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.last_name}, {f.first_name} — {f.position || 'Staff'} ({f.employee_id})
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4, display: 'block' }}>
                    Pulls directly from active Faculty profiles. Updates name and title automatically.
                  </span>
                </div>

                <div>
                  <label style={labelStyle}>Official Signature Name (Printed on SF1, SF2, SF4)</label>
                  <input
                    type="text"
                    required
                    value={formData.principal_name}
                    onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                    placeholder="e.g. Maria A. Santos, PhD"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Official DepEd Position / Title</label>
                  <input
                    type="text"
                    required
                    value={formData.principal_title}
                    onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                    placeholder="e.g. Secondary School Principal IV"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Profile Card Preview */}
              <div style={previewBoxStyle}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#334155', marginBottom: 12 }}>
                  Current School Head Credentials
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={avatarStyle}>
                    {selectedFacultyObj?.photo_url ? (
                      <img
                        src={selectedFacultyObj.photo_url}
                        alt="Principal"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <User size={28} color="#ffffff" />
                    )}
                  </div>

                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.92rem' }}>
                      {formData.principal_name || 'No Principal Assigned'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#0284c7', fontWeight: 700, marginTop: 2 }}>
                      {formData.principal_title || 'Unassigned Title'}
                    </div>
                    {selectedFacultyObj && (
                      <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                        ID: {selectedFacultyObj.employee_id} &bull; {selectedFacultyObj.department}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: School Identification */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <Building2 size={20} color="#0284c7" />
              <h2 style={cardTitleStyle}>School Identification &amp; Hierarchy</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              <div>
                <label style={labelStyle}>DepEd School ID *</label>
                <input
                  type="text"
                  required
                  value={formData.school_id}
                  onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Official School Name *</label>
                <input
                  type="text"
                  required
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Region</label>
                <input
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Division</label>
                <input
                  type="text"
                  value={formData.division}
                  onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>District</label>
                <input
                  type="text"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Section 3: School Profile Photo (System & Sidebar Logo) */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <ImageIcon size={20} color="#0284c7" />
              <h2 style={cardTitleStyle}>School Profile Photo &amp; Main Emblem</h2>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div
                style={{
                  width: 90,
                  height: 90,
                  borderRadius: '50%',
                  border: '2px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                }}
              >
                {formData.school_logo ? (
                  <img
                    src={formData.school_logo}
                    alt="School Profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <Building2 size={36} color="#94a3b8" />
                )}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '0.88rem' }}>
                  Main School Profile Photo (e.g., LNHS Official Emblem)
                </div>
                <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 4, lineHeight: 1.4 }}>
                  This single photo represents your school across the entire AttendSure system: displayed in the top-left sidebar header, the portal navigation bar, and gate clearance passes.
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <label style={uploadBtnStyle}>
                    <Upload size={13} /> Upload School Photo
                    <input
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={(e) => handleLogoUpload('school_logo', e)}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.school_logo && (
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, school_logo: null }))}
                      style={removeBtnStyle}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Dual Report Letterhead Seals (DepEd Manual of Style) */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <ShieldCheck size={20} color="#0284c7" />
              <h2 style={cardTitleStyle}>Official Report Letterhead Seals (SF1, SF2, SF4, DTR)</h2>
            </div>
            <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '0 0 14px 0' }}>
              These two seals are printed at <strong>0.76 inches</strong> on official report headers according to the DepEd Manual of Style:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* Left Report Seal */}
              <div style={logoSlotStyle}>
                <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155' }}>
                  1. Left Seal (e.g., DepEd Seal / Kagawaran Seal)
                </span>
                <div style={logoBoxStyle}>
                  {formData.left_logo ? (
                    <img
                      src={formData.left_logo}
                      alt="Left Seal"
                      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>No seal uploaded</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <label style={uploadBtnStyle}>
                    <Upload size={13} /> Upload Left Seal
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload('left_logo', e)}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.left_logo && (
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, left_logo: null }))}
                      style={removeBtnStyle}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Right Report Seal */}
              <div style={logoSlotStyle}>
                <span style={{ fontSize: '0.80rem', fontWeight: 700, color: '#334155' }}>
                  2. Right Seal (e.g., Division Seal / DepEd Flame Logo)[cite: 14]
                </span>
                <div style={logoBoxStyle}>
                  {formData.right_logo ? (
                    <img
                      src={formData.right_logo}
                      alt="Right Seal"
                      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>No seal uploaded</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <label style={uploadBtnStyle}>
                    <Upload size={13} /> Upload Right Seal
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleLogoUpload('right_logo', e)}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.right_logo && (
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, right_logo: null }))}
                      style={removeBtnStyle}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action Button Bar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 10 }}>
            {saveSuccess && (
              <span style={{ color: '#059669', fontSize: '0.85rem', fontWeight: 700 }}>
                Settings saved successfully.
              </span>
            )}
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? (
                <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} />
              ) : (
                <Save size={16} style={{ marginRight: 6 }} />
              )}
              Save School Configuration
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsTab;

// ============================================================================
// STYLES
// ============================================================================

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  padding: '20px 24px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 16,
  paddingBottom: 10,
  borderBottom: '1px solid #f1f5f9',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 800,
  color: '#0f172a',
  margin: 0,
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
  color: '#0f172a',
  outline: 'none',
  boxSizing: 'border-box',
};

const previewBoxStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  padding: '16px',
};

const avatarStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  backgroundColor: '#0284c7',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  flexShrink: 0,
  border: '2px solid #ffffff',
  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
};

const logoSlotStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const logoBoxStyle: React.CSSProperties = {
  width: '100%',
  height: 100,
  backgroundColor: '#f8fafc',
  border: '1px dashed #cbd5e1',
  borderRadius: '8px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 8,
  boxSizing: 'border-box',
};

const uploadBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: '#f1f5f9',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#0284c7',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const removeBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 700,
  color: '#dc2626',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};