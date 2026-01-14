/**
 * StatusIndicator Component
 *
 * Displays the connection status with appropriate styling
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import { colors, spacing, borderRadius, inlineStyles, typography } from '../styles';

export interface StatusIndicatorProps {
  isConnected: boolean;
}

function getStatusStyles(isConnected: boolean) {
  const baseStyle = {
    marginBottom: spacing.md,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    fontWeight: typography.fontWeight.medium,
  };

  if (isConnected) {
    return inlineStyles({
      ...baseStyle,
      backgroundColor: colors.success.bg,
      color: colors.success.text,
      border: `1px solid ${colors.success.border}`,
    });
  }

  return inlineStyles({
    ...baseStyle,
    backgroundColor: colors.error.bg,
    color: colors.error.text,
    border: `1px solid ${colors.error.border}`,
  });
}

function getStatusText(isConnected: boolean): string {
  return isConnected ? '✓ Profile detected' : '⚠ No profile detected';
}

export function StatusIndicator({ isConnected }: StatusIndicatorProps): DomJson {
  return div(
    {
      style: getStatusStyles(isConnected),
    },
    [getStatusText(isConnected)]
  );
}
