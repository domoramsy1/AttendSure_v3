/**
 * AttendSure - School Form 2 (SF2) Daily Attendance Report of Learners
 * File: mobile/src/components/reports/SF2ReportView.tsx
 */

import React, { useMemo, useState, useEffect, useRef } from 'react';
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
import { ENDPOINTS } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { useThemeMode } from '../../context/ThemeContext';
import { cleanText, getFriendlyErrorMessage } from '../../constants/theme';
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
  sectionId?: number | string;
  month?: string;
  year?: number;
}

// Single source of truth for SF2 table widths (header & data rows align cleanly)
const SF2_COL_NUM = 26;
const SF2_COL_NAME = 175;
const SF2_DAY_COUNT = 25;
const SF2_DAY_CELL_WIDTH = 21;
const SF2_DAYS_TOTAL_WIDTH = SF2_DAY_COUNT * SF2_DAY_CELL_WIDTH; // 525
const SF2_COL_ABSENT = 35;
const SF2_COL_TARDY = 35;
const SF2_COL_MONTH_TOTAL = SF2_COL_ABSENT + SF2_COL_TARDY; // 70
const SF2_COL_REMARKS = 155;
const SF2_TALLY_LABEL_WIDTH = SF2_COL_NUM + SF2_COL_NAME; // 201
const SF2_TABLE_INNER_WIDTH =
  SF2_COL_NUM + SF2_COL_NAME + SF2_DAYS_TOTAL_WIDTH + SF2_COL_MONTH_TOTAL + SF2_COL_REMARKS; // 951
const SF2_TABLE_WIDTH = SF2_TABLE_INNER_WIDTH + 2; // 953 (includes 1px left/right border)
const SF2_CANVAS_WIDTH = SF2_TABLE_WIDTH + 12; // 965 (includes 6px horizontal padding)

