/**
 * LoginPrompt Component
 *
 * Displays a message prompting the user to login
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import { colors, spacing, borderRadius, inlineStyles } from '../styles';

const styles = {
  prompt: inlineStyles({
    textAlign: 'center',
    color: colors.warning.text,
    padding: spacing.sm,
    backgroundColor: colors.warning.bg,
    borderRadius: borderRadius.sm,
    border: `1px solid ${colors.warning.border}`,
  }),
};

export function LoginPrompt(): DomJson {
  return div(
    {
      style: styles.prompt,
    },
    ['Please login to x.com to continue']
  );
}
