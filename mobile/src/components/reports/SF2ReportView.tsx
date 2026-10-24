// D:\AttendSure_V3\mobile\src\components\reports\SF2ReportView.tsx

import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { DepEdReportHeader, DepEdReportFooter } from './DepEdReportHeaderFooter';

export interface SchoolDay {
  dateNumber: number;
  dayOfWeek: 'M' | 'T' | 'W' | 'TH' | 'F';
  fullDate?: string;
}

export interface SF2Learner {
  id: number;
  lrn: string;
  name: string;
  sex: 'M' | 'F';
  attendance: { [dayNumber: number]: string | number };
  total_absent: number;
  total_tardy: number;
  remarks?: string;
}

export interface SF2ReportViewProps {
  data: any;
  learners?: any[];
}

export const SF2ReportView: React.FC<SF2ReportViewProps> = ({ data }) => {
  const { user } = useAuth();

  if (!data) return null;

  // 1. Dynamic Teacher Signatory Resolution
  const currentUser = user as Record<string, any> | null;
  const activeUserFullName =
    currentUser?.full_name ||
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() ||
    currentUser?.faculty_name ||
    currentUser?.username ||
    '';

  const userRole = String(
    currentUser?.role || currentUser?.system_role || 'EMPLOYEE'
  ).trim().toUpperCase();

  const isTeachingRole = ['TEACHER', 'FACULTY', 'EMPLOYEE'].includes(userRole);

  const resolvedTeacherName =
    (isTeachingRole && activeUserFullName.length > 0
      ? activeUserFullName
      : null) ||
    data.adviser_name ||
    activeUserFullName ||
    'Class Adviser';

  const resolvedSchoolHead = String(data.school_head || 'School Head / Principal').trim();

  // 2. Safe Array Normalization
  const schoolDays: SchoolDay[] = Array.isArray(data.school_days) ? data.school_days : [];
  const males: SF2Learner[] = Array.isArray(data.males) ? data.males : [];
  const females: SF2Learner[] = Array.isArray(data.females) ? data.females : [];

  const standardSchoolDays = useMemo(() => {
    const list: SchoolDay[] = [];
    const maxDays = 25;
    const daysCycle: Array<'M' | 'T' | 'W' | 'TH' | 'F'> = ['M', 'T', 'W', 'TH', 'F'];

    for (let i = 0; i < maxDays; i++) {
      if (schoolDays[i]) {
        list.push(schoolDays[i]);
      } else {
        list.push({
          dateNumber: i + 1,
          dayOfWeek: daysCycle[i % 5],
        });
      }
    }
    return list;
  }, [schoolDays]);

  // 3. Totals Summary Cached with useMemo
  const totalsSummary = useMemo(() => {
    const maleAbsent = males.reduce((acc, cur) => acc + (Number(cur.total_absent) || 0), 0);
    const maleTardy = males.reduce((acc, cur) => acc + (Number(cur.total_tardy) || 0), 0);
    const femaleAbsent = females.reduce((acc, cur) => acc + (Number(cur.total_absent) || 0), 0);
    const femaleTardy = females.reduce((acc, cur) => acc + (Number(cur.total_tardy) || 0), 0);

    return {
      maleAbsent,
      maleTardy,
      femaleAbsent,
      femaleTardy,
      combinedAbsent: maleAbsent + femaleAbsent,
      combinedTardy: maleTardy + femaleTardy,
    };
  }, [males, females]);

  // 4. Daily Column Tallies
  const dailyAttendanceTotals = useMemo(() => {
    const maxCols = 25;
    const malesCount: number[] = new Array(maxCols).fill(0);
    const femalesCount: number[] = new Array(maxCols).fill(0);
    const combinedCount: number[] = new Array(maxCols).fill(0);

    standardSchoolDays.forEach((day, idx) => {
      if (idx >= maxCols) return;
      let mPresent = 0;
      let fPresent = 0;

      males.forEach((m) => {
        const raw = String(m.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (
          raw === 'present' ||
          raw === 'tardy' ||
          raw === 'late' ||
          raw === 'cutting' ||
          raw === '0' ||
          raw === ''
        ) {
          mPresent++;
        }
      });

      females.forEach((f) => {
        const raw = String(f.attendance?.[day.dateNumber] ?? '').toLowerCase().trim();
        if (
          raw === 'present' ||
          raw === 'tardy' ||
          raw === 'late' ||
          raw === 'cutting' ||
          raw === '0' ||
          raw === ''
        ) {
          fPresent++;
        }
      });

      malesCount[idx] = mPresent;
      femalesCount[idx] = fPresent;
      combinedCount[idx] = mPresent + fPresent;
    });

    return { males: malesCount, females: femalesCount, combined: combinedCount };
  }, [standardSchoolDays, males, females]);

  // 5. Official DepEd Cell Notation Renderer
  const renderAttendanceCell = (status?: string | number | null) => {
    const s = String(status ?? '').toLowerCase().trim();

    if (s === 'absent' || s === 'x' || s === '1' || s === 'a') {
      return (
        <View style={styles.attCell}>
          <Text style={styles.textAbsent}>(x)</Text>
        </View>
      );
    }

    if (s === 'tardy' || s === 'late' || s === '2' || s === 't') {
      return (
        <View style={styles.attCell}>
          <View style={styles.triangleUpperShaded} />
        </View>
      );
    }

    if (s === 'cutting' || s === 'cc' || s === '3' || s === 'c') {
      return (
        <View style={styles.attCell}>
          <View style={styles.triangleLowerShaded} />
        </View>
      );
    }

    return <View style={styles.attCell} />;
  };

  const isListEmpty = males.length === 0 && females.length === 0;

  const metrics = data.metrics || {};
  const maleEnrolmentJune = metrics?.enrolment_june?.m ?? males.length;
  const femaleEnrolmentJune = metrics?.enrolment_june?.f ?? females.length;
  const totalEnrolmentJune = maleEnrolmentJune + femaleEnrolmentJune;

  const maleRegisteredEnd = males.length;
  const femaleRegisteredEnd = females.length;
  const totalRegisteredEnd = maleRegisteredEnd + femaleRegisteredEnd;

  const percentageEnrolment =
    totalEnrolmentJune > 0 ? ((totalRegisteredEnd / totalEnrolmentJune) * 100).toFixed(2) : '100.00';

  const adaM = Number(metrics?.average_daily_attendance?.m ?? 0).toFixed(1);
  const adaF = Number(metrics?.average_daily_attendance?.f ?? 0).toFixed(1);
  const adaTotal = Number(metrics?.average_daily_attendance?.total ?? (Number(adaM) + Number(adaF))).toFixed(1);

  const percAttM = Number(metrics?.percentage_attendance?.m ?? 0).toFixed(1);
  const percAttF = Number(metrics?.percentage_attendance?.f ?? 0).toFixed(1);
  const percAttTotal = Number(metrics?.percentage_attendance?.total ?? 0).toFixed(1);

  const leftLogoUrl = data.left_logo || null;
  const rightLogoUrl = data.right_logo || null;

  return (
    <View style={styles.sheetOuterWrapper}>
      <ScrollView horizontal showsHorizontalScrollIndicator={true}>
        <View style={styles.officialDocumentCanvas}>
          <DepEdReportHeader
            leftLogoUrl={leftLogoUrl}
            rightLogoUrl={rightLogoUrl}
            region={data.region}
            division={data.division}
            formTitle="School Form 2 (SF2) Daily Attendance Report of Learners"
            formSubtitle="(This replaced Form 1, Form 2 & STS Form 4- Absenteeism and Dropout Profile)"
          />

          <View style={styles.metaTable}>
            <View style={styles.metaRow}>
              <View style={[styles.metaCol, { flex: 1.2 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>School ID </Text>
                  <Text style={styles.metaValue}>{data.school_id || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, { flex: 1.2 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>School Year </Text>
                  <Text style={styles.metaValue}>{data.academic_year || data.school_year || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, { flex: 1.6 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Report for the Month of </Text>
                  <Text style={styles.metaValue}>{data.month || '—'} {data.year || ''}</Text>
                </Text>
              </View>
            </View>

            <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: '#000000' }]}>
              <View style={[styles.metaCol, { flex: 1.8 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Name of School </Text>
                  <Text style={styles.metaValue}>{data.school_name || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, { flex: 1 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Grade Level </Text>
                  <Text style={styles.metaValue}>{data.grade_level || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, { flex: 1.2 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Section </Text>
                  <Text style={styles.metaValue}>{data.section_name || '—'}</Text>
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.matrixTable}>
            <View style={styles.tableRowHeader}>
              <View style={[styles.thCell, { width: 26 }]}>
                <Text style={styles.thText}>#</Text>
              </View>
              <View style={[styles.thCell, { width: 175, paddingHorizontal: 3 }]}>
                <Text style={styles.thText}>LEARNER'S NAME</Text>
                <Text style={styles.thSubText}>(Last Name, First Name, Middle Name)</Text>
              </View>

              <View style={styles.daysContainer}>
                <View style={styles.daysTopBanner}>
                  <Text style={styles.daysBannerText}>
                    (1st row for date, 2nd row for Day: M,T,W,TH,F)
                  </Text>
                </View>
                <View style={styles.daysRowNumbers}>
                  {standardSchoolDays.map((sd, colIdx) => (
                    <View key={`dnum-col-${colIdx}`} style={styles.dayColCell}>
                      <Text style={styles.dayNumText}>{sd.dateNumber}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.daysRowLetters}>
                  {standardSchoolDays.map((sd, colIdx) => (
                    <View key={`dday-col-${colIdx}`} style={styles.dayColCell}>
                      <Text style={styles.dayLetterText}>{sd.dayOfWeek}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={[styles.thCell, { width: 70 }]}>
                <Text style={styles.thText}>Total for the{'\n'}Month</Text>
                <View style={styles.absTarSubRow}>
                  <View style={[styles.absTarCell, { borderRightWidth: 1, borderColor: '#000000' }]}>
                    <Text style={styles.thSmall}>ABSENT</Text>
                  </View>
                  <View style={styles.absTarCell}>
                    <Text style={styles.thSmall}>TARDY</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.thCell, { width: 155, paddingHorizontal: 4 }]}>
                <Text style={styles.thText}>
                  REMARK/S (If DROPPED OUT, state reason, please refer to legend number 2.{'\n'}
                  If TRANSFERRED IN/OUT, write the name of School.)
                </Text>
              </View>
            </View>

            {isListEmpty ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {data.notice || `No student attendance records found for Section ${data.section_name}.`}
                </Text>
              </View>
            ) : (
              <>
                {males.map((m, rowIdx) => (
                  <View key={`male-row-${rowIdx}-${m.id || rowIdx}`} style={styles.tableRowData}>
                    <View style={[styles.tdCell, { width: 26 }]}>
                      <Text style={styles.tdText}>{rowIdx + 1}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: 175, alignItems: 'flex-start', paddingLeft: 4 }]}>
                      <Text style={styles.tdLearnerName} numberOfLines={1}>{m.name}</Text>
                    </View>

                    {standardSchoolDays.map((sd, colIdx) => {
                      const status = m.attendance?.[sd.dateNumber];
                      return (
                        <View key={`m-${m.id || rowIdx}-col-${colIdx}`} style={styles.dayDataCell}>
                          {renderAttendanceCell(status)}
                        </View>
                      );
                    })}

                    <View style={[styles.tdCell, { width: 35 }]}>
                      <Text style={styles.tdTotalAbsent}>{m.total_absent || ''}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: 35 }]}>
                      <Text style={styles.tdTotalTardy}>{m.total_tardy || ''}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: 155, alignItems: 'flex-start', paddingLeft: 4 }]}>
                      <Text style={styles.tdRemarks} numberOfLines={1}>{m.remarks || ''}</Text>
                    </View>
                  </View>
                ))}

                <View style={styles.tallyRow}>
                  <View style={[styles.tdCell, { width: 201, alignItems: 'flex-start', paddingLeft: 6 }]}>
                    <Text style={styles.tallyLabel}>&larr; MALE | TOTAL Per Day &rarr;</Text>
                  </View>
                  {standardSchoolDays.map((_, colIdx) => (
                    <View key={`m-tot-col-${colIdx}`} style={styles.dayDataCell}>
                      <Text style={styles.tallyCountText}>{dailyAttendanceTotals.males[colIdx] || ''}</Text>
                    </View>
                  ))}
                  <View style={[styles.tdCell, { width: 35 }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.maleAbsent || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 35 }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.maleTardy || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 155 }]} />
                </View>

                {females.map((f, rowIdx) => (
                  <View key={`female-row-${rowIdx}-${f.id || rowIdx}`} style={styles.tableRowData}>
                    <View style={[styles.tdCell, { width: 26 }]}>
                      <Text style={styles.tdText}>{rowIdx + 1}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: 175, alignItems: 'flex-start', paddingLeft: 4 }]}>
                      <Text style={styles.tdLearnerName} numberOfLines={1}>{f.name}</Text>
                    </View>

                    {standardSchoolDays.map((sd, colIdx) => {
                      const status = f.attendance?.[sd.dateNumber];
                      return (
                        <View key={`f-${f.id || rowIdx}-col-${colIdx}`} style={styles.dayDataCell}>
                          {renderAttendanceCell(status)}
                        </View>
                      );
                    })}

                    <View style={[styles.tdCell, { width: 35 }]}>
                      <Text style={styles.tdTotalAbsent}>{f.total_absent || ''}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: 35 }]}>
                      <Text style={styles.tdTotalTardy}>{f.total_tardy || ''}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: 155, alignItems: 'flex-start', paddingLeft: 4 }]}>
                      <Text style={styles.tdRemarks} numberOfLines={1}>{f.remarks || ''}</Text>
                    </View>
                  </View>
                ))}

                <View style={styles.tallyRow}>
                  <View style={[styles.tdCell, { width: 201, alignItems: 'flex-start', paddingLeft: 6 }]}>
                    <Text style={styles.tallyLabel}>&larr; FEMALE | TOTAL Per Day &rarr;</Text>
                  </View>
                  {standardSchoolDays.map((_, colIdx) => (
                    <View key={`f-tot-col-${colIdx}`} style={styles.dayDataCell}>
                      <Text style={styles.tallyCountText}>{dailyAttendanceTotals.females[colIdx] || ''}</Text>
                    </View>
                  ))}
                  <View style={[styles.tdCell, { width: 35 }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.femaleAbsent || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 35 }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.femaleTardy || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: 155 }]} />
                </View>

                <View style={[styles.tallyRow, { backgroundColor: '#f1f5f9' }]}>
                  <View style={[styles.tdCell, { width: 201, alignItems: 'flex-start', paddingLeft: 6 }]}>
                    <Text style={[styles.tallyLabel, { fontWeight: '900' }]}>Combined TOTAL PER DAY</Text>
                  </View>
                  {standardSchoolDays.map((_, colIdx) => (
                    <View key={`c-tot-col-${colIdx}`} style={styles.dayDataCell}>
                      <Text style={[styles.tallyCountText, { fontWeight: '900' }]}>
                        {dailyAttendanceTotals.combined[colIdx] || ''}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.tdCell, { width: 35 }]}>
                    <Text style={[styles.tallyCountText, { fontWeight: '900' }]}>
                      {totalsSummary.combinedAbsent || ''}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 35 }]}>
                    <Text style={[styles.tallyCountText, { fontWeight: '900' }]}>
                      {totalsSummary.combinedTardy || ''}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: 155 }]} />
                </View>
              </>
            )}
          </View>

          <View style={styles.bottomBlockContainer}>
            <View style={styles.guidelinesCol}>
              <Text style={styles.blockHeading}>GUIDELINES:</Text>
              <Text style={styles.guidelineP}>
                1. The attendance shall be accomplished daily. Refer to the codes for checking learners' attendance.
              </Text>
              <Text style={styles.guidelineP}>
                2. Dates shall be written in the preceding columns beside Learner's Name.
              </Text>
              <Text style={styles.guidelineP}>3. To compute the following:</Text>

              <View style={styles.formulaRow}>
                <Text style={styles.formulaLabel}>a. Percentage of Enrolment =</Text>
                <View style={styles.fractionWrap}>
                  <Text style={styles.fractionNumerator}>Registered Learner as of End of the Month</Text>
                  <View style={styles.fractionBar} />
                  <Text style={styles.fractionDenominator}>Enrolment as of 1st Friday of June</Text>
                </View>
                <Text style={styles.multiplyText}>x 100</Text>
              </View>

              <View style={styles.formulaRow}>
                <Text style={styles.formulaLabel}>b. Average Daily Attendance =</Text>
                <View style={styles.fractionWrap}>
                  <Text style={styles.fractionNumerator}>Total Daily Attendance</Text>
                  <View style={styles.fractionBar} />
                  <Text style={styles.fractionDenominator}>Number of School Days in reporting month</Text>
                </View>
              </View>

              <View style={styles.formulaRow}>
                <Text style={styles.formulaLabel}>c. Percentage of Attendance for the month =</Text>
                <View style={styles.fractionWrap}>
                  <Text style={styles.fractionNumerator}>Average daily attendance</Text>
                  <View style={styles.fractionBar} />
                  <Text style={styles.fractionDenominator}>Registered Learner as of End of the month</Text>
                </View>
                <Text style={styles.multiplyText}>x 100</Text>
              </View>

              <Text style={styles.guidelineP}>
                4. Every End of the month, the class adviser will submit this form to the office of the principal for recording of summary table into the School Form 4. Once signed by the principal, this form should be returned to the adviser.
              </Text>
              <Text style={styles.guidelineP}>
                5. The adviser will extend necessary intervention including but not limited to home visitation to learner/s that committed 5 consecutive days of absences or those with potentials of dropping out.
              </Text>
              <Text style={styles.guidelineP}>
                6. Attendance performance of learner is expected to reflect in Form 137 and Form 138 every grading period.
              </Text>
              <Text style={styles.guidelineFooter}>
                Beginning of School Year cut-off report is every 1st Friday of School Calendar Days
              </Text>
            </View>

            <View style={styles.codesAndReasonsCol}>
              <Text style={styles.blockHeading}>1. CODES FOR CHECKING ATTENDANCE</Text>
              <Text style={styles.codeText}>
                <Text style={{ fontWeight: '800' }}>blank </Text>- Present
              </Text>
              <Text style={styles.codeText}>
                <Text style={{ fontWeight: '800' }}>(x) </Text>- Absent
              </Text>
              <Text style={styles.codeText}>
                <Text style={{ fontWeight: '800' }}>Tardy </Text>(half shaded Upper for Late Comer, Lower for Cutting Classes)
              </Text>

              <View style={styles.legendVisualRow}>
                <View style={styles.legendBox}>
                  <View style={styles.triangleUpperShadedLegend} />
                </View>
                <Text style={styles.legendLabel}>Late Comer</Text>

                <View style={[styles.legendBox, { marginLeft: 12 }]}>
                  <View style={styles.triangleLowerShadedLegend} />
                </View>
                <Text style={styles.legendLabel}>Cutting Classes</Text>
              </View>

              <Text style={[styles.blockHeading, { marginTop: 6 }]}>
                2. REASONS/CAUSES OF DROP-OUTS
              </Text>

              <Text style={styles.reasonSection}>a. Domestic-Related Factors</Text>
              <Text style={styles.reasonItem}>a.1. Had to take care of siblings</Text>
              <Text style={styles.reasonItem}>a.2. Early marriage/pregnancy</Text>
              <Text style={styles.reasonItem}>a.3. Parents' attitude toward schooling</Text>
              <Text style={styles.reasonItem}>a.4. Family problems</Text>

              <Text style={styles.reasonSection}>b. Individual-Related Factors</Text>
              <Text style={styles.reasonItem}>b.1. Illness</Text>
              <Text style={styles.reasonItem}>b.2. Overage</Text>
              <Text style={styles.reasonItem}>b.3. Death</Text>
              <Text style={styles.reasonItem}>b.4. Drug Abuse</Text>
              <Text style={styles.reasonItem}>b.5. Poor academic performance</Text>
              <Text style={styles.reasonItem}>b.6. Lack of interest/Distractions</Text>
              <Text style={styles.reasonItem}>b.7. Hunger/Malnutrition</Text>

              <Text style={styles.reasonSection}>c. School-Related Factors</Text>
              <Text style={styles.reasonItem}>c.1. Teacher Factor</Text>
              <Text style={styles.reasonItem}>c.2. Physical condition of classroom</Text>
              <Text style={styles.reasonItem}>c.3. Peer influence</Text>

              <Text style={styles.reasonSection}>d. Geographic/Environmental</Text>
              <Text style={styles.reasonItem}>d.1. Distance between home and school</Text>
              <Text style={styles.reasonItem}>d.2. Armed conflict (incl. Tribal wars &amp; clanfeuds)</Text>
              <Text style={styles.reasonItem}>d.3. Calamities/Disasters</Text>

              <Text style={styles.reasonSection}>e. Financial-Related</Text>
              <Text style={styles.reasonItem}>e.1. Child labor, work</Text>

              <Text style={styles.reasonSection}>f. Others</Text>
            </View>

            <View style={styles.summaryTableCol}>
              <View style={styles.summaryMonthHeader}>
                <Text style={styles.summaryMonthTitle}>
                  Month: <Text style={styles.summaryMonthVal}>{data.month || '—'}</Text>
                </Text>
                <Text style={styles.summaryDaysTitle}>
                  No. of Days of Classes: <Text style={styles.summaryMonthVal}>{standardSchoolDays.length}</Text>
                </Text>
              </View>

              <View style={styles.sumTableWrap}>
                <View style={styles.sumTableRowHeader}>
                  <Text style={[styles.sumTableColTitle, { flex: 2.2 }]}>Summary for the Month</Text>
                  <Text style={[styles.sumTableColTitle, { flex: 0.6 }]}>M</Text>
                  <Text style={[styles.sumTableColTitle, { flex: 0.6 }]}>F</Text>
                  <Text style={[styles.sumTableColTitle, { flex: 0.8 }]}>TOTAL</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Enrolment as of (1st Friday of June)
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{maleEnrolmentJune}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{femaleEnrolmentJune}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{totalEnrolmentJune}</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Late Enrollment during the month{'\n'}(beyond cut-off)
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.late_enrolment?.m ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.late_enrolment?.f ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.late_enrolment?.total ?? 0}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Registered Learner as of end of the month
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{maleRegisteredEnd}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{femaleRegisteredEnd}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{totalRegisteredEnd}</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Percentage of Enrolment as of end of the month
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>—</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>—</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>
                    {percentageEnrolment}%
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Average Daily Attendance
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{adaM}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{adaF}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{adaTotal}</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Percentage of Attendance for the month
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{percAttM}%</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{percAttF}%</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{percAttTotal}%</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Number of students with 5 consecutive days of absences:
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.consecutive_5?.m ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.consecutive_5?.f ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.consecutive_5?.total ?? 0}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>Drop out</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.drop_out?.m ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.drop_out?.f ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{metrics?.drop_out?.total ?? 0}</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>Transferred out</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.transferred_out?.m ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.transferred_out?.f ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{metrics?.transferred_out?.total ?? 0}</Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>Transferred in</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.transferred_in?.m ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{metrics?.transferred_in?.f ?? 0}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.8, fontWeight: '700' }]}>{metrics?.transferred_in?.total ?? 0}</Text>
                </View>
              </View>

              <View style={styles.signSection}>
                <Text style={styles.certifyDeclaration}>
                  I certify that this is a true and correct report.
                </Text>

                <View style={styles.signFieldBox}>
                  <Text style={styles.signPersonName}>{resolvedTeacherName.toUpperCase()}</Text>
                  <View style={styles.signUnderline} />
                  <Text style={styles.signPositionLabel}>
                    (Signature of Teacher over Printed Name)
                  </Text>
                </View>

                <View style={[styles.signFieldBox, { marginTop: 14 }]}>
                  <Text style={styles.attestLabel}>Attested by:</Text>
                  <Text style={styles.signPersonName}>{resolvedSchoolHead.toUpperCase()}</Text>
                  <View style={styles.signUnderline} />
                  <Text style={styles.signPositionLabel}>
                    (Signature of School Head over Printed Name)
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <DepEdReportFooter
            sealUrl={leftLogoUrl || rightLogoUrl}
            address={data.school_address}
            contactNumber={data.school_contact}
            email={data.school_email}
          />

          <View style={styles.pageMetaFooter}>
            <Text style={styles.pageMetaText}>School Form 2: Page 2 of 2</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  sheetOuterWrapper: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
  },
  officialDocumentCanvas: {
    width: 1040,
    backgroundColor: '#ffffff',
    padding: 6,
  },

  metaTable: {
    borderWidth: 1.2,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaCol: {
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  metaText: { fontSize: 8.5, color: '#000000' },
  metaLabel: { fontWeight: '700' },
  metaValue: { fontWeight: '800' },

  matrixTable: {
    borderWidth: 1.2,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
  },
  tableRowHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1.2,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
  },
  thCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderColor: '#000000',
    paddingVertical: 2,
  },
  thText: {
    fontSize: 7.5,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 9.5,
  },
  thSubText: {
    fontSize: 6.5,
    color: '#000000',
    textAlign: 'center',
    marginTop: 1,
  },
  thSmall: {
    fontSize: 6.5,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },

  daysContainer: {
    width: 25 * 21,
    borderRightWidth: 1,
    borderColor: '#000000',
  },
  daysTopBanner: {
    borderBottomWidth: 1,
    borderColor: '#000000',
    paddingVertical: 1,
    alignItems: 'center',
  },
  daysBannerText: {
    fontSize: 6.8,
    fontStyle: 'italic',
    color: '#000000',
  },
  daysRowNumbers: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#000000',
  },
  daysRowLetters: {
    flexDirection: 'row',
  },
  dayColCell: {
    width: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 0.8,
    borderColor: '#000000',
    paddingVertical: 1,
  },
  dayNumText: { fontSize: 7.2, fontWeight: '800', color: '#000000' },
  dayLetterText: { fontSize: 6.5, fontWeight: '700', color: '#000000' },

  absTarSubRow: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
    borderColor: '#000000',
    marginTop: 2,
  },
  absTarCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 1,
  },

  tableRowData: {
    flexDirection: 'row',
    borderBottomWidth: 0.8,
    borderColor: '#000000',
    minHeight: 16,
    alignItems: 'center',
  },
  tdCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 0.8,
    borderColor: '#000000',
    paddingVertical: 1,
    height: 16,
  },
  tdText: { fontSize: 7.5, color: '#000000', fontWeight: '600' },
  tdLearnerName: { fontSize: 7.5, color: '#000000', fontWeight: '700' },
  dayDataCell: {
    width: 21,
    height: 16,
    borderRightWidth: 0.8,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    backgroundColor: '#ffffff',
  },
  tdTotalAbsent: { fontSize: 7.5, fontWeight: '800', color: '#dc2626' },
  tdTotalTardy: { fontSize: 7.5, fontWeight: '800', color: '#d97706' },
  tdRemarks: { fontSize: 6.8, color: '#000000' },

  attCell: {
    width: 20,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    position: 'relative',
    overflow: 'hidden',
  },
  textAbsent: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#000000',
    lineHeight: 9,
    textAlign: 'center',
  },

  triangleUpperShaded: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 15,
    borderRightWidth: 20,
    borderTopColor: '#000000',
    borderRightColor: 'transparent',
  },
  triangleLowerShaded: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderBottomWidth: 15,
    borderLeftWidth: 20,
    borderBottomColor: '#000000',
    borderLeftColor: 'transparent',
  },

  tallyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.2,
    borderColor: '#000000',
    minHeight: 17,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  tallyLabel: { fontSize: 7.5, fontWeight: '800', color: '#000000' },
  tallyCountText: { fontSize: 7.5, fontWeight: '800', color: '#000000' },

  emptyBox: { padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 10, color: '#64748b' },

  bottomBlockContainer: {
    flexDirection: 'row',
    borderWidth: 1.2,
    borderColor: '#000000',
    borderTopWidth: 0,
    backgroundColor: '#ffffff',
  },

  guidelinesCol: {
    flex: 1.4,
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  blockHeading: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#000000',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  guidelineP: {
    fontSize: 6.8,
    color: '#000000',
    lineHeight: 9.5,
    marginVertical: 1,
    textAlign: 'justify',
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 2,
    flexWrap: 'wrap',
  },
  formulaLabel: { fontSize: 6.6, color: '#000000', fontWeight: '600', marginRight: 4 },
  fractionWrap: { alignItems: 'center', marginHorizontal: 2 },
  fractionNumerator: { fontSize: 6.2, color: '#000000', fontWeight: '600' },
  fractionBar: { width: '100%', height: 0.8, backgroundColor: '#000000', marginVertical: 1 },
  fractionDenominator: { fontSize: 6.2, color: '#000000', fontWeight: '600' },
  multiplyText: { fontSize: 6.6, color: '#000000', fontWeight: '700', marginLeft: 3 },
  guidelineFooter: {
    fontSize: 6.5,
    fontStyle: 'italic',
    color: '#000000',
    marginTop: 4,
  },

  codesAndReasonsCol: {
    flex: 1.2,
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  codeText: { fontSize: 6.8, color: '#000000', marginVertical: 0.5 },
  legendVisualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    marginBottom: 4,
  },
  legendBox: {
    width: 14,
    height: 14,
    borderWidth: 0.8,
    borderColor: '#000000',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  triangleUpperShadedLegend: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderTopWidth: 14,
    borderRightWidth: 14,
    borderTopColor: '#000000',
    borderRightColor: 'transparent',
  },
  triangleLowerShadedLegend: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderBottomWidth: 14,
    borderLeftWidth: 14,
    borderBottomColor: '#000000',
    borderLeftColor: 'transparent',
  },
  legendLabel: {
    fontSize: 6.5,
    color: '#000000',
    marginLeft: 3,
  },
  reasonSection: {
    fontSize: 6.8,
    fontWeight: '700',
    color: '#000000',
    marginTop: 2,
  },
  reasonItem: {
    fontSize: 6.3,
    color: '#1e293b',
    marginLeft: 4,
    lineHeight: 8.5,
  },

  summaryTableCol: {
    flex: 1.6,
    padding: 5,
  },
  summaryMonthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  summaryMonthTitle: { fontSize: 7, fontWeight: '700', color: '#000000' },
  summaryDaysTitle: { fontSize: 7, fontWeight: '700', color: '#000000' },
  summaryMonthVal: { fontWeight: '900' },

  sumTableWrap: {
    borderWidth: 1,
    borderColor: '#000000',
  },
  sumTableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderColor: '#000000',
    paddingVertical: 1.5,
  },
  sumTableColTitle: {
    fontSize: 6.5,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  sumTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.6,
    borderColor: '#000000',
    minHeight: 12,
    alignItems: 'center',
  },
  sumTableCellLabel: {
    fontSize: 6.1,
    color: '#000000',
    paddingLeft: 3,
    borderRightWidth: 0.6,
    borderColor: '#000000',
    lineHeight: 8,
    paddingVertical: 1,
  },
  sumTableCellVal: {
    fontSize: 6.5,
    color: '#000000',
    textAlign: 'center',
    borderRightWidth: 0.6,
    borderColor: '#000000',
    paddingVertical: 1,
  },

  signSection: {
    marginTop: 8,
  },
  certifyDeclaration: {
    fontSize: 6.8,
    fontStyle: 'italic',
    color: '#000000',
    marginBottom: 6,
  },
  signFieldBox: {
    alignItems: 'center',
    width: '100%',
  },
  signPersonName: {
    fontSize: 8,
    fontWeight: '800',
    color: '#000000',
    textAlign: 'center',
  },
  signUnderline: {
    width: '80%',
    height: 1,
    backgroundColor: '#000000',
    marginTop: 1,
  },
  signPositionLabel: {
    fontSize: 6.2,
    color: '#000000',
    textAlign: 'center',
    marginTop: 1,
  },
  attestLabel: {
    fontSize: 6.8,
    color: '#000000',
    marginBottom: 2,
    alignSelf: 'flex-start',
    marginLeft: '10%',
  },

  pageMetaFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  pageMetaText: {
    fontSize: 6.5,
    color: '#64748b',
    fontStyle: 'italic',
  },
});

export default SF2ReportView;