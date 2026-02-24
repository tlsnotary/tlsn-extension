import { useState, useEffect, useCallback } from 'react';
import { SystemChecks } from './components/SystemChecks';
import { ConsoleOutput } from './components/Console';
import { PluginButtons } from './components/PluginButtons';
import { StatusBar } from './components/StatusBar';
import { CollapsibleSection } from './components/CollapsibleSection';
import { HowItWorks } from './components/HowItWorks';
import { WhyPlugins } from './components/WhyPlugins';
import { BuildYourOwn } from './components/BuildYourOwn';
import { plugins } from './plugins';
import { checkBrowserCompatibility, checkExtension, checkVerifier, formatTimestamp } from './utils';
import { ConsoleEntry, CheckStatus, PluginResult as PluginResultType, ProgressData } from './types';
import './App.css';

interface PluginResultData {
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
    const [pluginResults, setPluginResults] = useState<Record<string, PluginResultData>>({});
    const [pluginProgress, setPluginProgress] = useState<Record<string, ProgressData>>({});
    const [consoleExpanded, setConsoleExpanded] = useState(false);

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

    const handleRecheck = useCallback(async () => {
        // Recheck extension
        setExtensionCheck({ status: 'checking', message: 'Checking...' });
        const extensionOk = await checkExtension();
        if (extensionOk) {
            setExtensionCheck({ status: 'success', message: '✅ Extension installed' });
        } else {
            setExtensionCheck({ status: 'error', message: '❌ Extension not found' });
        }

        // Recheck verifier
        setVerifierCheck({ status: 'checking', message: 'Checking...', showInstructions: false });
        const verifierOk = await checkVerifier();
        if (verifierOk) {
            setVerifierCheck({ status: 'success', message: '✅ Verifier running', showInstructions: false });
        } else {
            setVerifierCheck({ status: 'error', message: '❌ Verifier not running', showInstructions: true });
        }

        setAllChecksPass(extensionOk && verifierOk);
    }, []);

    const handleRunPlugin = useCallback(
        async (pluginKey: string) => {
            const plugin = plugins[pluginKey];
            if (!plugin) return;

            const requestId = `plugin_${pluginKey}_${Date.now()}`;
            setRunningPlugins((prev) => new Set(prev).add(pluginKey));
            setPluginProgress((prev) => ({ ...prev, [pluginKey]: { step: 'STARTING', progress: 0, message: 'Please continue in the TLSNotary popup' } }));
            setConsoleExpanded(true);

            try {
                const startTime = performance.now();
                const pluginCode = await fetch(plugin.file).then((r) => r.text());

                addConsoleEntry('🔧 Executing plugin code...', 'info');
                const result = await window.tlsn!.execCode(pluginCode, { requestId });
                const executionTime = (performance.now() - startTime).toFixed(2);

                const json: PluginResultType = JSON.parse(result);

                setPluginResults((prev) => ({
                    ...prev,
                    [pluginKey]: {
                        resultHtml: plugin.parseResult(json),
                        debugJson: JSON.stringify(json.results, null, 2),
                    },
                }));

                addConsoleEntry(`✅ ${plugin.name} completed successfully in ${executionTime}ms`, 'success');
            } catch (err) {
                console.error(err);
                addConsoleEntry(`❌ Error: ${err instanceof Error ? err.message : String(err)}`, 'error');
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

    // Listen for offscreen logs and progress events
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data?.type === 'TLSN_OFFSCREEN_LOG') {
                addConsoleEntry(event.data.message, event.data.level);
            }

            if (event.data?.type === 'TLSN_PROVE_PROGRESS') {
                const { requestId, step, progress, message } = event.data;
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
                <h1 className="hero-title">TLSNotary Plugin Demo</h1>
                <p className="hero-subtitle">
                    zkTLS in action — secure, private data verification from any website
                </p>
            </div>

            <HowItWorks />

            <StatusBar
                browserOk={browserCheck.status === 'success'}
                extensionOk={extensionCheck.status === 'success'}
                verifierOk={verifierCheck.status === 'success'}
                onRecheck={handleRecheck}
                detailsContent={
                    <div className="checks-section">
                        <div className="checks-title">System Status Details</div>
                        <SystemChecks
                            checks={{
                                browser: browserCheck,
                                extension: extensionCheck,
                                verifier: verifierCheck,
                            }}
                            onRecheck={handleRecheck}
                            showBrowserWarning={showBrowserWarning}
                        />
                    </div>
                }
            />

            <div className="content-card">
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
            </div>

            <WhyPlugins />

            <BuildYourOwn />

            <CollapsibleSection title="Console Output" expanded={consoleExpanded}>
                <ConsoleOutput
                    entries={consoleEntries}
                    onClear={handleClearConsole}
                    onOpenExtensionLogs={handleOpenExtensionLogs}
                />
            </CollapsibleSection>

            <footer className="app-footer">
                <a
                    href="https://github.com/tlsnotary/tlsn-extension/tree/main/packages/demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                >
                    View source on GitHub
                </a>
                <span className="footer-version">{__GIT_COMMIT_HASH__}</span>
            </footer>
        </div>
    );
}

declare const __GIT_COMMIT_HASH__: string;
