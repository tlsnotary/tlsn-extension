import { useState, useEffect, useCallback, useRef } from 'react';
import { SystemChecks } from './components/SystemChecks';
import { ConsoleOutput, ConsoleActions } from './components/Console';
import { PluginButtons } from './components/PluginButtons';
import { StatusBar } from './components/StatusBar';
import { CollapsibleSection } from './components/CollapsibleSection';
import { HowItWorks } from './components/HowItWorks';
import { WhatAndWhy } from './components/WhatAndWhy';
import { WhyPlugins } from './components/WhyPlugins';
import { BuildYourOwn } from './components/BuildYourOwn';
import { OnchainDemo } from './components/OnchainDemo';
import { ModeComparison, CompareDurations } from './components/ModeComparison';
import { plugins } from './plugins';
import {
  checkBrowserCompatibility,
  checkExtension,
  checkVerifier,
  formatTimestamp,
  ExtensionStatus,
} from './utils';
import { MIN_EXTENSION_VERSION } from './config';
import { ConsoleEntry, CheckStatus, PluginResult as PluginResultType, ProgressData } from './types';
import {
  trackBrowserCheck,
  trackExtensionCheck,
  trackVerifierCheck,
  trackAllChecksPass,
  trackRecheck,
  trackPluginStarted,
  trackPluginSuccess,
  trackPluginError,
  trackOutboundClick,
} from './analytics';
import './App.css';

interface PluginResultData {
  resultHtml: string;
  debugJson: string;
  isError?: boolean;
}

