import React from 'react';
import depedLogoSrc from '../../assets/DepEdLogo.svg';

export interface DepEdLogoProps {
  height?: number;
  width?: number | 'auto';
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export const DepEdLogo: React.FC<DepEdLogoProps> = ({
  height = 48,
  width = 'auto',
  className = '',
  style,
  alt = 'Department of Education (DepEd)',
}) => {
  return (
    <img
      src={depedLogoSrc}
      alt={alt}
      className={className}
      style={{
        height: `${height}px`,
        width: typeof width === 'number' ? `${width}px` : width,
        objectFit: 'contain',
        display: 'block',
        userSelect: 'none',
        ...style,
      }}
    />
  );
};