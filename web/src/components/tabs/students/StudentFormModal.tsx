// AttendSure Web - Student Create / Edit Modal (DepEd SF1)
// File: D:\AttendSure_V3\web\src\components\tabs\students\StudentFormModal.tsx

import React from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { AvatarUploadField } from '../../common/AvatarUploadField';
import { ControlSwitch } from '../../ui/ControlSwitch';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { AlertCircle, BookOpen, GraduationCap, Home, User, Users2 } from 'lucide-react';
import type {
  GradeLevelItem,
  ModalFormTab,
  SectionItem,
  StudentFormData,
  StudentRecord,
} from './types';

interface LrnCheckState {
  checking: boolean;
  is_taken: boolean;
  available: boolean;
  message: string;
}

interface StudentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingStudent: StudentRecord | null;
  formTab: ModalFormTab;
  onChangeTab: (tab: ModalFormTab) => void;
  formData: StudentFormData;
  onChangeFormData: (updater: StudentFormData | ((prev: StudentFormData) => StudentFormData)) => void;
  formError: string | null;
  onSetFormError: (msg: string | null) => void;
  onMarkPhotoRemoved: (removed: boolean) => void;
  saving: boolean;
  lrnCheck: LrnCheckState;
  gradeLevels: GradeLevelItem[];
  modalAvailableSections: SectionItem[];
  selectedModalSection: SectionItem | null;
  onSubmit: (e: React.FormEvent) => void;
}

