// AttendSure Mobile - School Setup Section Component
// File: D:\AttendSure_V3\mobile\src\components\settings\SchoolSetupSection.tsx

/**
 * AttendSure Mobile - Settings School Profile, Principal Picker & 3 Letterhead Logos Section
 * File: mobile/src/components/settings/SchoolSetupSection.tsx
 */

import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useThemeMode } from '../../context/ThemeContext';
import type { ThemePalette } from '../../constants/theme';
import { resolveMediaUrl } from '../../utils/helpers';
import ImageUploadField from '../common/ImageUploadField';
import ChipRow from '../common/ChipRow';

export interface PrincipalCandidate {
  id: number;
  employee_id: string;
  full_name: string;
  position_title?: string;
  department_name?: string;
  email?: string;
  contact_number?: string;
  photo_url?: string | null;
}

export interface SchoolFormState {
  school_name: string;
  school_id: string;
  academic_year: string;
  region: string;
  division: string;
  district: string;
  principal_teacher: string;
  superintendent_name: string;
  address: string;
  contact_number: string;
  email: string;
  website: string;
  latitude: string;
  longitude: string;
  geofence_radius_meters: string;
  weekend_rest_enabled: boolean;
  school_logo: string | null;
  left_logo: string | null;
  right_logo: string | null;
}

export interface SchoolSetupSectionProps {
  schoolForm: SchoolFormState;
  setSchoolForm: React.Dispatch<React.SetStateAction<SchoolFormState>>;
  principalCandidates: PrincipalCandidate[];
  selectedPrincipal: PrincipalCandidate | null;
  serverBase: string;
  logoValueFor: (key: 'school_logo' | 'left_logo' | 'right_logo') => string | null;
  onLogoChange: (key: 'school_logo' | 'left_logo' | 'right_logo', dataUrl: string) => void;
  onLogoRemove: (key: 'school_logo' | 'left_logo' | 'right_logo') => void;
  schoolSaving: boolean;
  onSave: () => void;
}

