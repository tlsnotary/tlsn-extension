import { useState, useEffect } from 'react';
import { File, Paths } from 'expo-file-system/next';
import type { TlsnLogLevel } from '../modules/tlsn-native/src';

const configFile = new File(Paths.document, 'verifier-config.json');
const DEFAULT_VERIFIER_URL = 'https://demo.tlsnotary.org';
const DEFAULT_PROXY_MODE = false;
const DEFAULT_LOG_LEVEL: TlsnLogLevel = 'info';
const LOG_LEVELS: TlsnLogLevel[] = ['info', 'debug', 'trace'];

export { DEFAULT_VERIFIER_URL, DEFAULT_PROXY_MODE, DEFAULT_LOG_LEVEL, LOG_LEVELS };
export type { TlsnLogLevel };

interface Config {
  verifierUrl?: string;
  proxyMode?: boolean;
  logLevel?: TlsnLogLevel;
}

async function loadConfig(): Promise<Config> {
  try {
    if (!configFile.exists) return {};
    const content = await configFile.text();
    return JSON.parse(content) as Config;
  } catch (err) {
    console.error('[useVerifierUrl] read error:', err);
    return {};
  }
}

async function patchConfig(patch: Config): Promise<void> {
  const current = await loadConfig();
  const next = { ...current, ...patch };
  // Drop empty config to keep behavior consistent with the original "delete file on reset".
  const hasAny = Object.values(next).some((v) => v !== undefined && v !== null && v !== '');
  if (!hasAny) {
    if (configFile.exists) configFile.delete();
    return;
  }
  configFile.write(JSON.stringify(next));
}

export async function getVerifierUrl(): Promise<string> {
  const config = await loadConfig();
  if (config.verifierUrl) {
    console.log('[useVerifierUrl] using override:', config.verifierUrl);
    return config.verifierUrl;
  }
  return DEFAULT_VERIFIER_URL;
}

export async function setVerifierUrl(url: string | null): Promise<void> {
  console.log('[useVerifierUrl] setVerifierUrl called with:', url);
  await patchConfig({ verifierUrl: url ?? undefined });
}

export async function getProxyMode(): Promise<boolean> {
  const config = await loadConfig();
  return config.proxyMode ?? DEFAULT_PROXY_MODE;
}

export async function setProxyMode(value: boolean): Promise<void> {
  console.log('[useVerifierUrl] setProxyMode called with:', value);
  await patchConfig({ proxyMode: value });
}

export async function getLogLevel(): Promise<TlsnLogLevel> {
  const config = await loadConfig();
  return config.logLevel ?? DEFAULT_LOG_LEVEL;
}

export async function setLogLevelPref(level: TlsnLogLevel): Promise<void> {
  console.log('[useVerifierUrl] setLogLevelPref called with:', level);
  await patchConfig({ logLevel: level });
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

export function useProxyMode(): { proxyMode: boolean; loading: boolean } {
  const [proxyMode, setProxyModeState] = useState(DEFAULT_PROXY_MODE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProxyMode().then((v) => {
      setProxyModeState(v);
      setLoading(false);
    });
  }, []);

  return { proxyMode, loading };
}
