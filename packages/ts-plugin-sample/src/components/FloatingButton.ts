/**
 * FloatingButton Component
 *
 * Minimized floating action button
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  position,
  bottom,
  right,
  width,
  height,
  borderRadius,
  bgColor,
  boxShadow,
  zIndex,
  display,
  alignItems,
  justifyContent,
  cursor,
  fontSize,
  color,
  transition,
} from '@tlsn/plugin-sdk';

export interface FloatingButtonProps {
  onClick: string;
  icon?: string;
}

export function FloatingButton({ onClick, icon = '🔐' }: FloatingButtonProps): DomJson {
  return div(
    {
      style: inlineStyle(
        position('fixed'),
        bottom('lg'),
        right('lg'),
        width('60px'),
        height('60px'),
        borderRadius('circle'),
        bgColor('#4CAF50'),
        boxShadow('lg'),
        zIndex('999999'),
        display('flex'),
        alignItems('center'),
        justifyContent('center'),
        cursor('pointer'),
        fontSize('2xl'),
        color('white'),
        transition()
      ),
      onclick: onClick,
    },
    [icon]
  );
}
