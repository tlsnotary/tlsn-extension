import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  Share,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import {
  subscribe,
  getLogs,
  clearLogs,
  formatLogs,
  type LogEntry,
  type LogLevel,
} from '@/lib/logStore';

type Filter = 'all' | LogLevel;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'debug', label: 'Debug' },
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warn' },
  { key: 'error', label: 'Error' },
];

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '#8a8f98',
  info: '#2563eb',
  warn: '#b45309',
  error: '#dc2626',
};

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

function LogRow({ entry }: { entry: LogEntry }) {
  const color = LEVEL_COLOR[entry.level];
  return (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <View style={styles.rowHeader}>
        <Text style={[styles.level, { color }]}>{entry.level.toUpperCase()}</Text>
        {entry.source === 'native' && <Text style={styles.nativeBadge}>native</Text>}
        {entry.tag ? <Text style={styles.tag}>{entry.tag}</Text> : null}
      </View>
      <Text style={styles.message} selectable>
        {entry.text}
      </Text>
    </View>
  );
}

/**
 * Reusable log viewer backed by `logStore`: level-filter chips, Share, Clear,
 * and an inverted (newest-at-bottom) list. Used by both the full Logs screen
 * and the in-proof log drawer.
 */
export function LogList({ style }: { style?: StyleProp<ViewStyle> }) {
  // Third arg (getServerSnapshot) is required for web static rendering
  // (expo.web.output: "static"); getLogs returns a stable, env-agnostic snapshot.
  const logs = useSyncExternalStore(subscribe, getLogs, getLogs);
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(
    () => (filter === 'all' ? logs : logs.filter((l) => l.level === filter)),
    [logs, filter],
  );

  // Inverted list (newest at the bottom, auto-pinned, scroll up for history), so
  // the data is newest-first. This avoids any scrollToEnd loop.
  const inverted = useMemo(() => filtered.slice().reverse(), [filtered]);

  const handleShare = async () => {
    if (filtered.length === 0) return;
    try {
      await Share.share({ message: formatLogs(filtered) });
    } catch {
      // user dismissed share sheet — nothing to do
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.toolbar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleShare}
            activeOpacity={0.7}
            accessibilityLabel="Share logs"
          >
            <FontAwesome name="share-square-o" size={18} color="#c9ced8" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={clearLogs}
            activeOpacity={0.7}
            accessibilityLabel="Clear logs"
          >
            <FontAwesome name="trash-o" size={18} color="#c9ced8" />
          </TouchableOpacity>
        </View>
      </View>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No logs yet.</Text>
          <Text style={styles.emptyHint}>Run a plugin to capture proving logs here.</Text>
        </View>
      ) : (
        <FlatList
          inverted
          data={inverted}
          keyExtractor={(e) => String(e.id)}
          renderItem={({ item }) => <LogRow entry={item} />}
          contentContainerStyle={styles.listContent}
          initialNumToRender={30}
          windowSize={11}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1b1f27',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2c313c',
  },
  filterScroll: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#2c313c',
  },
  chipActive: {
    backgroundColor: '#3b82f6',
  },
  chipText: {
    fontSize: 12,
    color: '#c9ced8',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
  },
  iconButton: {
    padding: 6,
  },
  listContent: {
    paddingVertical: 6,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderLeftWidth: 3,
    marginHorizontal: 8,
    marginVertical: 2,
    backgroundColor: '#161a21',
    borderRadius: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  level: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  nativeBadge: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0f1115',
    backgroundColor: '#a3e635',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tag: {
    fontSize: 11,
    color: '#9aa3b2',
    fontFamily: MONO,
  },
  message: {
    fontSize: 12,
    color: '#e6e9ef',
    fontFamily: MONO,
    lineHeight: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#c9ced8',
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyHint: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
});
