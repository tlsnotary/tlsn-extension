import { useState, useEffect, useCallback } from 'react';
import { SystemChecks } from './components/SystemChecks';
import { ConsoleOutput } from './components/Console';
import { PluginButtons } from './components/PluginButtons';
import { PluginResult } from './components/PluginResult';
import { plugins } from './plugins';
import { checkBrowserCompatibility, checkExtension, checkVerifier, formatTimestamp } from './utils';
import { ConsoleEntry, CheckStatus, PluginResult as PluginResultType } from './types';

interface PluginResultData {
  pluginName: string;
  resultHtml: string;
  debugJson: string;
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

  const [extensionCheck, setExtensionCheck] = useState<{ status: CheckStatus; message: string }>({
    status: 'checking',
    message: 'Checking...',
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
  const [completedPlugins, setCompletedPlugins] = useState<Set<string>>(new Set());
  const [pluginResults, setPluginResults] = useState<PluginResultData[]>([]);

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
      'info'
    );
  }, [addConsoleEntry]);

  const runAllChecks = useCallback(async () => {
    // Browser check
    const browserOk = checkBrowserCompatibility();
    if (browserOk) {
      setBrowserCheck({ status: 'success', message: '✅ Chrome-based browser detected' });
      setShowBrowserWarning(false);
    } else {
      setBrowserCheck({ status: 'error', message: '❌ Unsupported browser' });
      setShowBrowserWarning(true);
      setAllChecksPass(false);
      return;
    }

    // Extension check
    const extensionOk = await checkExtension();
    if (extensionOk) {
      setExtensionCheck({ status: 'success', message: '✅ Extension installed' });
    } else {
      setExtensionCheck({ status: 'error', message: '❌ Extension not found' });
    }

    // Verifier check
    const verifierOk = await checkVerifier();
    if (verifierOk) {
      setVerifierCheck({ status: 'success', message: '✅ Verifier running', showInstructions: false });
    } else {
      setVerifierCheck({ status: 'error', message: '❌ Verifier not running', showInstructions: true });
    }

    setAllChecksPass(extensionOk && verifierOk);
  }, []);

  const handleRecheckVerifier = useCallback(async () => {
    setVerifierCheck({ status: 'checking', message: 'Checking...', showInstructions: false });
    const verifierOk = await checkVerifier();
    if (verifierOk) {
      setVerifierCheck({ status: 'success', message: '✅ Verifier running', showInstructions: false });
      const extensionOk = extensionCheck.status === 'success';
      setAllChecksPass(extensionOk && verifierOk);
    } else {
      setVerifierCheck({ status: 'error', message: '❌ Verifier not running', showInstructions: true });
      setAllChecksPass(false);
    }
  }, [extensionCheck.status]);

  const handleRunPlugin = useCallback(
    async (pluginKey: string) => {
      const plugin = plugins[pluginKey];
      if (!plugin) return;

      setRunningPlugins((prev) => new Set(prev).add(pluginKey));
      addConsoleEntry(`🎬 Starting ${plugin.name} plugin...`, 'info');

      try {
        const startTime = performance.now();
        const pluginCode = await fetch(plugin.file).then((r) => r.text());

        addConsoleEntry('🔧 Executing plugin code...', 'info');
        const result = await window.tlsn!.execCode(pluginCode);
        const executionTime = (performance.now() - startTime).toFixed(2);

        const json: PluginResultType = JSON.parse(result);

        setPluginResults((prev) => [
          ...prev,
          {
            pluginName: plugin.name,
            resultHtml: plugin.parseResult(json),
            debugJson: JSON.stringify(json.results, null, 2),
          },
        ]);

        addConsoleEntry(`✅ ${plugin.name} completed successfully in ${executionTime}ms`, 'success');

        setCompletedPlugins((prev) => new Set(prev).add(pluginKey));
      } catch (err) {
        console.error(err);
        addConsoleEntry(`❌ Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
      } finally {
        setRunningPlugins((prev) => {
          const newSet = new Set(prev);
          newSet.delete(pluginKey);
          return newSet;
        });
      }
    },
    [addConsoleEntry]
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

  // Listen for offscreen logs
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === 'TLSN_OFFSCREEN_LOG') {
        addConsoleEntry(event.data.message, event.data.level);
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
    <div>
      <h1>TLSNotary Plugin Demo</h1>
      <p>This page demonstrates TLSNotary plugins. Choose a plugin to test below.</p>

      <SystemChecks
        checks={{
          browser: browserCheck,
          extension: extensionCheck,
          verifier: verifierCheck,
        }}
        onRecheckVerifier={handleRecheckVerifier}
        showBrowserWarning={showBrowserWarning}
      />

      <div style={{ marginTop: '20px' }}>
        <strong>Steps:</strong>
        <ol>
          <li>Click one of the plugin "Run" buttons below.</li>
          <li>The plugin will open a new browser window with the target website.</li>
          <li>Log in to the website if you are not already logged in.</li>
          <li>A TLSNotary overlay will appear in the bottom right corner.</li>
          <li>
            Click the <strong>Prove</strong> button in the overlay to start the proving process.
          </li>
          <li>
            After successful proving, you can close the browser window and the results will appear on this page.
          </li>
        </ol>
      </div>

      <PluginButtons
        plugins={plugins}
        runningPlugins={runningPlugins}
        completedPlugins={completedPlugins}
        allChecksPass={allChecksPass}
        onRunPlugin={handleRunPlugin}
      />

      <ConsoleOutput
        entries={consoleEntries}
        onClear={handleClearConsole}
        onOpenExtensionLogs={handleOpenExtensionLogs}
      />

      {pluginResults.map((result, index) => (
        <PluginResult key={index} {...result} />
      ))}
    </div>
  );
}
