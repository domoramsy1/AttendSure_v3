/**
 * ATTENDSURE - Centralized Brand & Asset Components
 * File: web/src/components/branding/BrandAssets.tsx
 *
 * Every image in `web/src/assets` has a dedicated, type-safe component here
 * so any screen or modal can import and render it with one line.
 */

import React from 'react';

import attendsureLogoSvg from '../../assets/AttendSureLogo.svg';
import techblazerSvg from '../../assets/techblazer.svg';
import splashSvg from '../../assets/splash.svg';
import splashPng from '../../assets/splash.png';
import iconSvg from '../../assets/icon.svg';
import iconPng from '../../assets/icon.png';
import adaptiveIconSvg from '../../assets/adaptive-icon.svg';
import adaptiveIconPng from '../../assets/adaptive-icon.png';
import attendSureFullSvg from '../../assets/AttendSureLogo.svg';
import attendSureFullPng from '../../assets/AttendSureLogo.png';

export const BRAND_ASSETS = {
  attendsureLogo: attendsureLogoSvg,
  techblazer: techblazerSvg,
  splashSvg,
  splashPng,
  iconSvg,
  iconPng,
  adaptiveIconSvg,
  adaptiveIconPng,
  attendSureFullSvg,
  attendSureFullPng,
} as const;

export interface AssetImageProps {
  size?: number;
  width?: number;
  height?: number;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

const createAssetComponent = (src: string, defaultAlt: string): React.FC<AssetImageProps> => {
  const AssetComponent: React.FC<AssetImageProps> = ({
    size = 32,
    width,
    height,
    alt = defaultAlt,
    className,
    style,
  }) => (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{
        width: width ?? size,
        height: height ?? size,
        objectFit: 'contain',
        display: 'block',
        ...style,
      }}
    />
  );
  AssetComponent.displayName = defaultAlt.replace(/\s+/g, '');
  return AssetComponent;
};

// Individual Reusable Components for Every Image in src/assets
export const AttendSureLogoAsset = createAssetComponent(attendsureLogoSvg, 'AttendSure Logo');
export const TechBlazerLogoAsset = createAssetComponent(techblazerSvg, 'TECHBLAZER Logo');
export const SplashSvgAsset = createAssetComponent(splashSvg, 'AttendSure Splash Vector');
export const SplashPngAsset = createAssetComponent(splashPng, 'AttendSure Splash Image');
export const AppIconSvgAsset = createAssetComponent(iconSvg, 'AttendSure App Icon Vector');
export const AppIconPngAsset = createAssetComponent(iconPng, 'AttendSure App Icon');
export const AdaptiveIconSvgAsset = createAssetComponent(adaptiveIconSvg, 'AttendSure Adaptive Icon Vector');
export const AdaptiveIconPngAsset = createAssetComponent(adaptiveIconPng, 'AttendSure Adaptive Icon');
export const AttendSureFullSvgAsset = createAssetComponent(attendSureFullSvg, 'AttendSure Full Logo Vector');
export const AttendSureFullPngAsset = createAssetComponent(attendSureFullPng, 'AttendSure Full Logo');