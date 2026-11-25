// AttendSure Mobile - Image Upload Field Component
// File: D:\AttendSure_V3\mobile\src\components\common\ImageUploadField.tsx

/**
 * AttendSure Mobile - Cross-Platform Photo & Transparent PNG Logo Picker
 * File: mobile/src/components/common/ImageUploadField.tsx
 *
 * - On Android / iOS: Take Photo (Camera) + Choose from Gallery via expo-image-picker
 *   (with square crop for avatars, JPG/PNG/WEBP & 2 MB validation, and Remove Photo).
 * - On Web: native file chooser with transparent-PNG preservation & auto-trim for logos.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useThemeMode } from '../../context/ThemeContext';
import {
  isSafeUrl,
  QR_COLORS,
  SCANNER_OVERLAY_COLORS,
  type ThemePalette,
} from '../../constants/theme';
import { getServerBaseUrl } from '../../services/configService';
import { resolveMediaUrl, showNotice } from '../../utils/helpers';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export interface ImageUploadFieldProps {
  label: string;
  helperText?: string;
  value: string | null | undefined;
  serverBase?: string;
  variant?: 'avatar' | 'logo' | 'proof';
  onChange: (dataUrl: string) => void;
  onRemove?: () => void;
  disabled?: boolean;
}

const inferSafeImageMime = (
  mimeType?: string | null,
  uriOrName?: string | null
): 'image/jpeg' | 'image/png' | 'image/webp' | null => {
  const cleanMime = String(mimeType || '').trim().toLowerCase();
  if (cleanMime === 'image/png') return 'image/png';
  if (cleanMime === 'image/webp') return 'image/webp';
  if (cleanMime === 'image/jpeg' || cleanMime === 'image/jpg') return 'image/jpeg';

  const lowerName = String(uriOrName || '').trim().toLowerCase().split('?')[0];
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  return null;
};

const estimateBase64Bytes = (rawBase64: string): number => {
  const clean = rawBase64.replace(/\s+/g, '');
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
};

/**
 * Browser-side image preparation:
 * - For `logo`: preserves full alpha transparency, trims empty transparent padding, exports PNG.
 * - For `avatar`/`proof`: constrains max dimension cleanly.
 */
