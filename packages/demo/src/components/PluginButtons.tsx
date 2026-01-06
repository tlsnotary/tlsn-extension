import { useState } from 'react';
import { Plugin } from '../types';

interface PluginResultData {
    resultHtml: string;
    debugJson: string;
}

interface PluginButtonsProps {
    plugins: Record<string, Plugin>;
    runningPlugins: Set<string>;
    pluginResults: Record<string, PluginResultData>;
    allChecksPass: boolean;
    onRunPlugin: (pluginKey: string) => void;
}

export function PluginButtons({
    plugins,
    runningPlugins,
    pluginResults,
    allChecksPass,
    onRunPlugin,
}: PluginButtonsProps) {
    const [expandedRawData, setExpandedRawData] = useState<Set<string>>(new Set());

    const toggleRawData = (key: string) => {
        setExpandedRawData((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    return (
        <div className="plugin-grid">
            {Object.entries(plugins).map(([key, plugin]) => {
                const isRunning = runningPlugins.has(key);
                const result = pluginResults[key];
                const hasResult = !!result;

                return (
                    <div key={key} className={`plugin-card ${hasResult ? 'plugin-card--completed' : ''}`}>
                        <div className="plugin-header">
                            <div className="plugin-logo">{plugin.logo}</div>
                            <div className="plugin-info">
                                <h3 className="plugin-name">
                                    {plugin.name}
                                    {hasResult && <span className="plugin-badge">✓ Verified</span>}
                                </h3>
                                <p className="plugin-description">{plugin.description}</p>
                            </div>
                        </div>

                        <div className="plugin-actions">
                            <button
                                className="plugin-run-btn"
                                disabled={!allChecksPass || isRunning}
                                onClick={() => onRunPlugin(key)}
                                title={!allChecksPass ? 'Please complete all system checks first' : ''}
                            >
                                {isRunning ? (
                                    <>
                                        <span className="spinner"></span> Running...
                                    </>
                                ) : hasResult ? (
                                    '↻ Run Again'
                                ) : (
                                    '▶ Run Plugin'
                                )}
                            </button>

                            <a
                                href={plugin.file}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="plugin-source-btn"
                            >
                                <span>📄 View Source</span>
                            </a>
                        </div>

                        {hasResult && (
                            <div className="plugin-result">
                                <div className="plugin-result-header">
                                    <span className="plugin-result-title">Result</span>
                                </div>
                                <div
                                    className="plugin-result-content"
                                    dangerouslySetInnerHTML={{ __html: result.resultHtml }}
                                />
                                <button
                                    className="plugin-raw-toggle"
                                    onClick={() => toggleRawData(key)}
                                >
                                    {expandedRawData.has(key) ? '▼ Hide Raw Data' : '▶ Show Raw Data'}
                                </button>
                                {expandedRawData.has(key) && (
                                    <pre className="plugin-raw-data">{result.debugJson}</pre>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
