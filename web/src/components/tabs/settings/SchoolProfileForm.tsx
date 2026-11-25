// AttendSure Web - School Profile Form
// File: D:\AttendSure_V3\web\src\components\tabs\settings\SchoolProfileForm.tsx

/**
 * AttendSure - Official School Profile, Principal Credentials & Seal Upload Form
 * File: web/src/components/tabs/settings/SchoolProfileForm.tsx
 */

import React from 'react';
import { isSafeImageUrl, SEAL_COLORS } from '../../../theme/tokens';
import { useTheme } from '../../../context/ThemeContext';
import { useAlert } from '../../../context/AlertContext';
import { ProfileAvatar } from '../../common/ProfileAvatar';
import { Button } from '../../ui/Button';
import {
  Award,
  Building2,
  Calendar,
  CheckCircle2,
  Compass,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import type { FreshLogosState, SchoolSettingsFormData, TeacherOption } from './types';

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

const prepareLogoDataUrl = (file: File, maxDim = 640): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      if (typeof window === 'undefined') {
        resolve('');
        return;
      }
      const rawDataUrl = typeof e.target?.result === 'string' ? e.target.result : '';
      if (!isSafeImageUrl(rawDataUrl)) {
        resolve('');
        return;
      }
      const img = new window.Image();
      img.src = rawDataUrl;
      img.onload = () => {
        const srcW = img.naturalWidth || img.width;
        const srcH = img.naturalHeight || img.height;
        if (!srcW || !srcH) {
          resolve(rawDataUrl);
          return;
        }

        const workScale = Math.min(1, maxDim / Math.max(srcW, srcH));
        const workW = Math.max(1, Math.round(srcW * workScale));
        const workH = Math.max(1, Math.round(srcH * workScale));

        const workCanvas = document.createElement('canvas');
        workCanvas.width = workW;
        workCanvas.height = workH;
        const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });
        if (!workCtx) {
          resolve(rawDataUrl);
          return;
        }
        workCtx.clearRect(0, 0, workW, workH);
        workCtx.imageSmoothingEnabled = true;
        workCtx.imageSmoothingQuality = 'high';
        workCtx.drawImage(img, 0, 0, workW, workH);

        let hasTransparency = file.type === 'image/png' || file.type === 'image/webp';
        let cropX = 0;
        let cropY = 0;
        let cropW = workW;
        let cropH = workH;

        try {
          const pixels = workCtx.getImageData(0, 0, workW, workH).data;
          let minX = workW;
          let minY = workH;
          let maxX = -1;
          let maxY = -1;
          let foundTransparent = false;

          for (let y = 0; y < workH; y += 1) {
            for (let x = 0; x < workW; x += 1) {
              const alpha = pixels[(y * workW + x) * 4 + 3];
              if (alpha < 250) foundTransparent = true;
              if (alpha > 8) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          if (foundTransparent) hasTransparency = true;
          if (foundTransparent && maxX >= minX && maxY >= minY) {
            cropX = minX;
            cropY = minY;
            cropW = maxX - minX + 1;
            cropH = maxY - minY + 1;
          }
        } catch {
          // Proceed without pixel trimming if canvas readback is restricted
        }

        const pad = hasTransparency ? Math.max(2, Math.round(Math.max(cropW, cropH) * 0.03)) : 0;
        const outW = cropW + pad * 2;
        const outH = cropH + pad * 2;

        const outCanvas = document.createElement('canvas');
        outCanvas.width = outW;
        outCanvas.height = outH;
        const outCtx = outCanvas.getContext('2d');
        if (!outCtx) {
          resolve(rawDataUrl);
          return;
        }
        outCtx.imageSmoothingEnabled = true;
        outCtx.imageSmoothingQuality = 'high';

        if (hasTransparency) {
          outCtx.clearRect(0, 0, outW, outH);
          outCtx.drawImage(workCanvas, cropX, cropY, cropW, cropH, pad, pad, cropW, cropH);
          const pngUrl = outCanvas.toDataURL('image/png');
          resolve(isSafeImageUrl(pngUrl) ? pngUrl : rawDataUrl);
        } else {
          outCtx.fillStyle = SEAL_COLORS.white;
          outCtx.fillRect(0, 0, outW, outH);
          outCtx.drawImage(workCanvas, 0, 0, workW, workH, 0, 0, outW, outH);
          const jpgUrl = outCanvas.toDataURL('image/jpeg', 0.9);
          resolve(isSafeImageUrl(jpgUrl) ? jpgUrl : rawDataUrl);
        }
      };
      img.onerror = () => resolve('');
    };
    reader.onerror = () => resolve('');
  });
};

