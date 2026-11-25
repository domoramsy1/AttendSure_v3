// AttendSure Mobile - Duty Right Now Card
// File: D:\AttendSure_V3\mobile\src\components\dashboard\DutyRightNowCard.tsx

/**
 * AttendSure Mobile - Glanceable Duty, Location & Next-Step Card
 * File: mobile/src/components/dashboard/DutyRightNowCard.tsx
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import type { TabType } from '../../navigation/MainTabNavigator';
import { formatDistanceMeters } from '../../utils/helpers';

export interface DutyRightNowCardProps {
  offlineCount: number;
  isOnline: boolean;
  isOfficiallyOnDuty: boolean;
  hasCheckedInToday: boolean;
  hasCheckedOutToday: boolean;
  arrivalTime?: string | null;
  isInsideCampusPerimeter: boolean | null;
  liveDistanceMeters: number | null;
  allowClassViews: boolean;
  onNavigate?: (tab: TabType) => void;
}

export const DutyRightNowCard: React.FC<DutyRightNowCardProps> = ({
  offlineCount,
  isOnline,
  isOfficiallyOnDuty,
  hasCheckedInToday,
  hasCheckedOutToday,
  arrivalTime,
  isInsideCampusPerimeter,
  liveDistanceMeters,
  allowClassViews,
  onNavigate,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <View style={styles.rightNowCard}>
      <View style={styles.rightNowHeader}>
        <Text style={styles.rightNowEyebrow}>RIGHT NOW • YOUR DUTY &amp; NEXT STEP</Text>
        <View
          style={[
            styles.rightNowPill,
            {
              backgroundColor:
                offlineCount > 0
                  ? palette.warningLight
                  : isOnline
                    ? palette.successLight
                    : palette.surfaceSubtle,
            },
          ]}
        >
          <Text
            style={[
              styles.rightNowPillText,
              {
                color:
                  offlineCount > 0
                    ? palette.warning
                    : isOnline
                      ? palette.success
                      : palette.textMuted,
              },
            ]}
          >
            {offlineCount > 0
              ? `${offlineCount} Saved Offline`
              : isOnline
                ? 'Synced'
                : 'Offline Mode'}
          </Text>
        </View>
      </View>

      <View style={styles.rightNowChipsRow}>
        <View
          style={[
            styles.rightNowStatusChip,
            {
              backgroundColor: isOfficiallyOnDuty
                ? palette.successLight
                : hasCheckedOutToday
                  ? palette.infoLight
                  : palette.surfaceSubtle,
            },
          ]}
        >
          <Ionicons
            name={
              isOfficiallyOnDuty
                ? 'checkmark-circle'
                : hasCheckedOutToday
                  ? 'time-outline'
                  : 'moon-outline'
            }
            size={14}
            color={
              isOfficiallyOnDuty
                ? palette.success
                : hasCheckedOutToday
                  ? palette.info
                  : palette.textMuted
            }
          />
          <Text
            style={[
              styles.rightNowChipText,
              {
                color: isOfficiallyOnDuty
                  ? palette.success
                  : hasCheckedOutToday
                    ? palette.info
                    : palette.textSecondary,
              },
            ]}
            numberOfLines={1}
          >
            {isOfficiallyOnDuty
              ? `On Duty (${arrivalTime || 'Timed In'})`
              : hasCheckedOutToday
                ? 'Shift Completed'
                : 'Off Duty — Not Timed In'}
          </Text>
        </View>

        <View
          style={[
            styles.rightNowStatusChip,
            {
              backgroundColor:
                isInsideCampusPerimeter === true
                  ? palette.successLight
                  : isInsideCampusPerimeter === false
                    ? isOfficiallyOnDuty
                      ? palette.dangerLight
                      : palette.warningLight
                    : palette.surfaceSubtle,
            },
          ]}
        >
          <Ionicons
            name={isInsideCampusPerimeter === true ? 'location' : 'navigate-outline'}
            size={14}
            color={
              isInsideCampusPerimeter === true
                ? palette.success
                : isInsideCampusPerimeter === false
                  ? isOfficiallyOnDuty
                    ? palette.danger
                    : palette.warning
                  : palette.textMuted
            }
          />
          <Text
            style={[
              styles.rightNowChipText,
              {
                color:
                  isInsideCampusPerimeter === true
                    ? palette.success
                    : isInsideCampusPerimeter === false
                      ? isOfficiallyOnDuty
                        ? palette.danger
                        : palette.warning
                      : palette.textSecondary,
              },
            ]}
            numberOfLines={1}
          >
            {isInsideCampusPerimeter === null
              ? 'Locating...'
              : isInsideCampusPerimeter
                ? 'On Campus'
                : `Outside (${liveDistanceMeters !== null ? formatDistanceMeters(liveDistanceMeters) : '—'})`}
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.rightNowPrimaryBtn}
        onPress={() =>
          onNavigate?.(!hasCheckedInToday ? 'scanner' : allowClassViews ? 'scanner' : 'dtr')
        }
        activeOpacity={0.85}
      >
        <Ionicons
          name={
            !hasCheckedInToday
              ? 'finger-print-outline'
              : allowClassViews
                ? 'qr-code-outline'
                : 'time-outline'
          }
          size={18}
          color={palette.onPrimary}
        />
        <Text style={styles.rightNowPrimaryBtnText}>
          {!hasCheckedInToday
            ? 'Time In on Campus'
            : allowClassViews
              ? 'Scan Student QR'
              : 'View My Daily Time Record'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    rightNowCard: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 10,
    },
    rightNowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    rightNowEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textMuted,
      letterSpacing: 0.4,
    },
    rightNowPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    rightNowPillText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
    },
    rightNowChipsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    rightNowStatusChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 8,
      borderRadius: 10,
    },
    rightNowChipText: {
      flex: 1,
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
    },
    rightNowPrimaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 12,
      backgroundColor: palette.buttonBg,
    },
    rightNowPrimaryBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.sm,
      fontWeight: fonts.weight.extrabold,
    },
  });

export default DutyRightNowCard;
