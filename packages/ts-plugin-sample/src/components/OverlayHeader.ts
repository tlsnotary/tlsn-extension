/**
 * OverlayHeader Component
 *
 * Header bar with title and minimize button
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import { colors, spacing, typography, inlineStyles } from '../styles';

export interface OverlayHeaderProps {
  title: string;
  onMinimize: string;
}

const styles = {
  header: inlineStyles({
    background: colors.primary.gradient,
    padding: `${spacing.sm} ${spacing.md}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    color: colors.text.white,
  }),

  title: inlineStyles({
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.lg,
  }),

  minimizeButton: inlineStyles({
    background: 'transparent',
    border: 'none',
    color: colors.text.white,
    fontSize: typography.fontSize.xl,
    cursor: 'pointer',
    padding: '0',
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
};

export function OverlayHeader({ title, onMinimize }: OverlayHeaderProps): DomJson {
  return div(
    {
      style: styles.header,
    },
    [
      div(
        {
          style: styles.title,
        },
        [title]
      ),
      button(
        {
          style: styles.minimizeButton,
          onclick: onMinimize,
        },
        ['−']
      ),
    ]
  );
}
