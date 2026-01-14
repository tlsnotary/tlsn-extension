/**
 * OverlayHeader Component
 *
 * Header bar with title and minimize button
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  background,
  paddingY,
  paddingX,
  display,
  justifyContent,
  alignItems,
  color,
  fontWeight,
  fontSize,
  border,
  cursor,
  padding,
  width,
  height,
} from '@tlsn/plugin-sdk/styles';

export interface OverlayHeaderProps {
  title: string;
  onMinimize: string;
}

export function OverlayHeader({ title, onMinimize }: OverlayHeaderProps): DomJson {
  return div(
    {
      style: inlineStyle(
        background('linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
        paddingY('sm'),
        paddingX('md'),
        display('flex'),
        justifyContent('space-between'),
        alignItems('center'),
        color('white')
      ),
    },
    [
      div(
        {
          style: inlineStyle(
            fontWeight('semibold'),
            fontSize('lg')
          ),
        },
        [title]
      ),
      button(
        {
          style: inlineStyle(
            background('transparent'),
            border('none'),
            color('white'),
            fontSize('xl'),
            cursor('pointer'),
            padding('0'),
            width('24px'),
            height('24px'),
            display('flex'),
            alignItems('center'),
            justifyContent('center')
          ),
          onclick: onMinimize,
        },
        ['−']
      ),
    ]
  );
}
