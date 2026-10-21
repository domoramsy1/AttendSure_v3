// D:\AttendSure_V3\mobile\src\components\reports\DTRReportView.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../../api/client';

export interface DailyDTRRow {
  day: number;
  date_str: string;
  day_of_week: string;
  is_weekend: boolean;
  am_arrival: string;
  am_departure: string;
  pm_arrival: string;
  pm_departure: string;
  undertime_hours: number | string;
  undertime_minutes: number | string;
  is_loafing?: boolean;
  loafing_excused?: boolean;
  loafing_remarks?: string;
}

export interface DTRReportData {
  faculty_id: number;
  faculty_name: string;
  employee_id: string;
  department?: string;
  month: string;
  month_number: number;
  year: number;
  regular_days_hours: string;
  saturdays_hours: string;
  school_head: string;
  school_head_title?: string;
  dtr_submitted?: boolean;
  dept_head_approved: boolean;
  approved_by_dept_head_at?: string | null;
  user_role?: string;
  can_approve_dept?: boolean;
  can_clear_loafing?: boolean;
  rows: DailyDTRRow[];
  total_undertime_hours: number;
  total_undertime_minutes: number;
  days_present: number;
}

export interface DTRReportViewProps {
  data: DTRReportData | null;
  selectedMonth?: number;
  selectedYear?: number;
  onMonthChange?: (month: number, year: number) => void;
  submitting?: boolean;
  onSubmit?: () => void;
  onRefreshNeeded?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const DTRReportView: React.FC<DTRReportViewProps> = ({
  data,
  selectedMonth = new Date().getMonth() + 1,
  selectedYear = new Date().getFullYear(),
  onMonthChange,
  submitting = false,
  onSubmit,
  onRefreshNeeded,
}) => {
  if (!data) return null;

  const [viewSide, setViewSide] = useState<'FRONT' | 'BACK' | 'BOTH'>('FRONT');
  const [selectedViolationRow, setSelectedViolationRow] = useState<DailyDTRRow | null>(null);
  const [pardonRemarks, setPardonRemarks] = useState<string>('');
  const [actionProcessing, setActionProcessing] = useState<boolean>(false);
  const [showDatePickerModal, setShowDatePickerModal] = useState<boolean>(false);

  const isApproved = Boolean(data.dept_head_approved);
  const isSubmitted = Boolean(data.dtr_submitted);
  const resolvedHead = (data.school_head || 'School Head / In-Charge').trim();
  const resolvedTitle = (data.school_head_title || 'In-Charge').trim();

  // Normalize 31 rows
  const rawRows = Array.isArray(data.rows) ? data.rows : [];
  const rows31: DailyDTRRow[] = [];

  for (let dayNum = 1; dayNum <= 31; dayNum++) {
    const found = rawRows.find((r) => r.day === dayNum);
    if (found) {
      rows31.push(found);
    } else {
      rows31.push({
        day: dayNum,
        date_str: '',
        day_of_week: '',
        is_weekend: false,
        am_arrival: '',
        am_departure: '',
        pm_arrival: '',
        pm_departure: '',
        undertime_hours: '',
        undertime_minutes: '',
        is_loafing: false,
        loafing_excused: false,
      });
    }
  }

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (!onMonthChange) return;
    if (selectedMonth === 1) {
      onMonthChange(12, selectedYear - 1);
    } else {
      onMonthChange(selectedMonth - 1, selectedYear);
    }
  };

  const handleNextMonth = () => {
    if (!onMonthChange) return;
    if (selectedMonth === 12) {
      onMonthChange(1, selectedYear + 1);
    } else {
      onMonthChange(selectedMonth + 1, selectedYear);
    }
  };

  // Excuse loafing
  const handleExcuseLoafing = async () => {
    if (!selectedViolationRow) return;

    const cleanRemarks = pardonRemarks.replace(/[\r\n\t]/g, ' ').trim();
    if (!cleanRemarks) {
      Alert.alert('Required', 'Please enter official remarks or justification.');
      return;
    }

    setActionProcessing(true);
    try {
      await apiClient.post(`/reports/dtr/${data.faculty_id}/`, {
        action: 'EXCUSE_LOAFING',
        faculty_id: data.faculty_id,
        date_str: selectedViolationRow.date_str,
        remarks: cleanRemarks,
      });

      Alert.alert('Excused', `Departure on ${selectedViolationRow.date_str} excused.`);
      setSelectedViolationRow(null);
      setPardonRemarks('');
      if (onRefreshNeeded) onRefreshNeeded();
    } catch (err: any) {
      Alert.alert('Denied', err?.response?.data?.error || 'Could not excuse record.');
    } finally {
      setActionProcessing(false);
    }
  };

