// D:\AttendSure_V3\mobile\src\components\reports\SF1ReportView.tsx

import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

interface Learner {
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
  parent_contact: string;
  remarks: string;
}

interface SF1ReportViewProps {
  data: any;
  learners: Learner[];
}

export const SF1ReportView: React.FC<SF1ReportViewProps> = ({ data, learners }) => {
  if (!data) return null;

  const [groupingMode, setGroupingMode] = useState<'COMBINED' | 'SEPARATED'>('COMBINED');

  const sortedCombinedLearners = useMemo(() => {
    if (data.has_enrolled_students === false) return [];
    const raw: Learner[] = data.students || data.learners || learners || [];
    return [...raw].sort((a, b) => a.name.localeCompare(b.name));
  }, [data, learners]);

  const { maleLearners, femaleLearners } = useMemo(() => {
    if (data.has_enrolled_students === false) {
      return { maleLearners: [], femaleLearners: [] };
    }
    const raw: Learner[] = data.students || data.learners || learners || [];
    const m = raw.filter((l: Learner) => l.sex === 'M' || l.sex === 'Male');
    const f = raw.filter((l: Learner) => l.sex === 'F' || l.sex === 'Female');
    return {
      maleLearners: [...m].sort((a, b) => a.name.localeCompare(b.name)),
      femaleLearners: [...f].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }, [data, learners]);

  const maleCount = data.total_male ?? maleLearners.length;
  const femaleCount = data.total_female ?? femaleLearners.length;
  const totalCount = data.total_combined ?? (maleCount + femaleCount);

  const activeRosterList = groupingMode === 'COMBINED' ? sortedCombinedLearners : [...maleLearners, ...femaleLearners];
  const isRosterEmpty = activeRosterList.length === 0;

  const parseGuardian = (name: string, rel: string) => {
    const commonRel = ['MOTHER', 'FATHER', 'AUNT', 'UNCLE', 'GRANDMOTHER', 'GRANDFATHER', 'GUARDIAN'];
    const cleanName = (name || '').trim();
    const cleanRel = (rel || '').trim();
    if (commonRel.includes(cleanName.toUpperCase()) && !commonRel.includes(cleanRel.toUpperCase())) {
      return { gName: cleanRel, gRel: cleanName };
    }
    return { gName: cleanName, gRel: cleanRel === 'Mather' ? 'Mother' : cleanRel };
  };

  const leftLogoUrl = data.left_logo || null;
  const rightLogoUrl = data.right_logo || null;

  return (
    <View style={styles.sheetContainer}>
      {/* Layout Mode Control Bar */}
      <View style={styles.controlBar}>
        <Text style={styles.controlLabel}>Roster Layout:</Text>
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, groupingMode === 'COMBINED' && styles.toggleBtnActive]}
            onPress={() => setGroupingMode('COMBINED')}
          >
            <Ionicons name="people-outline" size={13} color={groupingMode === 'COMBINED' ? '#ffffff' : '#64748b'} />
            <Text style={[styles.toggleText, groupingMode === 'COMBINED' && styles.toggleTextActive]}>
              One List
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, groupingMode === 'SEPARATED' && styles.toggleBtnActive]}
            onPress={() => setGroupingMode('SEPARATED')}
          >
            <Ionicons name="git-branch-outline" size={13} color={groupingMode === 'SEPARATED' ? '#ffffff' : '#64748b'} />
            <Text style={[styles.toggleText, groupingMode === 'SEPARATED' && styles.toggleTextActive]}>
              By Sex
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Full Sheet Document Horizontal Scroll (920px Canvas) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={styles.officialDocumentCanvas}>
          {/* DMOS Header with 0.76" Seals and Zero Collisions */}
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

              <Text style={styles.formTitle}>School Form 1 (SF 1) School Register</Text>
              <Text style={styles.formSub}>(This replaces Form 1, Master List &amp; STS Form 2)</Text>
            </View>

            <View style={styles.logoBox}>
              {rightLogoUrl ? (
                <Image source={{ uri: rightLogoUrl }} style={styles.logoImage} contentFit="contain" />
              ) : null}
            </View>
          </View>

          {/* Metadata Grid (Clean 4-Column Row) */}
          <View style={styles.metaGrid}>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School ID: </Text>{data.school_id || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Region: </Text>{data.region || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Division: </Text>{data.division || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>District: </Text>{data.district || '—'}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School Name: </Text>{data.school_name || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>School Year: </Text>{data.academic_year || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Grade: </Text>{data.grade_level || '—'}</Text>
              <Text style={styles.metaCell}><Text style={styles.metaKey}>Section: </Text>{data.section_name || '—'}</Text>
            </View>
          </View>

          {/* SF1 Official Table */}
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, { width: 32 }]}>#</Text>
              <Text style={[styles.th, { width: 95 }]}>LRN</Text>
              <Text style={[styles.th, { width: 170 }]}>LEARNER'S NAME{'\n'}(Last, First, Middle)</Text>
              <Text style={[styles.th, { width: 38 }]}>SEX</Text>
              <Text style={[styles.th, { width: 75 }]}>BIRTH DATE</Text>
              <Text style={[styles.th, { width: 36 }]}>AGE</Text>
              <Text style={[styles.th, { width: 85 }]}>MOTHER TONGUE</Text>
              <Text style={[styles.th, { width: 75 }]}>IP GROUP</Text>
              <Text style={[styles.th, { width: 75 }]}>RELIGION</Text>
              <Text style={[styles.th, { width: 140 }]}>ADDRESS</Text>
              <Text style={[styles.th, { width: 120 }]}>FATHER'S NAME</Text>
              <Text style={[styles.th, { width: 120 }]}>MOTHER'S MAIDEN</Text>
              <Text style={[styles.th, { width: 110 }]}>GUARDIAN</Text>
              <Text style={[styles.th, { width: 90 }]}>CONTACT</Text>
              <Text style={[styles.th, { width: 80 }]}>REMARKS</Text>
            </View>

            {isRosterEmpty ? (
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: '#64748b' }}>
                  {data.notice || `No students enrolled in Section ${data.section_name}.`}
                </Text>
              </View>
            ) : groupingMode === 'COMBINED' ? (
              activeRosterList.map((learner: Learner, idx: number) => {
                const { gName } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                return (
                  <View key={String(learner.id || idx)} style={styles.tdRow}>
                    <Text style={[styles.td, { width: 32 }]}>{idx + 1}</Text>
                    <Text style={[styles.td, { width: 95, fontWeight: '700' }]}>{learner.lrn}</Text>
                    <Text style={[styles.td, { width: 170, textAlign: 'left', paddingLeft: 4, fontWeight: '700' }]}>{learner.name}</Text>
                    <Text style={[styles.td, { width: 38 }]}>{learner.sex}</Text>
                    <Text style={[styles.td, { width: 75 }]}>{learner.birthdate}</Text>
                    <Text style={[styles.td, { width: 36 }]}>{learner.age}</Text>
                    <Text style={[styles.td, { width: 85 }]}>{learner.mother_tongue}</Text>
                    <Text style={[styles.td, { width: 75 }]}>{learner.ethnic_group || 'N/A'}</Text>
                    <Text style={[styles.td, { width: 75 }]}>{learner.religion || 'N/A'}</Text>
                    <Text style={[styles.td, { width: 140, textAlign: 'left', paddingLeft: 4 }]}>{learner.barangay || learner.house_street || ''}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'left', paddingLeft: 4 }]}>{learner.father_name || 'N/A'}</Text>
                    <Text style={[styles.td, { width: 120, textAlign: 'left', paddingLeft: 4 }]}>{learner.mother_maiden_name || 'N/A'}</Text>
                    <Text style={[styles.td, { width: 110, textAlign: 'left', paddingLeft: 4 }]}>{gName || 'N/A'}</Text>
                    <Text style={[styles.td, { width: 90 }]}>{learner.parent_contact || 'N/A'}</Text>
                    <Text style={[styles.td, { width: 80 }]}>{learner.remarks || ''}</Text>
                  </View>
                );
              })
            ) : (
              <>
                <View style={styles.genderHeader}>
                  <Text style={styles.genderHeaderText}>MALE ({maleLearners.length})</Text>
                </View>
                {maleLearners.map((learner: Learner, idx: number) => {
                  const { gName } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                  return (
                    <View key={String(learner.id || idx)} style={styles.tdRow}>
                      <Text style={[styles.td, { width: 32 }]}>{idx + 1}</Text>
                      <Text style={[styles.td, { width: 95, fontWeight: '700' }]}>{learner.lrn}</Text>
                      <Text style={[styles.td, { width: 170, textAlign: 'left', paddingLeft: 4, fontWeight: '700' }]}>{learner.name}</Text>
                      <Text style={[styles.td, { width: 38 }]}>M</Text>
                      <Text style={[styles.td, { width: 75 }]}>{learner.birthdate}</Text>
                      <Text style={[styles.td, { width: 36 }]}>{learner.age}</Text>
                      <Text style={[styles.td, { width: 85 }]}>{learner.mother_tongue}</Text>
                      <Text style={[styles.td, { width: 75 }]}>{learner.ethnic_group || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 75 }]}>{learner.religion || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 140, textAlign: 'left', paddingLeft: 4 }]}>{learner.barangay || ''}</Text>
                      <Text style={[styles.td, { width: 120, textAlign: 'left', paddingLeft: 4 }]}>{learner.father_name || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 120, textAlign: 'left', paddingLeft: 4 }]}>{learner.mother_maiden_name || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 110, textAlign: 'left', paddingLeft: 4 }]}>{gName || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 90 }]}>{learner.parent_contact || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 80 }]}>{learner.remarks || ''}</Text>
                    </View>
                  );
                })}

                <View style={[styles.genderHeader, { backgroundColor: '#fdf2f8' }]}>
                  <Text style={[styles.genderHeaderText, { color: '#db2777' }]}>FEMALE ({femaleLearners.length})</Text>
                </View>
                {femaleLearners.map((learner: Learner, idx: number) => {
                  const { gName } = parseGuardian(learner.guardian_name, learner.guardian_relationship);
                  return (
                    <View key={String(learner.id || idx)} style={styles.tdRow}>
                      <Text style={[styles.td, { width: 32 }]}>{idx + 1}</Text>
                      <Text style={[styles.td, { width: 95, fontWeight: '700' }]}>{learner.lrn}</Text>
                      <Text style={[styles.td, { width: 170, textAlign: 'left', paddingLeft: 4, fontWeight: '700' }]}>{learner.name}</Text>
                      <Text style={[styles.td, { width: 38 }]}>F</Text>
                      <Text style={[styles.td, { width: 75 }]}>{learner.birthdate}</Text>
                      <Text style={[styles.td, { width: 36 }]}>{learner.age}</Text>
                      <Text style={[styles.td, { width: 85 }]}>{learner.mother_tongue}</Text>
                      <Text style={[styles.td, { width: 75 }]}>{learner.ethnic_group || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 75 }]}>{learner.religion || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 140, textAlign: 'left', paddingLeft: 4 }]}>{learner.barangay || ''}</Text>
                      <Text style={[styles.td, { width: 120, textAlign: 'left', paddingLeft: 4 }]}>{learner.father_name || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 120, textAlign: 'left', paddingLeft: 4 }]}>{learner.mother_maiden_name || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 110, textAlign: 'left', paddingLeft: 4 }]}>{gName || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 90 }]}>{learner.parent_contact || 'N/A'}</Text>
                      <Text style={[styles.td, { width: 80 }]}>{learner.remarks || ''}</Text>
                    </View>
                  );
                })}
              </>
            )}
          </View>

          {/* Summary Box & Signatures */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryInfoCol}>
              <Text style={styles.summaryTitle}>Registered Learners Summary</Text>
              <Text style={styles.summaryText}>Male: <Text style={{ fontWeight: '800' }}>{maleCount}</Text></Text>
              <Text style={styles.summaryText}>Female: <Text style={{ fontWeight: '800' }}>{femaleCount}</Text></Text>
              <Text style={styles.summaryText}>Total Enrolled: <Text style={{ fontWeight: '800' }}>{totalCount}</Text></Text>
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
                <Text style={styles.signCaption}>Certified Correct (School Head)</Text>
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
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    marginBottom: 10,
  },
  controlLabel: { fontSize: 10, fontWeight: '800', color: '#0f172a' },
  toggleRow: { flexDirection: 'row', gap: 4 },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  toggleBtnActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  toggleText: { fontSize: 10, fontWeight: '700', color: '#64748b' },
  toggleTextActive: { color: '#ffffff' },

  officialDocumentCanvas: {
    width: 920,
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
  genderHeader: { backgroundColor: '#eff6ff', paddingVertical: 2, paddingLeft: 6, borderBottomWidth: 1, borderColor: '#0f172a' },
  genderHeaderText: { fontSize: 8.5, fontWeight: '800', color: '#0284c7' },
  tdRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', minHeight: 20 },
  td: { fontSize: 8, color: '#0f172a', textAlign: 'center', paddingVertical: 3, borderRightWidth: 1, borderColor: '#cbd5e1' },

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

export default SF1ReportView;