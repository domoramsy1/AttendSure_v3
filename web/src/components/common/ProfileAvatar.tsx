// AttendSure Web - Profile Avatar Component
// File: D:\AttendSure_V3\web\src\components\common\ProfileAvatar.tsx

/**
 * AttendSure - Reusable User & Teacher Avatar
 * Replaces duplicate implementations across TeachersTab, DTRTab, and MyAssignedClassesTab.
 * File: web/src/components/common/ProfileAvatar.tsx
 */

import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { isSafeImageUrl } from '../../theme/tokens';

interface ProfileAvatarProps {
  photoUrl?: string | null;
  name?: string;
  size?: number;
  iconSize?: number;
}

export const ProfileAvatar: React.FC<ProfileAvatarProps> = ({
  photoUrl,
  name = 'Member',
  size = 38,
  iconSize = 19,
}) => {
  const { tokens } = useTheme();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const hasPhoto = isSafeImageUrl(photoUrl);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: tokens.bgSurfaceSubtle,
        border: `1px solid ${tokens.borderSubtle}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
      title={name}
    >
      {hasPhoto && !imageFailed ? (
        <img
          src={photoUrl!}
          alt={name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <User size={iconSize} color={tokens.textMuted} />
      )}
    </div>
  );
};

export default ProfileAvatar;
