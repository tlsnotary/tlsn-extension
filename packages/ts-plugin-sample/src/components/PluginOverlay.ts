/**
 * PluginOverlay Component
 *
 * Main plugin UI overlay container
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  position,
  bottom,
  right,
  width,
  borderRadius,
  bgColor,
  boxShadow,
  zIndex,
  fontSize,
  fontFamily,
  overflow,
  padding,
  defaultFontFamily,
} from '@tlsn/plugin-sdk';
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

export function PluginOverlay({
  title,
  isConnected,
  isPending,
  onMinimize,
  onProve,
}: PluginOverlayProps): DomJson {
  return div(
    {
      style: inlineStyle(
        position('fixed'),
        bottom('0'),
        right('xs'),
        width('280px'),
        borderRadius('md'),
        { borderRadius: '8px 8px 0 0' }, // Custom override for specific corner rounding
        bgColor('white'),
        boxShadow('md'),
        zIndex('999999'),
        fontSize('sm'),
        fontFamily(defaultFontFamily),
        overflow('hidden')
      ),
    },
    [
      // Header
      OverlayHeader({ title, onMinimize }),

      // Content area
      div(
        {
          style: inlineStyle(
            padding('lg'),
            bgColor('gray-100')
          ),
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
