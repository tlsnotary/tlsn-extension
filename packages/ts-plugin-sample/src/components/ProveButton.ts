/**
 * ProveButton Component
 *
 * Button for initiating proof generation
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  width,
  padding,
  background,
  color,
  border,
  borderRadius,
  fontSize,
  fontWeight,
  cursor,
  transition,
  opacity,
} from '@tlsn/plugin-sdk';

export interface ProveButtonProps {
  onClick: string;
  isPending: boolean;
}

export function ProveButton({ onClick, isPending }: ProveButtonProps): DomJson {
  return button(
    {
      style: inlineStyle(
        width('100%'),
        padding('sm'),
        background('linear-gradient(135deg, #667eea 0%, #764ba2 100%)'),
        color('white'),
        border('none'),
        borderRadius('sm'),
        fontSize('md'),
        fontWeight('semibold'),
        cursor('pointer'),
        transition(),
        isPending && opacity('0.6'),
        isPending && cursor('not-allowed')
      ),
      onclick: onClick,
    },
    [isPending ? 'Generating Proof...' : 'Prove']
  );
}
