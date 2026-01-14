/**
 * FloatingButton Component
 *
 * Renders a minimized floating action button in the bottom-right corner
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import { colors, spacing, borderRadius, shadows, zIndex, inlineStyles } from '../styles';

export interface FloatingButtonProps {
  onClick: string;
  icon?: string;
}

const styles = {
  button: inlineStyles({
    position: 'fixed',
    bottom: spacing.lg,
    right: spacing.lg,
    width: '60px',
    height: '60px',
    borderRadius: borderRadius.circle,
    backgroundColor: '#4CAF50',
    boxShadow: shadows.lg,
    zIndex: zIndex.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontSize: '24px',
    color: colors.text.white,
  }),
};

export function FloatingButton({ onClick, icon = '🔐' }: FloatingButtonProps): DomJson {
  return div(
    {
      style: styles.button,
      onclick: onClick,
    },
    [icon]
  );
}
