/**
 * Tailwind-like style utilities for plugin UI components
 */

// =============================================================================
// DESIGN TOKENS
// =============================================================================

/**
 * Color palette with Tailwind-like naming
 * Non-opinionated color scales from 100-900
 */
const colorTokens = {
  // Neutral
  'white': '#ffffff',
  'black': '#000000',
  'transparent': 'transparent',

  // Gray scale
  'gray-50': '#f9fafb',
  'gray-100': '#f3f4f6',
  'gray-200': '#e5e7eb',
  'gray-300': '#d1d5db',
  'gray-400': '#9ca3af',
  'gray-500': '#6b7280',
  'gray-600': '#4b5563',
  'gray-700': '#374151',
  'gray-800': '#1f2937',
  'gray-900': '#111827',

  // Blue
  'blue-100': '#dbeafe',
  'blue-200': '#bfdbfe',
  'blue-300': '#93c5fd',
  'blue-400': '#60a5fa',
  'blue-500': '#3b82f6',
  'blue-600': '#2563eb',
  'blue-700': '#1d4ed8',
  'blue-800': '#1e40af',
  'blue-900': '#1e3a8a',

  // Purple
  'purple-100': '#f3e8ff',
  'purple-200': '#e9d5ff',
  'purple-300': '#d8b4fe',
  'purple-400': '#c084fc',
  'purple-500': '#a855f7',
  'purple-600': '#9333ea',
  'purple-700': '#7e22ce',
  'purple-800': '#6b21a8',
  'purple-900': '#581c87',

  // Red
  'red-100': '#fee2e2',
  'red-200': '#fecaca',
  'red-300': '#fca5a5',
  'red-400': '#f87171',
  'red-500': '#ef4444',
  'red-600': '#dc2626',
  'red-700': '#b91c1c',
  'red-800': '#991b1b',
  'red-900': '#7f1d1d',

  // Yellow
  'yellow-100': '#fef3c7',
  'yellow-200': '#fde68a',
  'yellow-300': '#fcd34d',
  'yellow-400': '#fbbf24',
  'yellow-500': '#f59e0b',
  'yellow-600': '#d97706',
  'yellow-700': '#b45309',
  'yellow-800': '#92400e',
  'yellow-900': '#78350f',

  // Orange
  'orange-100': '#ffedd5',
  'orange-200': '#fed7aa',
  'orange-300': '#fdba74',
  'orange-400': '#fb923c',
  'orange-500': '#f97316',
  'orange-600': '#ea580c',
  'orange-700': '#c2410c',
  'orange-800': '#9a3412',
  'orange-900': '#7c2d12',

  // Green
  'green-100': '#d1fae5',
  'green-200': '#a7f3d0',
  'green-300': '#6ee7b7',
  'green-400': '#34d399',
  'green-500': '#10b981',
  'green-600': '#059669',
  'green-700': '#047857',
  'green-800': '#065f46',
  'green-900': '#064e3b',
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
// EXPORTS
// =============================================================================

/**
 * Common font family
 */
export const defaultFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
