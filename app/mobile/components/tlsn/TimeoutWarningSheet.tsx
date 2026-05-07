import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BottomSheetCard } from './BottomSheetCard';

interface TimeoutWarningSheetProps {
  visible: boolean;
  /** Initial time remaining (ms) when the warning fires. The sheet ticks down on its own. */
  initialRemainingMs: number;
  onExtend: () => void;
  onDismiss: () => void;
}

/**
 * Bottom-sheet warning shown ~60s before plugin deadline. Two buttons:
 * "Extend 5 minutes" or "Exit now". Non-dismissable — user must choose.
 */
export function TimeoutWarningSheet({
  visible,
  initialRemainingMs,
  onExtend,
  onDismiss,
}: TimeoutWarningSheetProps) {
  const [remainingMs, setRemainingMs] = useState(initialRemainingMs);

  useEffect(() => {
    if (!visible) return;
    setRemainingMs(initialRemainingMs);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      setRemainingMs(Math.max(0, initialRemainingMs - elapsed));
    }, 500);
    return () => clearInterval(id);
  }, [visible, initialRemainingMs]);

  const seconds = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  const display = mm > 0 ? `${mm}:${ss.toString().padStart(2, '0')}` : `${ss}s`;

  return (
    <BottomSheetCard visible={visible} dismissible={false}>
      <View style={styles.body}>
        <Text style={styles.icon}>⏱️</Text>
        <Text style={styles.title}>Plugin timeout warning</Text>
        <Text style={styles.subtitle}>
          This plugin will be terminated in
          <Text style={styles.countdown}> {display}</Text>
          {'.'}
        </Text>
        <Text style={styles.hint}>
          Extend the timeout to keep working, or exit now.
        </Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonDismiss]}
          onPress={onDismiss}
        >
          <Text style={[styles.buttonText, styles.buttonTextDismiss]}>Exit now</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonExtend]}
          onPress={onExtend}
        >
          <Text style={[styles.buttonText, styles.buttonTextExtend]}>
            Extend 5 minutes
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheetCard>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', paddingTop: 8, paddingBottom: 8 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
  },
  countdown: { fontWeight: '700', color: '#b91c1c' },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'column',
    paddingTop: 16,
    gap: 8,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonDismiss: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  buttonTextDismiss: { color: '#374151' },
  buttonExtend: { backgroundColor: '#2563eb' },
  buttonTextExtend: { color: '#ffffff' },
});
