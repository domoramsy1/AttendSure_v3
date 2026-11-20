/**
 * AttendSure - School Form 4 (SF4) Monthly Learner's Movement and Attendance
 * File: mobile/src/components/reports/SF4ReportView.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { apiClient } from '../../api/client';
import { useThemeMode } from '../../context/ThemeContext';
import { cleanText, getFriendlyErrorMessage } from '../../constants/theme';
import { DepEdReportHeader, DepEdReportFooter } from './DepEdReportHeaderFooter';

export interface MetricTriplet {
  m: number;
  f: number;
  total: number;
}

export interface SF4SectionRecord {
  section_id: number | string;
  section_name: string;
  grade_level: string;
  adviser_name: string;
  registered_end: MetricTriplet;
  daily_average: MetricTriplet;
  attendance_percentage: MetricTriplet;
  dropped_out_prev: MetricTriplet;
  dropped_out_month: MetricTriplet;
  dropped_out_cumulative: MetricTriplet;
  transferred_out_prev: MetricTriplet;
  transferred_out_month: MetricTriplet;
  transferred_out_cumulative: MetricTriplet;
  transferred_in_prev: MetricTriplet;
  transferred_in_month: MetricTriplet;
  transferred_in_cumulative: MetricTriplet;
}

export interface SF4GradeGroup {
  grade_level: string;
  sections: SF4SectionRecord[];
  subtotal: SF4SectionRecord;
}

export interface SF4ReportViewProps {
  data: any;
  gradeGroups?: SF4GradeGroup[];
  month?: string;
  year?: number;
}

// Single source of truth for SF4 header & data widths (guarantees exact alignment)
const COL_ADVISER = 100;
const COL_GRADE = 75;
const COL_SECTION = 70;
const COL_LEFT_SPAN = COL_ADVISER + COL_GRADE + COL_SECTION; // 245
const COL_MFT_GROUP = 78; // 26px per M / F / T column across 12 metric groups
const MFT_GROUP_COUNT = 12;
const SF4_TABLE_INNER_WIDTH = COL_LEFT_SPAN + COL_MFT_GROUP * MFT_GROUP_COUNT; // 1181
const SF4_TABLE_WIDTH = SF4_TABLE_INNER_WIDTH + 2; // 1183 (includes 1px left/right border)
const SF4_CANVAS_WIDTH = SF4_TABLE_WIDTH + 12; // 1195 (includes 6px horizontal padding)

const SF4_METRIC_HEADERS = [
  'REGISTERED\n(End of Month)',
  'ATTENDANCE\n(Daily Average)',
  'ATTENDANCE\n(Percentage)',
  'DROPPED OUT\n(Prev Month)',
  'DROPPED OUT\n(For Month)',
  'DROPPED OUT\n(Cumulative)',
  'TRANSFERRED OUT\n(Prev Month)',
  'TRANSFERRED OUT\n(For Month)',
  'TRANSFERRED OUT\n(Cumulative)',
  'TRANSFERRED IN\n(Prev Month)',
  'TRANSFERRED IN\n(For Month)',
  'TRANSFERRED IN\n(Cumulative)',
] as const;

const parseGradeLevelAndSection = (gradeLevelInput: string, existingSectionName?: string) => {
  const cleanGrade = cleanText(gradeLevelInput, 80);
  const cleanSection = cleanText(existingSectionName, 80);

  if (cleanSection) {
    return { grade: cleanGrade, section: cleanSection };
  }

  if (cleanGrade.includes(' - ')) {
    const parts = cleanGrade.split(' - ');
    return {
      grade: parts[0].trim(),
      section: parts.slice(1).join(' - ').trim(),
    };
  }

  if (cleanGrade.includes('-') && !cleanGrade.toLowerCase().startsWith('non-')) {
    const parts = cleanGrade.split('-');
    if (parts.length === 2 && parts[0].toLowerCase().includes('grade')) {
      return {
        grade: parts[0].trim(),
        section: parts[1].trim(),
      };
    }
  }

  return { grade: cleanGrade, section: '' };
};

export const SF4ReportView: React.FC<SF4ReportViewProps> = ({
  data,
  gradeGroups,
  month,
  year,
}) => {
  const { palette } = useThemeMode();
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

  // Optional standalone fetch when rendered without parent data
  useEffect(() => {
    if (data || (!month && !year)) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingSelf(true);
    setLoadError(null);

    apiClient
      .get('reports/sf4/', {
        params: {
          ...(month ? { month } : {}),
          ...(year ? { year } : {}),
        },
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
          setLoadError(getFriendlyErrorMessage(err, 'Could not load School Form 4 records.'));
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
  }, [data, month, year]);

  const activeData = data || fetchedData;

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
          Loading School Form 4...
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

  const leftLogoUrl = activeData.left_logo || null;
  const rightLogoUrl = activeData.right_logo || null;

  const safeGroups: SF4GradeGroup[] = Array.isArray(gradeGroups)
    ? gradeGroups
    : Array.isArray(activeData.grade_groups)
    ? activeData.grade_groups
    : [];

  const renderMetricGroup = (triplet?: MetricTriplet, isLastGroup = false) => (
    <View style={[styles.mftGroup, isLastGroup && styles.lastCell]}>
      <Text style={styles.tdCenter}>{triplet ? triplet.m : 0}</Text>
      <Text style={styles.tdCenter}>{triplet ? triplet.f : 0}</Text>
      <Text style={[styles.tdCenter, styles.lastCell, { fontWeight: '700' }]}>
        {triplet ? triplet.total : 0}
      </Text>
    </View>
  );

  const renderAllMetrics = (record?: Partial<SF4SectionRecord> | null) => (
    <>
      {renderMetricGroup(record?.registered_end)}
      {renderMetricGroup(record?.daily_average)}
      {renderMetricGroup(record?.attendance_percentage)}
      {renderMetricGroup(record?.dropped_out_prev)}
      {renderMetricGroup(record?.dropped_out_month)}
      {renderMetricGroup(record?.dropped_out_cumulative)}
      {renderMetricGroup(record?.transferred_out_prev)}
      {renderMetricGroup(record?.transferred_out_month)}
      {renderMetricGroup(record?.transferred_out_cumulative)}
      {renderMetricGroup(record?.transferred_in_prev)}
      {renderMetricGroup(record?.transferred_in_month)}
      {renderMetricGroup(record?.transferred_in_cumulative, true)}
    </>
  );

  return (
    <View
      style={[
        styles.sheetContainer,
        { backgroundColor: palette.surface, borderColor: palette.borderStrong },
      ]}
    >
      <View
        style={[
          styles.scrollHintBar,
          { backgroundColor: palette.surfaceSubtle, borderColor: palette.border },
        ]}
      >
        <Ionicons name="swap-horizontal-outline" size={14} color={palette.primary} />
        <Text style={[styles.scrollHintText, { color: palette.textSecondary }]}>
          Swipe sideways to inspect all 39 consolidated columns
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.officialDocumentCanvas}>
          {/* 1. Official DepEd DMOS Header */}
          <DepEdReportHeader
            leftLogoUrl={leftLogoUrl}
            rightLogoUrl={rightLogoUrl}
            region={activeData.region}
            division={activeData.division}
            formTitle="School Form 4 (SF 4) Monthly Learner's Movement and Attendance"
            formSubtitle="(Consolidated Learner Movement and Monthly Attendance Summary)"
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
                {activeData.school_year || activeData.academic_year || '—'}
              </Text>
              <Text style={styles.metaCell}>
                <Text style={styles.metaKey}>Report Month: </Text>
                {activeData.month || '—'} {activeData.year || ''}
              </Text>
            </View>
          </View>

          {/* 3. 39-Column SF4 Matrix Table (aligned widths) */}
          <View style={styles.table}>
            <View style={styles.thRow1}>
              <Text style={[styles.th, { width: COL_ADVISER }]}>NAME OF ADVISER</Text>
              <Text style={[styles.th, { width: COL_GRADE }]}>GRADE LEVEL</Text>
              <Text style={[styles.th, { width: COL_SECTION }]}>SECTION</Text>
              {SF4_METRIC_HEADERS.map((label, idx) => (
                <Text
                  key={label}
                  style={[
                    styles.th,
                    { width: COL_MFT_GROUP },
                    idx === MFT_GROUP_COUNT - 1 && styles.lastCell,
                  ]}
                >
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.thRow2}>
              <View
                style={{
                  width: COL_LEFT_SPAN,
                  borderRightWidth: 1,
                  borderColor: '#0f172a',
                }}
              />
              {Array.from({ length: MFT_GROUP_COUNT }).map((_, i) => (
                <View
                  key={`mft-th-${i}`}
                  style={[styles.mftGroup, i === MFT_GROUP_COUNT - 1 && styles.lastCell]}
                >
                  <Text style={styles.mftTh}>M</Text>
                  <Text style={styles.mftTh}>F</Text>
                  <Text style={[styles.mftTh, styles.lastCell, { fontWeight: '800' }]}>T</Text>
                </View>
              ))}
            </View>

            <View style={styles.rowCategory}>
              <Text style={styles.categoryText}>ELEMENTARY/SECONDARY:</Text>
            </View>

            {safeGroups.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  No consolidated grade-level attendance summaries available for this month.
                </Text>
              </View>
            ) : (
              safeGroups.map((group) => {
                const { grade: groupGrade, section: groupSection } = parseGradeLevelAndSection(
                  group.grade_level
                );
                return (
                  <React.Fragment key={`group-${group.grade_level}`}>
                    {group.sections && group.sections.length > 0 ? (
                      <>
                        {group.sections.map((sec) => {
                          const { grade: secGrade, section: secName } = parseGradeLevelAndSection(
                            sec.grade_level,
                            sec.section_name
                          );
                          return (
                            <View key={`sec-${sec.section_id}`} style={styles.tdRow}>
                              <Text
                                style={[
                                  styles.td,
                                  { width: COL_ADVISER, textAlign: 'left', paddingLeft: 4 },
                                ]}
                              >
                                {cleanText(sec.adviser_name, 100)}
                              </Text>
                              <Text style={[styles.td, { width: COL_GRADE, fontWeight: '700' }]}>
                                {secGrade}
                              </Text>
                              <Text style={[styles.td, { width: COL_SECTION }]}>{secName}</Text>
                              {renderAllMetrics(sec)}
                            </View>
                          );
                        })}
                        <View style={styles.subtotalRow}>
                          <Text
                            style={[
                              styles.td,
                              {
                                width: COL_LEFT_SPAN,
                                textAlign: 'left',
                                paddingLeft: 6,
                                fontWeight: '800',
                                borderRightColor: '#0f172a',
                              },
                            ]}
                          >
                            TOTAL FOR {groupGrade.toUpperCase()}
                          </Text>
                          {renderAllMetrics(group.subtotal)}
                        </View>
                      </>
                    ) : (
                      <View style={styles.tdRow}>
                        <Text style={[styles.td, { width: COL_ADVISER }]} />
                        <Text style={[styles.td, { width: COL_GRADE, fontWeight: '700' }]}>
                          {groupGrade}
                        </Text>
                        <Text style={[styles.td, { width: COL_SECTION }]}>{groupSection}</Text>
                        {renderAllMetrics(group.subtotal)}
                      </View>
                    )}
                  </React.Fragment>
                );
              })
            )}

            {activeData.non_graded_summary && (
              <View style={styles.subtotalRow}>
                <Text
                  style={[
                    styles.td,
                    {
                      width: COL_LEFT_SPAN,
                      textAlign: 'left',
                      paddingLeft: 6,
                      fontWeight: '800',
                      borderRightColor: '#0f172a',
                    },
                  ]}
                >
                  TOTAL FOR NON-GRADED
                </Text>
                {renderAllMetrics(activeData.non_graded_summary)}
              </View>
            )}

            {activeData.total_summary && (
              <View style={[styles.subtotalRow, { backgroundColor: '#e2e8f0', borderBottomWidth: 0 }]}>
                <Text
                  style={[
                    styles.td,
                    {
                      width: COL_LEFT_SPAN,
                      textAlign: 'left',
                      paddingLeft: 6,
                      fontWeight: '900',
                      borderRightColor: '#0f172a',
                    },
                  ]}
                >
                  TOTAL
                </Text>
                {renderAllMetrics(activeData.total_summary)}
              </View>
            )}
          </View>

          {/* 4. Guidelines & Signatures */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryInfoCol}>
              <Text style={styles.summaryTitle}>GUIDELINES:</Text>
              <Text style={styles.summaryText}>
                1. This form shall be accomplished every end of the month.
              </Text>
              <Text style={styles.summaryText}>
                2. Furnish copy to Division Office: a week after June 30, October 30 &amp; March 31.
              </Text>
            </View>

            <View style={styles.signCol}>
              <View style={styles.signBlock}>
                <Text style={styles.signName}>
                  {cleanText(activeData.school_head, 160) || 'School Head'}
                </Text>
                <View style={styles.signLine} />
                <Text style={styles.signCaption}>Prepared and Submitted by: (School Head)</Text>
              </View>
            </View>
          </View>

          {/* 5. Official DepEd DMOS Footer */}
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
  scrollHintBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  scrollHintText: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  officialDocumentCanvas: {
    width: SF4_CANVAS_WIDTH,
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
    width: SF4_TABLE_WIDTH,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  metaCell: { fontSize: 8.5, color: '#0f172a' },
  metaKey: { fontWeight: '700' },

  table: { borderWidth: 1, borderColor: '#0f172a', width: SF4_TABLE_WIDTH },
  thRow1: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderBottomWidth: 1,
    borderColor: '#0f172a',
  },
  thRow2: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1.2,
    borderColor: '#0f172a',
  },
  th: {
    fontSize: 6.8,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderColor: '#0f172a',
  },
  mftGroup: {
    width: COL_MFT_GROUP,
    flexDirection: 'row',
    borderRightWidth: 1,
    borderColor: '#0f172a',
  },
  mftTh: {
    flex: 1,
    fontSize: 6.5,
    fontWeight: '800',
    textAlign: 'center',
    color: '#0f172a',
    paddingVertical: 2,
    borderRightWidth: 0.5,
    borderColor: '#cbd5e1',
  },
  lastCell: {
    borderRightWidth: 0,
  },

  rowCategory: {
    backgroundColor: '#f8fafc',
    paddingVertical: 2,
    paddingLeft: 6,
    borderBottomWidth: 1,
    borderColor: '#0f172a',
  },
  categoryText: { fontSize: 8.5, fontWeight: '800', color: '#0f172a' },
  emptyBox: { padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 10, color: '#64748b' },

  tdRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', minHeight: 20 },
  subtotalRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.2,
    borderColor: '#0f172a',
    backgroundColor: '#f8fafc',
    minHeight: 20,
  },
  td: {
    fontSize: 7.5,
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 3,
    borderRightWidth: 1,
    borderColor: '#cbd5e1',
  },
  tdCenter: {
    flex: 1,
    fontSize: 7.5,
    textAlign: 'center',
    color: '#0f172a',
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderColor: '#cbd5e1',
  },

  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#0f172a',
    padding: 8,
    backgroundColor: '#f8fafc',
    marginTop: 4,
    width: SF4_TABLE_WIDTH,
  },
  summaryInfoCol: { flex: 1.5, justifyContent: 'center' },
  summaryTitle: { fontSize: 9.5, fontWeight: '800', color: '#0f172a', marginBottom: 3 },
  summaryText: { fontSize: 8, color: '#334155', marginVertical: 0.5 },
  signCol: { flex: 1, justifyContent: 'center', paddingLeft: 10 },
  signBlock: { alignItems: 'center' },
  signName: { fontSize: 9.5, fontWeight: '800', color: '#0f172a' },
  signLine: { width: '100%', height: 1, backgroundColor: '#0f172a', marginTop: 2 },
  signCaption: { fontSize: 7.5, color: '#475569', marginTop: 1, textAlign: 'center' },
});

export default SF4ReportView;
