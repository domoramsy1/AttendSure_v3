/**
 * AttendSure - School Form 1 (SF1) Official School Register View
 * File: mobile/src/components/reports/SF1ReportView.tsx
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { apiClient } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { cleanText, getFriendlyErrorMessage } from '../../constants/theme';
import { DepEdReportHeader, DepEdReportFooter } from './DepEdReportHeaderFooter';

export interface Learner {
  id: number;
  lrn: string;
  name: string;
  sex: string;
  birthdate: string;
  age: number | string;
  birth_place?: string;
  mother_tongue: string;
  ethnic_group: string;
  religion: string;
  house_street: string;
  barangay: string;
  municipality_city: string;
  province: string;
  father_name: string;
  mother_maiden_name: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_contact: string;
  remarks: string;
}

export interface SF1ReportViewProps {
  data: any;
  learners?: Learner[];
  sectionId?: number | string;
}

// Single source of truth for SF1 header & data column widths
const SF1_COLS = {
  num: 32,
  lrn: 95,
  name: 170,
  sex: 38,
  birthdate: 75,
  age: 36,
  motherTongue: 85,
  ipGroup: 75,
  religion: 75,
  address: 140,
  father: 120,
  mother: 120,
  guardian: 110,
  contact: 90,
  remarks: 80,
} as const;

const SF1_TABLE_INNER_WIDTH = Object.values(SF1_COLS).reduce((sum, w) => sum + w, 0); // 1341
const SF1_TABLE_WIDTH = SF1_TABLE_INNER_WIDTH + 2; // +2 for 1px left/right border
const SF1_CANVAS_WIDTH = SF1_TABLE_WIDTH + 12; // +6px padding on each side

export const SF1ReportView: React.FC<SF1ReportViewProps> = ({ data, learners, sectionId }) => {
  const { user } = useAuth();
  const { palette } = useThemeMode();
  const [groupingMode, setGroupingMode] = useState<'COMBINED' | 'SEPARATED'>('COMBINED');
  const [fetchedData, setFetchedData] = useState<any>(null);
  const [loadingSelf, setLoadingSelf] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  // Optional self-fetch if rendered standalone with sectionId and no parent-supplied data
  useEffect(() => {
    if (data || !sectionId) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingSelf(true);
    setLoadError(null);

    apiClient
      .get(`${ENDPOINTS.REPORT_SF1}${encodeURIComponent(String(sectionId))}/`, {
        signal: controller.signal,
      })
      .then((res) => {
        if (isMountedRef.current) {
          setFetchedData(res.data || null);
        }
      })
      .catch((err: unknown) => {
        if (axios.isCancel(err) || (err as { code?: string })?.code === 'ERR_CANCELED') {
          return;
        }
        if (isMountedRef.current) {
          setLoadError(getFriendlyErrorMessage(err, 'Could not load School Form 1 records.'));
        }
      })
      .finally(() => {
        if (isMountedRef.current) {
          setLoadingSelf(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [data, sectionId]);

  const activeData = data || fetchedData;

  // Dynamic Adviser Resolution
  const activeUserFullName =
    user?.full_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.teacher_name ||
    user?.username ||
    '';

  const userRole = String(user?.role || user?.system_role || 'TEACHER')
    .trim()
    .toUpperCase();

  const isTeacherRole = userRole === 'TEACHER';

  // 1. Memoized Combined Learner List (respects parent search-filtered learners prop)
  const sortedCombinedLearners = useMemo(() => {
    if (!activeData || activeData.has_enrolled_students === false) return [];
    const raw: Learner[] = Array.isArray(learners)
      ? learners
      : activeData.students || activeData.learners || [];
    return [...raw].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [activeData, learners]);

  // 2. Memoized Gender Breakdown
  const { maleLearners, femaleLearners } = useMemo(() => {
    if (!activeData || activeData.has_enrolled_students === false) {
      return { maleLearners: [], femaleLearners: [] };
    }
    const raw: Learner[] = Array.isArray(learners)
      ? learners
      : activeData.students || activeData.learners || [];
    const m = raw.filter((l: Learner) => l.sex === 'M' || l.sex === 'Male');
    const f = raw.filter((l: Learner) => l.sex === 'F' || l.sex === 'Female');
    return {
      maleLearners: [...m].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      femaleLearners: [...f].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    };
  }, [activeData, learners]);

  if (loadingSelf && !activeData) {
    return (
      <View
        style={[
          styles.stateBox,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <ActivityIndicator size="small" color={palette.primary} />
        <Text style={[styles.stateText, { color: palette.textSecondary }]}>
          Loading School Form 1...
        </Text>
      </View>
    );
  }

  if (loadError && !activeData) {
    return (
      <View
        style={[
          styles.stateBox,
          { backgroundColor: palette.surface, borderColor: palette.danger },
        ]}
      >
        <Ionicons name="alert-circle-outline" size={22} color={palette.danger} />
        <Text style={[styles.stateText, { color: palette.danger }]}>{loadError}</Text>
      </View>
    );
  }

  if (!activeData) return null;

  const resolvedAdviserName =
    (isTeacherRole && activeUserFullName.length > 0 ? activeUserFullName : null) ||
    activeData.adviser_name ||
    activeUserFullName ||
    'Class Adviser';

  const resolvedSchoolHead = cleanText(activeData.school_head, 160) || 'School Head';

  const formatLearnerAddress = (learner: Learner & { address?: string }) =>
    [learner.house_street, learner.barangay, learner.municipality_city, learner.province]
      .map((part) => cleanText(part, 100))
      .filter(Boolean)
      .join(', ') ||
    cleanText(learner.address, 200) ||
    '';

  const maleCount = activeData.total_male ?? maleLearners.length;
  const femaleCount = activeData.total_female ?? femaleLearners.length;
  const totalCount = activeData.total_combined ?? maleCount + femaleCount;

  const activeStudentList =
    groupingMode === 'COMBINED'
      ? sortedCombinedLearners
      : [...maleLearners, ...femaleLearners];
  const isListEmpty = activeStudentList.length === 0;

  // Sanitized guardian parser
  const parseGuardian = (name: string, rel: string) => {
    const commonRel = [
      'MOTHER',
      'FATHER',
      'AUNT',
      'UNCLE',
      'GRANDMOTHER',
      'GRANDFATHER',
      'GUARDIAN',
    ];
    const safeName = cleanText(name, 120);
    const safeRel = cleanText(rel, 60);
    if (
      commonRel.includes(safeName.toUpperCase()) &&
      !commonRel.includes(safeRel.toUpperCase())
    ) {
      return { gName: safeRel, gRel: safeName };
    }
    return { gName: safeName, gRel: safeRel.toLowerCase() === 'mather' ? 'Mother' : safeRel };
  };

  const renderLearnerRow = (learner: Learner, idx: number, forcedSex?: 'M' | 'F') => {
    const { gName } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
    return (
      <View key={String(learner.id || idx)} style={styles.tdRow}>
        <Text style={[styles.td, { width: SF1_COLS.num }]}>{idx + 1}</Text>
        <Text style={[styles.td, { width: SF1_COLS.lrn, fontWeight: '700' }]}>
          {cleanText(learner.lrn, 30)}
        </Text>
        <Text
          style={[
            styles.td,
            { width: SF1_COLS.name, textAlign: 'left', paddingLeft: 4, fontWeight: '700' },
          ]}
        >
          {cleanText(learner.name, 120)}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.sex }]}>
          {forcedSex || cleanText(learner.sex, 10)}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.birthdate }]}>
          {cleanText(learner.birthdate, 30)}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.age }]}>{learner.age}</Text>
        <Text style={[styles.td, { width: SF1_COLS.motherTongue }]}>
          {cleanText(learner.mother_tongue, 60)}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.ipGroup }]}>
          {cleanText(learner.ethnic_group, 60) || 'N/A'}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.religion }]}>
          {cleanText(learner.religion, 60) || 'N/A'}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.address, textAlign: 'left', paddingLeft: 4 }]}>
          {formatLearnerAddress(learner)}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.father, textAlign: 'left', paddingLeft: 4 }]}>
          {cleanText(learner.father_name, 100) || 'N/A'}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.mother, textAlign: 'left', paddingLeft: 4 }]}>
          {cleanText(learner.mother_maiden_name, 100) || 'N/A'}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.guardian, textAlign: 'left', paddingLeft: 4 }]}>
          {gName || 'N/A'}
        </Text>
        <Text style={[styles.td, { width: SF1_COLS.contact }]}>
          {cleanText(learner.guardian_contact, 40) || 'N/A'}
        </Text>
        <Text style={[styles.td, styles.lastCell, { width: SF1_COLS.remarks }]}>
          {cleanText(learner.remarks, 120)}
        </Text>
      </View>
    );
  };

  const leftLogoUrl = activeData.left_logo || null;
  const rightLogoUrl = activeData.right_logo || null;

  return (
    <View
      style={[
        styles.sheetContainer,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
      ]}
    >
      {/* Interactive Layout Mode Control Bar */}
      <View
        style={[
          styles.controlBar,
          { backgroundColor: palette.surfaceSubtle, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.controlLabel, { color: palette.textPrimary }]}>
          Class List Layout:
        </Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              {
                backgroundColor:
                  groupingMode === 'COMBINED' ? palette.buttonBg : palette.surface,
                borderColor:
                  groupingMode === 'COMBINED' ? palette.buttonBg : palette.borderStrong,
              },
            ]}
            onPress={() => setGroupingMode('COMBINED')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="people-outline"
              size={13}
              color={groupingMode === 'COMBINED' ? palette.onPrimary : palette.textSecondary}
            />
            <Text
              style={[
                styles.toggleText,
                {
                  color: groupingMode === 'COMBINED' ? palette.onPrimary : palette.textSecondary,
                },
              ]}
            >
              One List
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleBtn,
              {
                backgroundColor:
                  groupingMode === 'SEPARATED' ? palette.buttonBg : palette.surface,
                borderColor:
                  groupingMode === 'SEPARATED' ? palette.buttonBg : palette.borderStrong,
              },
            ]}
            onPress={() => setGroupingMode('SEPARATED')}
            activeOpacity={0.8}
          >
            <Ionicons
              name="git-branch-outline"
              size={13}
              color={groupingMode === 'SEPARATED' ? palette.onPrimary : palette.textSecondary}
            />
            <Text
              style={[
                styles.toggleText,
                {
                  color: groupingMode === 'SEPARATED' ? palette.onPrimary : palette.textSecondary,
                },
              ]}
            >
              By Sex
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Full Sheet Document Horizontal Scroll (Width matched to column sum) */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.officialDocumentCanvas}>
          {/* 1. Official DepEd DMOS Header */}
          <DepEdReportHeader
            leftLogoUrl={leftLogoUrl}
            rightLogoUrl={rightLogoUrl}
            region={activeData.region}
            division={activeData.division}
            formTitle="School Form 1 (SF 1) School Register"
            formSubtitle="(This replaces Form 1, Master List & STS Form 2)"
          />

          {/* 2. Metadata Grid */}
          <View style={styles.metaGrid}>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>School ID: </Text>
                {activeData.school_id || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>Region: </Text>
                {activeData.region || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>Division: </Text>
                {activeData.division || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>District: </Text>
                {activeData.district || '—'}
              </Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>School Name: </Text>
                {activeData.school_name || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>School Year: </Text>
                {activeData.academic_year || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>Grade Level: </Text>
                {activeData.grade_level || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>Section: </Text>
                {activeData.section_name || '—'}
              </Text>
            </View>
          </View>

          {/* 3. SF1 Official Table */}
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, { width: SF1_COLS.num }]}>#</Text>
              <Text style={[styles.th, { width: SF1_COLS.lrn }]}>LRN</Text>
              <Text style={[styles.th, { width: SF1_COLS.name }]}>
                LEARNER&apos;S NAME{'\n'}(Last, First, Middle)
              </Text>
              <Text style={[styles.th, { width: SF1_COLS.sex }]}>SEX</Text>
              <Text style={[styles.th, { width: SF1_COLS.birthdate }]}>BIRTH DATE</Text>
              <Text style={[styles.th, { width: SF1_COLS.age }]}>AGE</Text>
              <Text style={[styles.th, { width: SF1_COLS.motherTongue }]}>MOTHER TONGUE</Text>
              <Text style={[styles.th, { width: SF1_COLS.ipGroup }]}>IP GROUP</Text>
              <Text style={[styles.th, { width: SF1_COLS.religion }]}>RELIGION</Text>
              <Text style={[styles.th, { width: SF1_COLS.address }]}>ADDRESS</Text>
              <Text style={[styles.th, { width: SF1_COLS.father }]}>FATHER&apos;S NAME</Text>
              <Text style={[styles.th, { width: SF1_COLS.mother }]}>MOTHER&apos;S MAIDEN</Text>
              <Text style={[styles.th, { width: SF1_COLS.guardian }]}>GUARDIAN</Text>
              <Text style={[styles.th, { width: SF1_COLS.contact }]}>CONTACT</Text>
              <Text style={[styles.th, styles.lastCell, { width: SF1_COLS.remarks }]}>
                REMARKS
              </Text>
            </View>

            {isListEmpty ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: '#64748b' }}>
                  {activeData.notice ||
                    `No students enrolled in Section ${activeData.section_name || 'this class'}.`}
                </Text>
              </View>
            ) : groupingMode === 'COMBINED' ? (
              activeStudentList.map((learner: Learner, idx: number) =>
                renderLearnerRow(learner, idx)
              )
            ) : (
              <>
                <View style={styles.genderHeader}>
                  <Text style={styles.genderHeaderText}>MALE ({maleLearners.length})</Text>
                </View>
                {maleLearners.map((learner: Learner, idx: number) =>
                  renderLearnerRow(learner, idx, 'M')
                )}

                <View style={[styles.genderHeader, { backgroundColor: '#fdf2f8' }]}>
                  <Text style={[styles.genderHeaderText, { color: '#db2777' }]}>
                    FEMALE ({femaleLearners.length})
                  </Text>
                </View>
                {femaleLearners.map((learner: Learner, idx: number) =>
                  renderLearnerRow(learner, idx, 'F')
                )}
              </>
            )}
          </View>

          {/* 4. Official DepEd Indicators & Remarks Guide Box */}
          <View style={styles.remarksGuideContainer}>
            <Text style={styles.remarksGuideTitle}>
              List and Code of Indicators under REMARKS column:
            </Text>
            <View style={styles.remarksGrid}>
              <View style={styles.remarksCol}>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Transferred Out (T/O): </Text>
                  Name of Public (P) / Private (PR) School &amp; Effectivity Date
                </Text>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Transferred In (T/I): </Text>
                  Name of Public (P) / Private (PR) School &amp; Effectivity Date
                </Text>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>CCT Recipient: </Text>
                  CCT C/H ID Number &amp; Effectivity Date
                </Text>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Balik-Aral (B/A): </Text>
                  Name of school last attended &amp; Year
                </Text>
              </View>
              <View style={styles.remarksCol}>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Dropped Out (DRP): </Text>
                  Reason and Effectivity Date
                </Text>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Late Enrollment (LE): </Text>
                  Reason for enrollment beyond 1st Friday of June
                </Text>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Learner With Disability (LWD): </Text>
                  Specify condition
                </Text>
                <Text style={styles.remarksItem}>
                  <Text style={styles.codeBold}>Accelerated (ACL): </Text>
                  Specify Level &amp; Effectivity Date
                </Text>
              </View>
            </View>
          </View>

          {/* 5. Summary Box & Dynamic Signatures */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryInfoCol}>
              <Text style={styles.summaryTitle}>Registered Learners Summary</Text>
              <Text style={styles.summaryText}>
                Male: <Text style={{ fontWeight: '800' }}>{maleCount}</Text>
              </Text>
              <Text style={styles.summaryText}>
                Female: <Text style={{ fontWeight: '800' }}>{femaleCount}</Text>
              </Text>
              <Text style={styles.summaryText}>
                Total Enrolled: <Text style={{ fontWeight: '800' }}>{totalCount}</Text>
              </Text>
            </View>

            <View style={styles.signCol}>
              <View style={styles.signBlock}>
                <Text style={styles.signName}>{resolvedAdviserName}</Text>
                <View style={styles.signLine} />
                <Text style={styles.signCaption}>Prepared by (Class Adviser)</Text>
              </View>

              <View style={styles.signBlock}>
                <Text style={styles.signName}>{resolvedSchoolHead}</Text>
                <View style={styles.signLine} />
                <Text style={styles.signCaption}>Certified Correct (School Head)</Text>
              </View>
            </View>
          </View>

          {/* 6. Official DepEd DMOS Footer */}
          <DepEdReportFooter
            schoolLogoUrl={activeData.school_logo || activeData.right_logo || null}
            address={activeData.school_address || activeData.address}
            contactNumber={activeData.school_contact || activeData.contact_number}
            email={activeData.school_email || activeData.email}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  stateBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  stateText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  sheetContainer: {
    borderWidth: 1.5,
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  controlLabel: { fontSize: 10.5, fontWeight: '800' },
  toggleRow: { flexDirection: 'row', gap: 6 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
  },
  toggleText: { fontSize: 10.5, fontWeight: '700' },

  officialDocumentCanvas: {
    width: SF1_CANVAS_WIDTH,
    backgroundColor: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },

  metaGrid: {
    borderWidth: 1,
    borderColor: '#0f172a',
    padding: 6,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    width: SF1_TABLE_WIDTH,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  metaCell: { fontSize: 9, color: '#0f172a' },
  metaKey: { fontWeight: '700' },

  table: { borderWidth: 1, borderColor: '#0f172a', width: SF1_TABLE_WIDTH },
  thRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderColor: '#0f172a',
  },
  th: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 4,
    borderRightWidth: 1,
    borderColor: '#0f172a',
  },
  genderHeader: {
    backgroundColor: '#eff6ff',
    paddingVertical: 2,
    paddingLeft: 6,
    borderBottomWidth: 1,
    borderColor: '#0f172a',
  },
  genderHeaderText: { fontSize: 8.5, fontWeight: '800', color: '#0284c7' },
  tdRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', minHeight: 20 },
  td: {
    fontSize: 8,
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 3,
    borderRightWidth: 1,
    borderColor: '#cbd5e1',
  },
  lastCell: {
    borderRightWidth: 0,
  },

  remarksGuideContainer: {
    borderWidth: 1,
    borderColor: '#0f172a',
    backgroundColor: '#ffffff',
    padding: 6,
    marginTop: 4,
    width: SF1_TABLE_WIDTH,
  },
  remarksGuideTitle: {
    fontSize: 8,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  remarksGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  remarksCol: {
    flex: 1,
  },
  remarksItem: {
    fontSize: 7.2,
    color: '#1e293b',
    lineHeight: 10,
    marginVertical: 0.5,
  },
  codeBold: {
    fontWeight: '800',
    color: '#0f172a',
  },

  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#0f172a',
    padding: 8,
    backgroundColor: '#f8fafc',
    marginTop: 4,
    width: SF1_TABLE_WIDTH,
  },
  summaryInfoCol: { flex: 1, justifyContent: 'center' },
  summaryTitle: { fontSize: 10, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  summaryText: { fontSize: 9, color: '#334155', marginVertical: 1 },
  signCol: { flex: 1.5, flexDirection: 'row', justifyContent: 'space-around', gap: 10 },
  signBlock: { flex: 1, alignItems: 'center' },
  signName: { fontSize: 9.5, fontWeight: '800', color: '#0f172a' },
  signLine: { width: '100%', height: 1, backgroundColor: '#0f172a', marginTop: 2 },
  signCaption: { fontSize: 7.5, color: '#475569', marginTop: 1, textAlign: 'center' },
});

export default SF1ReportView;
