import React, { useState, useEffect } from 'react';
import { Button } from '../components/shared/Button';
import { StatusBadge } from '../components/shared/StatusBadge';
import { useStepProgress } from '../hooks/useStepProgress';
import { performSystemChecks, getSystemCheckStatus } from '../utils/checks';
import { CheckResult } from '../types';

export const Setup: React.FC = () => {
  const { complete, isCompleted } = useStepProgress(1);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const performChecks = async () => {
    setIsChecking(true);
    const result = await performSystemChecks();
    setCheckResult(result);
    setIsChecking(false);

    if (result.browserCompatible && result.extensionReady && result.verifierReady) {
      complete();
    }
  };

  useEffect(() => {
    performChecks();
  }, []);

  const checks = checkResult ? getSystemCheckStatus(checkResult) : [];
  const allPassed = checkResult?.browserCompatible && checkResult?.extensionReady && checkResult?.verifierReady;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up">
        <h1 className="text-3xl font-bold mb-6 gradient-text">Step 1: System Setup</h1>

        <p className="text-lg text-gray-700 mb-6">
          Before we start, let's make sure your environment is ready for TLSNotary development.
        </p>

        <div className="space-y-4 mb-8">
          {checks.map((check, index) => (
            <div key={index}>
              <StatusBadge status={isChecking ? 'checking' : check.status} message={check.message} />

              {check.status === 'error' && check.name === 'TLSNotary Extension' && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="font-medium text-gray-800 mb-2">Installation Instructions:</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                    <li>Navigate to the extension directory and build it:
                      <pre className="mt-2 bg-gray-800 text-white p-3 rounded overflow-x-auto">
cd packages/extension{'\n'}
npm install{'\n'}
npm run build
                      </pre>
                    </li>
                    <li>Open Chrome and go to <code className="bg-gray-200 px-2 py-1 rounded">chrome://extensions/</code></li>
                    <li>Enable "Developer mode" (toggle in top right)</li>
                    <li>Click "Load unpacked"</li>
                    <li>Select the <code className="bg-gray-200 px-2 py-1 rounded">packages/extension/build/</code> folder</li>
                  </ol>
                </div>
              )}

              {check.status === 'error' && check.name === 'Verifier Server' && (
                <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="font-medium text-gray-800 mb-2">Start the Verifier Server:</p>
                  <pre className="bg-gray-800 text-white p-3 rounded overflow-x-auto">
cd packages/verifier{'\n'}
cargo run --release
                  </pre>
                  <p className="mt-2 text-sm text-gray-600">
                    Make sure you have Rust installed. If not, install it from <a href="https://rustup.rs/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">rustup.rs</a>
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Button onClick={performChecks} disabled={isChecking} variant="secondary">
            {isChecking ? 'Checking...' : 'Recheck'}
          </Button>

          {allPassed && (
            <Button onClick={complete} variant="success" disabled={isCompleted}>
              {isCompleted ? 'Completed ✓' : 'Continue to Next Step →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
