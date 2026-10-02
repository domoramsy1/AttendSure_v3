export const theme = {
  colors: {
    primary: '#0284c7',       // Sky/Oceanic DepEd Blue
    primaryHover: '#0369a1',
    primaryLight: '#e0f2fe',
    success: '#16a34a',
    danger: '#dc2626',
    dangerHover: '#b91c1c',
    dangerLight: '#fee2e2',
    warning: '#d97706',
    
    // Neutrals
    canvasBg: '#0f172a',      // Dark backdrop for report canvas
    surface: '#ffffff',
    surfaceSubtle: '#f8fafc',
    border: '#cbd5e1',
    borderDark: '#000000',
    
    // Typography
    textPrimary: '#0f172a',
    textSecondary: '#64748b',
    textMuted: '#94a3b8',
    textWhite: '#ffffff',
  },
  
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
    canvas: '0 12px 36px rgba(0, 0, 0, 0.45)',
  },

  radius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
  },

  fonts: {
    sans: 'Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }
} as const;