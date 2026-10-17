import React from 'react';

interface TechBlazerSignatureProps {
  size?: number;
  textColor?: string;
  className?: string;
}

export const TechBlazerSignature: React.FC<TechBlazerSignatureProps> = ({
  size = 20,
  textColor = '#0A1F3D',
  className = '',
}) => {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 5,
        userSelect: 'none',
      }}
    >
      <span
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '0.74rem',
          color: '#8a8d91',
          letterSpacing: '0.04em',
          fontWeight: 500,
          textTransform: 'lowercase',
        }}
      >
        from
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img
          src="/techblazer.svg"
          alt="TECHBLAZER"
          style={{
            width: `${size}px`,
            height: `${size}px`,
            objectFit: 'contain',
          }}
        />
        <span
          style={{
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: `${size * 0.95}px`,
            fontWeight: 800,
            color: textColor,
            letterSpacing: '0.10em',
          }}
        >
          TECHBLAZER
        </span>
      </div>
    </div>
  );
};

export default TechBlazerSignature;