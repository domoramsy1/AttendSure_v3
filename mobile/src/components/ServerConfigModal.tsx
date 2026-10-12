import React, { useState, useEffect } from 'react';
import { Modal, StyleSheet, Text, View, TextInput, Alert } from 'react-native';
import { getServerBaseUrl, setServerBaseUrl, resetServerBaseUrl } from '../services/configService';
import { Button } from './common/Button';
import { theme } from '../constants/theme';

interface ServerConfigModalProps {
  visible: boolean;
  onClose: () => void;
}

export function ServerConfigModal({ visible, onClose }: ServerConfigModalProps) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (visible) {
      getServerBaseUrl().then(setUrl);
    }
  }, [visible]);

  const handleSave = async () => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Alert.alert('Invalid URL', 'Address must begin with http:// or https://');
      return;
    }
    await setServerBaseUrl(url);
    Alert.alert('Saved', 'Server address updated successfully.');
    onClose();
  };

  const handleReset = async () => {
    await resetServerBaseUrl();
    const defaultUrl = await getServerBaseUrl();
    setUrl(defaultUrl);
    Alert.alert('Reset', 'Restored default server address.');
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>Server Connection Settings</Text>
          <Text style={styles.modalDesc}>
            Configure the AttendSure backend endpoint dynamically for local development or remote campus deployment.
          </Text>

          <Text style={styles.label}>Host Base URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://10.16.115.49:8000"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttonRow}>
            <Button title="Reset Default" variant="outline" onPress={handleReset} style={styles.btnFlex} />
            <Button title="Save & Apply" variant="primary" onPress={handleSave} style={styles.btnFlex} />
          </View>
          <Button title="Cancel" variant="secondary" onPress={onClose} style={styles.cancelBtn} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  modalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
  },
  modalDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginVertical: theme.spacing.xs,
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.sm,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    backgroundColor: theme.colors.surfaceSubtle,
    marginBottom: theme.spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnFlex: {
    flex: 1,
    height: 40,
  },
  cancelBtn: {
    marginTop: 8,
    height: 38,
  },
});