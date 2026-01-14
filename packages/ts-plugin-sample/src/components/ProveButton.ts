/**
 * ProveButton Component
 *
 * Button to trigger proof generation
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import { colors, spacing, borderRadius, shadows, typography, inlineStyles } from '../styles';

export interface ProveButtonProps {
  onClick: string;
  isPending: boolean;
}

function getButtonStyles(isPending: boolean) {
  return inlineStyles({
    width: '100%',
    padding: `${spacing.sm} ${spacing.xl}`,
    borderRadius: borderRadius.sm,
    border: 'none',
    background: colors.primary.gradient,
    color: colors.text.white,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.md,
    cursor: isPending ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: shadows.sm,
    opacity: isPending ? '0.5' : '1',
  });
}

function getButtonText(isPending: boolean): string {
  return isPending ? 'Generating Proof...' : 'Generate Proof';
}

export function ProveButton({ onClick, isPending }: ProveButtonProps): DomJson {
  return button(
    {
      style: getButtonStyles(isPending),
      onclick: onClick,
    },
    [getButtonText(isPending)]
  );
}
