/**
 * AttendSure Mobile - Academic Setup List Card Renderer
 * File: mobile/src/components/schedules/ScheduleListItemCard.tsx
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import { resolveMediaUrl } from '../../utils/helpers';
import type { ScheduleSubTab } from './types';

export interface ScheduleListItemCardProps {
  subTab: ScheduleSubTab;
  item: any;
  serverBase: string;
  allowCrud: boolean;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}

export const ScheduleListItemCard: React.FC<ScheduleListItemCardProps> = ({
  subTab,
  item,
  serverBase,
  allowCrud,
  onEdit,
  onDelete,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const avatarUri =
    subTab === 'PERIODS'
      ? resolveMediaUrl(item.teacher_photo_url, serverBase)
      : subTab === 'SECTIONS'
        ? resolveMediaUrl(item.adviser_photo_url, serverBase)
        : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        {(subTab === 'PERIODS' || subTab === 'SECTIONS') && (
          <View style={styles.avatarBox}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={18} color={palette.primary} />
            )}
          </View>
        )}

        <View style={{ flex: 1 }}>
          {subTab === 'PERIODS' && (
            <>
              <Text style={styles.cardTitle}>
                {item.subject_code || item.subject_title || 'Subject'} &bull;{' '}
                {item.section_name || 'Section'}
              </Text>
              <Text style={styles.cardSub}>
                {String(item.start_time || '').slice(0, 5)} –{' '}
                {String(item.end_time || '').slice(0, 5)} ({item.day_of_week || 'Mon–Fri'})
              </Text>
              <Text style={styles.cardMeta}>
                Teacher: {item.teacher_name || 'Unassigned'} &bull; Room: {item.room_name || '—'}
              </Text>
            </>
          )}
          {subTab === 'SECTIONS' && (
            <>
              <Text style={styles.cardTitle}>
                {item.grade_level_name ? `${item.grade_level_name} - ` : ''}
                {item.name}
              </Text>
              <Text style={styles.cardSub}>Adviser: {item.adviser_name || 'No Adviser'}</Text>
              <Text style={styles.cardMeta}>
                Room: {item.room_name || '—'} &bull; Students: {item.student_count ?? 0}/
                {item.capacity ?? 45}
              </Text>
            </>
          )}
          {subTab === 'SUBJECTS' && (
            <>
              <Text style={styles.cardTitle}>{item.code}</Text>
              <Text style={styles.cardSub}>{item.title || item.name}</Text>
              <Text style={styles.cardMeta}>
                {item.subject_category || 'CORE'} &bull; {item.units ?? 1} unit(s)
              </Text>
            </>
          )}
          {subTab === 'ROOMS' && (
            <>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSub}>
                {item.building || 'Main Building'} &bull; {item.room_type || 'CLASSROOM'}
              </Text>
              <Text style={styles.cardMeta}>
                Capacity: {item.capacity ?? 45} &bull;{' '}
                {item.is_active !== false ? 'Active' : 'Inactive'}
              </Text>
            </>
          )}
          {subTab === 'GRADES' && (
            <>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSub}>
                Code: {item.code || `G${item.level_number}`} &bull; Stage: {item.stage || 'JHS'}
              </Text>
              <Text style={styles.cardMeta}>Order Level: {item.level_number}</Text>
            </>
          )}
          {subTab === 'YEARS' && (
            <>
              <Text style={styles.cardTitle}>
                S.Y. {item.name || item.code} {item.is_active ? '(ACTIVE)' : ''}
              </Text>
              <Text style={styles.cardSub}>
                {item.start_date || '—'} to {item.end_date || '—'}
              </Text>
            </>
          )}
          {subTab === 'DEPARTMENTS' && (
            <>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSub}>Code: {item.code || '—'}</Text>
            </>
          )}
          {subTab === 'HOLIDAYS' && (
            <>
              <Text style={styles.cardTitle}>{item.title || item.reason}</Text>
              <Text style={styles.cardSub}>
                {item.date} &bull; {item.type || 'HOLIDAY'}
              </Text>
            </>
          )}
        </View>

        {allowCrud && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(item)}>
              <Ionicons name="create-outline" size={16} color={palette.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, { backgroundColor: palette.dangerLight }]}
              onPress={() => onDelete(item)}
            >
              <Ionicons name="trash-outline" size={16} color={palette.danger} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: palette.border,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    avatarBox: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.border,
    },
    avatarImg: { width: '100%', height: '100%' },
    cardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    cardSub: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.primary, marginTop: 1 },
    cardMeta: { fontSize: fonts.xs, color: palette.textSecondary, marginTop: 1 },
    actionsRow: { flexDirection: 'row', gap: 5 },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

export default ScheduleListItemCard;
