import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  getVerifierUrl,
  setVerifierUrl,
  getProxyMode,
  setProxyMode,
  getDebugEnabled,
  setDebugEnabled,
  getLogLevel,
  setLogLevelPref,
  DEFAULT_VERIFIER_URL,
  DEFAULT_LOG_LEVEL,
  LOG_LEVELS,
  type TlsnLogLevel,
} from '@/lib/useVerifierUrl';

export default function SettingsScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(false);
  const [proxyMode, setProxyModeState] = useState(false);
  const [debugEnabled, setDebugEnabledState] = useState(false);
  const [logLevel, setLogLevelState] = useState<TlsnLogLevel>(DEFAULT_LOG_LEVEL);
  // Don't let the async initial read clobber a tap that lands before it resolves.
  const logLevelTouched = useRef(false);

  useEffect(() => {
    getVerifierUrl().then(setUrl);
    getProxyMode().then(setProxyModeState);
    getDebugEnabled().then(setDebugEnabledState);
    getLogLevel().then((level) => {
      if (!logLevelTouched.current) setLogLevelState(level);
    });
  }, []);

  const handleToggleProxyMode = async (value: boolean) => {
    setProxyModeState(value);
    await setProxyMode(value);
  };

  const handleToggleDebug = async (value: boolean) => {
    setDebugEnabledState(value);
    await setDebugEnabled(value);
  };

  const handleSelectLogLevel = async (level: TlsnLogLevel) => {
    logLevelTouched.current = true;
    setLogLevelState(level);
    await setLogLevelPref(level);
  };

  const handleSave = async () => {
    const trimmed = url.trim();
    if (trimmed && !trimmed.startsWith('http')) {
      Alert.alert('Invalid URL', 'Verifier URL must start with http:// or https://');
      return;
    }
    await setVerifierUrl(trimmed || null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = async () => {
    setUrl(DEFAULT_VERIFIER_URL);
    await setVerifierUrl(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.label}>Verifier URL</Text>
        <Text style={styles.description}>
          Override the verifier server URL used for proof generation. Leave empty or reset to use
          the default.
        </Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder={DEFAULT_VERIFIER_URL}
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.saveButton} onPress={handleSave} activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>{saved ? 'Saved!' : 'Save'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.resetButton} onPress={handleReset} activeOpacity={0.7}>
            <Text style={styles.resetButtonText}>Reset to Default</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.card, styles.cardSpacing]}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelGroup}>
            <Text style={styles.label}>Proxy mode</Text>
          </View>
          <Switch
            value={proxyMode}
            onValueChange={handleToggleProxyMode}
            trackColor={{ false: '#ddd', true: '#243f5f' }}
          />
        </View>
      </View>

      <View style={[styles.card, styles.cardSpacing]}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabelGroup}>
            <Text style={styles.label}>Debug</Text>
            <Text style={styles.linkDescription}>
              Show prover log detail and a live log drawer while running a plugin.
            </Text>
          </View>
          <Switch
            value={debugEnabled}
            onValueChange={handleToggleDebug}
            trackColor={{ false: '#ddd', true: '#243f5f' }}
          />
        </View>

        {debugEnabled && (
          <>
            <View style={styles.debugDivider} />

            <Text style={styles.label}>Prover verbosity</Text>
            <Text style={styles.description}>
              How much the tlsn prover logs — captures this level and finer detail (not a display
              filter). Use Debug or Trace to diagnose proving failures; applies on the next run.
            </Text>
            <View style={styles.segment}>
              {LOG_LEVELS.map((level) => {
                const active = logLevel === level;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[styles.segmentButton, active && styles.segmentButtonActive]}
                    onPress={() => handleSelectLogLevel(level)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.debugDivider} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => router.push('/logs')}
              activeOpacity={0.7}
            >
              <View style={styles.toggleLabelGroup}>
                <Text style={styles.label}>Logs</Text>
                <Text style={styles.linkDescription}>
                  View app and prover logs. Share them when reporting an issue.
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Default</Text>
        <Text style={styles.infoValue}>{DEFAULT_VERIFIER_URL}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f2f5',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: '#243f5f',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fafafa',
    marginBottom: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#243f5f',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resetButtonText: {
    color: '#666',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 13,
    color: '#444',
    fontFamily: 'Courier',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  toggleLabelGroup: {
    flex: 1,
  },
  cardSpacing: {
    marginTop: 12,
  },
  debugDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  linkDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: '#999',
    fontWeight: '400',
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  segmentButtonActive: {
    backgroundColor: '#243f5f',
    borderColor: '#243f5f',
  },
  segmentText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#fff',
  },
});
