import { CheckResult, SystemCheck } from '../types';
import { config } from './config';

export const checkBrowserCompatibility = (): boolean => {
  const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
  const isEdge = /Edg/.test(navigator.userAgent);
  const isBrave = navigator.brave && typeof navigator.brave.isBrave === 'function';
  const isChromium = /Chromium/.test(navigator.userAgent);

  return isChrome || isEdge || isBrave || isChromium;
};

export const checkExtension = async (): Promise<boolean> => {
  // Wait a bit for extension to load
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return typeof window.tlsn !== 'undefined';
};

export const checkVerifier = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${config.verifierUrl}/health`);
    if (response.ok) {
      const text = await response.text();
      return text === 'ok';
    }
    return false;
  } catch {
    return false;
  }
};

export const performSystemChecks = async (): Promise<CheckResult> => {
  const [browserCompatible, extensionReady, verifierReady] = await Promise.all([
    Promise.resolve(checkBrowserCompatibility()),
    checkExtension(),
    checkVerifier(),
  ]);

  return {
    browserCompatible,
    extensionReady,
    verifierReady,
  };
};

export const getSystemCheckStatus = (checkResult: CheckResult): SystemCheck[] => {
  return [
    {
      name: 'Browser Compatibility',
      status: checkResult.browserCompatible ? 'success' : 'error',
      message: checkResult.browserCompatible
        ? 'Chrome-based browser detected'
        : 'Please use a Chrome-based browser (Chrome, Edge, Brave, etc.)',
    },
    {
      name: 'TLSNotary Extension',
      status: checkResult.extensionReady ? 'success' : 'error',
      message: checkResult.extensionReady
        ? 'Extension installed and ready'
        : 'Extension not found. Please install and load the extension.',
    },
    {
      name: 'Verifier Server',
      status: checkResult.verifierReady ? 'success' : 'error',
      message: checkResult.verifierReady
        ? `Verifier server running on ${config.verifierUrl}`
        : 'Verifier server not responding. Please start the verifier server.',
    },
  ];
};
