// AttendSure Mobile - Campus Location Card
// File: D:\AttendSure_V3\mobile\src\components\dashboard\CampusLocationCard.tsx

/**
 * AttendSure Mobile - Live School Campus GPS Location Card
 * File: mobile/src/components/dashboard/CampusLocationCard.tsx
 */

import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import { formatDistanceMeters } from '../../utils/helpers';

export interface CampusLocationCardProps {
  isInsideCampusPerimeter: boolean | null;
  liveDistanceMeters: number | null;
  radiusMeters: number | null;
  timestamp?: string | null;
  gpsError: string | null;
}

export const CampusLocationCard: React.FC<CampusLocationCardProps> = ({
  isInsideCampusPerimeter,
  liveDistanceMeters,
  radiusMeters,
  timestamp,
  gpsError,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  return (
    <View style={styles.campusLocationCard}>
      <View style={styles.campusCardHeader}>
        <View style={styles.campusHeaderLeft}>
          <View
            style={[
              styles.pulseDot,
              {
                backgroundColor:
                  isInsideCampusPerimeter === true
                    ? palette.success
                    : isInsideCampusPerimeter === false
                      ? palette.warning
                      : palette.textMuted,
              },
            ]}
          />
          <Text style={styles.campusHeaderLabel}>SCHOOL CAMPUS LOCATION</Text>
        </View>

        {timestamp ? (
          <View style={styles.timestampBadge}>
            <Ionicons name="time-outline" size={11} color={palette.textMuted} />
            <Text style={styles.timestampBadgeText}>{timestamp}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.campusMainContent}>
        {liveDistanceMeters !== null ? (
          <>
            <View style={styles.distanceValueRow}>
              <Text style={styles.distanceMetricBig}>
                {formatDistanceMeters(liveDistanceMeters)}
              </Text>
              <Text style={styles.distanceMetricSub}>from school grounds</Text>
            </View>

            <View style={styles.perimeterBadgeRow}>
              <View
                style={[
                  styles.perimeterBadge,
                  {
                    backgroundColor: isInsideCampusPerimeter
                      ? palette.successLight
                      : palette.warningLight,
                    borderColor: isInsideCampusPerimeter ? palette.success : palette.warning,
                  },
                ]}
              >
                <Ionicons
                  name={isInsideCampusPerimeter ? 'checkmark-circle' : 'navigate-circle-outline'}
                  size={13}
                  color={isInsideCampusPerimeter ? palette.success : palette.warning}
                />
                <Text
                  style={[
                    styles.perimeterBadgeText,
                    { color: isInsideCampusPerimeter ? palette.success : palette.warning },
                  ]}
                >
                  {isInsideCampusPerimeter ? 'INSIDE SCHOOL GROUNDS' : 'OUTSIDE SCHOOL GROUNDS'}
                </Text>
              </View>

              <Text style={styles.perimeterRadiusMeta}>
                {radiusMeters !== null ? `Allowed area: ${radiusMeters}m` : 'Boundary not set'}
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.acquiringFixBox}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={styles.acquiringFixText}>{gpsError || 'Finding GPS location...'}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    campusLocationCard: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: palette.border,
      marginBottom: 12,
    },
    campusCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    campusHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    pulseDot: { width: 8, height: 8, borderRadius: 4 },
    campusHeaderLabel: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
      letterSpacing: 0.4,
    },
    timestampBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: palette.surfaceSubtle,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    timestampBadgeText: {
      fontSize: fonts.xxs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.semibold,
    },
    campusMainContent: { marginVertical: 4 },
    distanceValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
    distanceMetricBig: {
      fontSize: 26,
      fontWeight: fonts.weight.black,
      color: palette.textPrimary,
      letterSpacing: -0.5,
    },
    distanceMetricSub: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.semibold,
      color: palette.textSecondary,
    },
    perimeterBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 6,
    },
    perimeterBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      borderWidth: 1,
    },
    perimeterBadgeText: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      letterSpacing: 0.2,
    },
    perimeterRadiusMeta: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.semibold,
    },
    acquiringFixBox: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
    acquiringFixText: {
      fontSize: fonts.xs,
      color: palette.textSecondary,
      fontWeight: fonts.weight.semibold,
      flex: 1,
    },
  });

export default CampusLocationCard;
