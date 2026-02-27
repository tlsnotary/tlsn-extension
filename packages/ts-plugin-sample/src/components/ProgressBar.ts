/**
 * ProgressBar Component
 *
 * Displays proof generation progress when active.
 * Reads the reserved '_proveProgress' state key that is automatically
 * managed by the plugin SDK's prove() wrapper.
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import {
  inlineStyle,
  height,
  bgColor,
  borderRadius,
  overflow,
  width,
  transition,
  background,
  fontSize,
  color,
  marginTop,
  textAlign,
} from '@tlsn/plugin-sdk/styles';

export function ProgressBar(): DomJson[] {
  const progress = useState<{ step: string; progress: number; message: string } | null>(
    '_proveProgress',
    null
  );

  if (!progress) return [];

  const pct = `${Math.round(progress.progress * 100)}%`;

  return [
    div(
      { style: inlineStyle(marginTop('sm')) },
      [
        // Track
        div(
          {
            style: inlineStyle(
              height('6px'),
              bgColor('gray-200'),
              borderRadius('sm'),
              overflow('hidden')
            ),
          },
          [
            // Fill
            div(
              {
                style: inlineStyle(
                  height('100%'),
                  width(pct),
                  background('linear-gradient(90deg, #667eea, #764ba2)'),
                  borderRadius('sm'),
                  transition('width 0.4s ease')
                ),
              },
              []
            ),
          ]
        ),
        // Message
        div(
          {
            style: inlineStyle(
              fontSize('xs'),
              color('gray-500'),
              marginTop('1'),
              textAlign('center')
            ),
          },
          [progress.message]
        ),
      ]
    ),
  ];
}