interface SchoolProfileFormProps {
  formData: SchoolSettingsFormData;
  teacherList: TeacherOption[];
  canEditSettings: boolean;
  saving: boolean;
  saveSuccess: boolean;
  onChangeFormData: React.Dispatch<React.SetStateAction<SchoolSettingsFormData>>;
  onMarkLogoDirty: (field: keyof FreshLogosState) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const SchoolProfileForm: React.FC<SchoolProfileFormProps> = ({
  formData,
  teacherList,
  canEditSettings,
  saving,
  saveSuccess,
  onChangeFormData,
  onMarkLogoDirty,
  onSubmit,
}) => {
  const { tokens, brand, ui } = useTheme();
  const { showAlert } = useAlert();

  const handleTeacherChange = (teacherIdStr: string) => {
    if (!teacherIdStr) {
      onChangeFormData((prev) => ({
        ...prev,
        principal_teacher: '',
        principal_name: '',
        principal_title: '',
        principal_photo_url: null,
        principal_employee_id: '',
        principal_department: '',
        principal_contact_number: '',
        principal_email: '',
      }));
      return;
    }

    const tid = Number(teacherIdStr);
    const chosen = teacherList.find((t) => t.id === tid);
    if (chosen) {
      onChangeFormData((prev) => ({
        ...prev,
        principal_teacher: tid,
        principal_name: chosen.full_name || `${chosen.first_name} ${chosen.last_name}`.trim(),
        principal_title: chosen.position || 'School Principal',
        principal_photo_url: isSafeImageUrl(chosen.photo_url) ? chosen.photo_url ?? null : null,
        principal_employee_id: chosen.employee_id || '',
        principal_department: chosen.department || 'Administration',
        principal_contact_number: chosen.contact_number || '',
        principal_email: chosen.email || '',
      }));
    }
  };

  const handleLogoUpload = async (
    field: keyof FreshLogosState,
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

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      showAlert({
        title: 'Image File Too Large',
        message: 'Please choose an image under 2 MB.',
        type: 'error',
      });
      return;
    }

    const prepared = await prepareLogoDataUrl(file, 640);
    e.target.value = '';
    if (prepared && isSafeImageUrl(prepared)) {
      onChangeFormData((prev) => ({ ...prev, [field]: prepared }));
      onMarkLogoDirty(field);
    }
  };

  const selectedTeacherObj = teacherList.find(
    (t) => String(t.id) === String(formData.principal_teacher)
  );
  const rawPrincipalPhoto = selectedTeacherObj?.photo_url || formData.principal_photo_url || null;
  const activePrincipalPhoto = isSafeImageUrl(rawPrincipalPhoto) ? rawPrincipalPhoto : null;
  const activePrincipalEmpId = selectedTeacherObj?.employee_id || formData.principal_employee_id || '';
  const activePrincipalDept = selectedTeacherObj?.department || formData.principal_department || 'Administration';
  const activePrincipalContact = selectedTeacherObj?.contact_number || formData.principal_contact_number || '';
  const activePrincipalEmail = selectedTeacherObj?.email || formData.principal_email || '';

