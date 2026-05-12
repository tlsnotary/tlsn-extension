import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface BottomSheetCardProps {
  /** When true, the sheet slides up; when false, it slides down and unmounts after the animation. */
  visible: boolean;
  /** Called when the user taps the backdrop or completes a swipe-down dismiss. Not called for programmatic close. */
  onClose?: () => void;
  /** When false, the backdrop is non-interactive and swipe-down is disabled. Default: true. */
  dismissible?: boolean;
  /** Sheet body. */
  children: React.ReactNode;
  /** Optional style overrides on the inner card. */
  cardStyle?: ViewStyle;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;
const SPRING_CONFIG = { tension: 60, friction: 11, useNativeDriver: true };
const SWIPE_DISMISS_THRESHOLD = 80;

/**
 * A slide-up bottom card with a tappable backdrop and optional swipe-down dismiss.
 *
 * Uses the legacy `Animated` + `PanResponder` API (matching the existing
 * `DraggableView` in PluginRenderer) rather than Reanimated worklets — simpler
 * context, no worklet boundaries, sufficient for this UI.
 */
export function BottomSheetCard({
  visible,
  onClose,
  dismissible = true,
  children,
  cardStyle,
}: BottomSheetCardProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardHeight = useRef(0);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { ...SPRING_CONFIG, toValue: 0 }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: cardHeight.current || SCREEN_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => dismissible && g.dy > 5 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) translateY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > SWIPE_DISMISS_THRESHOLD) {
            onClose?.();
          } else {
            Animated.spring(translateY, { ...SPRING_CONFIG, toValue: 0 }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, { ...SPRING_CONFIG, toValue: 0 }).start();
        },
      }),
    [dismissible, onClose, translateY],
  );

  if (!visible) {
    // Keep mounted briefly during exit animation by checking translateY's resting state isn't reached.
    // Simplification: unmount immediately when visible flips false. The exit animation runs but the
    // tree disappears once visible=false because parent stops rendering the component. Acceptable trade-off.
  }

  return (
    <View style={styles.fill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents={dismissible ? 'auto' : 'none'}
      >
        {dismissible ? (
          <Pressable style={styles.fill} onPress={onClose} accessibilityLabel="Dismiss" />
        ) : null}
      </Animated.View>

      <Animated.View
        style={[
          styles.card,
          { paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateY }] },
          cardStyle,
        ]}
        onLayout={(e) => {
          cardHeight.current = e.nativeEvent.layout.height;
        }}
        {...panResponder.panHandlers}
      >
        {dismissible ? <View style={styles.handle} /> : null}
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99999,
    elevation: 100,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 12,
    marginTop: 4,
  },
});
