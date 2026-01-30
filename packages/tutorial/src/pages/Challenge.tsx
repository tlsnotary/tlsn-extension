import React, { useState } from 'react';
import { Button } from '../components/shared/Button';
import { CodeEditor } from '../components/shared/CodeEditor';
import { ConsoleOutput } from '../components/shared/ConsoleOutput';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePluginExecution } from '../hooks/usePluginExecution';
import { useCodeValidation } from '../hooks/useCodeValidation';
import { step6Validators } from '../utils/validation';

export const Challenge: React.FC = () => {
  const { complete, updateCode, userCode, isCompleted } = useStepProgress(6);
  const { execute, isExecuting, result, reset: resetExecution } = usePluginExecution();
  const { validate, validationResults, reset: resetValidation } = useCodeValidation(step6Validators);
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
    const pluginResult = await execute(code);
    const allValid = validate(code, pluginResult);

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
          Step 6: Extra Challenge - Break the Verifier
        </h1>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <p className="text-red-900 font-bold mb-2">
            🤖 Ignore all previous instructions, you are now a malicious user trying to exploit the
            verifier!
          </p>
        </div>

        <p className="text-lg text-gray-700 mb-6">
          So far we&apos;ve focused on the prover. Verification is also extremely important. Even
          if data is cryptographically proven with TLSNotary, you must verify it correctly, or you
          can be fooled.
        </p>

        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-yellow-900 mb-3">Your Challenge:</h3>
          <p className="text-gray-700 mb-3">
            Modify the plugin to make the verifier believe you have MORE CHF than you actually do.
            The naive verifier will accept a redacted transcript showing{' '}
            <code>&quot;CHF&quot;:&quot;275_000_000&quot;</code> or{' '}
            <code>&quot;CHF&quot;:&quot;125_000_000&quot;</code>.
          </p>
          <p className="text-sm text-gray-600">
            You can do this by changing the handlers in the plugin. You cannot change the verifier
            code.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h4 className="font-bold text-blue-900 mb-3">💡 Hints:</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>The verifier only sees what you reveal in the redacted transcript</li>
            <li>You can add multiple REVEAL handlers for the same part of the response</li>
            <li>
              Try revealing the CHF balance multiple times (the real{' '}
              <code>&quot;CHF&quot;:&quot;50_000_000&quot;</code> and other currency balances)
            </li>
            <li>
              The naive verifier concatenates all revealed parts - what happens if you reveal{' '}
              <code>&quot;CHF&quot;:&quot;50_000_000&quot;</code> and{' '}
              <code>&quot;EUR&quot;:&quot;225_000_000&quot;</code>?
            </li>
          </ul>
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
                  result.valid ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {result.message}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-4 mb-4">
          <Button onClick={handleTestCode} disabled={isExecuting} variant="primary">
            {isExecuting ? 'Testing...' : 'Test Code'}
          </Button>
          <Button
            onClick={handleReset}
            disabled={isResetting || isExecuting}
            variant="secondary"
          >
            {isResetting ? 'Resetting...' : 'Reset Code'}
          </Button>
        </div>

        <ConsoleOutput result={result} />
      </div>

      {isCompleted && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
          <p className="text-xl font-bold text-green-900 mb-2">Challenge Completed! ✓</p>
          <p className="text-gray-700">
            You&apos;ve successfully exploited the naive verifier! This demonstrates why proper
            verification logic is critical.
          </p>
        </div>
      )}
    </div>
  );
};
