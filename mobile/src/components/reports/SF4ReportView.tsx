// D:\AttendSure_V3\mobile\src\components\reports\SF4ReportView.tsx

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';

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

interface SF4ReportViewProps {
  data: any;
  gradeGroups: SF4GradeGroup[];
}

const parseGradeLevelAndSection = (gradeLevelInput: string, existingSectionName?: string) => {
  const cleanGrade = (gradeLevelInput || '').trim();
  const cleanSection = (existingSectionName || '').trim();

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

export const SF4ReportView: React.FC<SF4ReportViewProps> = ({ data, gradeGroups }) => {
  if (!data) return null;

  const leftLogoUrl = data.left_logo || null;
  const rightLogoUrl = data.right_logo || null;

  const renderMetricCells = (triplet?: MetricTriplet) => (
    <>
      <Text style={styles.tdCenter}>{triplet ? triplet.m : 0}</Text>
      <Text style={styles.tdCenter}>{triplet ? triplet.f : 0}</Text>
      <Text style={[styles.tdCenter, { fontWeight: '700' }]}>{triplet ? triplet.total : 0}</Text>
    </>
  );

  return (
    <View style={styles.sheetContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={styles.officialDocumentCanvas}>
          {/* DMOS Header */}
          <View style={styles.headerContainer}>
            <View style={styles.logoBox}>
              {leftLogoUrl ? (
                <Image source={{ uri: leftLogoUrl }} style={styles.logoImage} contentFit="contain" />
              ) : null}
            </View>

            <View style={styles.headerCenterContent}>
              <Text style={styles.republicText}>Republic of the Philippines</Text>
              <Text style={styles.depedText}>Department of Education</Text>
              {data.region ? <Text style={styles.subOfficeText}>{data.region.toUpperCase()}</Text> : null}
              {data.division ? <Text style={styles.subOfficeText}>{data.division.toUpperCase()}</Text> : null}

              <Text style={styles.formTitle}>School Form 4 (SF 4) Monthly Learner's Movement and Attendance</Text>
              <Text style={styles.formSub}>(Consolidated Learner Movement and Monthly Attendance Summary)</Text>
            </View>

            <View style={styles.logoBox}>
              {rightLogoUrl ? (
                <Image source={{ uri: rightLogoUrl }} style={styles.logoImage} contentFit="contain" />
              ) : null}
            </View>
          </View>

          {/* Metadata Grid */}
          <View style={styles.metaGrid}>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School ID: </Text>{data.school_id || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Region: </Text>{data.region || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Division: </Text>{data.division || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>District: </Text>{data.district || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School Name: </Text>{data.school_name || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School Year: </Text>{data.school_year || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Report Month: </Text>{data.month || '—'} {data.year}</Text>
            </View>
          </View>

          {/* 39-Column SF4 Matrix Table */}
          <View style={styles.table}>
            <View style={styles.thRow1}>
              <Text style={[styles.th, { width: 95 }]}>NAME OF ADVISER</Text>
              <Text style={[styles.th, { width: 75 }]}>GRADE LEVEL</Text>
              <Text style={[styles.th, { width: 70 }]}>SECTION</Text>
              <Text style={[styles.th, { width: 90 }]}>REGISTERED{'\n'}(End of Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>ATTENDANCE{'\n'}(Daily Average)</Text>
              <Text style={[styles.th, { width: 90 }]}>ATTENDANCE{'\n'}(Percentage)</Text>
              <Text style={[styles.th, { width: 90 }]}>DROPPED OUT{'\n'}(Prev Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>DROPPED OUT{'\n'}(For Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>DROPPED OUT{'\n'}(Cumulative)</Text>
              <Text style={[styles.th, { width: 90 }]}>TRANSFERRED OUT{'\n'}(Prev Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>TRANSFERRED OUT{'\n'}(For Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>TRANSFERRED OUT{'\n'}(Cumulative)</Text>
              <Text style={[styles.th, { width: 90 }]}>TRANSFERRED IN{'\n'}(Prev Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>TRANSFERRED IN{'\n'}(For Month)</Text>
              <Text style={[styles.th, { width: 90 }]}>TRANSFERRED IN{'\n'}(Cumulative)</Text>
            </View>

            <View style={styles.thRow2}>
              <View style={{ width: 95 + 75 + 70 }} />
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={`mft-th-${i}`} style={styles.mftGroup}>
                  <Text style={styles.mftTh}>M</Text>
                  <Text style={styles.mftTh}>F</Text>
                  <Text style={[styles.mftTh, { fontWeight: '800' }]}>T</Text>
                </View>
              ))}
            </View>

            <View style={styles.rowCategory}>
              <Text style={styles.categoryText}>ELEMENTARY/SECONDARY:</Text>
            </View>

            {gradeGroups.map((group) => {
              const { grade: groupGrade, section: groupSection } = parseGradeLevelAndSection(group.grade_level);
              return (
                <React.Fragment key={`group-${group.grade_level}`}>
                  {group.sections && group.sections.length > 0 ? (
                    <>
                      {group.sections.map((sec) => {
                        const { grade: secGrade, section: secName } = parseGradeLevelAndSection(sec.grade_level, sec.section_name);
                        return (
                          <View key={`sec-${sec.section_id}`} style={styles.tdRow}>
                            <Text style={[styles.td, { width: 95, textAlign: 'left', paddingLeft: 4 }]}>{sec.adviser_name}</Text>
                            <Text style={[styles.td, { width: 75, fontWeight: '700' }]}>{secGrade}</Text>
                            <Text style={[styles.td, { width: 70 }]}>{secName}</Text>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.registered_end)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.daily_average)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.attendance_percentage)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.dropped_out_prev)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.dropped_out_month)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.dropped_out_cumulative)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.transferred_out_prev)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.transferred_out_month)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.transferred_out_cumulative)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.transferred_in_prev)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.transferred_in_month)}</View>
                            <View style={styles.mftGroup}>{renderMetricCells(sec.transferred_in_cumulative)}</View>
                          </View>
                        );
                      })}
                      <View style={styles.subtotalRow}>
                        <Text style={[styles.td, { width: 240, textAlign: 'left', paddingLeft: 6, fontWeight: '800' }]}>
                          TOTAL FOR {groupGrade.toUpperCase()}
                        </Text>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.registered_end)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.daily_average)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.attendance_percentage)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.dropped_out_prev)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.dropped_out_month)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.dropped_out_cumulative)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_out_prev)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_out_month)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_out_cumulative)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_in_prev)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_in_month)}</View>
                        <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_in_cumulative)}</View>
                      </View>
                    </>
                  ) : (
                    <View style={styles.tdRow}>
                      <Text style={[styles.td, { width: 95 }]}></Text>
                      <Text style={[styles.td, { width: 75, fontWeight: '700' }]}>{groupGrade}</Text>
                      <Text style={[styles.td, { width: 70 }]}>{groupSection}</Text>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.registered_end)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.daily_average)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.attendance_percentage)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.dropped_out_prev)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.dropped_out_month)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.dropped_out_cumulative)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_out_prev)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_out_month)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_out_cumulative)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_in_prev)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_in_month)}</View>
                      <View style={styles.mftGroup}>{renderMetricCells(group.subtotal?.transferred_in_cumulative)}</View>
                    </View>
                  )}
                </React.Fragment>
              );
            })}

            {data.non_graded_summary && (
              <View style={styles.subtotalRow}>
                <Text style={[styles.td, { width: 240, textAlign: 'left', paddingLeft: 6, fontWeight: '800' }]}>
                  TOTAL FOR NON-GRADED
                </Text>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.registered_end)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.daily_average)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.attendance_percentage)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.dropped_out_prev)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.dropped_out_month)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.dropped_out_cumulative)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.transferred_out_prev)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.transferred_out_month)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.transferred_out_cumulative)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.transferred_in_prev)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.transferred_in_month)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.non_graded_summary.transferred_in_cumulative)}</View>
              </View>
            )}

            {data.total_summary && (
              <View style={[styles.subtotalRow, { backgroundColor: '#e2e8f0' }]}>
                <Text style={[styles.td, { width: 240, textAlign: 'left', paddingLeft: 6, fontWeight: '900' }]}>
                  TOTAL
                </Text>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.registered_end)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.daily_average)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.attendance_percentage)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.dropped_out_prev)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.dropped_out_month)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.dropped_out_cumulative)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.transferred_out_prev)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.transferred_out_month)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.transferred_out_cumulative)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.transferred_in_prev)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.transferred_in_month)}</View>
                <View style={styles.mftGroup}>{renderMetricCells(data.total_summary.transferred_in_cumulative)}</View>
              </View>
            )}
          </View>

          {/* Guidelines & Signatures */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryInfoCol}>
              <Text style={styles.summaryTitle}>GUIDELINES:</Text>
              <Text style={styles.summaryText}>1. This form shall be accomplished every end of the month.</Text>
              <Text style={styles.summaryText}>2. Furnish copy to Division Office: a week after June 30, October 30 &amp; March 31.</Text>
            </View>

            <View style={styles.signCol}>
              <View style={styles.signBlock}>
                <Text style={styles.signName}>{data.school_head || 'School Head Name'}</Text>
                <View style={styles.signLine} />
                <Text style={styles.signCaption}>Prepared and Submitted by: (School Head)</Text>
              </View>
            </View>
          </View>

          {/* Official DMOS Footer */}
          <View style={styles.dmosFooterStyle}>
            <View style={styles.logoBox}>
              {leftLogoUrl ? (
                <Image source={{ uri: leftLogoUrl }} style={styles.logoImage} contentFit="contain" />
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dmosFooterDetailsStyle}>
                <Text style={{ fontWeight: 'bold' }}>Address: </Text>Lapasan, Cagayan de Oro City, Northern Mindanao, 9000{'\n'}
                <Text style={{ fontWeight: 'bold' }}>Contact No.: </Text>(088) 856-1234 &bull; <Text style={{ fontWeight: 'bold' }}>Email: </Text>lapasan.nhs@deped.gov.ph
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0f172a',
    borderRadius: 4,
    padding: 10,
    marginBottom: 16,
  },
  officialDocumentCanvas: {
    width: 1100,
    backgroundColor: '#ffffff',
    paddingRight: 6,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    width: '100%',
  },
  logoBox: { width: 73, height: 73, alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 73, height: 73 },
  headerCenterContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  republicText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'American Typewriter' : 'serif',
  },
  depedText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'American Typewriter' : 'serif',
    marginTop: 1,
  },
  subOfficeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Tahoma' : 'sans-serif',
    marginTop: 2,
  },
  formTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#000000',
    marginTop: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  formSub: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#475569',
    marginBottom: 6,
    textAlign: 'center',
  },

  metaGrid: {
    borderWidth: 1,
    borderColor: '#0f172a',
    padding: 6,
    marginBottom: 8,
    backgroundColor: '#f8fafc',
    width: '100%',
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  metaCell: { fontSize: 8.5, color: '#0f172a' },
  metaKey: { fontWeight: '700' },

  table: { borderWidth: 1, borderColor: '#0f172a', width: '100%' },
  thRow1: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderBottomWidth: 1, borderColor: '#0f172a' },
  thRow2: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1.2, borderColor: '#0f172a' },
  th: {
    fontSize: 7,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 4,
    borderRightWidth: 1,
    borderColor: '#0f172a',
  },
  mftGroup: { width: 66, flexDirection: 'row', borderRightWidth: 1, borderColor: '#0f172a' },
  mftTh: { flex: 1, fontSize: 6.5, fontWeight: '800', textAlign: 'center', color: '#0f172a', paddingVertical: 2, borderRightWidth: 0.5, borderColor: '#cbd5e1' },

  rowCategory: { backgroundColor: '#f8fafc', paddingVertical: 2, paddingLeft: 6, borderBottomWidth: 1, borderColor: '#0f172a' },
  categoryText: { fontSize: 8.5, fontWeight: '800', color: '#0f172a' },

  tdRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', minHeight: 20 },
  subtotalRow: { flexDirection: 'row', borderBottomWidth: 1.2, borderColor: '#0f172a', backgroundColor: '#f8fafc', minHeight: 20 },
  td: { fontSize: 7.5, color: '#0f172a', textAlign: 'center', paddingVertical: 3, borderRightWidth: 1, borderColor: '#cbd5e1' },
  tdCenter: { flex: 1, fontSize: 7.5, textAlign: 'center', color: '#0f172a', paddingVertical: 3, borderRightWidth: 0.5, borderColor: '#cbd5e1' },

  summaryBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#0f172a',
    padding: 8,
    backgroundColor: '#f8fafc',
    marginTop: 4,
    width: '100%',
  },
  summaryInfoCol: { flex: 1.5, justifyContent: 'center' },
  summaryTitle: { fontSize: 9.5, fontWeight: '800', color: '#0f172a', marginBottom: 3 },
  summaryText: { fontSize: 8, color: '#334155', marginVertical: 0.5 },
  signCol: { flex: 1, justifyContent: 'center', paddingLeft: 10 },
  signBlock: { alignItems: 'center' },
  signName: { fontSize: 9.5, fontWeight: '800', color: '#0f172a' },
  signLine: { width: '100%', height: 1, backgroundColor: '#0f172a', marginTop: 2 },
  signCaption: { fontSize: 7.5, color: '#475569', marginTop: 1, textAlign: 'center' },

  dmosFooterStyle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 12,
    width: '100%',
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#000000',
  },
  dmosFooterDetailsStyle: {
    fontSize: 10,
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Calibri' : 'sans-serif',
    lineHeight: 14,
    textAlign: 'left',
  },
});

export default SF4ReportView;