import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { cssToRN } from '../../lib/cssToRN';

/**
 * DOM JSON types matching plugin-sdk's DomJson.
 * Plugins return this structure from their main() function.
 */
export type DomOptions = {
  className?: string;
  id?: string;
  style?: Record<string, string>;
  onclick?: string;
};

export type DomJson =
  | {
      type: 'div' | 'button';
      options: DomOptions;
      children: DomJson[];
    }
  | string;

interface PluginRendererProps {
  /** The DOM JSON tree returned by the plugin's main() function */
  domJson: DomJson;
  /** Called when a plugin button with an onclick handler is pressed */
  onPluginAction: (handlerName: string) => void;
}

/**
 * Renders a plugin's DOM JSON tree as React Native components.
 *
 * Mapping:
 *   div → View
 *   button → TouchableOpacity
 *   string → Text
 *   style (CSS strings) → RN styles via cssToRN
 *   onclick → onPress
 */
export function PluginRenderer({ domJson, onPluginAction }: PluginRendererProps) {
  return <>{renderNode(domJson, onPluginAction, '0')}</>;
}

function renderNode(
  node: DomJson,
  onPluginAction: (handlerName: string) => void,
  key: string,
): React.ReactNode {
  // String nodes → Text
  if (typeof node === 'string') {
    return <Text key={key} style={styles.text}>{node}</Text>;
  }

  const { type, options, children } = node;
  const rnStyle = cssToRN(options.style);
  const renderedChildren = children.map((child, i) =>
    renderNode(child, onPluginAction, `${key}-${i}`),
  );

  // Check if any child is a string — if so, we need to wrap in Text for proper rendering
  const hasStringChildren = children.some((child) => typeof child === 'string');

  if (type === 'button') {
    return (
      <TouchableOpacity
        key={key}
        style={rnStyle}
        onPress={options.onclick ? () => onPluginAction(options.onclick!) : undefined}
        disabled={rnStyle.opacity !== undefined && (rnStyle.opacity as number) < 1}
      >
        {hasStringChildren ? (
          <Text style={extractTextStyle(rnStyle)}>{renderTextChildren(children)}</Text>
        ) : (
          renderedChildren
        )}
      </TouchableOpacity>
    );
  }

  // div → View (or TouchableOpacity if it has an onclick handler)
  const content = hasStringChildren && children.every((c) => typeof c === 'string') ? (
    <Text style={extractTextStyle(rnStyle)}>{renderTextChildren(children)}</Text>
  ) : (
    renderedChildren
  );

  if (options.onclick) {
    return (
      <TouchableOpacity
        key={key}
        style={rnStyle}
        onPress={() => onPluginAction(options.onclick!)}
        activeOpacity={0.7}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View key={key} style={rnStyle}>
      {content}
    </View>
  );
}

/**
 * Concatenate string children for a Text node.
 */
function renderTextChildren(children: DomJson[]): string {
  return children
    .filter((c): c is string => typeof c === 'string')
    .join('');
}

/**
 * Extract text-relevant styles from a combined style object.
 * RN requires text styles to be on Text components, not Views.
 */
function extractTextStyle(style: Record<string, any>): Record<string, any> {
  const textProps = [
    'color',
    'fontSize',
    'fontWeight',
    'fontFamily',
    'fontStyle',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textTransform',
  ];
  const result: Record<string, any> = {};
  for (const prop of textProps) {
    if (style[prop] !== undefined) {
      result[prop] = style[prop];
    }
  }
  return result;
}

const styles = StyleSheet.create({
  text: {
    // Default text styling
  },
});
