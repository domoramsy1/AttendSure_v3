/**
 * AttendSure Mobile - Faculty On-Device Face & Campus GPS Check-In
 * File: mobile/src/screens/ScannerScreen.tsx
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useThemeMode } from '../context/ThemeContext';
import { getFriendlyErrorMessage, type ThemePalette } from '../constants/theme';
import { getOrCreateDeviceUuid } from '../services/deviceService';

interface ScannerScreenProps {
  onBack?: () => void;
}

const isCanceledError = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string };
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

const showNotice = (title: string, message: string): void => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}: ${message}`);
  } else {
    Alert.alert(title, message);
  }
};

export const ScannerScreen: React.FC<ScannerScreenProps> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);
  const [permission, requestPermission] = useCameraPermissions();
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'Center your face inside the oval in good light, then tap Check In.'
  );
  const cameraRef = useRef<CameraView | null>(null);
  const isMountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const handleCaptureAndVerify = async () => {
    if (submitting) return;
    if (!permission?.granted) {
      showNotice(
        'Camera Needed',
        'Please allow camera access so AttendSure can verify your check-in on this device.'
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setSubmitting(true);
    setStatusMessage('Verifying your face on this phone and checking campus location...');

    try {
      let capturedUri: string | null = null;
      if (cameraRef.current?.takePictureAsync) {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.3,
          skipProcessing: true,
        });
        capturedUri = photo?.uri || null;
      }

      if (!isMountedRef.current || controller.signal.aborted) return;

      if (!capturedUri) {
        setStatusMessage('Could not capture a clear frame. Please center your face and try again.');
        showNotice(
          'Capture Incomplete',
          'Could not capture a clear camera frame. Please align your face and try again.'
        );
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (status !== 'granted') {
        setStatusMessage('Location access is needed to confirm you are on school grounds.');
        showNotice(
          'Location Needed',
          'Please allow location access so AttendSure can confirm you are inside the school campus.'
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!isMountedRef.current || controller.signal.aborted) return;

      if (loc.mocked) {
        setStatusMessage('Mock location detected. Please turn off fake GPS apps to check in.');
        showNotice(
          'Location Check Notice',
          'A mock location app was detected on this phone. Please turn off fake GPS apps before checking in.'
        );
        return;
      }

      const deviceId = await getOrCreateDeviceUuid();
      if (!isMountedRef.current || controller.signal.aborted) return;

      // On-device verification only: never upload raw face image bytes to the server
      const res = await apiClient.post(
        'geofence/check-in/',
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy,
          accuracy_meters: loc.coords.accuracy,
          is_mock_location: Boolean(loc.mocked),
          client_device_id: deviceId,
          device_id: deviceId,
          face_verified: Boolean(capturedUri),
          liveness_passed: Boolean(capturedUri),
        },
        { signal: controller.signal }
      );

      if (!isMountedRef.current || controller.signal.aborted) return;

      const replyMsg =
        typeof res.data?.message === 'string' && res.data.message.trim()
          ? res.data.message.trim()
          : 'Your campus check-in inside the school boundary has been recorded.';
      setStatusMessage('Face check and campus location recorded!');
      showNotice('Checked In', replyMsg);
    } catch (err: unknown) {
      if (!isMountedRef.current || isCanceledError(err)) return;
      const friendly = getFriendlyErrorMessage(
        err,
        'Could not complete campus check-in. Please try again.'
      );
      setStatusMessage(friendly);
      showNotice('Check-In Notice', friendly);
    } finally {
      if (isMountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Curved Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.headerRow}>
          {onBack && (
            <TouchableOpacity
              style={styles.backCircle}
              onPress={onBack}
              activeOpacity={0.75}
              accessibilityLabel="Go back"
            >
              <Ionicons name="arrow-back" size={20} color={palette.onPrimary} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, marginLeft: onBack ? 12 : 0 }}>
            <Text style={styles.headerEyebrow}>FACULTY CHECK-IN</Text>
            <Text style={styles.headerTitle}>Face &amp; Location Check-In</Text>
            <Text style={styles.headerSub}>Verified on your phone — no face photo stored on server</Text>
          </View>
        </View>
      </View>

      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 12) + 96 }]}>
        {/* Rounded Camera Card with Oval Guide */}
        <View style={styles.cameraCard}>
          {permission?.granted ? (
            <CameraView ref={cameraRef} style={styles.cameraView} facing="front">
              <View style={styles.ovalOverlayContainer}>
                <View style={styles.ovalFrame} />
              </View>
            </CameraView>
          ) : (
            <View style={styles.permissionFallback}>
              <Ionicons name="camera-outline" size={48} color={palette.onPrimary} />
              <Text style={styles.permissionText}>
                Camera access is needed for on-device face verification.
              </Text>
              <TouchableOpacity
                style={styles.grantBtn}
                onPress={() => void requestPermission()}
                activeOpacity={0.85}
              >
                <Text style={styles.grantBtnText}>Allow Camera</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Status Instruction Banner */}
        <View style={styles.instructionBox}>
          <Text style={styles.instructionText}>{statusMessage}</Text>
        </View>

        {/* Primary Check-In Button */}
        <TouchableOpacity
          style={[styles.captureBtn, submitting && { opacity: 0.7 }]}
          onPress={() => void handleCaptureAndVerify()}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={palette.onPrimary} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={19} color={palette.onPrimary} />
              <Text style={styles.captureBtnText}>Verify &amp; Check In</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Secondary Cancel Button */}
        {onBack && (
          <TouchableOpacity style={styles.cancelBtn} onPress={onBack} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    header: {
      backgroundColor: palette.headerBg,
      paddingHorizontal: 18,
      paddingBottom: 22,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerEyebrow: {
      fontSize: fonts.xxs,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      opacity: 0.82,
      letterSpacing: 0.8,
    },
    headerTitle: {
      fontSize: fonts.xl,
      fontWeight: fonts.weight.extrabold,
      color: palette.onPrimary,
      marginTop: 2,
    },
    headerSub: {
      fontSize: fonts.xs,
      color: palette.onPrimary,
      opacity: 0.88,
      marginTop: 2,
    },
    body: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 14,
      gap: 10,
    },
    cameraCard: {
      flex: 1,
      borderRadius: 24,
      overflow: 'hidden',
      backgroundColor: '#0f172a',
      borderWidth: 1,
      borderColor: palette.border,
    },
    cameraView: {
      flex: 1,
    },
    ovalOverlayContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.25)',
    },
    ovalFrame: {
      width: 220,
      height: 290,
      borderRadius: 145,
      borderWidth: 3,
      borderColor: palette.onPrimary,
      backgroundColor: 'transparent',
    },
    permissionFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    permissionText: {
      color: palette.onPrimary,
      fontSize: fonts.md,
      textAlign: 'center',
      marginTop: 10,
      marginBottom: 14,
    },
    grantBtn: {
      backgroundColor: palette.buttonBg,
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
    },
    grantBtnText: {
      color: palette.onPrimary,
      fontWeight: fonts.weight.extrabold,
      fontSize: fonts.sm,
    },
    instructionBox: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    instructionText: {
      fontSize: fonts.sm,
      fontWeight: fonts.weight.semibold,
      color: palette.textPrimary,
      lineHeight: 18,
    },
    captureBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 50,
      borderRadius: 14,
      backgroundColor: palette.buttonBg,
    },
    captureBtnText: {
      color: palette.onPrimary,
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
    },
    cancelBtn: {
      height: 48,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtnText: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
  });

export default ScannerScreen;