export const StudentFormModal: React.FC<StudentFormModalProps> = ({
  isOpen,
  onClose,
  editingStudent,
  formTab,
  onChangeTab,
  formData,
  onChangeFormData,
  formError,
  onSetFormError,
  onMarkPhotoRemoved,
  saving,
  lrnCheck,
  gradeLevels,
  modalAvailableSections,
  selectedModalSection,
  onSubmit,
}) => {
  const { tokens, brand, fonts, ui } = useTheme();

  const todayIsoMax = (() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingStudent ? `Edit Student: ${editingStudent.full_name}` : 'Enroll New Student (DepEd SF1)'}
    >
      <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {formError && (
          <div
            style={{
              ...ui.subtleBox,
              backgroundColor: tokens.dangerLight,
              borderColor: brand.danger,
              color: brand.danger,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={15} /> <span>{formError}</span>
          </div>
        )}

        <ControlSwitch<ModalFormTab>
          options={[
            { value: 'BASIC', label: '1. Basic', icon: <User size={13} /> },
            { value: 'ADDRESS', label: '2. Address', icon: <Home size={13} /> },
            { value: 'GUARDIAN', label: '3. Guardian', icon: <Users2 size={13} /> },
            { value: 'DEPED', label: '4. DepEd', icon: <GraduationCap size={13} /> },
          ]}
          value={formTab}
          onChange={onChangeTab}
          size="sm"
        />

        {formTab === 'BASIC' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <AvatarUploadField
              previewUrl={formData.photo}
              displayName={`${formData.first_name} ${formData.last_name}`.trim() || 'Student'}
              label="Student ID Photo"
              size={54}
              disabled={saving}
              onSelectPhoto={(_file, dataUri) => {
                onSetFormError(null);
                onMarkPhotoRemoved(false);
                onChangeFormData((prev) => ({ ...prev, photo: dataUri }));
              }}
              onRemovePhoto={() => {
                onChangeFormData((p) => ({ ...p, photo: null }));
                onMarkPhotoRemoved(true);
              }}
              onValidationError={(msg) => onSetFormError(msg)}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>12-Digit LRN *</label>
                <input
                  maxLength={12}
                  value={formData.lrn}
                  onChange={(e) => onChangeFormData({ ...formData, lrn: e.target.value.replace(/\D/g, '') })}
                  style={{
                    ...ui.input,
                    borderColor: lrnCheck.is_taken
                      ? brand.danger
                      : lrnCheck.available
                        ? brand.success
                        : tokens.borderStrong,
                  }}
                  placeholder="Enter 12-digit LRN"
                />
                {lrnCheck.checking && (
                  <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: tokens.textMuted, fontWeight: 600 }}>
                    Checking LRN availability...
                  </span>
                )}
                {lrnCheck.is_taken && (
                  <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: brand.danger, fontWeight: 700 }}>
                    {lrnCheck.message || 'This 12-digit LRN is already registered.'}
                  </span>
                )}
                {!lrnCheck.checking && lrnCheck.available && (
                  <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: brand.success, fontWeight: 700 }}>
                    LRN is available.
                  </span>
                )}
              </div>
              <div>
                <label style={ui.label}>Birthdate *</label>
                <input
                  type="date"
                  required
                  max={todayIsoMax}
                  value={formData.birthdate}
                  onChange={(e) => {
                    onChangeFormData({ ...formData, birthdate: e.target.value });
                    if (formError && formError.toLowerCase().includes('birthdate')) {
                      onSetFormError(null);
                    }
                  }}
                  style={{
                    ...ui.input,
                    borderColor:
                      formError && formError.toLowerCase().includes('birthdate')
                        ? brand.danger
                        : tokens.borderStrong,
                  }}
                />
                {!formData.birthdate && (
                  <span style={{ display: 'block', marginTop: 3, fontSize: '0.70rem', color: tokens.textMuted, fontWeight: 600 }}>
                    Select the student&apos;s real birthdate for DepEd SF1 records.
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>First Name *</label>
                <input
                  maxLength={100}
                  value={formData.first_name}
                  onChange={(e) => onChangeFormData({ ...formData, first_name: e.target.value })}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>Last Name *</label>
                <input
                  maxLength={100}
                  value={formData.last_name}
                  onChange={(e) => onChangeFormData({ ...formData, last_name: e.target.value })}
                  style={ui.input}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Middle Name</label>
                <input
                  maxLength={100}
                  value={formData.middle_name}
                  onChange={(e) => onChangeFormData({ ...formData, middle_name: e.target.value })}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>Suffix</label>
                <select
                  value={formData.suffix}
                  onChange={(e) => onChangeFormData({ ...formData, suffix: e.target.value })}
                  style={ui.input}
                >
                  <option value="">None</option>
                  <option value="Jr.">Jr.</option>
                  <option value="Sr.">Sr.</option>
                  <option value="II">II</option>
                  <option value="III">III</option>
                  <option value="IV">IV</option>
                  <option value="V">V</option>
                </select>
              </div>
              <div>
                <label style={ui.label}>Sex *</label>
                <select
                  value={formData.sex}
                  onChange={(e) => onChangeFormData({ ...formData, sex: e.target.value })}
                  style={ui.input}
                >
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Grade Level *</label>
                <select
                  value={formData.grade_level_id}
                  onChange={(e) =>
                    onChangeFormData({ ...formData, grade_level_id: e.target.value, section_id: '' })
                  }
                  style={ui.input}
                >
                  <option value="">-- Select Grade --</option>
                  {gradeLevels.map((gl) => (
                    <option key={gl.id} value={gl.id}>
                      {gl.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={ui.label}>Class Section *</label>
                <select
                  value={formData.section_id}
                  onChange={(e) => onChangeFormData({ ...formData, section_id: e.target.value })}
                  style={ui.input}
                >
                  <option value="">-- Select Section --</option>
                  {modalAvailableSections.map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={ui.label}>Enrollment Status (DepEd SF1) *</label>
                <select
                  value={formData.enrollment_status}
                  onChange={(e) =>
                    onChangeFormData({
                      ...formData,
                      enrollment_status: e.target.value as StudentFormData['enrollment_status'],
                    })
                  }
                  style={ui.input}
                >
                  <option value="ENROLLED">Enrolled</option>
                  <option value="TRANSFERRED_IN">Transferred In</option>
                  <option value="TRANSFERRED_OUT">Transferred Out</option>
                  <option value="DROPPED">Dropped</option>
                </select>
              </div>
            </div>

            {selectedModalSection && (
              <div
                style={{
                  ...ui.subtleBox,
                  backgroundColor: tokens.infoLight,
                  borderColor: brand.primary,
                  color: brand.primary,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 8,
                  fontSize: fonts.size.xs,
                  fontWeight: 700,
                }}
              >
                <BookOpen size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  Auto-Enrollment Active: Enrolling in{' '}
                  {selectedModalSection.display_label ||
                    (selectedModalSection.grade_level_name
                      ? `${selectedModalSection.grade_level_name} - ${selectedModalSection.name}`
                      : selectedModalSection.name)}{' '}
                  automatically includes this student in all{' '}
                  {Number(selectedModalSection.scheduled_subjects_count ?? 0)} scheduled subject periods and class lists for this section.
                </span>
              </div>
            )}
          </div>
        )}

        {formTab === 'ADDRESS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={ui.label}>House # / Street / Sitio</label>
              <input
                maxLength={150}
                value={formData.house_street_sitio}
                onChange={(e) => onChangeFormData({ ...formData, house_street_sitio: e.target.value })}
                style={ui.input}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Barangay</label>
                <input
                  maxLength={100}
                  value={formData.barangay}
                  onChange={(e) => onChangeFormData({ ...formData, barangay: e.target.value })}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>Municipality / City</label>
                <input
                  maxLength={100}
                  value={formData.municipality_city}
                  onChange={(e) => onChangeFormData({ ...formData, municipality_city: e.target.value })}
                  style={ui.input}
                />
              </div>
            </div>
            <div>
              <label style={ui.label}>Province</label>
              <input
                maxLength={100}
                value={formData.province}
                onChange={(e) => onChangeFormData({ ...formData, province: e.target.value })}
                style={ui.input}
              />
            </div>
          </div>
        )}

        {formTab === 'GUARDIAN' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Father&apos;s Name (SF1)</label>
                <input
                  maxLength={150}
                  value={formData.father_name}
                  onChange={(e) => onChangeFormData({ ...formData, father_name: e.target.value })}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>Mother&apos;s Maiden Name (SF1)</label>
                <input
                  maxLength={150}
                  value={formData.mother_maiden_name}
                  onChange={(e) => onChangeFormData({ ...formData, mother_maiden_name: e.target.value })}
                  style={ui.input}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Guardian Name (SF1)</label>
                <input
                  maxLength={150}
                  value={formData.guardian_name}
                  onChange={(e) => onChangeFormData({ ...formData, guardian_name: e.target.value })}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>Relationship</label>
                <input
                  maxLength={60}
                  value={formData.guardian_relationship}
                  onChange={(e) => onChangeFormData({ ...formData, guardian_relationship: e.target.value })}
                  style={ui.input}
                />
              </div>
            </div>
            <div>
              <label style={ui.label}>Guardian Contact Number (11 Digits, SF1 Record) *</label>
              <input
                maxLength={20}
                value={formData.guardian_contact}
                onChange={(e) => onChangeFormData({ ...formData, guardian_contact: e.target.value })}
                style={ui.input}
                placeholder="Enter 11-digit guardian contact number"
              />
            </div>
          </div>
        )}

        {formTab === 'DEPED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
              <div>
                <label style={ui.label}>Mother Tongue</label>
                <input
                  maxLength={80}
                  value={formData.mother_tongue}
                  onChange={(e) => onChangeFormData({ ...formData, mother_tongue: e.target.value })}
                  style={ui.input}
                />
              </div>
              <div>
                <label style={ui.label}>IP / Ethnic Group</label>
                <input
                  maxLength={80}
                  value={formData.ethnic_group}
                  onChange={(e) => onChangeFormData({ ...formData, ethnic_group: e.target.value })}
                  style={ui.input}
                />
              </div>
            </div>
            <div>
              <label style={ui.label}>Religion</label>
              <input
                maxLength={80}
                value={formData.religion}
                onChange={(e) => onChangeFormData({ ...formData, religion: e.target.value })}
                style={ui.input}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            loading={saving}
            disabled={saving || lrnCheck.is_taken || lrnCheck.checking}
          >
            {editingStudent ? 'Save Changes' : 'Enroll Student'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default StudentFormModal;