export const SchoolSetupSection: React.FC<SchoolSetupSectionProps> = ({
  schoolForm,
  setSchoolForm,
  principalCandidates,
  selectedPrincipal,
  serverBase,
  logoValueFor,
  onLogoChange,
  onLogoRemove,
  schoolSaving,
  onSave,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const principalPhoto = selectedPrincipal
    ? resolveMediaUrl(selectedPrincipal.photo_url, serverBase)
    : null;

  return (
    <>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>School Profile &amp; DepEd Metadata</Text>
        <Text style={styles.cardSubtitle}>
          Synchronized directly with Web Settings, DepEd Forms (SF1/SF2/SF4), and Form 48 DTR
          headers.
        </Text>

        <Text style={styles.inputLabel}>Official School Name *</Text>
        <TextInput
          style={styles.input}
          value={schoolForm.school_name}
          onChangeText={(v) => setSchoolForm((p) => ({ ...p, school_name: v }))}
          placeholder="Official school name"
          placeholderTextColor={palette.textMuted}
        />

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>DepEd School ID</Text>
            <TextInput
              style={styles.input}
              value={schoolForm.school_id}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, school_id: v }))}
              placeholder="304118"
              placeholderTextColor={palette.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>School Year</Text>
            <TextInput
              style={styles.input}
              value={schoolForm.academic_year}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, academic_year: v }))}
              placeholder="2026-2027"
              placeholderTextColor={palette.textMuted}
            />
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Region</Text>
            <TextInput
              style={styles.input}
              value={schoolForm.region}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, region: v }))}
              placeholder="Region X"
              placeholderTextColor={palette.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Division</Text>
            <TextInput
              style={styles.input}
              value={schoolForm.division}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, division: v }))}
              placeholder="Cagayan de Oro City"
              placeholderTextColor={palette.textMuted}
            />
          </View>
        </View>

        <Text style={styles.inputLabel}>School District</Text>
        <TextInput
          style={styles.input}
          value={schoolForm.district}
          onChangeText={(v) => setSchoolForm((p) => ({ ...p, district: v }))}
          placeholder="District"
          placeholderTextColor={palette.textMuted}
        />

        <Text style={styles.inputLabel}>Assigned School Head / Principal</Text>
        <ChipRow
          options={[
            { key: '', label: 'Unassigned' },
            ...principalCandidates.map((cand) => ({
              key: String(cand.id),
              label: cand.full_name,
            })),
          ]}
          selected={schoolForm.principal_teacher}
          onSelect={(val) => setSchoolForm((p) => ({ ...p, principal_teacher: val }))}
          contentContainerStyle={{ paddingVertical: 4 }}
        />

        {selectedPrincipal && (
          <View style={styles.principalPreview}>
            <View style={styles.principalAvatar}>
              {principalPhoto ? (
                <Image
                  source={{ uri: principalPhoto }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="person" size={20} color={palette.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.principalName}>{selectedPrincipal.full_name}</Text>
              <Text style={styles.principalMeta}>
                {selectedPrincipal.position_title || 'School Principal'} &bull;{' '}
                {selectedPrincipal.employee_id}
              </Text>
              {selectedPrincipal.email || selectedPrincipal.contact_number ? (
                <Text style={styles.principalMeta}>
                  {[selectedPrincipal.email, selectedPrincipal.contact_number]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        <Text style={styles.inputLabel}>Schools Division Superintendent</Text>
        <TextInput
          style={styles.input}
          value={schoolForm.superintendent_name}
          onChangeText={(v) => setSchoolForm((p) => ({ ...p, superintendent_name: v }))}
          placeholder="Superintendent full name"
          placeholderTextColor={palette.textMuted}
        />

        <Text style={styles.inputLabel}>School Street Address</Text>
        <TextInput
          style={styles.input}
          value={schoolForm.address}
          onChangeText={(v) => setSchoolForm((p) => ({ ...p, address: v }))}
          placeholder="Complete school address"
          placeholderTextColor={palette.textMuted}
        />

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Contact Number</Text>
            <TextInput
              style={styles.input}
              keyboardType="phone-pad"
              value={schoolForm.contact_number}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, contact_number: v }))}
              placeholder="School phone"
              placeholderTextColor={palette.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Official Email</Text>
            <TextInput
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              value={schoolForm.email}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, email: v }))}
              placeholder="school@deped.gov.ph"
              placeholderTextColor={palette.textMuted}
            />
          </View>
        </View>

        <Text style={styles.inputLabel}>School Website</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          value={schoolForm.website}
          onChangeText={(v) => setSchoolForm((p) => ({ ...p, website: v }))}
          placeholder="https://school.deped.gov.ph"
          placeholderTextColor={palette.textMuted}
        />

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Campus Lat (°N)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={schoolForm.latitude}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, latitude: v }))}
              placeholder="8.4858"
              placeholderTextColor={palette.textMuted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inputLabel}>Campus Lng (°E)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={schoolForm.longitude}
              onChangeText={(v) => setSchoolForm((p) => ({ ...p, longitude: v }))}
              placeholder="124.6567"
              placeholderTextColor={palette.textMuted}
            />
          </View>
        </View>

        <Text style={styles.inputLabel}>Geofence Radius (Meters)</Text>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          value={schoolForm.geofence_radius_meters}
          onChangeText={(v) =>
            setSchoolForm((p) => ({ ...p, geofence_radius_meters: v.replace(/\D/g, '') }))
          }
          placeholder="150"
          placeholderTextColor={palette.textMuted}
        />

        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Weekend Rest Day Mode</Text>
            <Text style={styles.switchSub}>Marks Saturday &amp; Sunday as optional rest days</Text>
          </View>
          <Switch
            value={schoolForm.weekend_rest_enabled}
            onValueChange={(v) => setSchoolForm((p) => ({ ...p, weekend_rest_enabled: v }))}
            trackColor={{ false: palette.borderStrong, true: palette.primary }}
            thumbColor={palette.onPrimary}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>School Emblem &amp; Official Report Letterhead Seals</Text>
        <Text style={styles.cardSubtitle}>
          Transparent PNG files are preserved cleanly with automatic fit and no dark background.
        </Text>

        <ImageUploadField
          label="1. Main School Profile Emblem"
          helperText="Displayed on the dashboard header, sidebar, and digital IDs."
          value={logoValueFor('school_logo')}
          serverBase={serverBase}
          variant="logo"
          onChange={(dataUrl) => onLogoChange('school_logo', dataUrl)}
          onRemove={() => onLogoRemove('school_logo')}
        />

        <ImageUploadField
          label="2. Left Seal (DepEd Official Seal)"
          helperText="Printed on the top-left letterhead of SF1, SF2, SF4, and print sheets."
          value={logoValueFor('left_logo')}
          serverBase={serverBase}
          variant="logo"
          onChange={(dataUrl) => onLogoChange('left_logo', dataUrl)}
          onRemove={() => onLogoRemove('left_logo')}
        />

        <ImageUploadField
          label="3. Right Seal (Division / School Seal)"
          helperText="Printed on the top-right letterhead of SF1, SF2, SF4, and print sheets."
          value={logoValueFor('right_logo')}
          serverBase={serverBase}
          variant="logo"
          onChange={(dataUrl) => onLogoChange('right_logo', dataUrl)}
          onRemove={() => onLogoRemove('right_logo')}
        />

        <TouchableOpacity
          style={[styles.saveBtn, schoolSaving && { opacity: 0.65 }]}
          onPress={onSave}
          disabled={schoolSaving}
          activeOpacity={0.85}
        >
          {schoolSaving ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Save School Profile &amp; Logos</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: palette.border,
      gap: 8,
    },
    cardTitle: { fontSize: fonts.md, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    cardSubtitle: { fontSize: fonts.xs, color: palette.textSecondary, lineHeight: 17 },
    inputLabel: { fontSize: fonts.xs, fontWeight: fonts.weight.bold, color: palette.textSecondary, marginTop: 4 },
    input: {
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 42,
      fontSize: fonts.sm,
      color: palette.textPrimary,
    },
    twoCol: { flexDirection: 'row', gap: 8 },
    principalPreview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.primary,
    },
    principalAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    principalName: { fontSize: fonts.sm, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    principalMeta: { fontSize: fonts.xxs, color: palette.textSecondary, marginTop: 1 },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 4,
      padding: 10,
      borderRadius: 10,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    switchTitle: { fontSize: fonts.xs, fontWeight: fonts.weight.extrabold, color: palette.textPrimary },
    switchSub: { fontSize: fonts.xxs, color: palette.textSecondary },
    saveBtn: {
      backgroundColor: palette.buttonBg,
      borderRadius: 12,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    saveBtnText: { color: palette.onPrimary, fontSize: fonts.sm, fontWeight: fonts.weight.extrabold },
  });

export default SchoolSetupSection;
