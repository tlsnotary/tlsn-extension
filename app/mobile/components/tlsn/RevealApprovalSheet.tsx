import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { RevealRangeDescriptor } from '../../modules/tlsn-native/src';
import { BottomSheetCard } from './BottomSheetCard';

export type { RevealRangeDescriptor };

interface RevealApprovalSheetProps {
  visible: boolean;
  descriptors: RevealRangeDescriptor[];
  onApprove: () => void;
  onReject: () => void;
}

const PREVIEW_MAX = 256;

/**
 * Bottom-sheet shown after `compute_reveal` runs natively but before the
 * verifier receives reveal data. The user sees a per-range preview of what's
 * about to be revealed (real bytes) and approves or rejects.
 *
 * Backdrop tap or "Reject" both reject the gate.
 */
export function RevealApprovalSheet({
  visible,
  descriptors,
  onApprove,
  onReject,
}: RevealApprovalSheetProps) {
  const sent = descriptors.filter((d) => d.direction === 'SENT');
  const recv = descriptors.filter((d) => d.direction === 'RECV');

  return (
    <BottomSheetCard visible={visible} onClose={onReject} dismissible>
      <Text style={styles.title}>Approve reveal to verifier</Text>
      <Text style={styles.subtitle}>
        Review what's about to be sent. Anything not listed stays private.
      </Text>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {sent.length > 0 ? <DescriptorSection label="Sent" items={sent} /> : null}
        {recv.length > 0 ? <DescriptorSection label="Received" items={recv} /> : null}
        {descriptors.length === 0 ? (
          <Text style={styles.empty}>No data will be revealed.</Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.button, styles.buttonReject]}
          onPress={onReject}
        >
          <Text style={[styles.buttonText, styles.buttonTextReject]}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.buttonApprove]}
          onPress={onApprove}
        >
          <Text style={[styles.buttonText, styles.buttonTextApprove]}>Approve</Text>
        </TouchableOpacity>
      </View>
    </BottomSheetCard>
  );
}

function DescriptorSection({
  label,
  items,
}: {
  label: string;
  items: RevealRangeDescriptor[];
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {items.map((item, idx) => (
        <DescriptorRow key={`${label}-${idx}`} descriptor={item} />
      ))}
    </View>
  );
}

function DescriptorRow({ descriptor }: { descriptor: RevealRangeDescriptor }) {
  const isReveal = descriptor.action === 'REVEAL';
  const preview =
    descriptor.preview.length > PREVIEW_MAX
      ? descriptor.preview.slice(0, PREVIEW_MAX) + '…'
      : descriptor.preview;

  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text style={styles.rowLabel}>{descriptor.label}</Text>
        <View
          style={[
            styles.badge,
            isReveal ? styles.badgeReveal : styles.badgeHash,
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              isReveal ? styles.badgeTextReveal : styles.badgeTextHash,
            ]}
          >
            {isReveal ? 'REVEAL' : `HASH${descriptor.algorithm ? ' • ' + descriptor.algorithm : ''}`}
          </Text>
        </View>
      </View>
      <Text
        style={[styles.preview, !isReveal && styles.previewHashed]}
        numberOfLines={4}
      >
        {preview}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
    marginBottom: 8,
  },
  scroll: { maxHeight: 380 },
  scrollContent: { paddingVertical: 8 },
  section: { marginTop: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowLabel: { fontSize: 13, fontWeight: '600', color: '#374151', flex: 1 },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  badgeReveal: { backgroundColor: '#d1fae5' },
  badgeHash: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  badgeTextReveal: { color: '#065f46' },
  badgeTextHash: { color: '#92400e' },
  preview: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    color: '#1f2937',
    lineHeight: 16,
  },
  previewHashed: { color: '#9ca3af', fontStyle: 'italic' },
  empty: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    paddingTop: 16,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  buttonReject: { backgroundColor: '#fee2e2' },
  buttonTextReject: { color: '#991b1b' },
  buttonApprove: { backgroundColor: '#d1fae5' },
  buttonTextApprove: { color: '#065f46' },
});
