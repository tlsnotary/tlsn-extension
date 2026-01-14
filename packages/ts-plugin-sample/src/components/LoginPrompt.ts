/**
 * LoginPrompt Component
 *
 * Displays a message prompting the user to login
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  textAlign,
  color,
  padding,
  bgColor,
  borderRadius,
  border,
} from '@tlsn/plugin-sdk';

export function LoginPrompt(): DomJson {
  return div(
    {
      style: inlineStyle(
        textAlign('center'),
        color('gray-600'),
        padding('sm'),
        bgColor('yellow-100'),
        borderRadius('sm'),
        border('1px solid #ffeaa7')
      ),
    },
    ['Please login to x.com to continue']
  );
}
