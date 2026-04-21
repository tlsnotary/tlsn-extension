import { useState, useEffect } from 'react';
import { File, Paths } from 'expo-file-system/next';

const configFile = new File(Paths.document, 'verifier-config.json');
const DEFAULT_VERIFIER_URL = 'https://demo.tlsnotary.org';

export { DEFAULT_VERIFIER_URL };

export async function getVerifierUrl(): Promise<string> {
  try {
    const exists = configFile.exists;
    if (exists) {
      const content = await configFile.text();
      const config = JSON.parse(content);
      if (config.verifierUrl) {
        console.log('[useVerifierUrl] using override:', config.verifierUrl);
        return config.verifierUrl;
      }
    }
  } catch (err) {
    console.error('[useVerifierUrl] read error:', err);
  }
  return DEFAULT_VERIFIER_URL;
}

export async function setVerifierUrl(url: string | null): Promise<void> {
  console.log('[useVerifierUrl] setVerifierUrl called with:', url);
  if (url) {
    configFile.write(JSON.stringify({ verifierUrl: url }));
    console.log('[useVerifierUrl] wrote file, exists now:', configFile.exists);
  } else {
    try {
      if (configFile.exists) configFile.delete();
      console.log('[useVerifierUrl] deleted file');
    } catch {
      // Ignore
    }
  }
}

export function useVerifierUrl(): { url: string; loading: boolean } {
  const [url, setUrl] = useState(DEFAULT_VERIFIER_URL);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVerifierUrl().then((v) => {
      setUrl(v);
      setLoading(false);
    });
  }, []);

  return { url, loading };
}
