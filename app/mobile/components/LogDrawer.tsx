import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LogList } from '@/components/LogList';

const SCREEN_H = Dimensions.get('window').height;
const MIN_H = 200;
const MAX_H = Math.round(SCREEN_H * 0.8);
const DEFAULT_H = Math.round(SCREEN_H * 0.42);

const clamp = (h: number) => Math.min(MAX_H, Math.max(MIN_H, h));

/**
 * A resizable bottom-sheet log drawer that floats over the current screen
 * (it does not resize the underlying content — important on the proof screen,
 * whose WebView shouldn't reflow mid-proof). Drag the grab handle to resize.
 */
export function LogDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  // `committed` is the height between drags (updated on release); `height` is the
  // live Animated value driven during a drag (so dragging doesn't re-render).
  const [committed, setCommitted] = useState(DEFAULT_H);
  const height = useMemo(() => new Animated.Value(DEFAULT_H), []);

  // Only the grab handle drives resize, so the list inside still scrolls freely.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 2,
        onPanResponderMove: (_, g) => height.setValue(clamp(committed - g.dy)),
        // Commit on both release and terminate so committed/height never desync
        // (a terminated drag would otherwise leave them mismatched → next-drag jump).
        onPanResponderRelease: (_, g) => setCommitted(clamp(committed - g.dy)),
        onPanResponderTerminate: (_, g) => setCommitted(clamp(committed - g.dy)),
      }),
    [committed, height],
  );

  if (!visible) return null;

  return (
    <Animated.View style={[styles.drawer, { height }]}>
      <View style={styles.handleArea} {...pan.panHandlers}>
        <View style={styles.grabber} />
      </View>
      <View style={styles.header}>
        <Text style={styles.title}>Logs</Text>
        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>
      <LogList style={styles.list} />
      {insets.bottom > 0 ? (
        <View style={{ height: insets.bottom, backgroundColor: '#0f1115' }} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0f1115',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 12,
  },
  handleArea: {
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#1b1f27',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4b5563',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#1b1f27',
  },
  title: {
    color: '#e6e9ef',
    fontWeight: '700',
    fontSize: 14,
  },
  close: {
    color: '#3b82f6',
    fontWeight: '600',
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
});
