// D:\AttendSure_V3\mobile\src\components\reports\SF2ReportView.tsx

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';

interface SchoolDay {
  dateNumber: number;
  dayOfWeek: 'M' | 'T' | 'W' | 'TH' | 'F';
  fullDate: string;
}

interface SF2Learner {
  id: number;
  lrn: string;
  name: string;
  sex: 'M' | 'F';
  attendance: { [dayNumber: number]: string | number };
  total_absent: number;
  total_tardy: number;
  remarks: string;
}

interface SF2ReportViewProps {
  data: any;
  learners: any[];
}

export const SF2ReportView: React.FC<SF2ReportViewProps> = ({ data, learners }) => {
  if (!data) return null;

  const schoolDays: SchoolDay[] = Array.isArray(data.school_days) ? data.school_days : [];
  const males: SF2Learner[] = Array.isArray(data.males) ? data.males : [];
  const females: SF2Learner[] = Array.isArray(data.females) ? data.females : [];

  const dailyAttendanceTotals = useMemo(() => {
    const maxCols = 25;
    const malesCount: number[] = new Array(maxCols).fill(0);
    const femalesCount: number[] = new Array(maxCols).fill(0);
    const combinedCount: number[] = new Array(maxCols).fill(0);

    schoolDays.forEach((day, idx) => {
      if (idx >= maxCols) return;
      let mPresent = 0;
      let fPresent = 0;

      males.forEach((m) => {
        const status = String(m.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (status === 'present' || status === 'tardy' || status === 'cutting' || status === '0' || status === '') {
          mPresent++;
        }
      });

      females.forEach((f) => {
        const status = String(f.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (status === 'present' || status === 'tardy' || status === 'cutting' || status === '0' || status === '') {
          fPresent++;
        }
      });

      malesCount[idx] = mPresent;
      femalesCount[idx] = fPresent;
      combinedCount[idx] = mPresent + fPresent;
    });

    return { males: malesCount, females: femalesCount, combined: combinedCount };
  }, [schoolDays, males, females]);

  const leftLogoUrl = data.left_logo || null;
  const rightLogoUrl = data.right_logo || null;

  const renderAttendanceCell = (status?: string | number | null) => {
    const s = String(status ?? '').toLowerCase().trim();
    let label = '';

    if (s === 'absent' || s === 'x' || s === '1' || s === 'a') {
      label = 'X';
    } else if (s === 'tardy' || s === 'late' || s === '2' || s === 't') {
      label = 'T';
    } else if (s === 'cutting' || s === 'cc' || s === '3' || s === 'c') {
      label = 'C';
    }

    return (
      <View style={[styles.attCell, label === 'X' && { backgroundColor: '#fee2e2' }]}>
        <Text style={[styles.attCellText, label === 'X' && { color: '#dc2626' }]}>{label}</Text>
      </View>
    );
  };

  const isRosterEmpty = males.length === 0 && females.length === 0;

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

              <Text style={styles.formTitle}>School Form 2 (SF 2) Daily Attendance Report of Learners</Text>
              <Text style={styles.formSub}>(Master List Daily Attendance Recording Profile)</Text>
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
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School Year: </Text>{data.academic_year || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Month: </Text>{data.month || '—'} {data.year}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School Name: </Text>{data.school_name || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Grade Level: </Text>{data.grade_level || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Section: </Text>{data.section_name || '—'}</Text>
            </View>
          </View>

          {/* 25-Day Matrix Table */}
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, { width: 28 }]}>#</Text>
              <Text style={[styles.th, { width: 160 }]}>LEARNER'S NAME{'\n'}(Last, First, Middle)</Text>
              {schoolDays.map((sd: SchoolDay, i: number) => (
                <View key={`day-${i}`} style={styles.dayCol}>
                  <Text style={styles.dayNumTh}>{sd.dateNumber}</Text>
                  <Text style={styles.dayNameTh}>{sd.dayOfWeek}</Text>
                </View>
              ))}
              <Text style={[styles.th, { width: 36 }]}>ABS</Text>
              <Text style={[styles.th, { width: 36 }]}>TAR</Text>
              <Text style={[styles.th, { width: 90 }]}>REMARKS</Text>
            </View>

            {isRosterEmpty ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#64748b' }}>
                  {data.notice || `No attendance records found for Section ${data.section_name}.`}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.genderHeader}>
                  <Text style={styles.genderHeaderText}>MALE ({males.length})</Text>
                </View>
                {males.map((m, idx) => (
                  <View key={`m-${m.id}`} style={styles.tdRow}>
                    <Text style={[styles.td, { width: 28 }]}>{idx + 1}</Text>
                    <Text style={[styles.td, { width: 160, textAlign: 'left', paddingLeft: 4, fontWeight: '700' }]}>{m.name}</Text>
                    {schoolDays.map((sd) => {
                      const status = m.attendance?.[sd.dateNumber];
                      return (
                        <View key={`m-${m.id}-d-${sd.dateNumber}`} style={[styles.td, styles.dayColTd]}>
                          {renderAttendanceCell(status)}
                        </View>
                      );
                    })}
                    <Text style={[styles.td, { width: 36, fontWeight: '800', color: '#dc2626' }]}>{m.total_absent || ''}</Text>
                    <Text style={[styles.td, { width: 36, fontWeight: '800', color: '#d97706' }]}>{m.total_tardy || ''}</Text>
                    <Text style={[styles.td, { width: 90 }]}>{m.remarks || ''}</Text>
                  </View>
                ))}

                <View style={styles.summaryRow}>
                  <Text style={[styles.td, { width: 188, textAlign: 'left', paddingLeft: 6, fontWeight: '800' }]}>
                    &larr; MALE | TOTAL Per Day &rarr;
                  </Text>
                  {schoolDays.map((_, i) => (
                    <Text key={`m-tot-${i}`} style={[styles.td, styles.dayColTd, { fontWeight: '800' }]}>
                      {dailyAttendanceTotals.males[i] || ''}
                    </Text>
                  ))}
                  <Text style={[styles.td, { width: 36, fontWeight: '800' }]}>
                    {males.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}
                  </Text>
                  <Text style={[styles.td, { width: 36, fontWeight: '800' }]}>
                    {males.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}
                  </Text>
                  <Text style={[styles.td, { width: 90 }]}></Text>
                </View>

                <View style={[styles.genderHeader, { backgroundColor: '#fdf2f8' }]}>
                  <Text style={[styles.genderHeaderText, { color: '#db2777' }]}>FEMALE ({females.length})</Text>
                </View>
                {females.map((f, idx) => (
                  <View key={`f-${f.id}`} style={styles.tdRow}>
                    <Text style={[styles.td, { width: 28 }]}>{idx + 1}</Text>
                    <Text style={[styles.td, { width: 160, textAlign: 'left', paddingLeft: 4, fontWeight: '700' }]}>{f.name}</Text>
                    {schoolDays.map((sd) => {
                      const status = f.attendance?.[sd.dateNumber];
                      return (
                        <View key={`f-${f.id}-d-${sd.dateNumber}`} style={[styles.td, styles.dayColTd]}>
                          {renderAttendanceCell(status)}
                        </View>
                      );
                    })}
                    <Text style={[styles.td, { width: 36, fontWeight: '800', color: '#dc2626' }]}>{f.total_absent || ''}</Text>
                    <Text style={[styles.td, { width: 36, fontWeight: '800', color: '#d97706' }]}>{f.total_tardy || ''}</Text>
                    <Text style={[styles.td, { width: 90 }]}>{f.remarks || ''}</Text>
                  </View>
                ))}

                <View style={styles.summaryRow}>
                  <Text style={[styles.td, { width: 188, textAlign: 'left', paddingLeft: 6, fontWeight: '800' }]}>
                    &larr; FEMALE | TOTAL Per Day &rarr;
                  </Text>
                  {schoolDays.map((_, i) => (
                    <Text key={`f-tot-${i}`} style={[styles.td, styles.dayColTd, { fontWeight: '800' }]}>
                      {dailyAttendanceTotals.females[i] || ''}
                    </Text>
                  ))}
                  <Text style={[styles.td, { width: 36, fontWeight: '800' }]}>
                    {females.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}
                  </Text>
                  <Text style={[styles.td, { width: 36, fontWeight: '800' }]}>
                    {females.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}
                  </Text>
                  <Text style={[styles.td, { width: 90 }]}></Text>
                </View>

                <View style={[styles.summaryRow, { backgroundColor: '#e2e8f0' }]}>
                  <Text style={[styles.td, { width: 188, textAlign: 'left', paddingLeft: 6, fontWeight: '900' }]}>
                    Combined TOTAL PER DAY
                  </Text>
                  {schoolDays.map((_, i) => (
                    <Text key={`c-tot-${i}`} style={[styles.td, styles.dayColTd, { fontWeight: '900' }]}>
                      {dailyAttendanceTotals.combined[i] || ''}
                    </Text>
                  ))}
                  <Text style={[styles.td, { width: 36, fontWeight: '900' }]}>
                    {males.reduce((acc, cur) => acc + (cur.total_absent || 0), 0) +
                      females.reduce((acc, cur) => acc + (cur.total_absent || 0), 0)}
                  </Text>
                  <Text style={[styles.td, { width: 36, fontWeight: '900' }]}>
                    {males.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0) +
                      females.reduce((acc, cur) => acc + (cur.total_tardy || 0), 0)}
                  </Text>
                  <Text style={[styles.td, { width: 90 }]}></Text>
                </View>
              </>
            )}
          </View>

          {/* Summary Indicators & Signatures */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryInfoCol}>
              <Text style={styles.summaryTitle}>Summary for the Month</Text>
              <Text style={styles.summaryText}>Registered Learners: <Text style={{ fontWeight: '800' }}>{data.metrics?.registered_end?.total ?? (males.length + females.length)}</Text></Text>
              <Text style={styles.summaryText}>Average Daily Attendance: <Text style={{ fontWeight: '800' }}>{Number(data.metrics?.average_daily_attendance?.total ?? 0).toFixed(1)}</Text></Text>
              <Text style={styles.summaryText}>Percentage of Attendance: <Text style={{ fontWeight: '800' }}>{Number(data.metrics?.percentage_attendance?.total ?? 0).toFixed(1)}%</Text></Text>
            </View>

            <View style={styles.signCol}>
              <View style={styles.signBlock}>
                <Text style={styles.signName}>{data.adviser_name || 'Class Adviser'}</Text>
                <View style={styles.signLine} />
                <Text style={styles.signCaption}>Prepared by (Class Adviser)</Text>
              </View>
              <View style={styles.signBlock}>
                <Text style={styles.signName}>{data.school_head || 'School Head'}</Text>
                <View style={styles.signLine} />
                <Text style={styles.signCaption}>Attested by (School Head)</Text>
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
    width: 960,
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
    fontSize: 12.5,
    fontWeight: '900',
    color: '#000000',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  formSub: {
    fontSize: 8,
    fontStyle: 'italic',
    color: '#475569',
    marginBottom: 6,
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
  metaCell: { fontSize: 9, color: '#0f172a' },
  metaKey: { fontWeight: '700' },

  table: { borderWidth: 1, borderColor: '#0f172a', width: '100%' },
  thRow: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderBottomWidth: 1, borderColor: '#0f172a' },
  th: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    paddingVertical: 4,
    borderRightWidth: 1,
    borderColor: '#0f172a',
  },
  dayCol: { width: 22, alignItems: 'center', borderRightWidth: 1, borderColor: '#0f172a', paddingVertical: 1, backgroundColor: '#f1f5f9' },
  dayNumTh: { fontSize: 7.5, fontWeight: '800', color: '#0f172a' },
  dayNameTh: { fontSize: 6.5, color: '#475569' },

  genderHeader: { backgroundColor: '#eff6ff', paddingVertical: 2, paddingLeft: 6, borderBottomWidth: 1, borderColor: '#0f172a' },
  genderHeaderText: { fontSize: 8.5, fontWeight: '800', color: '#0284c7' },
  tdRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', minHeight: 20 },
  td: { fontSize: 8, color: '#0f172a', textAlign: 'center', paddingVertical: 3, borderRightWidth: 1, borderColor: '#cbd5e1' },
  dayColTd: { width: 22, padding: 0, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: 1.2, borderColor: '#0f172a', minHeight: 20 },

  attCell: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  attCellText: { fontSize: 9, fontWeight: '800', color: '#000000' },

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
  summaryInfoCol: { flex: 1, justifyContent: 'center' },
  summaryTitle: { fontSize: 10, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  summaryText: { fontSize: 9, color: '#334155', marginVertical: 1 },
  signCol: { flex: 1.5, flexDirection: 'row', justifyContent: 'space-around', gap: 10 },
  signBlock: { flex: 1, alignItems: 'center' },
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

export default SF2ReportView;