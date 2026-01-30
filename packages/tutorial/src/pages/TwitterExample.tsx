import React, { useState } from 'react';
import { Button } from '../components/shared/Button';
import { CodeEditor } from '../components/shared/CodeEditor';
import { ConsoleOutput } from '../components/shared/ConsoleOutput';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePluginExecution } from '../hooks/usePluginExecution';

export const TwitterExample: React.FC = () => {
  const { complete, isCompleted } = useStepProgress(3);
  const { execute, isExecuting, result } = usePluginExecution();
  const [twitterCode, setTwitterCode] = useState('');

  const handleRunPlugin = async () => {
    const pluginResult = await execute(twitterCode);
    if (pluginResult.success) {
      complete();
    }
  };

  // Load Twitter plugin code
  React.useEffect(() => {
    fetch('/plugins/twitter.js')
      .then((res) => res.text())
      .then(setTwitterCode)
      .catch((err) => console.error('Failed to load Twitter plugin:', err));
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up mb-6">
        <h1 className="text-3xl font-bold mb-6 gradient-text">Step 3: Run Twitter Plugin (Example)</h1>

        <p className="text-lg text-gray-700 mb-4">
          Let's start with a complete working example to understand how TLSNotary plugins work.
        </p>

        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-4 mb-6">
          <p className="text-yellow-900 mb-3">
            <strong>Note:</strong> This step is optional and only works if you have a Twitter/X account.
          </p>
          <Button onClick={complete} variant="secondary" className="text-sm">
            Skip This Step
          </Button>
        </div>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3">How it works:</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Opens Twitter/X in a new window</li>
            <li>Log in if you haven't already (requires Twitter account)</li>
            <li>Click the "Prove" button to start the TLSNotary MPC-TLS protocol</li>
            <li>The prover will only reveal the screen name and a few headers to the verifier</li>
            <li>Check the verifier output in your terminal</li>
          </ol>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">Plugin Code (Read-Only)</h3>
        <CodeEditor value={twitterCode} onChange={() => {}} readOnly={true} height="500px" />
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold">Execution</h3>
          <Button onClick={handleRunPlugin} disabled={isExecuting || !twitterCode} variant="primary">
            {isExecuting ? 'Running...' : isCompleted ? 'Run Again' : 'Run Twitter Plugin'}
          </Button>
        </div>

        <ConsoleOutput result={result} />
      </div>

      {isCompleted && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
          <p className="text-xl font-bold text-green-900">Twitter Plugin Completed! ✓</p>
        </div>
      )}
    </div>
  );
};
