import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SpotifyWebView, NativeProver, NativeProverHandle, Handler } from '@/components/tlsn';

const SPOTIFY_API = 'api.spotify.com';
const TOP_ARTIST_PATH = '/v1/me/top/artists?time_range=medium_term&limit=1';

export default function SpotifyProverScreen() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isProving, setIsProving] = useState(false);
  const [proofResult, setProofResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [proverReady, setProverReady] = useState(false);
  const proverRef = useRef<NativeProverHandle>(null);

  const handleAuthToken = (token: string) => {
    console.log('[App] Auth token captured');
    setAuthToken(token);
    setError(null);
  };

  const handleGenerateProof = async () => {
    if (!authToken || !proverRef.current?.isReady) {
      setError('Prover not ready or no auth token');
      return;
    }

    setIsProving(true);
    setError(null);
    setProofResult(null);

    try {
      // Handlers for selective disclosure
      // No SENT handlers = fully redact the request
      // Only reveal specific parts of the response
      const handlers: Handler[] = [
        { handlerType: 'Recv', part: 'StartLine', action: 'Reveal' },
        { handlerType: 'Recv', part: 'Headers', action: 'Reveal', params: { key: 'date' } },
        // Reveal full body for now to test redaction is working
        { handlerType: 'Recv', part: 'Body', action: 'Reveal' },
      ];

      const result = await proverRef.current.prove({
        url: `https://${SPOTIFY_API}${TOP_ARTIST_PATH}`,
        method: 'GET',
        headers: {
          authorization: authToken,
          Host: SPOTIFY_API,
          'Accept-Encoding': 'identity',
          Connection: 'close',
        },
        proverOptions: {
          verifierUrl: 'https://demo.tlsnotary.org',
          proxyUrl: `wss://demo.tlsnotary.org/proxy?token=${SPOTIFY_API}`,
          maxRecvData: 2400,
          maxSentData: 600,
          handlers,
        },
      });

      console.log('[App] Proof result:', result);
      setProofResult(result);
    } catch (e) {
      console.error('[App] Proof failed:', e);
      setError(e instanceof Error ? e.message : 'Proof generation failed');
    } finally {
      setIsProving(false);
    }
  };

  const getTopArtistName = () => {
    if (!proofResult?.body?.items?.[0]?.name) {
      return 'Unknown';
    }
    return proofResult.body.items[0].name;
  };

  return (
    <View style={styles.container}>
      {/* Native TLSN prover */}
      <NativeProver
        ref={proverRef}
        onReady={() => {
          console.log('[App] Native prover ready');
          setProverReady(true);
        }}
        onError={(err) => {
          console.error('[App] Native prover error:', err);
          setError(`Prover error: ${err}`);
        }}
      />

      {/* Spotify login WebView */}
      <View style={styles.webviewContainer}>
        <SpotifyWebView onAuthToken={handleAuthToken} />
      </View>

      {/* Bottom card overlay */}
      <View style={styles.bottomCard}>
        <Text style={styles.title}>Spotify Top Artist</Text>

        {/* Status row */}
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, proverReady ? styles.badgeSuccess : styles.badgeLoading]}>
            <Text style={styles.badgeText}>
              {proverReady ? '✓ Prover' : '⏳ Prover'}
            </Text>
          </View>
          <View style={[styles.statusBadge, authToken ? styles.badgeSuccess : styles.badgeWarning]}>
            <Text style={styles.badgeText}>
              {authToken ? '✓ Token' : '⚠ No Token'}
            </Text>
          </View>
        </View>

        {/* Instructions */}
        {!authToken && (
          <Text style={styles.instructions}>
            Login to Spotify above, then browse the Console to trigger an API call.
          </Text>
        )}

        {/* Generate proof button */}
        {authToken && proverReady && (
          <TouchableOpacity
            style={[styles.button, isProving && styles.buttonDisabled]}
            onPress={handleGenerateProof}
            disabled={isProving}
          >
            {isProving ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator color="white" size="small" />
                <Text style={styles.buttonText}>Generating Proof...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Generate Proof</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Error display */}
        {error && (
          <View style={styles.error}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Proof result */}
        {proofResult && (
          <View style={styles.result}>
            <Text style={styles.resultTitle}>Your Top Artist:</Text>
            <Text style={styles.resultValue}>{getTopArtistName()}</Text>
            <Text style={styles.resultProof}>✓ Cryptographically proven</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  webviewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  bottomCard: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1DB954',
    marginBottom: 12,
    textAlign: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeSuccess: {
    backgroundColor: '#d4edda',
  },
  badgeLoading: {
    backgroundColor: '#fff3e0',
  },
  badgeWarning: {
    backgroundColor: '#fff3cd',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  instructions: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#1DB954',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginTop: 12,
    padding: 10,
    backgroundColor: '#f8d7da',
    borderRadius: 8,
  },
  errorText: {
    color: '#721c24',
    textAlign: 'center',
    fontSize: 13,
  },
  result: {
    marginTop: 12,
    padding: 16,
    backgroundColor: '#f0fff4',
    borderRadius: 10,
    alignItems: 'center',
  },
  resultTitle: {
    fontSize: 13,
    color: '#666',
  },
  resultValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1DB954',
    marginVertical: 6,
    textAlign: 'center',
  },
  resultProof: {
    fontSize: 13,
    color: '#28a745',
    fontWeight: '500',
  },
});
