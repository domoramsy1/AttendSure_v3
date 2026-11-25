/**
 * AttendSure - Academic Structure Setup Modal (Themed)
 * File: web/src/components/modals/AcademicSetupModal.tsx
 * Manages Sections, Advisers, Schedules, Subject Teachers, Rooms, Subjects, and Grade Levels.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import apiClient from '../../api/client';
import { API_ROUTES, extractApiError } from '../../api/routes';
import { useTheme } from '../../context/ThemeContext';
import { useAlert } from '../../context/AlertContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  DoorOpen,
  Layers,
  Loader2,
  Users,
} from 'lucide-react';
import { alertBoxStyle, type AcademicSubTab } from './academic/academicShared';
import { SectionAdviserForm } from './academic/SectionAdviserForm';
import { SchedulePeriodForm } from './academic/SchedulePeriodForm';
import { SimpleLookupCrudForm, type SimpleLookupTab } from './academic/SimpleLookupCrudForm';

export type TabType =
  | 'SECTIONS'
  | 'SCHEDULE'
  | 'SECTION'
  | 'ROOM'
  | 'ROOMS'
  | 'SUBJECT'
  | 'SUBJECTS'
  | 'GRADES'
  | 'YEARS'
  | 'HOLIDAYS';

export interface AcademicSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
  onSuccess?: () => void;
  initialTab?: TabType;
  editItem?: any;
}

const normalizeTab = (tab: TabType): AcademicSubTab => {
  if (tab === 'SECTION' || tab === 'SECTIONS') return 'SECTIONS';
  if (tab === 'SCHEDULE') return 'SCHEDULE';
  if (tab === 'ROOM' || tab === 'ROOMS') return 'ROOMS';
  if (tab === 'SUBJECT' || tab === 'SUBJECTS') return 'SUBJECTS';
  if (tab === 'GRADES') return 'GRADES';
  if (tab === 'HOLIDAYS') return 'HOLIDAYS';
  return 'YEARS';
};

export const AcademicSetupModal: React.FC<AcademicSetupModalProps> = ({
  isOpen,
  onClose,
  onUpdated,
  onSuccess,
  initialTab = 'SECTIONS',
  editItem = null,
}) => {
  const { tokens, brand } = useTheme();
  const { showConfirm } = useAlert();

  const [activeSubTab, setActiveSubTab] = useState<AcademicSubTab>(normalizeTab(initialTab));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const [years, setYears] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [teacherList, setTeacherList] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<any[]>([]);

  const teachingTeachers = useMemo(
    () => teacherList.filter((t) => t.can_handle_classes !== false && t.can_teach !== false),
    [teacherList]
  );

  useEffect(() => {
    if (!initialTab) return;
    setActiveSubTab(normalizeTab(initialTab));
    setError(null);
    setSuccessMessage(null);
  }, [initialTab, editItem]);

  const loadData = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        apiClient.get(API_ROUTES.school.schoolYears, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.gradeLevels, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.rooms, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.subjects, { signal: controller.signal }),
        apiClient.get(API_ROUTES.school.sections, { params: { page_size: 300 }, signal: controller.signal }),
        apiClient
          .get(API_ROUTES.accounts.teachersDropdown, { signal: controller.signal })
          .catch(() =>
            apiClient.get(API_ROUTES.accounts.teachers, { params: { page_size: 300 }, signal: controller.signal })
          ),
        apiClient.get(API_ROUTES.school.periods, { params: { page_size: 300 }, signal: controller.signal }),
        apiClient.get(API_ROUTES.school.holidays, { params: { page_size: 200 }, signal: controller.signal }),
      ]);

      if (controller.signal.aborted) return;

      const getData = (res: PromiseSettledResult<any>) =>
        res.status === 'fulfilled' && res.value?.data
          ? Array.isArray(res.value.data)
            ? res.value.data
            : res.value.data.results || []
          : [];

      setYears(getData(results[0]));
      setGrades(getData(results[1]));
      setRooms(getData(results[2]));
      setSubjects(getData(results[3]));
      setSections(getData(results[4]));
      setTeacherList(getData(results[5]));
      setSchedules(getData(results[6]));
      setHolidays(getData(results[7]));
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setError(extractApiError(err, 'Could not load academic records.'));
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void loadData();
    }
    return () => {
      abortRef.current?.abort();
    };
  }, [isOpen, loadData]);

  const handleReloadAndNotify = useCallback(async () => {
    await loadData();
    onUpdated?.();
    onSuccess?.();
  }, [loadData, onUpdated, onSuccess]);

  const handleStatus = useCallback((err: string | null, success: string | null) => {
    setError(err);
    setSuccessMessage(success);
  }, []);

  const handleDeleteItem = useCallback(
    (baseRoute: string, id: number, label = 'Record') => {
      showConfirm({
        title: `Delete ${label}`,
        message: `Are you sure you want to permanently delete this ${label.toLowerCase()}?`,
        confirmLabel: 'Delete',
        isDestructive: true,
        onConfirm: async () => {
          setError(null);
          setSuccessMessage(null);
          try {
            await apiClient.delete(`${baseRoute}${id}/`);
            setSuccessMessage(`${label} deleted.`);
            await handleReloadAndNotify();
          } catch (err: unknown) {
            setError(extractApiError(err, `Could not delete ${label.toLowerCase()}.`));
          }
        },
      });
    },
    [showConfirm, handleReloadAndNotify]
  );

  const navTabs: Array<{ key: AcademicSubTab; label: string; icon: React.ReactNode }> = [
    { key: 'SECTIONS', label: 'Sections & Advisers', icon: <Users size={14} /> },
    { key: 'SCHEDULE', label: 'Schedules & Subject Teachers', icon: <Clock size={14} /> },
    { key: 'SUBJECTS', label: 'Subjects', icon: <BookOpen size={14} /> },
    { key: 'ROOMS', label: 'Classrooms', icon: <DoorOpen size={14} /> },
    { key: 'GRADES', label: 'Grade Levels', icon: <Layers size={14} /> },
    { key: 'YEARS', label: 'School Years', icon: <Calendar size={14} /> },
    { key: 'HOLIDAYS', label: 'Holidays', icon: <Calendar size={14} /> },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Academic Structure & Teacher Assignments">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            borderBottom: `1px solid ${tokens.borderSubtle}`,
            paddingBottom: 8,
            overflowX: 'auto',
          }}
        >
          {navTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveSubTab(tab.key);
                setError(null);
                setSuccessMessage(null);
              }}
              style={tabBtnStyle(activeSubTab === tab.key, brand.primary, tokens)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.76rem', color: tokens.textMuted }}>
            <Loader2 size={14} className="animate-spin" color={brand.primary} />
            <span>Loading academic records...</span>
          </div>
        )}

        {error && (
          <div style={alertBoxStyle(tokens.dangerLight, brand.danger)}>
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div style={alertBoxStyle(tokens.successLight, brand.success)}>
            <CheckCircle2 size={15} />
            <span>{successMessage}</span>
          </div>
        )}

        {activeSubTab === 'SECTIONS' && (
          <SectionAdviserForm
            key={`sections-${isOpen ? editItem?.id ?? 'new' : 'closed'}`}
            isOpen={isOpen}
            initialEditItem={normalizeTab(initialTab) === 'SECTIONS' ? editItem : null}
            grades={grades}
            sections={sections}
            teacherList={teacherList}
            teachingTeachers={teachingTeachers}
            onReload={handleReloadAndNotify}
            onDelete={handleDeleteItem}
            onStatus={handleStatus}
          />
        )}

        {activeSubTab === 'SCHEDULE' && (
          <SchedulePeriodForm
            key={`schedule-${isOpen ? editItem?.id ?? 'new' : 'closed'}`}
            isOpen={isOpen}
            initialEditItem={normalizeTab(initialTab) === 'SCHEDULE' ? editItem : null}
            sections={sections}
            subjects={subjects}
            schedules={schedules}
            teacherList={teacherList}
            teachingTeachers={teachingTeachers}
            onReload={handleReloadAndNotify}
            onDelete={handleDeleteItem}
            onStatus={handleStatus}
          />
        )}

        {activeSubTab !== 'SECTIONS' && activeSubTab !== 'SCHEDULE' && (
          <SimpleLookupCrudForm
            key={activeSubTab}
            isOpen={isOpen}
            activeSubTab={activeSubTab as SimpleLookupTab}
            rooms={rooms}
            subjects={subjects}
            grades={grades}
            years={years}
            holidays={holidays}
            onReload={handleReloadAndNotify}
            onDelete={handleDeleteItem}
            onStatus={handleStatus}
          />
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="secondary" size="md" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

const tabBtnStyle = (active: boolean, brandColor: string, tokens: any): React.CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: active ? `1px solid ${brandColor}` : '1px solid transparent',
  backgroundColor: active ? tokens.primaryLight : 'transparent',
  color: active ? brandColor : tokens.textSecondary,
  fontWeight: 700,
  fontSize: '0.78rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
});

export default AcademicSetupModal;
