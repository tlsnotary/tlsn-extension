/**
 * StatusIndicator Component
 *
 * Shows connection status with visual indicator
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  display,
  alignItems,
  marginBottom,
  width,
  height,
  borderRadius,
  bgColor,
  marginRight,
  fontSize,
  color,
} from '@tlsn/plugin-sdk';

export interface StatusIndicatorProps {
  isConnected: boolean;
}

export function StatusIndicator({ isConnected }: StatusIndicatorProps): DomJson {
  return div(
    {
      style: inlineStyle(
        display('flex'),
        alignItems('center'),
        marginBottom('md')
      ),
    },
    [
      // Status dot
      div(
        {
          style: inlineStyle(
            width('8px'),
            height('8px'),
            borderRadius('circle'),
            bgColor(isConnected ? '#48bb78' : '#cbd5e0'),
            marginRight('2')
          ),
        },
        []
      ),
      // Status text
      div(
        {
          style: inlineStyle(
            fontSize('sm'),
            color('gray-700')
          ),
        },
        [isConnected ? 'Connected' : 'Waiting for connection...']
      ),
    ]
  );
}
