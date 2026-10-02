import React from 'react';
import kagawaranLogoSrc from '../../assets/KagawaranNgEdukasyoLogo.svg';

export interface KagawaranNgEdukasyonLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  alt?: string;
}

export const KagawaranNgEdukasyonLogo: React.FC<KagawaranNgEdukasyonLogoProps> = ({
  size = 54,
  className = '',
  style,
  alt = 'Kagawaran ng Edukasyon Official Seal',
}) => {
  return (
    <img
      src={kagawaranLogoSrc}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        objectFit: 'contain',
        display: 'block',
        userSelect: 'none',
        flexShrink: 0,
        ...style,
      }}
    />
  );
};