export function App() {
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    {
      timestamp: formatTimestamp(),
      message:
        '💡 TLSNotary proving logs will appear here in real-time. You can also view them in the extension console by clicking "View Extension Logs" above.',
      type: 'info',
    },
  ]);

  const [browserCheck, setBrowserCheck] = useState<{ status: CheckStatus; message: string }>({
    status: 'checking',
    message: 'Checking...',
  });

  const [extensionCheck, setExtensionCheck] = useState<{
    status: CheckStatus;
    message: string;
    extStatus: ExtensionStatus;
    version?: string;
  }>({
    status: 'checking',
    message: 'Checking...',
    extStatus: 'missing',
  });

  const [verifierCheck, setVerifierCheck] = useState<{
    status: CheckStatus;
    message: string;
    showInstructions: boolean;
  }>({
    status: 'checking',
    message: 'Checking...',
    showInstructions: false,
  });

  const [showBrowserWarning, setShowBrowserWarning] = useState(false);
  const [allChecksPass, setAllChecksPass] = useState(false);
  const [runningPlugins, setRunningPlugins] = useState<Set<string>>(new Set());
  const [pluginResults, setPluginResults] = useState<Record<string, PluginResultData>>({});
  const [pluginProgress, setPluginProgress] = useState<Record<string, ProgressData>>({});
  const [proverMode, setProverMode] = useState<'Mpc' | 'Proxy'>('Mpc');
  const [consoleExpanded, setConsoleExpanded] = useState(false);

  // Comparison section state
  const pluginKeys = Object.keys(plugins);
  const [compareSelectedPlugin, setCompareSelectedPlugin] = useState<string>(pluginKeys[0] ?? '');
  const [compareDurations, setCompareDurations] = useState<
    Record<string, CompareDurations | undefined>
  >({});
  const [compareRunningMode, setCompareRunningMode] = useState<'Mpc' | 'Proxy' | null>(null);
  // Track per-requestId t0 (when CONNECTING fires) so COMPLETE can compute prove-only duration.
  const proveStartTimesRef = useRef<Record<string, number>>({});

  const addConsoleEntry = useCallback((message: string, type: ConsoleEntry['type'] = 'info') => {
    setConsoleEntries((prev) => [
      ...prev,
      {
        timestamp: formatTimestamp(),
        message,
        type,
      },
    ]);
  }, []);

  const handleClearConsole = useCallback(() => {
    setConsoleEntries([
      {
        timestamp: formatTimestamp(),
        message: 'Console cleared',
        type: 'info',
      },
      {
        timestamp: formatTimestamp(),
        message: '💡 TLSNotary proving logs will appear here in real-time.',
        type: 'info',
      },
    ]);
  }, []);

  const handleOpenExtensionLogs = useCallback(() => {
    window.open('chrome://extensions/', '_blank');
    addConsoleEntry(
      'Opening chrome://extensions/ - Find TLSNotary extension → click "service worker" → find "offscreen.html" → click "inspect"',
      'info',
    );
  }, [addConsoleEntry]);

  const runAllChecks = useCallback(async () => {
    // Browser check
    const browserOk = checkBrowserCompatibility();
    trackBrowserCheck(browserOk);
    if (browserOk) {
      setBrowserCheck({ status: 'success', message: '✅ Chrome-based browser detected' });
      setShowBrowserWarning(false);
    } else {
      setBrowserCheck({ status: 'error', message: '❌ Unsupported browser' });
      setShowBrowserWarning(true);
      setAllChecksPass(false);
      trackAllChecksPass(false);
      return;
    }

    // Extension check
    const extResult = await checkExtension();
    trackExtensionCheck(extResult.status, extResult.version);
    const extensionOk = extResult.status === 'ok';
    if (extResult.status === 'ok') {
      setExtensionCheck({
        status: 'success',
        message: `✅ Extension installed (v${extResult.version})`,
        extStatus: 'ok',
        version: extResult.version,
      });
    } else if (extResult.status === 'outdated') {
      setExtensionCheck({
        status: 'error',
        message: extResult.version
          ? `⚠️ Extension v${extResult.version} is outdated (requires ≥ ${extResult.minVersion})`
          : `⚠️ Extension is outdated (requires ≥ ${extResult.minVersion})`,
        extStatus: 'outdated',
        version: extResult.version,
      });
    } else {
      setExtensionCheck({
        status: 'error',
        message: '❌ Extension not found',
        extStatus: 'missing',
      });
    }

    // Verifier check
    const verifierOk = await checkVerifier();
    trackVerifierCheck(verifierOk);
    if (verifierOk) {
      setVerifierCheck({
        status: 'success',
        message: '✅ Verifier running',
        showInstructions: false,
      });
    } else {
      setVerifierCheck({
        status: 'error',
        message: '❌ Verifier not running',
        showInstructions: true,
      });
    }

    const allPass = extensionOk && verifierOk;
    setAllChecksPass(allPass);
    trackAllChecksPass(allPass);
  }, []);

  const handleRecheck = useCallback(async () => {
    trackRecheck();
    // Recheck extension
    setExtensionCheck({ status: 'checking', message: 'Checking...', extStatus: 'missing' });
    const extResult = await checkExtension();
    trackExtensionCheck(extResult.status, extResult.version);
    const extensionOk = extResult.status === 'ok';
    if (extResult.status === 'ok') {
      setExtensionCheck({
        status: 'success',
        message: `✅ Extension installed (v${extResult.version})`,
        extStatus: 'ok',
        version: extResult.version,
      });
    } else if (extResult.status === 'outdated') {
      setExtensionCheck({
        status: 'error',
        message: extResult.version
          ? `⚠️ Extension v${extResult.version} is outdated (requires ≥ ${extResult.minVersion})`
          : `⚠️ Extension is outdated (requires ≥ ${extResult.minVersion})`,
        extStatus: 'outdated',
        version: extResult.version,
      });
    } else {
      setExtensionCheck({
        status: 'error',
        message: '❌ Extension not found',
        extStatus: 'missing',
      });
    }

    // Recheck verifier
    setVerifierCheck({ status: 'checking', message: 'Checking...', showInstructions: false });
    const verifierOk = await checkVerifier();
    trackVerifierCheck(verifierOk);
    if (verifierOk) {
      setVerifierCheck({
        status: 'success',
        message: '✅ Verifier running',
        showInstructions: false,
      });
    } else {
      setVerifierCheck({
        status: 'error',
        message: '❌ Verifier not running',
        showInstructions: true,
      });
    }

    const allPass = extensionOk && verifierOk;
    setAllChecksPass(allPass);
    trackAllChecksPass(allPass);
  }, []);

  const handleRunCompare = useCallback(
    async (mode: 'Mpc' | 'Proxy') => {
      const pluginKey = compareSelectedPlugin;
      const plugin = plugins[pluginKey];
      if (!plugin) return;

      const requestId = `compare_${mode}_${pluginKey}_${Date.now()}`;
      setCompareRunningMode(mode);
      setConsoleExpanded(true);

      trackPluginStarted(plugin.name);

      try {
        const pluginCode = await fetch(plugin.file).then((r) => r.text());
        addConsoleEntry(`Running ${plugin.name} in ${mode} mode (comparison)…`, 'info');
        await window.tlsn!.execCode(pluginCode, {
          requestId,
          sessionData: { mode },
        });
        addConsoleEntry(`✅ ${plugin.name} (${mode}) comparison run complete`, 'success');
        // Duration is recorded by the TLSN_PROVE_PROGRESS listener below.
      } catch (err) {
        console.error(err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        trackPluginError(plugin.name, errorMsg);
        addConsoleEntry(`❌ Comparison error (${mode}): ${errorMsg}`, 'error');
      } finally {
        setCompareRunningMode(null);
        delete proveStartTimesRef.current[requestId];
      }
    },
    [addConsoleEntry, compareSelectedPlugin],
  );

  const handleRunPlugin = useCallback(
    async (pluginKey: string) => {
      const plugin = plugins[pluginKey];
      if (!plugin) return;

      const requestId = `plugin_${pluginKey}_${Date.now()}`;
      setRunningPlugins((prev) => new Set(prev).add(pluginKey));
      setPluginProgress((prev) => ({
        ...prev,
        [pluginKey]: {
          step: 'STARTING',
          progress: 0,
          message: 'Please continue in the TLSNotary popup',
        },
      }));
      setConsoleExpanded(true);

      trackPluginStarted(plugin.name);

      try {
        const startTime = performance.now();
        const pluginCode = await fetch(plugin.file).then((r) => r.text());

        addConsoleEntry(`Running ${plugin.name} in ${proverMode} mode...`, 'info');
        const result = await window.tlsn!.execCode(pluginCode, {
          requestId,
          sessionData: { mode: proverMode },
        });
        const durationMs = performance.now() - startTime;
        const executionTime = durationMs.toFixed(2);

        const json: PluginResultType = JSON.parse(result);

        setPluginResults((prev) => ({
          ...prev,
          [pluginKey]: {
            resultHtml: plugin.parseResult(json),
            debugJson: JSON.stringify(json.results, null, 2),
          },
        }));

        trackPluginSuccess(plugin.name, durationMs);
        addConsoleEntry(
          `✅ ${plugin.name} completed successfully in ${executionTime}ms`,
          'success',
        );
      } catch (err) {
        console.error(err);
        const errorMsg = err instanceof Error ? err.message : String(err);
        trackPluginError(plugin.name, errorMsg);
        addConsoleEntry(`❌ Error: ${errorMsg}`, 'error');

        setPluginResults((prev) => ({
          ...prev,
          [pluginKey]: {
            resultHtml: errorMsg,
            debugJson: '',
            isError: true,
          },
        }));
      } finally {
        setRunningPlugins((prev) => {
          const newSet = new Set(prev);
          newSet.delete(pluginKey);
          return newSet;
        });
        setPluginProgress((prev) => {
          const next = { ...prev };
          delete next[pluginKey];
          return next;
        });
      }
    },
    [addConsoleEntry, proverMode],
  );

  // Listen for tlsn_loaded event
  useEffect(() => {
    const handleTlsnLoaded = () => {
      console.log('TLSNotary client loaded');
      addConsoleEntry('TLSNotary client loaded', 'success');
    };

    window.addEventListener('tlsn_loaded', handleTlsnLoaded);
    return () => window.removeEventListener('tlsn_loaded', handleTlsnLoaded);
  }, [addConsoleEntry]);

  // Listen for offscreen logs and progress events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'TLSN_OFFSCREEN_LOG') {
        addConsoleEntry(event.data.message, event.data.level);
      }

      if (event.data?.type === 'TLSN_PROVE_PROGRESS') {
        const { requestId, step, progress, message } = event.data;

        // Track prove-only duration via the lifecycle bookends.
        // CONNECTING is the first emit of the prove pipeline; COMPLETE is the last.
        // Measuring between them gives the proving time alone, excluding any
        // in-plugin user interaction that may precede the prove() call.
        if (typeof requestId === 'string') {
          if (step === 'CONNECTING') {
            proveStartTimesRef.current[requestId] = performance.now();
          } else if (step === 'COMPLETE') {
            const t0 = proveStartTimesRef.current[requestId];
            if (t0 !== undefined) {
              const durationMs = performance.now() - t0;
              const compareMatch = requestId.match(/^compare_(Mpc|Proxy)_(.+)_\d+$/);
              if (compareMatch) {
                const mode = compareMatch[1] as 'Mpc' | 'Proxy';
                const pluginKey = compareMatch[2];
                setCompareDurations((prev) => ({
                  ...prev,
                  [pluginKey]: { ...prev[pluginKey], [mode]: durationMs },
                }));
              }
            }
          }
        }

        // Extract pluginKey from requestId (format: plugin_<key>_<timestamp>)
        const match = requestId?.match(/^plugin_(.+)_\d+$/);
        if (match) {
          const pluginKey = match[1];
          setPluginProgress((prev) => ({ ...prev, [pluginKey]: { step, progress, message } }));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [addConsoleEntry]);

  // Run checks on mount
  useEffect(() => {
    addConsoleEntry('TLSNotary Plugin Demo initialized', 'success');
    setTimeout(() => {
      runAllChecks();
    }, 500);
  }, [runAllChecks, addConsoleEntry]);

  return (
    <div className="app-container">
      <div className="hero-section">
        <h1 className="hero-title">Prove anything from the web. Privacy on your terms.</h1>
        <p className="hero-subtitle">
          TLSNotary lets users prove facts from any HTTPS site, like a bank balance, a paid
          subscription, or an age. They share only the fields the plugin discloses, or use
          zero-knowledge proofs to prove a fact without revealing any data.
        </p>
        <div className="hero-ctas">
          <a href="#what-and-why" className="hero-cta hero-cta-secondary">
            How it works →
          </a>
          <a href="#try-it" className="hero-cta hero-cta-secondary">
            Try a plugin →
          </a>
          <a href="#onchain-demo" className="hero-cta hero-cta-secondary">
            Onchain demo →
          </a>
          <a href="#build-your-own" className="hero-cta hero-cta-secondary">
            Build your own →
          </a>
        </div>
      </div>

      <WhatAndWhy />

      <HowItWorks />

      <StatusBar
        browserOk={browserCheck.status === 'success'}
        extensionStatus={extensionCheck.extStatus}
        extensionVersion={extensionCheck.version}
        minExtensionVersion={MIN_EXTENSION_VERSION}
        verifierOk={verifierCheck.status === 'success'}
        onRecheck={handleRecheck}
        detailsContent={
          <SystemChecks
            checks={{
              browser: browserCheck,
              extension: extensionCheck,
              verifier: verifierCheck,
            }}
            onRecheck={handleRecheck}
            showBrowserWarning={showBrowserWarning}
          />
        }
      />

      <div id="try-it" className="content-card">
        <h2 className="section-title">Try It: Demo Plugins</h2>
        <p className="section-subtitle">
          Run a plugin to see TLSNotary in action. Click "View Source" to see how each plugin works.
        </p>

        {!allChecksPass && (
          <div className="alert-box">
            <span className="alert-icon">ℹ️</span>
            <span>Complete system setup above to run plugins</span>
          </div>
        )}

        <PluginButtons
          plugins={plugins}
          runningPlugins={runningPlugins}
          pluginResults={pluginResults}
          pluginProgress={pluginProgress}
          allChecksPass={allChecksPass}
          onRunPlugin={handleRunPlugin}
        />

        <div className="mode-toggle mode-toggle--footer">
          <span className="mode-toggle-label">Protocol Mode:</span>
          <div className="mode-toggle-buttons">
            <button
              className={`mode-toggle-btn ${proverMode === 'Mpc' ? 'active' : ''}`}
              onClick={() => setProverMode('Mpc')}
            >
              MPC
            </button>
            <button
              className={`mode-toggle-btn ${proverMode === 'Proxy' ? 'active' : ''}`}
              onClick={() => setProverMode('Proxy')}
            >
              Proxy
            </button>
          </div>
        </div>
      </div>

      <ModeComparison
        plugins={plugins}
        selectedPlugin={compareSelectedPlugin}
        onSelectPlugin={setCompareSelectedPlugin}
        durations={compareDurations[compareSelectedPlugin] ?? {}}
        runningMode={compareRunningMode}
        allChecksPass={allChecksPass}
        onRun={handleRunCompare}
      />

      <OnchainDemo allChecksPass={allChecksPass} addConsoleEntry={addConsoleEntry} />

      <WhyPlugins />

      <BuildYourOwn />

      <CollapsibleSection
        title="Console Output"
        className="console-collapsible"
        expanded={consoleExpanded}
        onToggle={setConsoleExpanded}
        actions={
          <ConsoleActions
            onClear={handleClearConsole}
            onOpenExtensionLogs={handleOpenExtensionLogs}
          />
        }
      >
        <ConsoleOutput entries={consoleEntries} />
      </CollapsibleSection>

      <footer className="app-footer">
        <div className="app-footer-row">
          <a
            href="https://github.com/tlsnotary/tlsn-extension/tree/main/packages/demo"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
            onClick={() => trackOutboundClick('github')}
          >
            View source on GitHub
          </a>
          <span className="footer-version">{__GIT_COMMIT_HASH__}</span>
        </div>
        <span className="footer-analytics">
          This site collects anonymous usage statistics to improve the demo.
          <br />
          No cookies are used and no personal data is logged.{' '}
          <a
            href="https://github.com/tlsnotary/tlsn-extension/blob/main/packages/demo/src/analytics.ts"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackOutboundClick('analytics_source')}
          >
            See what we track.
          </a>
        </span>
      </footer>
    </div>
  );
}

declare const __GIT_COMMIT_HASH__: string;
