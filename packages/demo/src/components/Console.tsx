import './styles.css';

interface ConsoleEntryProps {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export function ConsoleEntry({ timestamp, message, type }: ConsoleEntryProps) {
  return (
    <div className={`console-entry ${type}`}>
      <span className="console-timestamp">[{timestamp}]</span>
      <span className="console-message">{message}</span>
    </div>
  );
}

interface ConsoleOutputProps {
  entries: ConsoleEntryProps[];
  onClear: () => void;
  onOpenExtensionLogs: () => void;
}

export function ConsoleOutput({ entries, onClear, onOpenExtensionLogs }: ConsoleOutputProps) {
  return (
    <div className="console-section">
      <div className="console-header">
        <div className="console-title">Console Output</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-console" onClick={onOpenExtensionLogs} style={{ background: '#6c757d' }}>
            View Extension Logs
          </button>
          <button className="btn-console" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
      <div className="console-output" id="consoleOutput">
        {entries.map((entry, index) => (
          <ConsoleEntry key={index} {...entry} />
        ))}
      </div>
    </div>
  );
}
