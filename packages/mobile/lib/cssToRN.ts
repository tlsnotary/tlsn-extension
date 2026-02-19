/**
 * Converts CSS-style objects (from plugin DOM JSON) to React Native StyleSheet-compatible objects.
 *
 * Plugin DOM JSON uses web CSS strings like:
 *   { backgroundColor: '#1DB954', padding: '12px', fontSize: '14px' }
 *
 * React Native needs:
 *   { backgroundColor: '#1DB954', padding: 12, fontSize: 14 }
 */

import { ViewStyle, TextStyle } from 'react-native';

type RNStyle = ViewStyle & TextStyle;

// CSS properties that should be ignored on mobile
const IGNORED_PROPERTIES = new Set([
  'cursor',
  'transition',
  'boxSizing',
  'webkitFontSmoothing',
  'mozOsxFontSmoothing',
  'outline',
  'appearance',
  'textDecoration', // partially supported, handle separately if needed
]);

// Properties whose values are always numeric (after stripping 'px')
const NUMERIC_PROPERTIES = new Set([
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'borderWidth',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontSize',
  'lineHeight',
  'letterSpacing',
  'top',
  'right',
  'bottom',
  'left',
  'gap',
  'rowGap',
  'columnGap',
]);

/**
 * Strip 'px' suffix and convert to number.
 */
function parsePx(value: string): number | string {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.endsWith('px')) {
    return parseFloat(trimmed);
  }
  // Try parsing as pure number
  const num = parseFloat(trimmed);
  if (!isNaN(num) && String(num) === trimmed) {
    return num;
  }
  return value;
}

/**
 * Parse a shorthand padding/margin value like '12px 16px' into individual properties.
 */
function parseShorthand(
  value: string,
  prefix: 'padding' | 'margin',
): Partial<RNStyle> {
  const parts = value
    .trim()
    .split(/\s+/)
    .map((p) => parsePx(p));

  if (parts.length === 1 && typeof parts[0] === 'number') {
    return { [prefix]: parts[0] } as Partial<RNStyle>;
  }
  if (parts.length === 2) {
    return {
      [`${prefix}Vertical`]: parts[0],
      [`${prefix}Horizontal`]: parts[1],
    } as unknown as Partial<RNStyle>;
  }
  if (parts.length === 3) {
    return {
      [`${prefix}Top`]: parts[0],
      [`${prefix}Horizontal`]: parts[1],
      [`${prefix}Bottom`]: parts[2],
    } as unknown as Partial<RNStyle>;
  }
  if (parts.length === 4) {
    return {
      [`${prefix}Top`]: parts[0],
      [`${prefix}Right`]: parts[1],
      [`${prefix}Bottom`]: parts[2],
      [`${prefix}Left`]: parts[3],
    } as unknown as Partial<RNStyle>;
  }
  return {};
}

/**
 * Parse a CSS boxShadow string into RN shadow properties.
 * e.g., '0 4px 8px rgba(0,0,0,0.3)' → { shadowOffset, shadowOpacity, shadowRadius, shadowColor, elevation }
 */
function parseBoxShadow(value: string): Partial<RNStyle> {
  // Simple parser: extract color and numeric values
  const colorMatch = value.match(
    /rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}|\b[a-z]+\b$/,
  );
  const nums = value.match(/-?\d+(\.\d+)?/g);

  if (!nums || nums.length < 3) return {};

  const offsetX = parseFloat(nums[0]);
  const offsetY = parseFloat(nums[1]);
  const radius = parseFloat(nums[2]);

  const result: Partial<RNStyle> = {
    shadowOffset: { width: offsetX, height: offsetY },
    shadowRadius: radius,
    shadowOpacity: 1,
    elevation: Math.max(1, Math.round(radius / 2)),
  };

  if (colorMatch) {
    result.shadowColor = colorMatch[0];
    // Extract opacity from rgba
    const opacityMatch = colorMatch[0].match(
      /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
    );
    if (opacityMatch) {
      result.shadowOpacity = parseFloat(opacityMatch[1]);
    }
  }

  return result;
}