  // Front Form 48 Sheet
  const renderFrontSheet = () => (
    <View style={styles.sheetContainer}>
      {/* Draft Watermark */}
      {!isApproved && (
        <View style={styles.watermarkOverlay} pointerEvents="none">
          <View style={styles.watermarkRotate}>
            <View style={styles.watermarkBorder}>
              <Text style={styles.watermarkText}>DRAFT</Text>
            </View>
            <Text style={styles.watermarkSub}>NOT APPROVED BY DEPT HEAD</Text>
          </View>
        </View>
      )}

      {/* Date Navigation Bar on Top of Form */}
      <View style={styles.topDateNavCard}>
        <TouchableOpacity style={styles.dateNavArrow} onPress={handlePrevMonth}>
          <Ionicons name="chevron-back" size={16} color="#004b87" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.dateDisplayBtn}
          onPress={() => setShowDatePickerModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={14} color="#004b87" />
          <Text style={styles.dateDisplayText}>
            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
          </Text>
          <Ionicons name="caret-down-outline" size={11} color="#64748b" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dateNavArrow} onPress={handleNextMonth}>
          <Ionicons name="chevron-forward" size={16} color="#004b87" />
        </TouchableOpacity>
      </View>

      {/* Statutory Header */}
      <Text style={styles.formMeta}>Civil Service Form No. 48</Text>
      <Text style={styles.formTitle}>DAILY TIME RECORD</Text>
      <Text style={styles.formDivider}>----- o0o -----</Text>

      {/* Name Line */}
      <View style={styles.nameBlock}>
        <Text style={styles.nameText}>{data.faculty_name.toUpperCase()}</Text>
        <View style={styles.blackUnderline} />
        <Text style={styles.captionText}>(Name)</Text>
        {data.employee_id ? (
          <Text style={styles.empIdCaption}>Employee ID: {data.employee_id}</Text>
        ) : null}
      </View>

      {/* Month & Prescribed Hours */}
      <View style={styles.hoursBlock}>
        <Text style={styles.monthCoverText}>
          For the month of <Text style={styles.boldUnderline}>{MONTH_NAMES[selectedMonth - 1]}</Text>, 20
          <Text style={styles.boldUnderline}>{String(selectedYear).slice(-2)}</Text>
        </Text>

        <View style={styles.hoursSpecRow}>
          <Text style={styles.hoursSpecLabel}>
            Official hours of arrival{'\n'}and departure
          </Text>
          <View style={styles.hoursSpecBox}>
            <Text style={styles.hoursText}>
              Regular Days: <Text style={styles.underlineVal}>{data.regular_days_hours || '8:00 AM - 12:00 PM / 1:00 PM - 5:00 PM'}</Text>
            </Text>
            <Text style={styles.hoursText}>
              Saturdays: <Text style={styles.underlineVal}>{data.saturdays_hours || 'As Required'}</Text>
            </Text>
          </View>
        </View>
      </View>

      {/* 31-Day Grid Table */}
      <View style={styles.table}>
        <View style={styles.tableRowHeader}>
          <View style={[styles.cell, styles.colDay, { borderBottomWidth: 0 }]}>
            <Text style={styles.thBold}>Days</Text>
          </View>
          <View style={[styles.cell, styles.colHalf, styles.borderLeft]}>
            <Text style={styles.thBold}>A. M.</Text>
          </View>
          <View style={[styles.cell, styles.colHalf, styles.borderLeft]}>
            <Text style={styles.thBold}>P. M.</Text>
          </View>
          <View style={[styles.cell, styles.colUt, styles.borderLeft]}>
            <Text style={styles.thBold}>UNDERTIME</Text>
          </View>
        </View>

