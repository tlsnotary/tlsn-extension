/**
 * Tailwind-like style utilities for plugin UI components
 */

// =============================================================================
// DESIGN TOKENS
// =============================================================================

/**
 * Color palette with Tailwind-like naming
 */
const colorTokens = {
  // Grayscale
  'gray-100': '#f7fafc',
  'gray-200': '#edf2f7',
  'gray-300': '#e2e8f0',
  'gray-400': '#cbd5e0',
  'gray-500': '#a0aec0',
  'gray-600': '#718096',
  'gray-700': '#4a5568',
  'gray-800': '#2d3748',
  'gray-900': '#1a202c',

  // Primary (Purple/Blue gradient)
  'primary-500': '#667eea',
  'primary-600': '#764ba2',
  'primary-gradient': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',

  // Success (Green)
  'green-100': '#d4edda',
  'green-500': '#48bb78',
  'green-700': '#155724',
  'green-800': '#22543d',

  // Error (Red)
  'red-100': '#f8d7da',
  'red-500': '#f56565',
  'red-700': '#721c24',

  // Warning (Yellow)
  'yellow-100': '#fff3cd',
  'yellow-200': '#ffeaa7',
  'yellow-500': '#ecc94b',

  // Neutral
  'white': 'white',
  'black': 'black',
  'transparent': 'transparent',
} as const;

/**
 * Spacing scale
 */
const spacingTokens = {
  '0': '0',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',

  // Named aliases
  'xs': '8px',
  'sm': '12px',
  'md': '16px',
  'lg': '20px',
  'xl': '24px',
} as const;

/**
 * Font sizes
 */
const fontSizeTokens = {
  'xs': '12px',
  'sm': '14px',
  'md': '15px',
  'base': '16px',
  'lg': '18px',
  'xl': '20px',
  '2xl': '24px',
} as const;

/**
 * Font weights
 */
const fontWeightTokens = {
  'normal': '400',
  'medium': '500',
  'semibold': '600',
  'bold': '700',
} as const;

/**
 * Border radius
 */
const borderRadiusTokens = {
  'none': '0',
  'sm': '6px',
  'md': '8px',
  'lg': '12px',
  'full': '9999px',
  'circle': '50%',
} as const;

/**
 * Box shadows
 */
const shadowTokens = {
  'sm': '0 2px 4px rgba(0,0,0,0.1)',
  'md': '0 -2px 10px rgba(0,0,0,0.1)',
  'lg': '0 4px 8px rgba(0,0,0,0.3)',
  'xl': '0 10px 25px rgba(0,0,0,0.2)',
} as const;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

type StyleObject = Record<string, string>;
type StyleHelper = StyleObject | false | null | undefined;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Resolve a color token to its CSS value
 */
function resolveColor(token: string): string {
  return colorTokens[token as keyof typeof colorTokens] || token;
}

/**
 * Resolve a spacing token to its CSS value
 */
function resolveSpacing(token: string): string {
  return spacingTokens[token as keyof typeof spacingTokens] || token;
}

/**
 * Resolve a font size token to its CSS value
 */
function resolveFontSize(token: string): string {
  return fontSizeTokens[token as keyof typeof fontSizeTokens] || token;
}

/**
 * Resolve a font weight token to its CSS value
 */
function resolveFontWeight(token: string): string {
  return fontWeightTokens[token as keyof typeof fontWeightTokens] || token;
}

/**
 * Resolve a border radius token to its CSS value
 */
function resolveBorderRadius(token: string): string {
  return borderRadiusTokens[token as keyof typeof borderRadiusTokens] || token;
}

/**
 * Resolve a shadow token to its CSS value
 */
function resolveShadow(token: string): string {
  return shadowTokens[token as keyof typeof shadowTokens] || token;
}

// =============================================================================
// STYLE HELPER FUNCTIONS
// =============================================================================

// Color helpers
export const color = (value: string): StyleObject => ({ color: resolveColor(value) });
export const bgColor = (value: string): StyleObject => ({ backgroundColor: resolveColor(value) });
export const borderColor = (value: string): StyleObject => ({ borderColor: resolveColor(value) });
export const bg = bgColor; // Alias

// Spacing helpers - Padding
export const padding = (value: string): StyleObject => ({ padding: resolveSpacing(value) });
export const paddingX = (value: string): StyleObject => {
  const val = resolveSpacing(value);
  return { paddingLeft: val, paddingRight: val };
};
export const paddingY = (value: string): StyleObject => {
  const val = resolveSpacing(value);
  return { paddingTop: val, paddingBottom: val };
};
export const paddingTop = (value: string): StyleObject => ({ paddingTop: resolveSpacing(value) });
export const paddingBottom = (value: string): StyleObject => ({ paddingBottom: resolveSpacing(value) });
export const paddingLeft = (value: string): StyleObject => ({ paddingLeft: resolveSpacing(value) });
export const paddingRight = (value: string): StyleObject => ({ paddingRight: resolveSpacing(value) });

// Aliases
export const p = padding;
export const px = paddingX;
export const py = paddingY;
export const pt = paddingTop;
export const pb = paddingBottom;
export const pl = paddingLeft;
export const pr = paddingRight;