/**
 * Extract the first color from a CSS gradient string.
 * e.g., 'linear-gradient(135deg, #1DB954 0%, #1AA34A 100%)' → '#1DB954'
 */
function extractFirstColor(value: string): string | null {
  const colorMatch = value.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/);
  return colorMatch ? colorMatch[0] : null;
}

/**
 * Convert a CSS border shorthand to RN properties.
 * e.g., '1px solid #c3e6cb' → { borderWidth: 1, borderColor: '#c3e6cb' }
 */
function parseBorder(value: string): Partial<RNStyle> {
  const parts = value.trim().split(/\s+/);
  const result: Partial<RNStyle> = {};

  for (const part of parts) {
    if (part.endsWith('px')) {
      result.borderWidth = parseFloat(part);
    } else if (
      part.startsWith('#') ||
      part.startsWith('rgb') ||
      [
        'transparent',
        'black',
        'white',
        'red',
        'blue',
        'green',
        'gray',
      ].includes(part)
    ) {
      result.borderColor = part;
    }
    // ignore 'solid', 'dashed', etc. — RN uses borderStyle separately
  }

  return result;
}

/**
 * Convert a CSS style object from plugin DOM JSON to a React Native compatible style object.
 */
export function cssToRN(
  cssStyle: Record<string, string> | undefined,
): Partial<RNStyle> {
  if (!cssStyle) return {};

  const rnStyle: Record<string, any> = {};

  for (const [key, value] of Object.entries(cssStyle)) {
    if (IGNORED_PROPERTIES.has(key)) continue;

    // Handle shorthand padding/margin with spaces
    if (
      (key === 'padding' || key === 'margin') &&
      typeof value === 'string' &&
      value.trim().includes(' ')
    ) {
      Object.assign(rnStyle, parseShorthand(value, key));
      continue;
    }

    // Handle boxShadow
    if (key === 'boxShadow') {
      Object.assign(rnStyle, parseBoxShadow(value));
      continue;
    }

    // Handle background (gradient → first color fallback)
    if (key === 'background') {
      if (value.includes('gradient')) {
        const color = extractFirstColor(value);
        if (color) rnStyle.backgroundColor = color;
      } else {
        rnStyle.backgroundColor = value;
      }
      continue;
    }

    // Handle border shorthand
    if (key === 'border') {
      Object.assign(rnStyle, parseBorder(value));
      continue;
    }

    // Handle position: 'fixed' → 'absolute'
    if (key === 'position' && value === 'fixed') {
      rnStyle.position = 'absolute';
      continue;
    }

    // Handle borderRadius: '50%' → large number
    if (key === 'borderRadius' && value === '50%') {
      rnStyle.borderRadius = 9999;
      continue;
    }

    // Handle display: 'flex' → default in RN, skip
    if (key === 'display' && value === 'flex') {
      continue;
    }

    // Handle zIndex string → number
    if (key === 'zIndex') {
      rnStyle.zIndex = parseInt(value, 10) || 0;
      continue;
    }

    // Handle opacity string → number
    if (key === 'opacity') {
      rnStyle.opacity = parseFloat(value);
      continue;
    }

    // Handle fontWeight — RN accepts string fontWeight
    if (key === 'fontWeight') {
      rnStyle.fontWeight = value;
      continue;
    }

    // Handle fontFamily — pass through, may need mapping on mobile
    if (key === 'fontFamily') {
      // Strip fallback fonts, use first one
      rnStyle.fontFamily = value.split(',')[0].trim().replace(/['"]/g, '');
      continue;
    }

    // Handle numeric properties
    if (NUMERIC_PROPERTIES.has(key)) {
      const parsed = parsePx(value);
      rnStyle[key] = parsed;
      continue;
    }

    // Handle percentage widths/heights
    if (
      (key === 'width' || key === 'height') &&
      typeof value === 'string' &&
      value.endsWith('%')
    ) {
      rnStyle[key] = value;
      continue;
    }

    // Default: pass through string value
    rnStyle[key] = value;
  }

  return rnStyle;
}