        <View style={[styles.tableRowHeader, { borderBottomWidth: 1.2 }]}>
          <View style={[styles.cell, styles.colDay]} />
          <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
            <Text style={styles.thSmall}>ARRIVAL</Text>
          </View>
          <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
            <Text style={styles.thSmall}>DEPARTURE</Text>
          </View>
          <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
            <Text style={styles.thSmall}>ARRIVAL</Text>
          </View>
          <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
            <Text style={styles.thSmall}>DEPARTURE</Text>
          </View>
          <View style={[styles.cell, styles.colUtPart, styles.borderLeft]}>
            <Text style={styles.thSmall}>Hours</Text>
          </View>
          <View style={[styles.cell, styles.colUtPart, styles.borderLeft]}>
            <Text style={styles.thSmall}>Minutes</Text>
          </View>
        </View>

        {rows31.map((row) => {
          const isViolating = Boolean(row.is_loafing && !row.loafing_excused);
          const isWeekend = Boolean(row.is_weekend);

          return (
            <View
              key={String(row.day)}
              style={[
                styles.tableRow,
                isViolating
                  ? { backgroundColor: '#fee2e2' }
                  : isWeekend
                  ? { backgroundColor: '#fafafa' }
                  : null,
              ]}
            >
              <View style={[styles.cell, styles.colDay]}>
                <TouchableOpacity
                  onPress={() => {
                    if (data.can_clear_loafing && row.is_loafing) {
                      setSelectedViolationRow(row);
                    }
                  }}
                  disabled={!data.can_clear_loafing || !row.is_loafing}
                  style={{ flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={styles.dayText}>{row.day}</Text>
                  {row.is_loafing ? (
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: '800',
                        marginLeft: 1,
                        color: isViolating ? '#dc2626' : '#059669',
                      }}
                    >
                      {isViolating ? '!' : '✓'}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              </View>

              <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
                <Text style={[styles.tdText, isViolating && styles.redText]}>
                  {row.am_arrival}
                </Text>
              </View>

              <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
                <Text style={[styles.tdText, isViolating && styles.redText]}>
                  {row.am_departure}
                </Text>
              </View>

              <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
                <Text style={[styles.tdText, isViolating && styles.redText]}>
                  {row.pm_arrival}
                </Text>
              </View>

              <View style={[styles.cell, styles.colTime, styles.borderLeft]}>
                <Text style={[styles.tdText, isViolating && styles.redText]}>
                  {row.pm_departure}
                </Text>
              </View>

              <View style={[styles.cell, styles.colUtPart, styles.borderLeft]}>
                <Text style={[styles.tdText, row.undertime_hours ? styles.redText : null]}>
                  {row.undertime_hours}
                </Text>
              </View>

              <View style={[styles.cell, styles.colUtPart, styles.borderLeft]}>
                <Text style={[styles.tdText, row.undertime_minutes ? styles.redText : null]}>
                  {row.undertime_minutes}
                </Text>
              </View>
            </View>
          );
        })}

        {/* Totals */}
        <View style={styles.totalRow}>
          <View style={[styles.cell, styles.colTotalSpan]}>
            <Text style={styles.totalThText}>TOTAL</Text>
          </View>
          <View style={[styles.cell, styles.colUtPart, styles.borderLeft]}>
            <Text style={styles.totalValText}>
              {data.total_undertime_hours > 0 ? String(data.total_undertime_hours) : ''}
            </Text>
          </View>
          <View style={[styles.cell, styles.colUtPart, styles.borderLeft]}>
            <Text style={styles.totalValText}>
              {data.total_undertime_minutes > 0 ? String(data.total_undertime_minutes) : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Certification */}
      <Text style={styles.certBody}>
        I CERTIFY on my honor that the above is a true and correct report of the
        hours of work performed, record of which was made daily at the time of
        arrival and departure from office.
      </Text>

      <View style={styles.sigBox}>
        <Text style={styles.sigName}>{data.faculty_name}</Text>
        <View style={styles.sigLine} />
        <Text style={styles.captionText}>(Signature of Faculty / Employee)</Text>
      </View>

      <View style={styles.sigBox}>
        <Text style={styles.verifiedText}>Verified as to prescribed office hours:</Text>
        <Text style={styles.sigName}>{resolvedHead}</Text>
        <View style={styles.sigLine} />
        <Text style={styles.captionText}>{resolvedTitle}</Text>
      </View>

      <Text style={styles.backNote}>(See Instructions on back)</Text>

      {/* Submit Button */}
      {!isSubmitted && onSubmit && (
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="send-outline" size={16} color="#ffffff" />
              <Text style={styles.submitBtnText}>Submit DTR</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  // Back Instructions Sheet
  const renderBackSheet = () => (
    <View style={styles.sheetContainer}>
      <Text style={styles.instTitle}>INSTRUCTIONS</Text>
      <View style={styles.instLine} />

      <Text style={styles.instP}>
        Civil Service Form No. 48, after completion, Should be filed in the records
        of the Bureau or Office which submits the monthly report on Civil Service Form
        No. 3 to the Bureau of Civil Service.
      </Text>

      <Text style={styles.instP}>
        In lieu of the above, court interpreters and stenographers who accompany
        the judges of the Court of First Instance will fill out the daily time
        reports on this form in triplicate, after which they should be approved by
        the judge with whom service has been rendered, or by an officer of the
        Department of Justice authorized to do so. The original should be forwarded
        promptly after the end of the month to the Bureau of Civil Service, thru the
        Department of Justice; the duplicate to kept in the department of justice;
        and the triplicate, in the office of the Clerk of Court where service was
        rendered.
      </Text>

      <Text style={styles.instP}>
        In the space provided for the purpose on the other side will be indicated the
        office hours the employee is required to observe, as for example, "Regular
        days, 8:00 to 12:00 and 1:00 to 4:00; Saturdays 8:00 to 1:00."
      </Text>

      <Text style={styles.instP}>
        Attention is invited to paragraph 3, Civil Service Rule XV, Executive Order
        No. 5, series of 1909, which reads as follows:
      </Text>

      <View style={styles.instQuote}>
        <Text style={styles.instQuoteText}>
          "Each chief of a Bureau or Office shall require a daily record of
          attendance of all the officers and employees under him entitled to leave or
          absence or vacation (including teachers) to be kept on the proper form and
          also a systematic office record showing for each day all absences from
          duty from any cause whatever. At the beginning of each month he shall
          report to the Commissioner on the proper form of all absences from any cause
          whatever, including the exact amount of undertime of each person for each
          day. Officers or employees serving in the field or on the water need not be
          required to keep a daily record, but all absences of such employees must
          be included in the monthly report of changes and absences. Falsification of
          time records will render the offending officers or employee liable to
          summary removal from the service and criminal prosecution."
        </Text>
      </View>

      <Text style={styles.instNote}>
        <Text style={{ fontWeight: '800' }}>(NOTE: </Text>A record made from memory
        at sometime subsequent to the occurrence of an event is not reliable. Non
        observance of office hours deprives the employee of the leave privileges
        although he may have rendered overtime service. Where service rendered
        outside of the Office for the whole morning or afternoon, notation to that
        effect should be made clearly.)
      </Text>
    </View>
  );

  return (
    <View style={{ gap: 10 }}>
      {/* Side Toggle Bar */}
      <View style={styles.sideToggleRow}>
        {(['FRONT', 'BACK', 'BOTH'] as const).map((side) => {
          const active = viewSide === side;
          return (
            <TouchableOpacity
              key={side}
              style={[styles.sideToggleBtn, active && styles.sideToggleBtnActive]}
              onPress={() => setViewSide(side)}
            >
              <Text style={[styles.sideToggleText, active && styles.sideToggleTextActive]}>
                {side === 'FRONT' ? 'Front (Form 48)' : side === 'BACK' ? 'Back (Instructions)' : 'Full View'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Sheet Output */}
      {(viewSide === 'BOTH' || viewSide === 'FRONT') && renderFrontSheet()}
      {(viewSide === 'BOTH' || viewSide === 'BACK') && renderBackSheet()}

      {/* Month & Year Picker Modal */}
      <Modal
        visible={showDatePickerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDatePickerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="calendar" size={20} color="#004b87" />
              <Text style={styles.modalTitle}>Select Month & Year</Text>
            </View>

            {/* Year Selector */}
            <Text style={styles.pickerSectionLabel}>YEAR</Text>
            <View style={styles.yearGrid}>
              {[2024, 2025, 2026, 2027].map((y) => (
                <TouchableOpacity
                  key={y}
                  style={[styles.yearChip, selectedYear === y && styles.yearChipActive]}
                  onPress={() => onMonthChange && onMonthChange(selectedMonth, y)}
                >
                  <Text style={[styles.yearChipText, selectedYear === y && styles.yearChipTextActive]}>
                    {y}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Months 3x4 Grid */}
            <Text style={styles.pickerSectionLabel}>MONTH</Text>
            <View style={styles.monthsGrid}>
              {MONTH_NAMES.map((m, idx) => {
                const mNum = idx + 1;
                const active = selectedMonth === mNum;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.monthChip, active && styles.monthChipActive]}
                    onPress={() => {
                      if (onMonthChange) onMonthChange(mNum, selectedYear);
                      setShowDatePickerModal(false);
                    }}
                  >
                    <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                      {m.slice(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowDatePickerModal(false)}
            >
              <Text style={styles.modalCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Loafing Review Modal */}
      {selectedViolationRow && (
        <Modal
          visible={Boolean(selectedViolationRow)}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setSelectedViolationRow(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Ionicons name="warning" size={24} color="#dc2626" />
                <Text style={styles.modalTitle}>Loafing Violation Review</Text>
              </View>

              <Text style={styles.modalDesc}>
                An unexcused departure was recorded for{' '}
                <Text style={{ fontWeight: '800' }}>{data.faculty_name}</Text> on{' '}
                <Text style={{ fontWeight: '800' }}>{selectedViolationRow.date_str}</Text>.
                If not excused, this day incurs a salary deduction.
              </Text>

              <Text style={styles.gateNote}>
                Gate Note: {selectedViolationRow.loafing_remarks || 'None'}
              </Text>

              <Text style={styles.modalInputLabel}>Official Remarks / Justification:</Text>
              <TextInput
                style={styles.modalInput}
                value={pardonRemarks}
                onChangeText={setPardonRemarks}
                placeholder="Enter justification for excusing departure..."
                placeholderTextColor="#94a3b8"
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalBtnCancel}
                  onPress={() => setSelectedViolationRow(null)}
                >
                  <Text style={styles.modalBtnCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalBtnConfirm, actionProcessing && { opacity: 0.6 }]}
                  onPress={handleExcuseLoafing}
                  disabled={actionProcessing}
                >
                  {actionProcessing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-done" size={15} color="#ffffff" />
                      <Text style={styles.modalBtnConfirmText}>Pardon &amp; Clear</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sideToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    gap: 4,
  },
  sideToggleBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  sideToggleBtnActive: { backgroundColor: '#004b87' },
  sideToggleText: { fontSize: 10.5, fontWeight: '800', color: '#64748b' },
  sideToggleTextActive: { color: '#ffffff' },

  sheetContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#0f172a',
    borderRadius: 4,
    padding: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  topDateNavCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
  },
  dateNavArrow: { padding: 4 },
  dateDisplayBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  dateDisplayText: { fontSize: 12, fontWeight: '800', color: '#004b87' },

  watermarkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  watermarkRotate: {
    transform: [{ rotate: '-32deg' }],
    alignItems: 'center',
  },
  watermarkBorder: {
    borderWidth: 3,
    borderColor: 'rgba(239, 68, 68, 0.22)',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 16,
    borderStyle: 'dashed',
  },
  watermarkText: {
    fontSize: 34,
    fontWeight: '900',
    color: 'rgba(239, 68, 68, 0.22)',
    letterSpacing: 6,
  },
  watermarkSub: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(239, 68, 68, 0.32)',
    letterSpacing: 1,
    marginTop: 2,
  },

  formMeta: { fontSize: 9, fontStyle: 'italic', color: '#0f172a' },
  formTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: 1,
    marginTop: 1,
  },
  formDivider: { fontSize: 9, textAlign: 'center', color: '#475569', marginBottom: 4 },
  nameBlock: { alignItems: 'center', marginVertical: 3 },
  nameText: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  blackUnderline: { width: '80%', height: 1, backgroundColor: '#0f172a', marginTop: 1 },
  captionText: { fontSize: 8, color: '#475569', marginTop: 1 },
  empIdCaption: { fontSize: 8.5, fontWeight: '700', color: '#004b87', marginTop: 1 },
  hoursBlock: { marginVertical: 4 },
  monthCoverText: { fontSize: 10.5, color: '#0f172a', marginBottom: 4 },
  boldUnderline: { fontWeight: '800', textDecorationLine: 'underline' },
  hoursSpecRow: { flexDirection: 'row', alignItems: 'center' },
  hoursSpecLabel: { fontSize: 9, color: '#0f172a', width: 110, lineHeight: 12 },
  hoursSpecBox: { flex: 1, borderLeftWidth: 1.5, borderLeftColor: '#0f172a', paddingLeft: 6 },
  hoursText: { fontSize: 8.5, color: '#0f172a', marginVertical: 0.5 },
  underlineVal: { textDecorationLine: 'underline', fontWeight: '700' },

  table: { borderWidth: 1.2, borderColor: '#0f172a', backgroundColor: '#ffffff', marginTop: 4 },
  tableRowHeader: { flexDirection: 'row', backgroundColor: '#f8fafc', borderBottomWidth: 1, borderColor: '#0f172a' },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#cbd5e1', minHeight: 18, alignItems: 'center' },
  totalRow: { flexDirection: 'row', backgroundColor: '#f1f5f9', minHeight: 20, alignItems: 'center' },
  cell: { paddingVertical: 1, paddingHorizontal: 1, alignItems: 'center', justifyContent: 'center' },
  borderLeft: { borderLeftWidth: 1, borderLeftColor: '#0f172a' },
  colDay: { width: 30 },
  colHalf: { flex: 2 },
  colTime: { flex: 1 },
  colUt: { flex: 1.2 },
  colUtPart: { flex: 0.6 },
  colTotalSpan: { width: 30 + 4 * 56 },
  thBold: { fontSize: 8.5, fontWeight: '800', color: '#0f172a', textAlign: 'center' },
  thSmall: { fontSize: 6.8, fontWeight: '800', color: '#334155', textAlign: 'center' },
  dayText: { fontSize: 9, fontWeight: '800', color: '#0f172a' },
  tdText: { fontSize: 8.5, color: '#334155', textAlign: 'center' },
  redText: { color: '#dc2626', fontWeight: '800' },
  totalThText: { fontSize: 9, fontWeight: '900', color: '#0f172a', textAlign: 'right', paddingRight: 6 },
  totalValText: { fontSize: 9, fontWeight: '900', color: '#dc2626', textAlign: 'center' },
  certBody: { fontSize: 8.5, color: '#0f172a', textAlign: 'justify', lineHeight: 12, marginTop: 8 },
  sigBox: { alignItems: 'center', marginTop: 12 },
  sigName: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  sigLine: { width: '70%', height: 1, backgroundColor: '#0f172a', marginTop: 1 },
  verifiedText: { fontSize: 8.5, color: '#0f172a', marginBottom: 6 },
  backNote: { fontSize: 7.5, fontStyle: 'italic', textAlign: 'center', color: '#64748b', marginTop: 8 },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#004b87',
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  submitBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },

  instTitle: { fontSize: 13, fontWeight: '900', textAlign: 'center', color: '#0f172a', letterSpacing: 0.6 },
  instLine: { height: 1, backgroundColor: '#0f172a', marginVertical: 6 },
  instP: { fontSize: 8.5, color: '#0f172a', lineHeight: 12.5, textAlign: 'justify', marginBottom: 6 },
  instQuote: { borderLeftWidth: 1.5, borderLeftColor: '#0f172a', paddingLeft: 6, marginVertical: 4 },
  instQuoteText: { fontSize: 8, fontStyle: 'italic', color: '#0f172a', lineHeight: 11.5, textAlign: 'justify' },
  instNote: { fontSize: 8, color: '#334155', lineHeight: 11.5, textAlign: 'justify', marginTop: 4 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  modalTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  pickerSectionLabel: { fontSize: 10, fontWeight: '800', color: '#64748b', marginBottom: 6, letterSpacing: 0.5 },
  yearGrid: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  yearChip: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  yearChipActive: { backgroundColor: '#004b87', borderColor: '#004b87' },
  yearChipText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  yearChipTextActive: { color: '#ffffff' },
  monthsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  monthChip: {
    width: '31%',
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthChipActive: { backgroundColor: '#004b87', borderColor: '#004b87' },
  monthChipText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  monthChipTextActive: { color: '#ffffff' },
  modalCloseBtn: {
    paddingVertical: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalCloseBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  modalDesc: { fontSize: 11, color: '#334155', lineHeight: 15, marginBottom: 8 },
  gateNote: { fontSize: 10.5, fontStyle: 'italic', color: '#dc2626', marginBottom: 10 },
  modalInputLabel: { fontSize: 10.5, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0f172a',
    marginBottom: 12,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  modalBtnCancel: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#f1f5f9' },
  modalBtnCancelText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  modalBtnConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#059669',
  },
  modalBtnConfirmText: { fontSize: 11.5, fontWeight: '800', color: '#ffffff' },
});

export default DTRReportView;