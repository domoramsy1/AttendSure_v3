// AttendSure Mobile - Server Config Modal
// File: D:\AttendSure_V3\mobile\src\components\ServerConfigModal.tsx

/**
 * AttendSure Mobile - School Server Connection Settings Modal
 * File: mobile/src/components/ServerConfigModal.tsx
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  cleanUrl,
  getServerBaseUrl,
  isValidServerUrl,
  setServerBaseUrl,
  resetServerBaseUrl,
  testServerConnection,
} from '../services/configService';
import { Button } from './common/Button';
import { useThemeMode } from '../context/ThemeContext';
import { cleanText, getFriendlyErrorMessage } from '../constants/theme';
import { showNotice } from '../utils/helpers';

export interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ServerConfigModal({ visible, onClose }: ServerConfigModalProps) {
  const { palette, spacing, radius, fonts } = useThemeMode();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;

    getServerBaseUrl()
      .then((resolved) => {
        if (active && isMountedRef.current) {
          setUrl(resolved || '');
        }
      })
      .catch(() => {
        if (active && isMountedRef.current) {
          setUrl('');
        }
      });

    return () => {
      active = false;
    };
  }, [visible]);

  const handleSave = async () => {
    if (busy) return;
    const rawInput = cleanText(url, 300);
    if (!rawInput || !isValidServerUrl(rawInput)) {
      showNotice(
        'Invalid Address',
        'Enter a valid school server address (for example: http://192.168.100.9:8000).'
      );
      return;
    }

    const normalizedUrl = cleanUrl(rawInput);
    setBusy(true);
    try {
      await setServerBaseUrl(normalizedUrl);
      const check = await testServerConnection(normalizedUrl);
      if (!isMountedRef.current) return;
      setUrl(normalizedUrl);
      showNotice(
        check.ok ? 'Connected & Saved' : 'Address Saved',
        check.ok
          ? check.message
          : `${check.message} Make sure your phone and server are on the same network.`
      );
      onClose();
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice(
        'Unable to Save',
        getFriendlyErrorMessage(err, 'Could not save the school server address. Please try again.')
      );
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  };

  const handleReset = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await resetServerBaseUrl();
      const defaultUrl = await getServerBaseUrl();
      if (isMountedRef.current) {
        setUrl(defaultUrl);
      }
      showNotice('Reset Complete', 'Default school server address restored.');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      showNotice(
        'Unable to Reset',
        getFriendlyErrorMessage(err, 'Could not restore the default server address.')
      );
    } finally {
      if (isMountedRef.current) {
        setBusy(false);
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { padding: spacing.lg }]}>
        <View
          style={[
            styles.modalBox,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              borderRadius: radius.lg,
              padding: spacing.lg,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <View style={styles.titleGroup}>
              <View style={[styles.iconBadge, { backgroundColor: palette.primarySoft }]}>
                <Ionicons name="server-outline" size={18} color={palette.primary} />
              </View>
              <Text
                style={[
                  styles.modalTitle,
                  { color: palette.textPrimary, fontSize: fonts.size.lg },
                ]}
              >
                School Server Address
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              accessibilityLabel="Close server settings"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={20} color={palette.textMuted} />
            </TouchableOpacity>
          </View>

          <Text
            style={[
              styles.modalDesc,
              {
                color: palette.textSecondary,
                marginVertical: spacing.xs,
                fontSize: fonts.size.sm,
              },
            ]}
          >
            Enter the Wi-Fi IP or web address of your AttendSure school server.
          </Text>

          <Text
            style={[
              styles.label,
              {
                color: palette.textPrimary,
                marginTop: spacing.sm,
                fontSize: fonts.size.xs,
              },
            ]}
          >
            Server Address
          </Text>
          <TextInput
            style={[
              styles.input,
              {
                borderColor: palette.borderStrong,
                borderRadius: radius.md,
                backgroundColor: palette.surfaceSubtle,
                color: palette.textPrimary,
                marginBottom: spacing.md,
                fontSize: fonts.size.base,
              },
            ]}
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.100.9:8000"
            placeholderTextColor={palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={!busy}
            maxLength={300}
          />

          <View style={styles.buttonRow}>
            <Button
              title="Reset Default"
              variant="outline"
              onPress={() => void handleReset()}
              disabled={busy}
              style={styles.btnFlex}
            />
            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor: palette.buttonBg,
                  borderRadius: radius.md,
                  opacity: busy ? 0.6 : 1,
                },
              ]}
              onPress={() => void handleSave()}
              disabled={busy}
              activeOpacity={0.8}
            >
              {busy ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <Text
                  style={[
                    styles.saveBtnText,
                    { color: palette.onPrimary, fontSize: fonts.size.sm },
                  ]}
                >
                  Save &amp; Apply
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Button
            title="Cancel"
            variant="secondary"
            onPress={onClose}
            disabled={busy}
            style={styles.cancelBtn}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
  },
  modalBox: {
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontWeight: '800',
  },
  modalDesc: {
    lineHeight: 18,
  },
  label: {
    fontWeight: '700',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnFlex: {
    flex: 1,
    height: 42,
  },
  saveBtn: {
    flex: 1,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  saveBtnText: {
    fontWeight: '800',
  },
  cancelBtn: {
    marginTop: 8,
    height: 40,
  },
});

export default ServerConfigModal;
