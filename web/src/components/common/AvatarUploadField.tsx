/**
 * AttendSure - Shared Profile Photo / Avatar Upload Field
 * File: web/src/components/common/AvatarUploadField.tsx
 *
 * Used across User Accounts, My Profile, Complete Profile, Teachers, and Students modals.
 * Enforces MIME type (JPEG/PNG/WEBP), <= 2 MB file size, safe isSafeImageUrl preview,
 * fallback initials, instant preview, replace, and remove actions.
 */

import React, { useRef, useState, useEffect } from 'react';
import { Camera, Trash2, Upload, User } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl } from '../../theme/tokens';

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export interface AvatarUploadFieldProps {
  previewUrl?: string | null;
  displayName?: string;
  label?: string;
  helpText?: string;
  size?: number;
  disabled?: boolean;
  onSelectPhoto: (file: File, dataUri: string) => void;
  onRemovePhoto: () => void;
  onValidationError?: (message: string) => void;
}

const getInitials = (name?: string): string => {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

export const AvatarUploadField: React.FC<AvatarUploadFieldProps> = ({
  previewUrl,
  displayName = '',
  label = 'Profile Photo',
  helpText = 'JPEG, PNG, or WEBP up to 2 MB (auto-resized to 600x600)',
  size = 68,
  disabled = false,
  onSelectPhoto,
  onRemovePhoto,
  onValidationError,
}) => {
  const { tokens, brand, ui, fonts } = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setImgFailed(false);
  }, [previewUrl]);

  const safeUrl = isSafeImageUrl(previewUrl) && !imgFailed ? previewUrl! : null;
  const initials = getInitials(displayName);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
      const msg = 'Please select a valid JPEG, PNG, or WEBP image.';
      setLocalError(msg);
      onValidationError?.(msg);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const msg = 'Profile photo must be 2 MB or smaller.';
      setLocalError(msg);
      onValidationError?.(msg);
      return;
    }

    setLocalError('');
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!isSafeImageUrl(result)) {
        const msg = 'Could not preview selected image file.';
        setLocalError(msg);
        onValidationError?.(msg);
        return;
      }
      onSelectPhoto(file, result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '12px 14px',
        borderRadius: 10,
        backgroundColor: tokens.bgSurfaceSubtle,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: localError ? brand.danger : tokens.borderSubtle,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: brand.primarySoft,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: safeUrl ? brand.primary : tokens.borderStrong,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {safeUrl ? (
          <img
            src={safeUrl}
            alt={displayName || label}
            onError={() => setImgFailed(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : initials ? (
          <span
            style={{
              fontFamily: fonts.display,
              fontSize: Math.round(size * 0.34),
              fontWeight: 800,
              color: brand.primary,
            }}
          >
            {initials}
          </span>
        ) : (
          <User size={Math.round(size * 0.44)} color={brand.primary} />
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fonts.size.sm, fontWeight: 800, color: tokens.textPrimary }}>
          {label}
        </div>
        <div style={{ fontSize: fonts.size.xs, color: tokens.textMuted, marginTop: 2 }}>
          {helpText}
        </div>

        {localError && (
          <div style={{ fontSize: fonts.size.xs, fontWeight: 700, color: brand.danger, marginTop: 4 }}>
            {localError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFilePick}
            disabled={disabled}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            style={{
              ...ui.btnSecondary,
              padding: '5px 10px',
              fontSize: fonts.size.xs,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {safeUrl ? <Camera size={13} /> : <Upload size={13} />}
            <span>{safeUrl ? 'Replace Photo' : 'Upload Photo'}</span>
          </button>

          {safeUrl && !disabled && (
            <button
              type="button"
              onClick={() => {
                setLocalError('');
                onRemovePhoto();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 8,
                borderWidth: 1,
                borderStyle: 'solid',
                borderColor: brand.danger,
                backgroundColor: tokens.dangerBg,
                color: brand.danger,
                fontSize: fonts.size.xs,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={13} />
              <span>Remove Photo</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AvatarUploadField;
