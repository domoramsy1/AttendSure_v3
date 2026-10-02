import React, { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Button } from '../ui/Button';
import {
  Building2,
  Image as ImageIcon,
  MapPin,
  Save,
  RotateCcw,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface SchoolSettingsData {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  principal_name: string;
  principal_title: string;
  left_logo: string | null;
  right_logo: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
}

export const SettingsTab: React.FC = () => {
  const [formData, setFormData] = useState<SchoolSettingsData>({
    school_id: '',
    school_name: '',
    region: '',
    division: '',
    district: '',
    principal_name: '',
    principal_title: '',
    left_logo: null,
    right_logo: null,
    latitude: null,
    longitude: null,
    geofence_radius_meters: null,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await apiClient.get<SchoolSettingsData>('/settings/school/');
      setFormData({
        school_id: res.data.school_id || '',
        school_name: res.data.school_name || '',
        region: res.data.region || '',
        division: res.data.division || '',
        district: res.data.district || '',
        principal_name: res.data.principal_name || '',
        principal_title: res.data.principal_title || '',
        left_logo: res.data.left_logo || null,
        right_logo: res.data.right_logo || null,
        latitude: res.data.latitude ?? null,
        longitude: res.data.longitude ?? null,
        geofence_radius_meters: res.data.geofence_radius_meters ?? null,
      });
    } catch (err: any) {
      setErrorMsg('Failed to load school settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, position: 'left' | 'right') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Selected image exceeds maximum allowed size (2MB).');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setFormData((prev) => ({
        ...prev,
        [position === 'left' ? 'left_logo' : 'right_logo']: base64String,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = (position: 'left' | 'right') => {
    setFormData((prev) => ({
      ...prev,
      [position === 'left' ? 'left_logo' : 'right_logo']: null,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await apiClient.put<SchoolSettingsData>('/settings/school/', formData);
      setFormData(res.data);
      setSuccessMsg('Settings successfully updated!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <Loader2 className="animate-spin" size={32} color="#0284c7" />
        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Loading settings...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1050, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: '#e0f2fe', color: '#0284c7' }}>
              <Building2 size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                System & School Institutional Settings
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
                Pure dynamic configuration: Configure your institution's profile, official report logos, and geofence perimeter.
              </p>
            </div>
          </div>
        </div>

        {successMsg && (
          <div style={successAlertStyle}>
            <CheckCircle2 size={18} color="#059669" />
            <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div style={errorAlertStyle}>
            <AlertCircle size={18} color="#dc2626" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Institutional Metadata */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldCheck size={18} color="#0284c7" />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Institutional Identity & Official Form Header
                </h2>
              </div>
            </div>

            <div style={gridTwoCols}>
              <div>
                <label style={labelStyle}>DepEd School ID</label>
                <input
                  type="text"
                  placeholder="Enter School ID"
                  value={formData.school_id}
                  onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Official School Name</label>
                <input
                  type="text"
                  placeholder="Enter Official School Name"
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Region</label>
                <input
                  type="text"
                  placeholder="Enter Region (e.g. Region X)"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Schools Division</label>
                <input
                  type="text"
                  placeholder="Enter Division"
                  value={formData.division}
                  onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>District</label>
                <input
                  type="text"
                  placeholder="Enter District"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Principal / School Head Name</label>
                <input
                  type="text"
                  placeholder="Enter Full Name of School Head"
                  value={formData.principal_name}
                  onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Report Logos */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={18} color="#0284c7" />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Report Header Logos
                </h2>
              </div>
            </div>

            <div style={gridTwoCols}>
              {/* Left Logo */}
              <div style={logoUploadBoxStyle}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: 6 }}>
                  Header Left Logo (DepEd / Division Seal)
                </div>
                <div style={logoPreviewContainer}>
                  {formData.left_logo ? (
                    <img
                      src={formData.left_logo}
                      alt="Left Seal Preview"
                      style={{ maxWidth: 84, maxHeight: 84, objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      No logo uploaded
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <label style={uploadBtnLabelStyle}>
                    <Upload size={13} />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'left')}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.left_logo && (
                    <button
                      type="button"
                      onClick={() => handleClearLogo('left')}
                      style={resetBtnStyle}
                      title="Clear logo"
                    >
                      <RotateCcw size={13} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Logo */}
              <div style={logoUploadBoxStyle}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#334155', marginBottom: 6 }}>
                  Header Right Logo (School Institutional Crest)
                </div>
                <div style={logoPreviewContainer}>
                  {formData.right_logo ? (
                    <img
                      src={formData.right_logo}
                      alt="Right Seal Preview"
                      style={{ maxWidth: 84, maxHeight: 84, objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      No logo uploaded
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  <label style={uploadBtnLabelStyle}>
                    <Upload size={13} />
                    <span>Upload Image</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'right')}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.right_logo && (
                    <button
                      type="button"
                      onClick={() => handleClearLogo('right')}
                      style={resetBtnStyle}
                      title="Clear logo"
                    >
                      <RotateCcw size={13} />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Campus Geofence */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={18} color="#0284c7" />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Campus Geofence GPS Coordinates
                </h2>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 8.4862"
                  value={formData.latitude !== null ? formData.latitude : ''}
                  onChange={(e) => setFormData({ ...formData, latitude: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 124.6618"
                  value={formData.longitude !== null ? formData.longitude : ''}
                  onChange={(e) => setFormData({ ...formData, longitude: e.target.value === '' ? null : parseFloat(e.target.value) })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Perimeter Radius (Meters)</label>
                <input
                  type="number"
                  min={10}
                  placeholder="e.g. 250"
                  value={formData.geofence_radius_meters !== null ? formData.geofence_radius_meters : ''}
                  onChange={(e) => setFormData({ ...formData, geofence_radius_meters: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
            <Button variant="secondary" size="md" type="button" onClick={fetchSettings}>
              Discard Changes
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" size={16} style={{ marginRight: 6 }} /> : <Save size={16} style={{ marginRight: 6 }} />}
              Save All Settings
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: 10,
  border: '1px solid #e2e8f0',
  padding: '18px 24px',
  marginBottom: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
};

const cardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid #f1f5f9',
  paddingBottom: 12,
  marginBottom: 16,
};

const gridTwoCols: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 16,
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
  backgroundColor: '#ffffff',
  boxSizing: 'border-box',
};

const logoUploadBoxStyle: React.CSSProperties = {
  border: '1px dashed #cbd5e1',
  borderRadius: 8,
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  backgroundColor: '#f8fafc',
};

const logoPreviewContainer: React.CSSProperties = {
  width: 96,
  height: 96,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#ffffff',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  marginBottom: 8,
};

const uploadBtnLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '6px 12px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const resetBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.76rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const successAlertStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: '#ecfdf5',
  border: '1px solid #a7f3d0',
  color: '#065f46',
  padding: '10px 16px',
  borderRadius: 8,
  marginBottom: 16,
  fontSize: '0.84rem',
  fontWeight: 600,
};

const errorAlertStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  color: '#dc2626',
  padding: '10px 16px',
  borderRadius: 8,
  marginBottom: 16,
  fontSize: '0.84rem',
  fontWeight: 600,
};