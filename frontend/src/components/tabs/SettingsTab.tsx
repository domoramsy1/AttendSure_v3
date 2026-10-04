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
  Mail,
  Phone,
  Compass,
} from 'lucide-react';

interface SchoolSettingsData {
  school_id: string;
  school_name: string;
  region: string;
  division: string;
  district: string;
  address: string;
  contact_number: string;
  email: string;
  principal_name: string;
  principal_title: string;
  kagawaran_logo: string | null;
  deped_logo: string | null;
  school_logo: string | null;
  left_logo?: string | null;
  right_logo?: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_meters: number | null;
}

type LogoType = 'kagawaran' | 'deped' | 'school';

export const SettingsTab: React.FC = () => {
  const [formData, setFormData] = useState<SchoolSettingsData>({
    school_id: '',
    school_name: '',
    region: '',
    division: '',
    district: '',
    address: '',
    contact_number: '',
    email: '',
    principal_name: '',
    principal_title: '',
    kagawaran_logo: null,
    deped_logo: null,
    school_logo: null,
    latitude: null,
    longitude: null,
    geofence_radius_meters: null,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
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
        address: res.data.address || '',
        contact_number: res.data.contact_number || '',
        email: res.data.email || '',
        principal_name: res.data.principal_name || '',
        principal_title: res.data.principal_title || '',
        kagawaran_logo: res.data.kagawaran_logo || res.data.left_logo || null,
        deped_logo: res.data.deped_logo || res.data.right_logo || null,
        school_logo: res.data.school_logo || null,
        latitude: res.data.latitude ?? null,
        longitude: res.data.longitude ?? null,
        geofence_radius_meters: res.data.geofence_radius_meters ?? null,
      });
    } catch {
      setErrorMsg('Failed to load institution settings from the database.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: LogoType) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Selected image exceeds the maximum allowed size (2MB).');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setFormData((prev) => {
        const updated = { ...prev };
        if (target === 'kagawaran') {
          updated.kagawaran_logo = base64String;
          updated.left_logo = base64String;
        } else if (target === 'deped') {
          updated.deped_logo = base64String;
          updated.right_logo = base64String;
        } else if (target === 'school') {
          updated.school_logo = base64String;
        }
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleClearLogo = (target: LogoType) => {
    setFormData((prev) => {
      const updated = { ...prev };
      if (target === 'kagawaran') {
        updated.kagawaran_logo = null;
        updated.left_logo = null;
      } else if (target === 'deped') {
        updated.deped_logo = null;
        updated.right_logo = null;
      } else if (target === 'school') {
        updated.school_logo = null;
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload = {
        ...formData,
        left_logo: formData.kagawaran_logo,
        right_logo: formData.deped_logo,
      };
      const res = await apiClient.put<SchoolSettingsData>('/settings/school/', payload);
      setFormData({
        school_id: res.data.school_id || '',
        school_name: res.data.school_name || '',
        region: res.data.region || '',
        division: res.data.division || '',
        district: res.data.district || '',
        address: res.data.address || '',
        contact_number: res.data.contact_number || '',
        email: res.data.email || '',
        principal_name: res.data.principal_name || '',
        principal_title: res.data.principal_title || '',
        kagawaran_logo: res.data.kagawaran_logo || res.data.left_logo || null,
        deped_logo: res.data.deped_logo || res.data.right_logo || null,
        school_logo: res.data.school_logo || null,
        latitude: res.data.latitude ?? null,
        longitude: res.data.longitude ?? null,
        geofence_radius_meters: res.data.geofence_radius_meters ?? null,
      });

      // Broadcast update event so AdminSidebar and UI re-sync in real time
      window.dispatchEvent(new CustomEvent('attendsure:school-settings-updated'));

      setSuccessMsg('Institutional settings and official emblems successfully saved!');
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to save configuration to database.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <Loader2 className="animate-spin" size={32} color="#0284c7" />
        <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>Loading school settings...</span>
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', backgroundColor: '#f8fafc', padding: '24px 32px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ padding: 8, borderRadius: 8, backgroundColor: '#e0f2fe', color: '#0284c7' }}>
              <Building2 size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Institutional Profile &amp; Dynamic Identity Settings
              </h1>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '4px 0 0 0' }}>
                All reports (SF1, SF2, SF4), headers, contacts, and footers query directly from this configuration.
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
                  Institutional Identity &amp; Governance
                </h2>
              </div>
            </div>

            <div style={gridThreeCols}>
              <div>
                <label style={labelStyle}>DepEd School ID</label>
                <input
                  type="text"
                  placeholder="e.g. 304033"
                  value={formData.school_id}
                  onChange={(e) => setFormData({ ...formData, school_id: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Official School Name</label>
                <input
                  type="text"
                  placeholder="e.g. Lapasan National High School"
                  value={formData.school_name}
                  onChange={(e) => setFormData({ ...formData, school_name: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Region</label>
                <input
                  type="text"
                  placeholder="e.g. Region X - Northern Mindanao"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Schools Division</label>
                <input
                  type="text"
                  placeholder="e.g. Division of Cagayan de Oro City"
                  value={formData.division}
                  onChange={(e) => setFormData({ ...formData, division: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>District</label>
                <input
                  type="text"
                  placeholder="e.g. District II"
                  value={formData.district}
                  onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div>
                <label style={labelStyle}>Principal / School Head Name</label>
                <input
                  type="text"
                  placeholder="e.g. JACQUELINE GALUPO"
                  value={formData.principal_name}
                  onChange={(e) => setFormData({ ...formData, principal_name: e.target.value })}
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>Designation / Title</label>
                <input
                  type="text"
                  placeholder="e.g. Secondary School Principal II"
                  value={formData.principal_title}
                  onChange={(e) => setFormData({ ...formData, principal_title: e.target.value })}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Contact, Location & Footer Information */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Compass size={18} color="#0284c7" />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Office Details &amp; Report Footer Contacts (DO 31, s. 2019)
                </h2>
              </div>
            </div>

            <div style={gridTwoCols}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={labelStyle}>School Address (Appears on report footers)</label>
                <input
                  type="text"
                  placeholder="e.g. Claro M. Recto Avenue, Lapasan, Cagayan de Oro City, 9000 Misamis Oriental"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Contact Numbers</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Phone size={14} color="#64748b" style={{ position: 'absolute', left: 10 }} />
                  <input
                    type="text"
                    placeholder="e.g. (088) 856-1234 / 0917-123-4567"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    style={{ ...inputStyle, paddingLeft: 30 }}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Official Email Address</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Mail size={14} color="#64748b" style={{ position: 'absolute', left: 10 }} />
                  <input
                    type="email"
                    placeholder="e.g. 304033@deped.gov.ph"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    style={{ ...inputStyle, paddingLeft: 30 }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Report Emblems & Logos */}
          <div style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ImageIcon size={18} color="#0284c7" />
                <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                  Official Emblems &amp; Document Seals (Auto-injected into SF1, SF2, SF4)
                </h2>
              </div>
            </div>

            <div style={gridThreeCols}>
              {/* Kagawaran Logo */}
              <div style={logoUploadBoxStyle}>
                <div style={logoBoxTitleStyle}>
                  1. Kagawaran ng Edukasyon Logo
                </div>
                <div style={logoBoxSubtitleStyle}>
                  Republic Seal / Left Masthead
                </div>
                <div style={logoPreviewContainer}>
                  {formData.kagawaran_logo ? (
                    <img
                      src={formData.kagawaran_logo}
                      alt="Kagawaran Seal"
                      style={{ maxWidth: 80, maxHeight: 80, objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={emptyLogoTextStyle}>Default Vector Used</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={uploadBtnLabelStyle}>
                    <Upload size={12} />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'kagawaran')}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.kagawaran_logo && (
                    <button
                      type="button"
                      onClick={() => handleClearLogo('kagawaran')}
                      style={resetBtnStyle}
                      title="Clear logo"
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* DepEd Logo */}
              <div style={logoUploadBoxStyle}>
                <div style={logoBoxTitleStyle}>
                  2. DepEd Official Logo
                </div>
                <div style={logoBoxSubtitleStyle}>
                  Agency Ribbon / Right Masthead
                </div>
                <div style={logoPreviewContainer}>
                  {formData.deped_logo ? (
                    <img
                      src={formData.deped_logo}
                      alt="DepEd Ribbon"
                      style={{ maxWidth: 80, maxHeight: 80, objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={emptyLogoTextStyle}>Default Vector Used</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={uploadBtnLabelStyle}>
                    <Upload size={12} />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'deped')}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.deped_logo && (
                    <button
                      type="button"
                      onClick={() => handleClearLogo('deped')}
                      style={resetBtnStyle}
                      title="Clear logo"
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>

              {/* School Crest */}
              <div style={logoUploadBoxStyle}>
                <div style={logoBoxTitleStyle}>
                  3. School Crest / Institutional Seal
                </div>
                <div style={logoBoxSubtitleStyle}>
                  Document Footer / Certification Seal
                </div>
                <div style={logoPreviewContainer}>
                  {formData.school_logo ? (
                    <img
                      src={formData.school_logo}
                      alt="School Crest"
                      style={{ maxWidth: 80, maxHeight: 80, objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={emptyLogoTextStyle}>No School Seal Set</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <label style={uploadBtnLabelStyle}>
                    <Upload size={12} />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, 'school')}
                      style={{ display: 'none' }}
                    />
                  </label>
                  {formData.school_logo && (
                    <button
                      type="button"
                      onClick={() => handleClearLogo('school')}
                      style={resetBtnStyle}
                      title="Clear logo"
                    >
                      <RotateCcw size={12} />
                      <span>Reset</span>
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

            <div style={gridThreeCols}>
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

// ==========================================
// STYLES
// ==========================================
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

const gridThreeCols: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
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
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  backgroundColor: '#f8fafc',
  textAlign: 'center',
};

const logoBoxTitleStyle: React.CSSProperties = {
  fontWeight: 700,
  fontSize: '0.80rem',
  color: '#1e293b',
  lineHeight: 1.2,
};

const logoBoxSubtitleStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#64748b',
  marginBottom: 8,
};

const logoPreviewContainer: React.CSSProperties = {
  width: 90,
  height: 90,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#ffffff',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  marginBottom: 10,
};

const emptyLogoTextStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: '#94a3b8',
  fontStyle: 'italic',
  padding: '0 4px',
};

const uploadBtnLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  borderRadius: 6,
  fontSize: '0.74rem',
  fontWeight: 700,
  cursor: 'pointer',
};

const resetBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 8px',
  backgroundColor: '#ffffff',
  color: '#dc2626',
  border: '1px solid #fecaca',
  borderRadius: 6,
  fontSize: '0.74rem',
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

export default SettingsTab;