const processWebImageFile = (
  file: File,
  variant: 'avatar' | 'logo' | 'proof'
): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected image file.'));
    reader.onload = () => {
      const rawDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawDataUrl.startsWith('data:image/')) {
        reject(new Error('Please select a JPG, PNG, or WebP image.'));
        return;
      }
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        resolve(rawDataUrl);
        return;
      }
      const img = new window.Image();
      img.onerror = () => resolve(rawDataUrl);
      img.onload = () => {
        try {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(rawDataUrl);
            return;
          }

          if (variant === 'logo') {
            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = w;
            srcCanvas.height = h;
            const srcCtx = srcCanvas.getContext('2d');
            if (!srcCtx) {
              resolve(rawDataUrl);
              return;
            }
            srcCtx.clearRect(0, 0, w, h);
            srcCtx.drawImage(img, 0, 0, w, h);

            const imgData = srcCtx.getImageData(0, 0, w, h).data;
            let minX = w;
            let minY = h;
            let maxX = -1;
            let maxY = -1;
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const alpha = imgData[(y * w + x) * 4 + 3];
                if (alpha > 10) {
                  if (x < minX) minX = x;
                  if (y < minY) minY = y;
                  if (x > maxX) maxX = x;
                  if (y > maxY) maxY = y;
                }
              }
            }

            const cropX = maxX >= minX ? Math.max(0, minX - 2) : 0;
            const cropY = maxY >= minY ? Math.max(0, minY - 2) : 0;
            const cropW = maxX >= minX ? Math.min(w - cropX, maxX - cropX + 3) : w;
            const cropH = maxY >= minY ? Math.min(h - cropY, maxY - cropY + 3) : h;

            const maxDim = 640;
            const scale = Math.min(1, maxDim / Math.max(cropW, cropH));
            const outW = Math.max(1, Math.round(cropW * scale));
            const outH = Math.max(1, Math.round(cropH * scale));

            const outCanvas = document.createElement('canvas');
            outCanvas.width = outW;
            outCanvas.height = outH;
            const outCtx = outCanvas.getContext('2d');
            if (!outCtx) {
              resolve(rawDataUrl);
              return;
            }
            outCtx.clearRect(0, 0, outW, outH);
            outCtx.drawImage(srcCanvas, cropX, cropY, cropW, cropH, 0, 0, outW, outH);
            resolve(outCanvas.toDataURL('image/png'));
            return;
          }

          const maxDim = 768;
          const scale = Math.min(1, maxDim / Math.max(w, h));
          const outW = Math.max(1, Math.round(w * scale));
          const outH = Math.max(1, Math.round(h * scale));
          const outCanvas = document.createElement('canvas');
          outCanvas.width = outW;
          outCanvas.height = outH;
          const outCtx = outCanvas.getContext('2d');
          if (!outCtx) {
            resolve(rawDataUrl);
            return;
          }
          const isPng = file.type === 'image/png';
          if (!isPng) {
            outCtx.fillStyle = QR_COLORS.background;
            outCtx.fillRect(0, 0, outW, outH);
          }
          outCtx.drawImage(img, 0, 0, outW, outH);
          resolve(outCanvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85));
        } catch {
          resolve(rawDataUrl);
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  label,
  helperText,
  value,
  serverBase: propServerBase,
  variant = 'avatar',
  onChange,
  onRemove,
  disabled = false,
}) => {
  const { palette, fonts } = useThemeMode();
  const styles = useMemo(() => createStyles(palette, fonts), [palette, fonts]);

  const [internalBase, setInternalBase] = useState<string>(propServerBase || '');
  const [imgError, setImgError] = useState<boolean>(false);
  const [cameraModalOpen, setCameraModalOpen] = useState<boolean>(false);
  const [facing, setFacing] = useState<'front' | 'back'>(variant === 'avatar' ? 'front' : 'back');
  const [capturing, setCapturing] = useState<boolean>(false);
  const [picking, setPicking] = useState<boolean>(false);
  const [camPerm, requestCamPerm] = useCameraPermissions();

  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    if (propServerBase) {
      setInternalBase(propServerBase);
      return;
    }
    let mounted = true;
    void getServerBaseUrl().then((b) => {
      if (mounted && b) setInternalBase(b);
    });
    return () => {
      mounted = false;
    };
  }, [propServerBase]);

  const resolvedUri = useMemo(
    () => resolveMediaUrl(value, internalBase),
    [value, internalBase]
  );

  useEffect(() => {
    setImgError(false);
  }, [resolvedUri]);

  const applyPickedAsset = (asset: ImagePicker.ImagePickerAsset) => {
    const inferredMime = inferSafeImageMime(asset.mimeType, asset.fileName || asset.uri);
    const mime = inferredMime || 'image/jpeg';
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
      showNotice('Unsupported File', 'Please select a JPG, PNG, or WebP image.');
      return;
    }

    if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_IMAGE_BYTES) {
      showNotice('File Too Large', 'Please choose an image smaller than 2 MB.');
      return;
    }

    if (!asset.base64) {
      showNotice('Image Error', 'Could not read image data. Please try another photo.');
      return;
    }

    if (estimateBase64Bytes(asset.base64) > MAX_IMAGE_BYTES) {
      showNotice('File Too Large', 'Please choose a smaller image (under 2 MB).');
      return;
    }

    const dataUrl = `data:${mime};base64,${asset.base64}`;
    if (!isSafeUrl(dataUrl)) {
      showNotice('Unsupported File', 'Please select a valid JPG, PNG, or WebP image.');
      return;
    }
    onChange(dataUrl);
    setImgError(false);
  };

  const handleOpenWebFilePicker = () => {
    if (disabled || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.type && !ALLOWED_IMAGE_MIME_TYPES.has(file.type.toLowerCase())) {
        showNotice('Unsupported File', 'Please select a JPG, PNG, or WebP image.');
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showNotice('File Too Large', 'Please choose an image smaller than 2 MB.');
        return;
      }
      try {
        const dataUrl = await processWebImageFile(file, variant);
        if (isSafeUrl(dataUrl)) {
          onChange(dataUrl);
          setImgError(false);
        } else {
          showNotice('Unsupported File', 'Please select a valid JPG, PNG, or WebP image.');
        }
      } catch (err: unknown) {
        showNotice(
          'Upload Error',
          err instanceof Error ? err.message : 'Could not load the selected image.'
        );
      }
    };
    input.click();
  };

  const handleChooseFromGallery = async () => {
    if (disabled || picking) return;
    if (Platform.OS === 'web') {
      handleOpenWebFilePicker();
      return;
    }

    setPicking(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showNotice(
          'Photo Library Permission Needed',
          'Allow photo library access in your phone settings so you can choose a photo.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: variant === 'avatar',
        aspect: variant === 'avatar' ? [1, 1] : undefined,
        quality: variant === 'logo' ? 0.9 : 0.78,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        applyPickedAsset(result.assets[0]);
      }
    } catch {
      showNotice('Gallery Error', 'Could not open your photo gallery right now. Please try again.');
    } finally {
      setPicking(false);
    }
  };

  const handleOpenCamera = async () => {
    if (disabled || picking) return;
    if (Platform.OS === 'web') {
      handleOpenWebFilePicker();
      return;
    }

    setPicking(true);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showNotice(
          'Camera Permission Needed',
          'Allow camera access in your phone settings to take a photo.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: variant === 'avatar',
        aspect: variant === 'avatar' ? [1, 1] : undefined,
        quality: 0.76,
        base64: true,
        cameraType:
          variant === 'avatar'
            ? ImagePicker.CameraType.front
            : ImagePicker.CameraType.back,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        applyPickedAsset(result.assets[0]);
      }
    } catch {
      // Fall back cleanly to built-in expo-camera modal if system camera picker fails
      if (!camPerm?.granted) {
        const res = await requestCamPerm();
        if (!res.granted) {
          showNotice(
            'Camera Permission Needed',
            'Allow camera access in your phone settings to take a photo.'
          );
          return;
        }
      }
      setCameraModalOpen(true);
    } finally {
      setPicking(false);
    }
  };

  const handleTakePhotoFallback = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.72,
      });
      if (photo?.base64) {
        if (estimateBase64Bytes(photo.base64) > MAX_IMAGE_BYTES) {
          showNotice('File Too Large', 'Captured photo exceeded 2 MB. Please try again.');
          return;
        }
        const dataUrl = `data:image/jpeg;base64,${photo.base64}`;
        onChange(dataUrl);
        setImgError(false);
        setCameraModalOpen(false);
      } else {
        showNotice('Capture Failed', 'Could not read image from camera. Please try again.');
      }
    } catch {
      showNotice('Capture Failed', 'Unable to capture photo right now. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const isLogo = variant === 'logo';
  const isProof = variant === 'proof';

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}

      <View style={styles.row}>
        <View
          style={[
            isLogo
              ? styles.logoFrame
              : isProof
                ? styles.proofFrame
                : styles.avatarFrame,
          ]}
        >
          {resolvedUri && !imgError ? (
            <Image
              source={{ uri: resolvedUri }}
              style={isLogo ? styles.logoImg : styles.fullImg}
              contentFit={isLogo || isProof ? 'contain' : 'cover'}
              onError={() => setImgError(true)}
            />
          ) : (
            <Ionicons
              name={isLogo ? 'ribbon-outline' : isProof ? 'document-attach-outline' : 'person'}
              size={isLogo ? 28 : 26}
              color={palette.primary}
            />
          )}
        </View>

        <View style={styles.actionsCol}>
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              style={[styles.uploadBtn, disabled && { opacity: 0.55 }]}
              onPress={handleOpenWebFilePicker}
              disabled={disabled}
              activeOpacity={0.85}
            >
              <Ionicons name="cloud-upload-outline" size={15} color={palette.primary} />
              <Text style={styles.uploadBtnText}>
                {isLogo
                  ? 'Upload PNG / Logo'
                  : isProof
                    ? 'Choose Proof Image'
                    : 'Choose Photo'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.dualBtnRow}>
              <TouchableOpacity
                style={[styles.uploadBtn, { flex: 1 }, (disabled || picking) && { opacity: 0.55 }]}
                onPress={() => void handleOpenCamera()}
                disabled={disabled || picking}
                activeOpacity={0.85}
              >
                <Ionicons name="camera-outline" size={15} color={palette.primary} />
                <Text style={styles.uploadBtnText} numberOfLines={1}>
                  Take Photo
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.galleryBtn, { flex: 1 }, (disabled || picking) && { opacity: 0.55 }]}
                onPress={() => void handleChooseFromGallery()}
                disabled={disabled || picking}
                activeOpacity={0.85}
              >
                <Ionicons name="images-outline" size={15} color={palette.textPrimary} />
                <Text style={styles.galleryBtnText} numberOfLines={1}>
                  Gallery
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {resolvedUri && onRemove && (
            <TouchableOpacity
              style={[styles.removeBtn, disabled && { opacity: 0.55 }]}
              onPress={onRemove}
              disabled={disabled}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={14} color={palette.danger} />
              <Text style={styles.removeBtnText}>
                {isLogo ? 'Remove Logo' : isProof ? 'Remove Image' : 'Remove Photo'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Fallback Built-In Camera Capture Modal */}
      <Modal
        visible={cameraModalOpen}
        animationType="slide"
        onRequestClose={() => setCameraModalOpen(false)}
      >
        <View style={styles.cameraShell}>
          <View style={styles.cameraTopBar}>
            <TouchableOpacity
              style={styles.cameraIconBtn}
              onPress={() => setCameraModalOpen(false)}
              accessibilityLabel="Close camera"
            >
              <Ionicons name="close" size={22} color={SCANNER_OVERLAY_COLORS.hintText} />
            </TouchableOpacity>
            <Text style={styles.cameraTitle}>{label}</Text>
            <TouchableOpacity
              style={styles.cameraIconBtn}
              onPress={() => setFacing((prev) => (prev === 'front' ? 'back' : 'front'))}
              accessibilityLabel="Switch camera"
            >
              <Ionicons
                name="camera-reverse-outline"
                size={22}
                color={SCANNER_OVERLAY_COLORS.hintText}
              />
            </TouchableOpacity>
          </View>

          <View style={styles.cameraPreviewWrap}>
            <CameraView ref={cameraRef} style={styles.cameraView} facing={facing} />
          </View>

          <View style={styles.cameraBottomBar}>
            <TouchableOpacity
              style={[styles.shutterBtn, capturing && { opacity: 0.6 }]}
              onPress={() => void handleTakePhotoFallback()}
              disabled={capturing}
              activeOpacity={0.85}
            >
              {capturing ? (
                <ActivityIndicator size="small" color={palette.onPrimary} />
              ) : (
                <Ionicons name="camera" size={26} color={palette.onPrimary} />
              )}
            </TouchableOpacity>
            <Text style={styles.cameraHint}>Tap shutter to capture photo</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (palette: ThemePalette, fonts: ReturnType<typeof useThemeMode>['fonts']) =>
  StyleSheet.create({
    wrapper: {
      gap: 6,
      marginTop: 4,
    },
    label: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.textSecondary,
    },
    helper: {
      fontSize: fonts.xxs,
      color: palette.textMuted,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 10,
      borderRadius: 12,
      backgroundColor: palette.surfaceSubtle,
      borderWidth: 1,
      borderColor: palette.border,
    },
    avatarFrame: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: palette.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      borderWidth: 2,
      borderColor: palette.primary,
    },
    logoFrame: {
      width: 96,
      height: 68,
      borderRadius: 10,
      backgroundColor: QR_COLORS.background,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 6,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      overflow: 'hidden',
    },
    proofFrame: {
      width: 84,
      height: 64,
      borderRadius: 10,
      backgroundColor: palette.surface,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 4,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      overflow: 'hidden',
    },
    fullImg: {
      width: '100%',
      height: '100%',
    },
    logoImg: {
      width: '100%',
      height: '100%',
    },
    actionsCol: {
      flex: 1,
      gap: 6,
    },
    dualBtnRow: {
      flexDirection: 'row',
      gap: 6,
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 38,
      borderRadius: 9,
      backgroundColor: palette.primarySoft,
      borderWidth: 1,
      borderColor: palette.primary,
      paddingHorizontal: 8,
    },
    uploadBtnText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.primary,
    },
    galleryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 38,
      borderRadius: 9,
      backgroundColor: palette.surface,
      borderWidth: 1,
      borderColor: palette.borderStrong,
      paddingHorizontal: 8,
    },
    galleryBtnText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.extrabold,
      color: palette.textPrimary,
    },
    removeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      height: 32,
      borderRadius: 8,
      backgroundColor: palette.dangerLight,
      paddingHorizontal: 10,
    },
    removeBtnText: {
      fontSize: fonts.xs,
      fontWeight: fonts.weight.bold,
      color: palette.danger,
    },
    cameraShell: {
      flex: 1,
      backgroundColor: SCANNER_OVERLAY_COLORS.surface,
    },
    cameraTopBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 48,
      paddingBottom: 14,
    },
    cameraTitle: {
      fontSize: fonts.md,
      fontWeight: fonts.weight.extrabold,
      color: SCANNER_OVERLAY_COLORS.hintText,
    },
    cameraIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: palette.headerSurface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cameraPreviewWrap: {
      flex: 1,
      marginHorizontal: 14,
      borderRadius: 18,
      overflow: 'hidden',
    },
    cameraView: {
      flex: 1,
    },
    cameraBottomBar: {
      alignItems: 'center',
      paddingVertical: 26,
      gap: 8,
    },
    shutterBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: palette.buttonBg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 4,
      borderColor: SCANNER_OVERLAY_COLORS.hintText,
    },
    cameraHint: {
      fontSize: fonts.xs,
      color: SCANNER_OVERLAY_COLORS.hintText,
      opacity: 0.85,
    },
  });

export default ImageUploadField;