  const cardStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurface,
    borderRadius: 14,
    padding: '18px 22px',
    border: `1px solid ${tokens.borderSubtle}`,
    boxShadow: tokens.cardShadow,
  };

  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
    paddingBottom: 10,
    borderBottom: `1px solid ${tokens.borderSubtle}`,
  };

  const cardTitleStyle: React.CSSProperties = {
    fontSize: '0.96rem',
    fontWeight: 800,
    color: tokens.textPrimary,
    margin: 0,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.74rem',
    fontWeight: 700,
    color: tokens.textSecondary,
    marginBottom: 4,
  };

  const inputStyle: React.CSSProperties = {
    ...ui.input,
    borderRadius: 8,
    backgroundColor: tokens.bgSurfaceSubtle,
    fontSize: '0.82rem',
  };

  const previewBoxStyle: React.CSSProperties = {
    backgroundColor: tokens.bgSurfaceSubtle,
    border: `1px solid ${tokens.borderSubtle}`,
    borderRadius: 12,
    padding: '16px',
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <fieldset
        disabled={!canEditSettings}
        style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {/* School Head / Principal Information */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <UserCheck size={18} color={brand.primary} />
            <h2 style={cardTitleStyle}>School Head / Principal Information</h2>
            <span
              style={{
                fontSize: '0.66rem',
                fontWeight: 800,
                backgroundColor: tokens.successLight,
                color: brand.success,
                border: `1px solid ${brand.success}`,
                padding: '2px 8px',
                borderRadius: 12,
                marginLeft: 'auto',
              }}
            >
              AUTOMATIC SYNC ACTIVE
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
              gap: 16,
              alignItems: 'start',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Assign from Teachers Directory</label>
                <select
                  value={formData.principal_teacher || ''}
                  onChange={(e) => handleTeacherChange(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Select Teacher --</option>
                  {teacherList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.last_name}, {t.first_name} — {t.position || 'Teacher'} ({t.employee_id})
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.70rem', color: tokens.textMuted, marginTop: 4, display: 'block' }}>
                  Assigning a user with role <strong>School Principal</strong> in the Users tab sets this automatically.
                </span>
              </div>

              <div>
                <label style={labelStyle}>Official Signature Name (Printed on SF1, SF2, SF4, DTR) *</label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={formData.principal_name}
                  onChange={(e) => onChangeFormData({ ...formData, principal_name: e.target.value })}
                  placeholder="Enter official school head name"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Official Position / Title *</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={formData.principal_title}
                  onChange={(e) => onChangeFormData({ ...formData, principal_title: e.target.value })}
                  placeholder="Enter official position or title"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={previewBoxStyle}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  gap: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: tokens.textPrimary }}>
                  Current School Head Credentials
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 10,
                    backgroundColor: tokens.primaryLight,
                    color: brand.primary,
                    fontSize: '0.66rem',
                    fontWeight: 800,
                  }}
                >
                  <ShieldCheck size={12} /> VERIFIED SCHOOL HEAD
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <ProfileAvatar
                  photoUrl={activePrincipalPhoto}
                  name={formData.principal_name || 'School Head'}
                  size={56}
                  iconSize={26}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: tokens.textPrimary, fontSize: '0.94rem' }}>
                    {formData.principal_name || 'No Principal Assigned'}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: brand.primary, fontWeight: 700, marginTop: 2 }}>
                    {formData.principal_title || 'Unassigned Title'}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 12,
                  paddingTop: 10,
                  borderTop: `1px solid ${tokens.borderSubtle}`,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
                  gap: 8,
                  fontSize: '0.72rem',
                }}
              >
                <div>
                  <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>
                    Employee ID:
                  </span>
                  <strong style={{ display: 'block', color: tokens.textPrimary, fontFamily: 'monospace' }}>
                    {activePrincipalEmpId || '—'}
                  </strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>
                    Department:
                  </span>
                  <strong style={{ display: 'block', color: tokens.textPrimary }}>{activePrincipalDept}</strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>
                    Contact No.:
                  </span>
                  <strong style={{ display: 'block', color: tokens.textPrimary }}>
                    {activePrincipalContact || '—'}
                  </strong>
                </div>
                <div>
                  <span style={{ display: 'block', color: tokens.textMuted, fontWeight: 700, marginBottom: 1 }}>
                    Email:
                  </span>
                  <strong
                    style={{
                      display: 'block',
                      color: tokens.textPrimary,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {activePrincipalEmail || '—'}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* School Identification & Hierarchy */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Building2 size={18} color={brand.primary} />
            <h2 style={cardTitleStyle}>School Identification &amp; Hierarchy</h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>School ID *</label>
              <input
                type="text"
                required
                maxLength={40}
                value={formData.school_id}
                onChange={(e) => onChangeFormData({ ...formData, school_id: e.target.value })}
                placeholder="Enter school ID"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Official School Name *</label>
              <input
                type="text"
                required
                maxLength={160}
                value={formData.school_name}
                onChange={(e) => onChangeFormData({ ...formData, school_name: e.target.value })}
                placeholder="Enter official school name"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Region</label>
              <input
                type="text"
                maxLength={80}
                value={formData.region}
                onChange={(e) => onChangeFormData({ ...formData, region: e.target.value })}
                placeholder="Enter region"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Division</label>
              <input
                type="text"
                maxLength={120}
                value={formData.division}
                onChange={(e) => onChangeFormData({ ...formData, division: e.target.value })}
                placeholder="Enter division"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>District</label>
              <input
                type="text"
                maxLength={120}
                value={formData.district}
                onChange={(e) => onChangeFormData({ ...formData, district: e.target.value })}
                placeholder="Enter district"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Active School Year (SY)</label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                  type="text"
                  maxLength={20}
                  value={formData.academic_year}
                  onChange={(e) => onChangeFormData({ ...formData, academic_year: e.target.value })}
                  placeholder="YYYY-YYYY"
                  style={{ ...inputStyle, paddingRight: 30 }}
                />
                <Calendar
                  size={14}
                  color={tokens.textMuted}
                  style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                />
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Schools Division Superintendent (SDS)</label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                  type="text"
                  maxLength={150}
                  value={formData.superintendent_name}
                  onChange={(e) => onChangeFormData({ ...formData, superintendent_name: e.target.value })}
                  placeholder="Enter division superintendent name"
                  style={{ ...inputStyle, paddingRight: 30 }}
                />
                <Award
                  size={14}
                  color={tokens.textMuted}
                  style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Official Contact Details */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <MapPin size={18} color={brand.primary} />
            <h2 style={cardTitleStyle}>Official Contact &amp; Document Footer Details</h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: 14,
            }}
          >
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Complete Campus Address *</label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                  type="text"
                  required
                  maxLength={250}
                  value={formData.address}
                  onChange={(e) => onChangeFormData({ ...formData, address: e.target.value })}
                  placeholder="Enter complete campus address"
                  style={{ ...inputStyle, paddingRight: 30 }}
                />
                <MapPin
                  size={14}
                  color={tokens.textMuted}
                  style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Telephone / Contact Number *</label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                  type="text"
                  required
                  maxLength={40}
                  value={formData.contact_number}
                  onChange={(e) => onChangeFormData({ ...formData, contact_number: e.target.value })}
                  placeholder="Enter official contact number"
                  style={{ ...inputStyle, paddingRight: 30 }}
                />
                <Phone
                  size={14}
                  color={tokens.textMuted}
                  style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Official School Email Address *</label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                  type="email"
                  required
                  maxLength={150}
                  value={formData.email}
                  onChange={(e) => onChangeFormData({ ...formData, email: e.target.value })}
                  placeholder="Enter official school email"
                  style={{ ...inputStyle, paddingRight: 30 }}
                />
                <Mail
                  size={14}
                  color={tokens.textMuted}
                  style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                />
              </div>
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Official Website / Division Portal</label>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <input
                  type="text"
                  maxLength={200}
                  value={formData.website}
                  onChange={(e) => onChangeFormData({ ...formData, website: e.target.value })}
                  placeholder="https://..."
                  style={{ ...inputStyle, paddingRight: 30 }}
                />
                <Globe
                  size={14}
                  color={tokens.textMuted}
                  style={{ position: 'absolute', right: 10, pointerEvents: 'none' }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Campus GPS Boundary Coordinates */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Compass size={18} color={brand.primary} />
            <h2 style={cardTitleStyle}>Campus GPS Boundary Coordinates</h2>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Campus Center Latitude (°N)</label>
              <input
                type="number"
                step="any"
                value={formData.latitude}
                onChange={(e) => onChangeFormData({ ...formData, latitude: e.target.value })}
                placeholder="Enter latitude"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Campus Center Longitude (°E)</label>
              <input
                type="number"
                step="any"
                value={formData.longitude}
                onChange={(e) => onChangeFormData({ ...formData, longitude: e.target.value })}
                placeholder="Enter longitude"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Allowed Radius (Meters, 20–5000)</label>
              <input
                type="number"
                min={20}
                max={5000}
                required
                value={formData.geofence_radius_meters || ''}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  onChangeFormData({
                    ...formData,
                    geofence_radius_meters: Number.isNaN(parsed) ? 0 : parsed,
                  });
                }}
                placeholder="150"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* School Emblem & Official Seals */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <ShieldCheck size={18} color={brand.primary} />
            <h2 style={cardTitleStyle}>School Emblem &amp; Official Report Letterhead Seals</h2>
          </div>
          <p style={{ margin: '-6px 0 14px', fontSize: '0.73rem', color: tokens.textSecondary, lineHeight: 1.45 }}>
            Upload PNG, JPG, or WebP logos. Transparent PNG backgrounds stay clear (never darkened) and are
            automatically trimmed and fitted to official DepEd report headers, sidebars, and dark mode.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))',
              gap: 16,
            }}
          >
            {(
              [
                {
                  field: 'school_logo',
                  label: '1. Main School Profile Emblem',
                  alt: 'Main Emblem',
                  uploadText: 'Upload Emblem',
                  emptyText: 'No emblem uploaded',
                },
                {
                  field: 'left_logo',
                  label: '2. Left Seal (DepEd Official Seal)',
                  alt: 'Left Seal',
                  uploadText: 'Upload Seal',
                  emptyText: 'No seal uploaded',
                },
                {
                  field: 'right_logo',
                  label: '3. Right Seal (DepEd / Division Logo)',
                  alt: 'Right Seal',
                  uploadText: 'Upload Logo',
                  emptyText: 'No logo uploaded',
                },
              ] as const
            ).map((item) => {
              const val = formData[item.field];
              const safeUrl = isSafeImageUrl(val) ? val : null;
              return (
                <div key={item.field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: tokens.textPrimary }}>
                    {item.label}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      height: 108,
                      backgroundColor: SEAL_COLORS.white,
                      border: `1px dashed ${tokens.borderStrong}`,
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 10,
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                    }}
                  >
                    {safeUrl ? (
                      <img
                        src={safeUrl}
                        alt={item.alt}
                        style={{
                          maxHeight: '100%',
                          maxWidth: '100%',
                          width: 'auto',
                          height: 'auto',
                          display: 'block',
                          objectFit: 'contain',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: tokens.textMuted }}>{item.emptyText}</span>
                    )}
                  </div>
                  {canEditSettings && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <label
                        style={{
                          padding: '5px 10px',
                          backgroundColor: tokens.bgSurfaceSubtle,
                          border: `1px solid ${tokens.borderStrong}`,
                          borderRadius: 6,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          color: brand.primary,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Upload size={12} /> {item.uploadText}
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={(e) => void handleLogoUpload(item.field, e)}
                          style={{ display: 'none' }}
                        />
                      </label>
                      {safeUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            onChangeFormData((p) => ({ ...p, [item.field]: null }));
                            onMarkLogoDirty(item.field);
                          }}
                          style={{
                            padding: '5px 10px',
                            backgroundColor: tokens.dangerLight,
                            border: `1px solid ${brand.danger}`,
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: brand.danger,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                          }}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </fieldset>

      {canEditSettings && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            marginTop: 6,
            flexWrap: 'wrap',
          }}
        >
          {saveSuccess && (
            <span
              style={{
                color: brand.success,
                fontSize: '0.80rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <CheckCircle2 size={15} /> Configuration saved successfully.
            </span>
          )}
          <Button
            variant="primary"
            size="md"
            type="submit"
            disabled={saving}
            icon={saving ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />}
          >
            Save School Configuration
          </Button>
        </div>
      )}
    </form>
  );
};
