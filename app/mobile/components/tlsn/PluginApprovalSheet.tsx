import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { PluginConfig } from '@tlsn/plugin-sdk';
import { BottomSheetCard } from './BottomSheetCard';

/**
 * Pre-execution approval modes — mirrors the extension's `ApprovalMode`.
 *
 * - `manual`     every prove() call shows the reveal-approval sheet
 * - `all-session` first prove() call shows the sheet; subsequent calls auto-approve
 * - `rejected`   plugin does not run
 */
export type ApprovalMode = 'manual' | 'all-session' | 'rejected';

interface PluginApprovalSheetProps {
  visible: boolean;
  pluginConfig: PluginConfig;
  /** GitHub URL of the plugin's source file, opened in the system browser. */
  sourceUrl?: string;
  onApprove: (mode: 'manual' | 'all-session') => void;
  onReject: () => void;
}

/**
 * Bottom-sheet card shown before a plugin starts running. The user reviews
 * name / description / permissions / source and chooses an approval mode.
 */
export function PluginApprovalSheet({
  visible,
  pluginConfig,
  sourceUrl,
  onApprove,
  onReject,
}: PluginApprovalSheetProps) {
  const requests = pluginConfig.requests ?? [];

  return (
    <BottomSheetCard visible={visible} onClose={onReject} dismissible>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>{pluginConfig.name}</Text>
        {pluginConfig.version || pluginConfig.author ? (
          <Text style={styles.byline}>
            {[pluginConfig.author, pluginConfig.version && `v${pluginConfig.version}`]
              .filter(Boolean)
              .join(' • ')}
          </Text>
        ) : null}
        <Text style={styles.description}>{pluginConfig.description}</Text>

        {requests.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Will request data from</Text>
            {requests.map((r, idx) => (
              <View key={`${r.host}-${idx}`} style={styles.permissionRow}>
                <Text style={styles.method}>{r.method}</Text>
                <Text style={styles.host}>
                  {r.host}
                  <Text style={styles.path}>{r.pathname}</Text>
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {sourceUrl ? (
          <TouchableOpacity style={styles.sourceToggle} onPress={() => Linking.openURL(sourceUrl)}>
            <Text style={styles.sourceToggleText}>View source on GitHub ↗</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.button, styles.buttonReject]} onPress={onReject}>
          <Text style={[styles.buttonText, styles.buttonTextReject]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonManual]}
          onPress={() => onApprove('manual')}
        >
          <Text style={[styles.buttonText, styles.buttonTextManual]}>Approve each reveal</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonAllSession]}
          onPress={() => onApprove('all-session')}
        >
          <Text style={[styles.buttonText, styles.buttonTextAllSession]}>Approve all reveals</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetCard>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 400 },
  scrollContent: { paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827' },
  byline: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  description: {
    fontSize: 15,
    color: '#374151',
    marginTop: 12,
    lineHeight: 21,
  },
  section: { marginTop: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  method: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1e40af',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
    minWidth: 44,
    textAlign: 'center',
  },
  host: { fontSize: 13, color: '#111827', flex: 1 },
  path: { color: '#6b7280' },
  sourceToggle: { marginTop: 16, paddingVertical: 6 },
  sourceToggleText: { fontSize: 14, color: '#2563eb', fontWeight: '500' },
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
  buttonReject: { backgroundColor: '#fee2e2' },
  buttonTextReject: { color: '#991b1b' },
  buttonManual: { backgroundColor: '#dbeafe' },
  buttonTextManual: { color: '#1e40af' },
  buttonAllSession: { backgroundColor: '#d1fae5' },
  buttonTextAllSession: { color: '#065f46' },
});