export const SF2ReportView: React.FC<SF2ReportViewProps> = ({
  data,
  learners,
  sectionId,
  month,
  year,
}) => {
  const { user } = useAuth();
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

  // Optional standalone fetch when rendered with sectionId without parent data
  useEffect(() => {
    if (data || !sectionId) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoadingSelf(true);
    setLoadError(null);

    const encodedSection = encodeURIComponent(String(sectionId));
    apiClient
      .get(`${ENDPOINTS.REPORT_SF2}${encodedSection}/`, {
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
          setLoadError(getFriendlyErrorMessage(err, 'Could not load School Form 2 records.'));
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
  }, [data, sectionId, month, year]);

  const activeData = data || fetchedData;

  // 1. Dynamic Teacher Signatory Resolution
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

  // 2. Safe Array Normalization (supports optional search-filtered learners prop)
  const schoolDays: SchoolDay[] = Array.isArray(activeData?.school_days)
    ? activeData.school_days
    : [];

  const { males, females } = useMemo(() => {
    const rawMales: SF2Learner[] = Array.isArray(activeData?.males) ? activeData.males : [];
    const rawFemales: SF2Learner[] = Array.isArray(activeData?.females) ? activeData.females : [];
    if (!Array.isArray(learners)) {
      return { males: rawMales, females: rawFemales };
    }
    const allowedKeys = new Set(
      learners.map((item: any) => String(item.id || item.lrn || item.name))
    );
    return {
      males: rawMales.filter((m) => allowedKeys.has(String(m.id || m.lrn || m.name))),
      females: rawFemales.filter((f) => allowedKeys.has(String(f.id || f.lrn || f.name))),
    };
  }, [activeData, learners]);

  const standardSchoolDays = useMemo(() => {
    const list: SchoolDay[] = [];
    const daysCycle: Array<'M' | 'T' | 'W' | 'TH' | 'F'> = ['M', 'T', 'W', 'TH', 'F'];

    for (let i = 0; i < SF2_DAY_COUNT; i++) {
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
    const malesCount: number[] = new Array(SF2_DAY_COUNT).fill(0);
    const femalesCount: number[] = new Array(SF2_DAY_COUNT).fill(0);
    const combinedCount: number[] = new Array(SF2_DAY_COUNT).fill(0);

    const isAttended = (value: unknown) => {
      const raw = String(value ?? '').toLowerCase().trim();
      return (
        raw === 'present' ||
        raw === 'p' ||
        raw === 'tardy' ||
        raw === 'late' ||
        raw === 't' ||
        raw === 'cutting' ||
        raw === 'cc' ||
        raw === 'c' ||
        raw === '0' ||
        raw === '2' ||
        raw === '3'
      );
    };

    standardSchoolDays.forEach((day, idx) => {
      if (idx >= SF2_DAY_COUNT || idx >= schoolDays.length) return;
      let mPresent = 0;
      let fPresent = 0;

      males.forEach((m) => {
        if (isAttended(m.attendance?.[day.dateNumber])) {
          mPresent++;
        }
      });

      females.forEach((f) => {
        if (isAttended(f.attendance?.[day.dateNumber])) {
          fPresent++;
        }
      });

      malesCount[idx] = mPresent;
      femalesCount[idx] = fPresent;
      combinedCount[idx] = mPresent + fPresent;
    });

    return { males: malesCount, females: femalesCount, combined: combinedCount };
  }, [standardSchoolDays, schoolDays.length, males, females]);

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
          Loading School Form 2...
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

  const resolvedTeacherName =
    (isTeacherRole && activeUserFullName.length > 0 ? activeUserFullName : null) ||
    activeData.adviser_name ||
    activeUserFullName ||
    'Class Adviser';

  const resolvedSchoolHead = cleanText(activeData.school_head, 160) || 'School Head / Principal';

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

  const metrics = activeData.metrics || {};
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
  const adaTotal = Number(
    metrics?.average_daily_attendance?.total ?? Number(adaM) + Number(adaF)
  ).toFixed(1);

  const percAttM = Number(metrics?.percentage_attendance?.m ?? 0).toFixed(1);
  const percAttF = Number(metrics?.percentage_attendance?.f ?? 0).toFixed(1);
  const percAttTotal = Number(metrics?.percentage_attendance?.total ?? 0).toFixed(1);

  const leftLogoUrl = activeData.left_logo || null;
  const rightLogoUrl = activeData.right_logo || null;

  // Dynamic pagination footer (never hardcoded)
  const totalLearners = males.length + females.length;
  const totalPages =
    Number(activeData.total_pages) > 0
      ? Number(activeData.total_pages)
      : Math.max(1, Math.ceil(totalLearners / 40));
  const currentPage =
    Number(activeData.page_number) > 0
      ? Math.min(Number(activeData.page_number), totalPages)
      : 1;

  return (
    <View
      style={[
        styles.sheetOuterWrapper,
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
          Swipe sideways to inspect the full 25-day attendance table
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.officialDocumentCanvas}>
          <DepEdReportHeader
            leftLogoUrl={leftLogoUrl}
            rightLogoUrl={rightLogoUrl}
            region={activeData.region}
            division={activeData.division}
            formTitle="School Form 2 (SF2) Daily Attendance Report of Learners"
            formSubtitle="(This replaced Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile)"
          />

          <View style={styles.metaTable}>
            <View style={styles.metaRow}>
              <View style={[styles.metaCol, { flex: 1.2 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>School ID </Text>
                  <Text style={styles.metaValue}>{activeData.school_id || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, { flex: 1.2 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>School Year </Text>
                  <Text style={styles.metaValue}>
                    {activeData.academic_year || activeData.school_year || '—'}
                  </Text>
                </Text>
              </View>
              <View style={[styles.metaCol, styles.lastCell, { flex: 1.6 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Report for the Month of </Text>
                  <Text style={styles.metaValue}>
                    {activeData.month || '—'} {activeData.year || ''}
                  </Text>
                </Text>
              </View>
            </View>

            <View style={[styles.metaRow, { borderTopWidth: 1, borderTopColor: '#000000' }]}>
              <View style={[styles.metaCol, { flex: 1.8 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Name of School </Text>
                  <Text style={styles.metaValue}>{activeData.school_name || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, { flex: 1 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Grade Level </Text>
                  <Text style={styles.metaValue}>{activeData.grade_level || '—'}</Text>
                </Text>
              </View>
              <View style={[styles.metaCol, styles.lastCell, { flex: 1.2 }]}>
                <Text style={styles.metaText}>
                  <Text style={styles.metaLabel}>Section </Text>
                  <Text style={styles.metaValue}>{activeData.section_name || '—'}</Text>
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.matrixTable}>
            <View style={styles.tableRowHeader}>
              <View style={[styles.thCell, { width: SF2_COL_NUM }]}>
                <Text style={styles.thText}>#</Text>
              </View>
              <View style={[styles.thCell, { width: SF2_COL_NAME, paddingHorizontal: 3 }]}>
                <Text style={styles.thText}>LEARNER&apos;S NAME</Text>
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

              <View style={[styles.thCell, { width: SF2_COL_MONTH_TOTAL }]}>
                <Text style={styles.thText}>Total for the{'\n'}Month</Text>
                <View style={styles.absTarSubRow}>
                  <View
                    style={[
                      styles.absTarCell,
                      { width: SF2_COL_ABSENT, borderRightWidth: 1, borderColor: '#000000' },
                    ]}
                  >
                    <Text style={styles.thSmall}>ABSENT</Text>
                  </View>
                  <View style={[styles.absTarCell, { width: SF2_COL_TARDY }]}>
                    <Text style={styles.thSmall}>TARDY</Text>
                  </View>
                </View>
              </View>

              <View
                style={[styles.thCell, styles.lastCell, { width: SF2_COL_REMARKS, paddingHorizontal: 4 }]}
              >
                <Text style={styles.thText}>
                  REMARK/S (If DROPPED OUT, state reason, please refer to legend number 2.{'\n'}
                  If TRANSFERRED IN/OUT, write the name of School.)
                </Text>
              </View>
            </View>

            {isListEmpty ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  {activeData.notice ||
                    `No student attendance records found for Section ${activeData.section_name || 'this class'}.`}
                </Text>
              </View>
            ) : (
              <>
                {males.map((m, rowIdx) => (
                  <View key={`male-row-${rowIdx}-${m.id || rowIdx}`} style={styles.tableRowData}>
                    <View style={[styles.tdCell, { width: SF2_COL_NUM }]}>
                      <Text style={styles.tdText}>{rowIdx + 1}</Text>
                    </View>
                    <View
                      style={[
                        styles.tdCell,
                        { width: SF2_COL_NAME, alignItems: 'flex-start', paddingLeft: 4 },
                      ]}
                    >
                      <Text style={styles.tdLearnerName} numberOfLines={1}>
                        {cleanText(m.name, 120)}
                      </Text>
                    </View>

                    {standardSchoolDays.map((sd, colIdx) => {
                      const status = m.attendance?.[sd.dateNumber];
                      return (
                        <View key={`m-${m.id || rowIdx}-col-${colIdx}`} style={styles.dayDataCell}>
                          {renderAttendanceCell(status)}
                        </View>
                      );
                    })}

                    <View style={[styles.tdCell, { width: SF2_COL_ABSENT }]}>
                      <Text style={styles.tdTotalAbsent}>{m.total_absent || ''}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: SF2_COL_TARDY }]}>
                      <Text style={styles.tdTotalTardy}>{m.total_tardy || ''}</Text>
                    </View>
                    <View
                      style={[
                        styles.tdCell,
                        styles.lastCell,
                        { width: SF2_COL_REMARKS, alignItems: 'flex-start', paddingLeft: 4 },
                      ]}
                    >
                      <Text style={styles.tdRemarks} numberOfLines={1}>
                        {cleanText(m.remarks, 120)}
                      </Text>
                    </View>
                  </View>
                ))}

                <View style={styles.tallyRow}>
                  <View
                    style={[
                      styles.tdCell,
                      { width: SF2_TALLY_LABEL_WIDTH, alignItems: 'flex-start', paddingLeft: 6 },
                    ]}
                  >
                    <Text style={styles.tallyLabel}>&larr; MALE | TOTAL Per Day &rarr;</Text>
                  </View>
                  {standardSchoolDays.map((_, colIdx) => (
                    <View key={`m-tot-col-${colIdx}`} style={styles.dayDataCell}>
                      <Text style={styles.tallyCountText}>
                        {dailyAttendanceTotals.males[colIdx] || ''}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.tdCell, { width: SF2_COL_ABSENT }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.maleAbsent || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: SF2_COL_TARDY }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.maleTardy || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, styles.lastCell, { width: SF2_COL_REMARKS }]} />
                </View>

                {females.map((f, rowIdx) => (
                  <View key={`female-row-${rowIdx}-${f.id || rowIdx}`} style={styles.tableRowData}>
                    <View style={[styles.tdCell, { width: SF2_COL_NUM }]}>
                      <Text style={styles.tdText}>{rowIdx + 1}</Text>
                    </View>
                    <View
                      style={[
                        styles.tdCell,
                        { width: SF2_COL_NAME, alignItems: 'flex-start', paddingLeft: 4 },
                      ]}
                    >
                      <Text style={styles.tdLearnerName} numberOfLines={1}>
                        {cleanText(f.name, 120)}
                      </Text>
                    </View>

                    {standardSchoolDays.map((sd, colIdx) => {
                      const status = f.attendance?.[sd.dateNumber];
                      return (
                        <View key={`f-${f.id || rowIdx}-col-${colIdx}`} style={styles.dayDataCell}>
                          {renderAttendanceCell(status)}
                        </View>
                      );
                    })}

                    <View style={[styles.tdCell, { width: SF2_COL_ABSENT }]}>
                      <Text style={styles.tdTotalAbsent}>{f.total_absent || ''}</Text>
                    </View>
                    <View style={[styles.tdCell, { width: SF2_COL_TARDY }]}>
                      <Text style={styles.tdTotalTardy}>{f.total_tardy || ''}</Text>
                    </View>
                    <View
                      style={[
                        styles.tdCell,
                        styles.lastCell,
                        { width: SF2_COL_REMARKS, alignItems: 'flex-start', paddingLeft: 4 },
                      ]}
                    >
                      <Text style={styles.tdRemarks} numberOfLines={1}>
                        {cleanText(f.remarks, 120)}
                      </Text>
                    </View>
                  </View>
                ))}

                <View style={styles.tallyRow}>
                  <View
                    style={[
                      styles.tdCell,
                      { width: SF2_TALLY_LABEL_WIDTH, alignItems: 'flex-start', paddingLeft: 6 },
                    ]}
                  >
                    <Text style={styles.tallyLabel}>&larr; FEMALE | TOTAL Per Day &rarr;</Text>
                  </View>
                  {standardSchoolDays.map((_, colIdx) => (
                    <View key={`f-tot-col-${colIdx}`} style={styles.dayDataCell}>
                      <Text style={styles.tallyCountText}>
                        {dailyAttendanceTotals.females[colIdx] || ''}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.tdCell, { width: SF2_COL_ABSENT }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.femaleAbsent || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, { width: SF2_COL_TARDY }]}>
                    <Text style={styles.tallyCountText}>{totalsSummary.femaleTardy || ''}</Text>
                  </View>
                  <View style={[styles.tdCell, styles.lastCell, { width: SF2_COL_REMARKS }]} />
                </View>

                <View style={[styles.tallyRow, { backgroundColor: '#f1f5f9', borderBottomWidth: 0 }]}>
                  <View
                    style={[
                      styles.tdCell,
                      { width: SF2_TALLY_LABEL_WIDTH, alignItems: 'flex-start', paddingLeft: 6 },
                    ]}
                  >
                    <Text style={[styles.tallyLabel, { fontWeight: '900' }]}>
                      Combined TOTAL PER DAY
                    </Text>
                  </View>
                  {standardSchoolDays.map((_, colIdx) => (
                    <View key={`c-tot-col-${colIdx}`} style={styles.dayDataCell}>
                      <Text style={[styles.tallyCountText, { fontWeight: '900' }]}>
                        {dailyAttendanceTotals.combined[colIdx] || ''}
                      </Text>
                    </View>
                  ))}
                  <View style={[styles.tdCell, { width: SF2_COL_ABSENT }]}>
                    <Text style={[styles.tallyCountText, { fontWeight: '900' }]}>
                      {totalsSummary.combinedAbsent || ''}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, { width: SF2_COL_TARDY }]}>
                    <Text style={[styles.tallyCountText, { fontWeight: '900' }]}>
                      {totalsSummary.combinedTardy || ''}
                    </Text>
                  </View>
                  <View style={[styles.tdCell, styles.lastCell, { width: SF2_COL_REMARKS }]} />
                </View>
              </>
            )}
          </View>

          <View style={styles.bottomBlockContainer}>
            <View style={styles.guidelinesCol}>
              <Text style={styles.blockHeading}>GUIDELINES:</Text>
              <Text style={styles.guidelineP}>
                1. The attendance shall be accomplished daily. Refer to the codes for checking
                learners&apos; attendance.
              </Text>
              <Text style={styles.guidelineP}>
                2. Dates shall be written in the preceding columns beside Learner&apos;s Name.
              </Text>
              <Text style={styles.guidelineP}>3. To compute the following:</Text>

              <View style={styles.formulaRow}>
                <Text style={styles.formulaLabel}>a. Percentage of Enrolment =</Text>
                <View style={styles.fractionWrap}>
                  <Text style={styles.fractionNumerator}>
                    Registered Learner as of End of the Month
                  </Text>
                  <View style={styles.fractionBar} />
                  <Text style={styles.fractionDenominator}>
                    Enrolment as of 1st Friday of June
                  </Text>
                </View>
                <Text style={styles.multiplyText}>x 100</Text>
              </View>

              <View style={styles.formulaRow}>
                <Text style={styles.formulaLabel}>b. Average Daily Attendance =</Text>
                <View style={styles.fractionWrap}>
                  <Text style={styles.fractionNumerator}>Total Daily Attendance</Text>
                  <View style={styles.fractionBar} />
                  <Text style={styles.fractionDenominator}>
                    Number of School Days in reporting month
                  </Text>
                </View>
              </View>

              <View style={styles.formulaRow}>
                <Text style={styles.formulaLabel}>
                  c. Percentage of Attendance for the month =
                </Text>
                <View style={styles.fractionWrap}>
                  <Text style={styles.fractionNumerator}>Average daily attendance</Text>
                  <View style={styles.fractionBar} />
                  <Text style={styles.fractionDenominator}>
                    Registered Learner as of End of the month
                  </Text>
                </View>
                <Text style={styles.multiplyText}>x 100</Text>
              </View>

              <Text style={styles.guidelineP}>
                4. Every End of the month, the class adviser will submit this form to the office
                of the principal for recording of summary table into the School Form 4. Once
                signed by the principal, this form should be returned to the adviser.
              </Text>
              <Text style={styles.guidelineP}>
                5. The adviser will extend necessary intervention including but not limited to
                home visitation to learner/s that committed 5 consecutive days of absences or
                those with potentials of dropping out.
              </Text>
              <Text style={styles.guidelineP}>
                6. Attendance performance of learner is expected to reflect in Form 137 and Form
                138 every grading period.
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
                <Text style={{ fontWeight: '800' }}>Tardy </Text>(half shaded Upper for Late
                Comer, Lower for Cutting Classes)
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
              <Text style={styles.reasonItem}>a.3. Family or guardian attitude toward schooling</Text>
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
              <Text style={styles.reasonItem}>
                d.2. Armed conflict (incl. Tribal wars &amp; clan feuds)
              </Text>
              <Text style={styles.reasonItem}>d.3. Calamities/Disasters</Text>

              <Text style={styles.reasonSection}>e. Financial-Related</Text>
              <Text style={styles.reasonItem}>e.1. Child labor, work</Text>

              <Text style={styles.reasonSection}>f. Others</Text>
            </View>

            <View style={styles.summaryTableCol}>
              <View style={styles.summaryMonthHeader}>
                <Text style={styles.summaryMonthTitle}>
                  Month: <Text style={styles.summaryMonthVal}>{activeData.month || '—'}</Text>
                </Text>
                <Text style={styles.summaryDaysTitle}>
                  No. of Days of Classes:{' '}
                  <Text style={styles.summaryMonthVal}>{schoolDays.length}</Text>
                </Text>
              </View>

              <View style={styles.sumTableWrap}>
                <View style={styles.sumTableRowHeader}>
                  <Text style={[styles.sumTableColTitle, { flex: 2.2 }]}>
                    Summary for the Month
                  </Text>
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
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {totalEnrolmentJune}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Late Enrollment during the month{'\n'}(beyond cut-off)
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.late_enrolment?.m ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.late_enrolment?.f ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.late_enrolment?.total ?? 0}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Registered Learner as of end of the month
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{maleRegisteredEnd}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{femaleRegisteredEnd}</Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {totalRegisteredEnd}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Percentage of Enrolment as of end of the month
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>—</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>—</Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {percentageEnrolment}%
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Average Daily Attendance
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{adaM}</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{adaF}</Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {adaTotal}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Percentage of Attendance for the month
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{percAttM}%</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>{percAttF}%</Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {percAttTotal}%
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>
                    Number of students with 5 consecutive days of absences:
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.consecutive_5?.m ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.consecutive_5?.f ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.consecutive_5?.total ?? metrics?.consecutive_5_absent_count ?? 0}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>Drop out</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.drop_out?.m ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.drop_out?.f ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.drop_out?.total ?? 0}
                  </Text>
                </View>

                <View style={styles.sumTableRow}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>Transferred out</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.transferred_out?.m ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.transferred_out?.f ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.transferred_out?.total ?? 0}
                  </Text>
                </View>

                <View style={[styles.sumTableRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.sumTableCellLabel, { flex: 2.2 }]}>Transferred in</Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.transferred_in?.m ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, { flex: 0.6 }]}>
                    {metrics?.transferred_in?.f ?? 0}
                  </Text>
                  <Text style={[styles.sumTableCellVal, styles.lastCell, { flex: 0.8, fontWeight: '700' }]}>
                    {metrics?.transferred_in?.total ?? 0}
                  </Text>
                </View>
              </View>

              <View style={styles.signSection}>
                <Text style={styles.certifyDeclaration}>
                  I certify that this is a true and correct report.
                </Text>

                <View style={styles.signFieldBox}>
                  <Text style={styles.signPersonName}>
                    {String(resolvedTeacherName).toUpperCase()}
                  </Text>
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
            schoolLogoUrl={activeData.school_logo || activeData.right_logo || null}
            address={activeData.school_address || activeData.address}
            contactNumber={activeData.school_contact || activeData.contact_number}
            email={activeData.school_email || activeData.email}
          />
          <View style={styles.pageMetaFooter}>
            <Text style={styles.pageMetaText}>
              School Form 2: Page {currentPage} of {totalPages}
            </Text>
          </View>
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
  sheetOuterWrapper: {
    borderWidth: 1.5,
    borderRadius: 6,
    padding: 8,
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
    width: SF2_CANVAS_WIDTH,
    backgroundColor: '#ffffff',
    padding: 6,
  },

  metaTable: {
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
    marginBottom: 4,
    width: SF2_TABLE_WIDTH,
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
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#ffffff',
    width: SF2_TABLE_WIDTH,
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
  lastCell: {
    borderRightWidth: 0,
  },

  daysContainer: {
    width: SF2_DAYS_TOTAL_WIDTH,
  },
  daysTopBanner: {
    borderBottomWidth: 1,
    borderRightWidth: 0.8,
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
    width: SF2_DAY_CELL_WIDTH,
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
    width: SF2_DAY_CELL_WIDTH,
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
    borderWidth: 1,
    borderColor: '#000000',
    borderTopWidth: 0,
    backgroundColor: '#ffffff',
    width: SF2_TABLE_WIDTH,
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
    width: SF2_TABLE_WIDTH,
  },
  pageMetaText: {
    fontSize: 6.5,
    color: '#64748b',
    fontStyle: 'italic',
  },
});

export default SF2ReportView;
