import React from 'react';

interface AttendSureBadgeProps {
  size?: number;
  animate?: boolean;
}

export const AttendSureBadge: React.FC<AttendSureBadgeProps> = ({
  size = 96,
  animate = false,
}) => {
  const iconSize = Math.round(size * 0.58);

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: '#0284c7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 10px 25px -4px rgba(2, 132, 199, 0.38), 0 4px 10px -2px rgba(2, 132, 199, 0.2)',
        animation: animate ? 'attendsure-breathe 2.4s ease-in-out infinite' : 'none',
        flexShrink: 0,
      }}
    >
      <img
        src="/splash.svg"
        alt="AttendSure"
        style={{
          width: `${iconSize}px`,
          height: `${iconSize}px`,
          objectFit: 'contain',
          filter: 'brightness(0) invert(1)',
        }}
      />
      <style>{`
        @keyframes attendsure-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.04); opacity: 0.94; }
        }
      `}</style>
    </div>
  );
};

export default AttendSureBadge;