// Spacing helpers - Margin
export const margin = (value: string): StyleObject => ({ margin: resolveSpacing(value) });
export const marginX = (value: string): StyleObject => {
  const val = resolveSpacing(value);
  return { marginLeft: val, marginRight: val };
};
export const marginY = (value: string): StyleObject => {
  const val = resolveSpacing(value);
  return { marginTop: val, marginBottom: val };
};
export const marginTop = (value: string): StyleObject => ({ marginTop: resolveSpacing(value) });
export const marginBottom = (value: string): StyleObject => ({ marginBottom: resolveSpacing(value) });
export const marginLeft = (value: string): StyleObject => ({ marginLeft: resolveSpacing(value) });
export const marginRight = (value: string): StyleObject => ({ marginRight: resolveSpacing(value) });

// Aliases
export const m = margin;
export const mx = marginX;
export const my = marginY;
export const mt = marginTop;
export const mb = marginBottom;
export const ml = marginLeft;
export const mr = marginRight;

// Typography helpers
export const fontSize = (value: string): StyleObject => ({ fontSize: resolveFontSize(value) });
export const fontWeight = (value: string): StyleObject => ({ fontWeight: resolveFontWeight(value) });
export const textAlign = (value: string): StyleObject => ({ textAlign: value });
export const fontFamily = (value: string): StyleObject => ({ fontFamily: value });

// Layout helpers
export const display = (value: string): StyleObject => ({ display: value });
export const position = (value: string): StyleObject => ({ position: value });
export const width = (value: string): StyleObject => ({ width: value });
export const height = (value: string): StyleObject => ({ height: value });
export const minWidth = (value: string): StyleObject => ({ minWidth: value });
export const minHeight = (value: string): StyleObject => ({ minHeight: value });
export const maxWidth = (value: string): StyleObject => ({ maxWidth: value });
export const maxHeight = (value: string): StyleObject => ({ maxHeight: value });

// Flexbox helpers
export const flex = (value: string = '1'): StyleObject => ({ flex: value });
export const flexDirection = (value: string): StyleObject => ({ flexDirection: value });
export const alignItems = (value: string): StyleObject => ({ alignItems: value });
export const justifyContent = (value: string): StyleObject => ({ justifyContent: value });
export const flexWrap = (value: string): StyleObject => ({ flexWrap: value });

// Positioning helpers
export const top = (value: string): StyleObject => ({ top: resolveSpacing(value) });
export const bottom = (value: string): StyleObject => ({ bottom: resolveSpacing(value) });
export const left = (value: string): StyleObject => ({ left: resolveSpacing(value) });
export const right = (value: string): StyleObject => ({ right: resolveSpacing(value) });

// Border helpers
export const border = (value: string): StyleObject => ({ border: value });
export const borderRadius = (value: string): StyleObject => ({ borderRadius: resolveBorderRadius(value) });
export const borderWidth = (value: string): StyleObject => ({ borderWidth: value });

// Visual helpers
export const boxShadow = (value: string): StyleObject => ({ boxShadow: resolveShadow(value) });
export const opacity = (value: string): StyleObject => ({ opacity: value });
export const overflow = (value: string): StyleObject => ({ overflow: value });
export const zIndex = (value: string): StyleObject => ({ zIndex: value });

// Interaction helpers
export const cursor = (value: string): StyleObject => ({ cursor: value });
export const pointerEvents = (value: string): StyleObject => ({ pointerEvents: value });

// Transition/Animation helpers
export const transition = (value: string = 'all 0.2s ease'): StyleObject => ({ transition: value });

// Background helpers
export const background = (value: string): StyleObject => ({ background: value });

// =============================================================================
// MAIN INLINE STYLE FUNCTION
// =============================================================================

/**
 * Combine multiple style helpers into a single style object
 * Automatically filters out falsey values for conditional styling
 *
 * @example
 * inlineStyle(
 *   textAlign('center'),
 *   color('gray-500'),
 *   padding('sm'),
 *   bgColor('yellow-100'),
 *   isPending && display('none'),
 *   { borderRadius: '12px' }
 * )
 */
export function inlineStyle(...styles: StyleHelper[]): StyleObject {
  return styles.reduce<StyleObject>((acc, style) => {
    if (style) {
      Object.assign(acc, style);
    }
    return acc;
  }, {});
}

// =============================================================================
// EXPORTS FOR BACKWARD COMPATIBILITY
// =============================================================================

/**
 * Legacy color constants (for reference)
 */
export const colors = {
  primary: {
    gradient: colorTokens['primary-gradient'],
    start: colorTokens['primary-500'],
    end: colorTokens['primary-600'],
  },
  success: {
    bg: colorTokens['green-100'],
    text: colorTokens['green-700'],
    border: colorTokens['green-100'],
  },
  error: {
    bg: colorTokens['red-100'],
    text: colorTokens['red-700'],
    border: colorTokens['red-100'],
  },
  warning: {
    bg: colorTokens['yellow-100'],
    border: colorTokens['yellow-200'],
    text: colorTokens['gray-600'],
  },
} as const;

/**
 * Common font family
 */
export const defaultFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
