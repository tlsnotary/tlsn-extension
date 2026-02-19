import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { PluginScreen } from '@/components/tlsn';
import { getPluginById } from '../../assets/plugins/registry';

/**
 * Extract all handler result values from the proof result string.
 */
function parseResults(raw: string): { value: string }[] {
  try {
    const json = JSON.parse(raw);
    if (json.results && Array.isArray(json.results)) {
      return json.results;
    }
    if (json.body !== undefined) {
      const body =
        typeof json.body === 'string'
          ? json.body
          : JSON.stringify(json.body, null, 2);
      return [{ value: body }];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Extract the full proven (unredacted) HTTP response from the result.
 */
function extractProvenData(raw: string): string | null {
  try {
    const json = JSON.parse(raw);
    if (json.response) {
      const r = json.response;
      const lines: string[] = [];
      if (r.status) lines.push(`HTTP/1.1 ${r.status}`);
      if (r.headers && Array.isArray(r.headers)) {
        for (const h of r.headers) {
          lines.push(`${h.name}: ${h.value}`);
        }
      }
      if (r.body !== undefined) {
        lines.push('');
        lines.push(
          typeof r.body === 'string'
            ? r.body
            : JSON.stringify(r.body, null, 2),
        );
      }
      return lines.join('\n');
    }
    return null;
  } catch {
    return null;
  }
}

function formatRawData(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function PluginRunnerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const plugin = getPluginById(id);
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);
  const [provenExpanded, setProvenExpanded] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);

  const results = useMemo(() => (result ? parseResults(result) : []), [result]);
  const keyValue = results.length > 0 ? results[results.length - 1].value : null;
  const secondaryResults = results.slice(0, -1);
  const provenData = useMemo(() => (result ? extractProvenData(result) : null), [result]);
  const rawData = useMemo(() => (result ? formatRawData(result) : ''), [result]);

  if (!plugin) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Plugin not found: {id}</Text>
      </View>
    );
  }

  const accent = plugin.accentColor;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: plugin.name,
          headerStyle: { backgroundColor: '#243f5f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
      {result ? (
        <ScrollView
          style={styles.resultScroll}
          contentContainerStyle={styles.resultContent}
        >
          {/* Success header */}
          <View style={[styles.successBanner, { backgroundColor: accent }]}>
            <Text style={styles.bannerLogo}>{plugin.logo}</Text>
            <View style={styles.bannerTextWrap}>
              <Text style={styles.bannerTitle}>{plugin.name}</Text>
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>Verified</Text>
              </View>
            </View>
          </View>

          {/* Key result */}
          <View style={styles.keyResultCard}>
            <Text style={[styles.keyLabel, { color: accent }]}>
              {plugin.resultLabel}
            </Text>
            <Text style={styles.keyValue}>{keyValue}</Text>
          </View>

          {/* Secondary results */}
          {secondaryResults.length > 0 && (
            <View style={styles.secondaryCard}>
              <Text style={styles.secondaryTitle}>Verified Details</Text>
              {secondaryResults.map((r, i) => (
                <View key={i} style={styles.secondaryRow}>
                  <Text style={styles.secondaryValue}>{r.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Proven data toggle */}
          {provenData && (
            <>
              <TouchableOpacity
                style={styles.rawToggle}
                activeOpacity={0.7}
                onPress={() => setProvenExpanded((v) => !v)}
              >
                <Text style={styles.rawToggleText}>
                  {provenExpanded
                    ? '\u25BC  Hide Proven Data'
                    : '\u25B6  Show Proven Data'}
                </Text>
              </TouchableOpacity>

              {provenExpanded && (
                <View style={styles.provenCard}>
                  <Text style={styles.provenCardValue}>{provenData}</Text>
                </View>
              )}
            </>
          )}

          {/* Raw data toggle */}
          <TouchableOpacity
            style={styles.rawToggle}
            activeOpacity={0.7}
            onPress={() => setRawExpanded((v) => !v)}
          >
            <Text style={styles.rawToggleText}>
              {rawExpanded ? '\u25BC  Hide Raw Data' : '\u25B6  Show Raw Data'}
            </Text>
          </TouchableOpacity>

          {rawExpanded && (
            <View style={styles.rawCard}>
              <Text style={styles.rawCardValue}>{rawData}</Text>
            </View>
          )}

          {/* Back */}
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: accent }]}
            activeOpacity={0.7}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Back to Plugins</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <PluginScreen
          pluginCode={plugin.getPluginCode()}
          pluginConfig={plugin.pluginConfig}
          onComplete={(res) => {
            setResult(
              typeof res === 'string' ? res : JSON.stringify(res, null, 2),
            );
          }}
          onError={(err) => {
            Alert.alert('Plugin Error', err.message);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#721c24',
  },
  resultScroll: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  resultContent: {
    paddingBottom: 40,
  },

  /* ---- Success banner ---- */
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  bannerLogo: {
    fontSize: 44,
    marginRight: 16,
  },
  bannerTextWrap: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  verifiedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  verifiedText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },

  /* ---- Key result card ---- */
  keyResultCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  keyLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  keyValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 36,
  },

  /* ---- Secondary results ---- */
  secondaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  secondaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  secondaryRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  secondaryValue: {
    fontSize: 14,
    color: '#444',
    fontFamily: 'Courier',
  },

  /* ---- Proven data ---- */
  provenCard: {
    backgroundColor: '#f8fdf5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d4edda',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 4,
  },
  provenCardValue: {
    fontSize: 12,
    color: '#2d5a1e',
    lineHeight: 18,
    fontFamily: 'Courier',
  },

  /* ---- Raw data ---- */
  rawToggle: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  rawToggleText: {
    fontSize: 14,
    color: '#888',
  },
  rawCard: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 4,
  },
  rawCardValue: {
    fontSize: 11,
    color: '#cdd6f4',
    lineHeight: 17,
    fontFamily: 'Courier',
  },

  /* ---- Back button ---- */
  backButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignSelf: 'center',
    marginTop: 24,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
