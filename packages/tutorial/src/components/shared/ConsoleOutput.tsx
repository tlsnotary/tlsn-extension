import React from 'react';
import { PluginResult } from '../../types';

interface ConsoleOutputProps {
  result: PluginResult | null;
}

export const ConsoleOutput: React.FC<ConsoleOutputProps> = ({ result }) => {
  if (!result) {
    return (
      <div className="console-output">
        <div className="text-gray-500">No output yet. Run the plugin to see results.</div>
      </div>
    );
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="console-output">
      <div className="mb-2">
        <span className="timestamp">[{formatTimestamp(result.timestamp)}]</span>
        <span className={result.success ? 'success' : 'error'}>
          {result.success ? 'Execution completed' : 'Execution failed'}
        </span>
      </div>

      {result.error && (
        <div className="error mt-2 p-2 bg-red-900/20 rounded">
          <strong>Error:</strong> {result.error}
        </div>
      )}

      {result.results && result.results.length > 0 && (
        <div className="mt-2">
          <div className="info mb-1">Results:</div>
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(result.results, null, 2)}
          </pre>
        </div>
      )}

      {result.output && (
        <div className="mt-2">
          <div className="info mb-1">Full Output:</div>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{result.output}</pre>
        </div>
      )}
    </div>
  );
};
