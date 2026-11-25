// AttendSure Web - Add / Edit Teacher Modal
// File: D:\AttendSure_V3\web\src\components\tabs\teachers\TeacherFormModal.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { AvatarUploadField } from '../../common/AvatarUploadField';
import {
  StaffContactField,
  StaffDepartmentPositionFields,
  StaffNameFields,
  StaffTeachingToggle,
} from '../../common/StaffFormFields';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import type { PositionGroupOption, Teacher, TeacherFormState } from './types';

interface TeacherFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTeacher: Teacher | null;
  formData: TeacherFormState;
  onChangeForm: React.Dispatch<React.SetStateAction<TeacherFormState>>;
  photoPreview: string | null;
  onPhotoPreviewChange: (next: string | null) => void;
  departmentOptions: string[];
  positionGroups: PositionGroupOption[];
  liveErrors: {
    employee_id?: string;
    email?: string;
    contact_number?: string;
  };
  fieldVerified: {
    employee_id: boolean;
    email: boolean;
    contact_number: boolean;
  };
  checkingCount: number;
  hasLiveErrors: boolean;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onPhotoValidationError: (msg: string) => void;
}

export const TeacherFormModal: React.FC<TeacherFormModalProps> = ({
  isOpen,
  onClose,
  editingTeacher,
  formData,
  onChangeForm,
  photoPreview,
  onPhotoPreviewChange,
  departmentOptions,
  positionGroups,
  liveErrors,
  fieldVerified,
  checkingCount,
  hasLiveErrors,
  saving,
  onSubmit,
  onPhotoValidationError,
}) => {
  const { tokens, brand, fonts, ui } = useTheme();

  if (!isOpen) return null;

  const formGrid2: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 10,
  };

  const nameGrid: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
    gap: 10,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingTeacher ? `Edit Teacher: ${editingTeacher.full_name}` : 'Add New Teacher'}
      maxWidth="580px"
    >
      <div
        style={{
          backgroundColor: tokens.bgSurface,
          color: tokens.textPrimary,
          margin: -20,
          padding: 20,
          fontFamily: fonts.sans,
        }}
      >
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <AvatarUploadField
            previewUrl={photoPreview}
            displayName={`${formData.first_name} ${formData.last_name}`.trim() || 'Teacher'}
            label="Directory Profile Photo"
            helpText="Optional JPG, PNG, or WebP (max 2 MB). On-device phone lock checks stay strictly on the teacher's phone."
            size={56}
            disabled={saving}
            onSelectPhoto={(_file, dataUri) => {
              onPhotoPreviewChange(dataUri);
              onChangeForm((prev) => ({ ...prev, photo: dataUri }));
            }}
            onRemovePhoto={() => {
              onPhotoPreviewChange(null);
              onChangeForm((prev) => ({ ...prev, photo: '' }));
            }}
            onValidationError={onPhotoValidationError}
          />

          <div style={formGrid2}>
            <div>
              <label htmlFor="teacher-emp-id" style={ui.label}>
                Employee ID *
              </label>
              <input
                id="teacher-emp-id"
                type="text"
                required
                maxLength={50}
                value={formData.employee_id}
                onChange={(e) =>
                  onChangeForm((prev) => ({ ...prev, employee_id: e.target.value.toUpperCase() }))
                }
                style={{
                  ...ui.input,
                  fontFamily: fonts.mono,
                  borderColor: liveErrors.employee_id
                    ? brand.danger
                    : fieldVerified.employee_id
                      ? brand.success
                      : tokens.borderStrong,
                }}
                placeholder="e.g. EMP-2026-014"
              />
              {liveErrors.employee_id && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 3,
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    color: brand.danger,
                  }}
                >
                  {liveErrors.employee_id}
                </span>
              )}
            </div>
            <div>
              <label htmlFor="teacher-email" style={ui.label}>
                Email Address
              </label>
              <input
                id="teacher-email"
                type="email"
                maxLength={150}
                value={formData.email}
                onChange={(e) => onChangeForm((prev) => ({ ...prev, email: e.target.value }))}
                style={{
                  ...ui.input,
                  borderColor: liveErrors.email
                    ? brand.danger
                    : fieldVerified.email
                      ? brand.success
                      : tokens.borderStrong,
                }}
                placeholder="name@school.edu"
              />
              {liveErrors.email && (
                <span
                  style={{
                    display: 'block',
                    marginTop: 3,
                    fontSize: '0.70rem',
                    fontWeight: 700,
                    color: brand.danger,
                  }}
                >
                  {liveErrors.email}
                </span>
              )}
            </div>
          </div>

          <StaffNameFields
            values={formData}
            onChange={(patch) => onChangeForm((prev) => ({ ...prev, ...patch }))}
            idPrefix="teacher"
            gridStyle={nameGrid}
          />

          <StaffDepartmentPositionFields
            department={formData.department}
            position={formData.position}
            onChange={(patch) => onChangeForm((prev) => ({ ...prev, ...patch }))}
            departmentOptions={departmentOptions}
            positionGroups={positionGroups}
            order="position-first"
            idPrefix="teacher"
            gridStyle={formGrid2}
          />

          <div style={formGrid2}>
            <StaffContactField
              id="teacher-contact"
              value={formData.contact_number}
              onChange={(val) => onChangeForm((prev) => ({ ...prev, contact_number: val }))}
              error={liveErrors.contact_number}
              verified={fieldVerified.contact_number}
            />
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
              <StaffTeachingToggle
                variant="inline"
                checked={formData.can_handle_classes}
                onChange={(checked) =>
                  onChangeForm((prev) => ({ ...prev, can_handle_classes: checked }))
                }
              />
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: fonts.size.sm,
                  fontWeight: fonts.weight.semibold,
                  color: tokens.textPrimary,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) =>
                    onChangeForm((prev) => ({ ...prev, is_active: e.target.checked }))
                  }
                  style={{ accentColor: brand.success }}
                />
                Active teacher account
              </label>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 8,
              paddingTop: 12,
              borderTop: `1px solid ${tokens.borderSubtle}`,
            }}
          >
            <Button variant="secondary" size="md" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="md"
              type="submit"
              loading={saving}
              disabled={saving || hasLiveErrors || checkingCount > 0}
            >
              {editingTeacher ? 'Save Changes' : 'Add Teacher'}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
};
