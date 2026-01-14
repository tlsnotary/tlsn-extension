/**
 * Shared styles and style utilities for plugin UI components
 */

/**
 * Common color palette
 */
export const colors = {
  primary: {
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    start: '#667eea',
    end: '#764ba2',
  },
  success: {
    bg: '#d4edda',
    text: '#155724',
    border: '#c3e6cb',
  },
  error: {
    bg: '#f8d7da',
    text: '#721c24',
    border: '#f5c6cb',
  },
  warning: {
    bg: '#fff3cd',
    border: '#ffeaa7',
    text: '#666',
  },
  background: {
    light: '#f8f9fa',
    white: 'white',
  },
  overlay: 'rgba(0,0,0,0.85)',
  text: {
    white: 'white',
    dark: '#666',
  },
} as const;

/**
 * Common spacing values
 */
export const spacing = {
  xs: '8px',
  sm: '12px',
  md: '16px',
  lg: '20px',
  xl: '24px',
} as const;

/**
 * Common font settings
 */
export const typography = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontSize: {
    sm: '14px',
    md: '15px',
    lg: '16px',
    xl: '20px',
    xxl: '24px',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
  },
} as const;

/**
 * Common border radius values
 */
export const borderRadius = {
  sm: '6px',
  md: '8px',
  circle: '50%',
} as const;

/**
 * Common box shadows
 */
export const shadows = {
  sm: '0 2px 4px rgba(0,0,0,0.1)',
  md: '0 -2px 10px rgba(0,0,0,0.1)',
  lg: '0 4px 8px rgba(0,0,0,0.3)',
} as const;

/**
 * Helper to create inline CSS style object
 */
export function inlineStyles<T extends Record<string, string>>(styles: T): T {
  return styles;
}

/**
 * Common transition
 */
export const transition = 'all 0.2s ease' as const;

/**
 * Z-index values
 */
export const zIndex = {
  overlay: '999999',
} as const;
