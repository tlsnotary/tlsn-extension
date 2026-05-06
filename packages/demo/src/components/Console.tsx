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
}

export function ConsoleOutput({ entries }: ConsoleOutputProps) {
  return (
    <div className="console-section">
      <div className="console-output" id="consoleOutput">
        {entries.map((entry, index) => (
          <ConsoleEntry key={index} {...entry} />
        ))}
      </div>
    </div>
  );
}

interface ConsoleActionsProps {
  onClear: () => void;
  onOpenExtensionLogs: () => void;
}

export function ConsoleActions({ onClear, onOpenExtensionLogs }: ConsoleActionsProps) {
  return (
    <>
      <button
        className="btn-console"
        onClick={onOpenExtensionLogs}
        style={{ background: '#6c757d' }}
      >
        View Extension Logs
      </button>
      <button className="btn-console" onClick={onClear}>
        Clear
      </button>
    </>
  );
}
