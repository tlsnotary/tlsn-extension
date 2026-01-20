import React, { useState } from 'react';
import { Button } from '../components/shared/Button';
import { CodeEditor } from '../components/shared/CodeEditor';
import { ConsoleOutput } from '../components/shared/ConsoleOutput';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePluginExecution } from '../hooks/usePluginExecution';
import { useCodeValidation } from '../hooks/useCodeValidation';
import { step4Validators } from '../utils/validation';

export const SwissBankBasic: React.FC = () => {
  const { complete, updateCode, userCode, isCompleted } = useStepProgress(4);
  const { execute, isExecuting, result, reset: resetExecution } = usePluginExecution();
  const {
    validate,
    validationResults,
    reset: resetValidation,
  } = useCodeValidation(step4Validators);
  const [code, setCode] = useState(userCode);
  const [isResetting, setIsResetting] = useState(false);

  React.useEffect(() => {
    if (!userCode) {
      fetch('/plugins/swissbank-starter.js')
        .then((res) => res.text())
        .then((text) => {
          setCode(text);
          updateCode(text);
        })
        .catch((err) => console.error('Failed to load Swiss Bank starter:', err));
    }
  }, []);

  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    updateCode(newCode);
  };

  const handleTestCode = async () => {
    // First validate code structure
    validate(code);

    // Execute plugin
    const pluginResult = await execute(code);

    // Validate with plugin output
    const allValid = validate(code, pluginResult);

    // Complete step if all validations pass
    if (allValid) {
      complete();
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    try {
      const response = await fetch('/plugins/swissbank-starter.js');
      const text = await response.text();
      setCode(text);
      updateCode(text);
      resetValidation();
      resetExecution();
    } catch (err) {
      console.error('Failed to reload Swiss Bank starter:', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up mb-6">
        <h1 className="text-3xl font-bold mb-6 gradient-text">
          Step 4: Swiss Bank - Add Missing Handler
        </h1>

        <p className="text-lg text-gray-700 mb-4">
          Now let's write our own plugin! Your task is to add a handler to reveal the Swiss Franc
          (CHF) balance.
        </p>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3">Setup:</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>
              Visit{' '}
              <a
                href="https://swissbank.tlsnotary.org/login"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                https://swissbank.tlsnotary.org/login
              </a>
            </li>
            <li>
              Login with:
              <ul className="list-disc list-inside ml-6">
                <li>
                  Username: <code className="bg-gray-200 px-2 py-1 rounded">tkstanczak</code>
                </li>
                <li>
                  Password:{' '}
                  <code className="bg-gray-200 px-2 py-1 rounded">
                    TLSNotary is my favorite project
                  </code>
                </li>
              </ul>
            </li>
            <li>Verify you can see the balances page</li>
          </ol>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-2">Your Task:</h3>
          <p className="text-gray-700 mb-2">
            Find the TODO comment in the code and add this handler:
          </p>
          <pre className="bg-white p-3 rounded border border-blue-300 overflow-x-auto text-sm">
            {`{ type: 'RECV', part: 'ALL', action: 'REVEAL',
  params: { type: 'regex', regex: '"CHF"\\\\s*:\\\\s*"[^"]+"' } }`}
          </pre>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">Edit Plugin Code</h3>
        <CodeEditor value={code} onChange={handleCodeChange} height="600px" />
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        {validationResults.length > 0 && (
          <div className="mb-4 space-y-2">
            {validationResults.map((result, index) => (
              <div
                key={index}
                className={`p-3 rounded ${
                  result.valid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {result.valid ? '✅' : '❌'} {result.message}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4 mb-4">
          <Button onClick={handleTestCode} disabled={isExecuting} variant="primary">
            {isExecuting ? 'Testing...' : 'Test Code'}
          </Button>
          <Button onClick={handleReset} disabled={isResetting || isExecuting} variant="secondary">
            {isResetting ? 'Resetting...' : 'Reset Code'}
          </Button>
        </div>

        <ConsoleOutput result={result} />
      </div>

      {isCompleted && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
          <p className="text-xl font-bold text-green-900 mb-2">Challenge Completed! ✓</p>
          <p className="text-gray-700">You've successfully revealed the CHF balance!</p>
        </div>
      )}
    </div>
  );
};
