/**
 * PluginOverlay Component
 *
 * Main plugin UI overlay container
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  colors,
  spacing,
  borderRadius,
  shadows,
  typography,
  zIndex,
  inlineStyles,
} from '../styles';
import { OverlayHeader } from './OverlayHeader';
import { StatusIndicator } from './StatusIndicator';
import { ProveButton } from './ProveButton';
import { LoginPrompt } from './LoginPrompt';

export interface PluginOverlayProps {
  title: string;
  isConnected: boolean;
  isPending: boolean;
  onMinimize: string;
  onProve: string;
}

const styles = {
  container: inlineStyles({
    position: 'fixed',
    bottom: '0',
    right: spacing.xs,
    width: '280px',
    borderRadius: `${borderRadius.md} ${borderRadius.md} 0 0`,
    backgroundColor: colors.background.white,
    boxShadow: shadows.md,
    zIndex: zIndex.overlay,
    fontSize: typography.fontSize.sm,
    fontFamily: typography.fontFamily,
    overflow: 'hidden',
  }),

  content: inlineStyles({
    padding: spacing.lg,
    backgroundColor: colors.background.light,
  }),
};

export function PluginOverlay({
  title,
  isConnected,
  isPending,
  onMinimize,
  onProve,
}: PluginOverlayProps): DomJson {
  return div(
    {
      style: styles.container,
    },
    [
      // Header
      OverlayHeader({ title, onMinimize }),

      // Content area
      div(
        {
          style: styles.content,
        },
        [
          // Status indicator
          StatusIndicator({ isConnected }),

          // Conditional content: button or login prompt
          isConnected
            ? ProveButton({ onClick: onProve, isPending })
            : LoginPrompt(),
        ]
      ),
    ]
  );
}
