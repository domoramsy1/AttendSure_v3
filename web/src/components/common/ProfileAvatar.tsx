/**
 * AttendSure - Reusable User & Faculty Avatar
 * Replaces duplicate implementations across FacultyTab, GateLogsTab, DTRTab, and MyAssignedClassesTab.
 * File: web/src/components/common/ProfileAvatar.tsx
 */

import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

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
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  const hasPhoto = Boolean(
    photoUrl &&
      typeof photoUrl === 'string' &&
      photoUrl.trim() !== '' &&
      photoUrl.trim().toLowerCase() !== 'null' &&
      photoUrl.trim().toLowerCase() !== 'undefined'
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: 'var(--bg-surface-subtle, #f1f5f9)',
        border: '1px solid var(--border-subtle, #e2e8f0)',
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
        <User size={iconSize} color="var(--text-muted, #94a3b8)" />
      )}
    </div>
  );
};

export default ProfileAvatar;