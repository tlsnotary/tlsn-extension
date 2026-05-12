import { Plugin } from '../types';

export interface CompareDurations {
  Mpc?: number;
  Proxy?: number;
}

interface ModeComparisonProps {
  plugins: Record<string, Plugin>;
  selectedPlugin: string;
  onSelectPlugin: (pluginKey: string) => void;
  durations: CompareDurations;
  runningMode: 'Mpc' | 'Proxy' | null;
  allChecksPass: boolean;
  onRun: (mode: 'Mpc' | 'Proxy') => void;
}

const PROXY_MODE_BLOG_URL = 'https://tlsnotary.org/blog/2026/04/22/proxy-mode';

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function ModePanel({
  mode,
  subtitle,
  duration,
  isRunning,
  isOtherRunning,
  disabled,
  onRun,
}: {
  mode: 'Mpc' | 'Proxy';
  subtitle: string;
  duration: number | undefined;
  isRunning: boolean;
  isOtherRunning: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const label = mode === 'Mpc' ? 'MPC' : 'Proxy';
  return (
    <div className={`compare-panel compare-panel--${mode.toLowerCase()}`}>
      <div className="compare-panel-header">
        <h3 className="compare-panel-title">{label}</h3>
        <p className="compare-panel-subtitle">{subtitle}</p>
      </div>
      <button
        className="compare-panel-run-btn"
        disabled={disabled || isRunning || isOtherRunning}
        onClick={onRun}
      >
        {isRunning ? (
          <>
            <span className="spinner"></span> Running…
          </>
        ) : (
          <>▶ Run with {label}</>
        )}
      </button>
      <div className="compare-panel-timing">
        {isRunning ? (
          <span className="spinner compare-panel-spinner" aria-label="Proving in progress"></span>
        ) : (
          <>
            <span className="compare-panel-timing-icon" aria-hidden="true">
              ⏱
            </span>
            <span className="compare-panel-timing-value">{formatDuration(duration)}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function ModeComparison({
  plugins,
  selectedPlugin,
  onSelectPlugin,
  durations,
  runningMode,
  allChecksPass,
  onRun,
}: ModeComparisonProps) {
  const pluginEntries = Object.entries(plugins);

  return (
    <div id="mode-comparison" className="content-card">
      <h2 className="section-title">MPC vs Proxy</h2>
      <p className="section-subtitle">
        MPC is the most secure protocol. It remains secure even if the prover is fully malicious. However, it is sensitive to
        network latency and bandwidth. Proxy mode is much faster, but it is only secure if an adversary
        cannot both compromise the prover and intercept the verifier’s network traffic at the same
        time. If that assumption matches your deployment, try the difference on your own connection.
      </p>

      <div className="compare-plugin-picker">
        <label htmlFor="compare-plugin-select" className="compare-plugin-picker-label">
          Plugin:
        </label>
        <select
          id="compare-plugin-select"
          className="compare-plugin-select"
          value={selectedPlugin}
          onChange={(e) => onSelectPlugin(e.target.value)}
          disabled={runningMode !== null}
        >
          {pluginEntries.map(([key, plugin]) => (
            <option key={key} value={key}>
              {plugin.name}
            </option>
          ))}
        </select>
      </div>

      <div className="compare-grid">
        <ModePanel
          mode="Mpc"
          subtitle="Secure against a malicious prover"
          duration={durations.Mpc}
          isRunning={runningMode === 'Mpc'}
          isOtherRunning={runningMode === 'Proxy'}
          disabled={!allChecksPass}
          onRun={() => onRun('Mpc')}
        />
        <ModePanel
          mode="Proxy"
          subtitle="Faster, simpler browser deployment"
          duration={durations.Proxy}
          isRunning={runningMode === 'Proxy'}
          isOtherRunning={runningMode === 'Mpc'}
          disabled={!allChecksPass}
          onRun={() => onRun('Proxy')}
        />
      </div>

      {!allChecksPass && (
        <div className="alert-box">
          <span className="alert-icon">ℹ️</span>
          <span>Complete system setup above to run the comparison</span>
        </div>
      )}

      <p className="compare-footer-note">
        Learn more about Proxy mode at{' '}
        <a
          href={PROXY_MODE_BLOG_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="compare-blog-link"
        >
          tlsnotary.org/blog/2026/04/22/proxy-mode
        </a>
      </p>
    </div>
  );
}
