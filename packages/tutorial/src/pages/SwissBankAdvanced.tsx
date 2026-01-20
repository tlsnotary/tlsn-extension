import React, { useState } from 'react';
import { Button } from '../components/shared/Button';
import { CodeEditor } from '../components/shared/CodeEditor';
import { ConsoleOutput } from '../components/shared/ConsoleOutput';
import { useStepProgress } from '../hooks/useStepProgress';
import { usePluginExecution } from '../hooks/usePluginExecution';
import {
  step5Challenge1Validators,
  step5Challenge2Validators,
  step5Challenge3Validators,
} from '../utils/validation';

export const SwissBankAdvanced: React.FC = () => {
  const { complete, updateCode, userCode, isCompleted, completedChallenges, markChallengeComplete } = useStepProgress(5);
  const { execute, isExecuting, result, reset: resetExecution } = usePluginExecution();
  const [code, setCode] = useState(userCode);
  const [isResetting, setIsResetting] = useState(false);
  const [challengeResults, setChallengeResults] = useState<{
    1: boolean;
    2: boolean;
    3: boolean;
  }>({ 1: false, 2: false, 3: false });

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

    // Validate all 3 challenges
    const challenge1Valid = step5Challenge1Validators.every((validator) =>
      validator.check({ code, pluginOutput: pluginResult }).valid
    );
    const challenge2Valid = step5Challenge2Validators.every((validator) =>
      validator.check({ code, pluginOutput: pluginResult }).valid
    );
    const challenge3Valid = step5Challenge3Validators.every((validator) =>
      validator.check({ code, pluginOutput: pluginResult }).valid
    );

    setChallengeResults({
      1: challenge1Valid,
      2: challenge2Valid,
      3: challenge3Valid,
    });

    // Mark completed challenges
    if (challenge1Valid && !completedChallenges.includes(1)) {
      markChallengeComplete(1);
    }
    if (challenge2Valid && !completedChallenges.includes(2)) {
      markChallengeComplete(2);
    }
    if (challenge3Valid && !completedChallenges.includes(3)) {
      markChallengeComplete(3);
    }

    // Complete step if all challenges pass
    if (challenge1Valid && challenge2Valid && challenge3Valid) {
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
      setChallengeResults({ 1: false, 2: false, 3: false });
      resetExecution();
    } catch (err) {
      console.error('Failed to reload Swiss Bank starter:', err);
    } finally {
      setIsResetting(false);
    }
  };

  const allChallengesComplete = completedChallenges.length === 3;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up mb-6">
        <h1 className="text-3xl font-bold mb-6 gradient-text">
          Step 5: Swiss Bank - Advanced Challenges
        </h1>

        <p className="text-lg text-gray-700 mb-6">
          Complete all three challenges by adding the necessary handlers to your code. Test your
          code to see which challenges you&apos;ve completed.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-blue-900 mb-3">Challenges:</h3>
          <div className="space-y-4">
            {/* Challenge 1 */}
            <div className={`p-4 rounded-lg border-2 ${
              challengeResults[1] || completedChallenges.includes(1)
                ? 'bg-green-50 border-green-500'
                : 'bg-white border-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-gray-900">
                  Challenge 1: Reveal USD Balance (Nested JSON)
                </h4>
                {(challengeResults[1] || completedChallenges.includes(1)) && (
                  <span className="text-2xl">✅</span>
                )}
              </div>
              <p className="text-sm text-gray-700 mb-2">
                Add a handler to reveal the USD balance from the nested <code>accounts.USD</code> field.
              </p>
              <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded">
                <code>
                  &#123; type: &apos;RECV&apos;, part: &apos;BODY&apos;, action: &apos;REVEAL&apos;,
                  params: &#123; type: &apos;json&apos;, path: &apos;accounts.USD&apos; &#125; &#125;
                </code>
              </div>
            </div>

            {/* Challenge 2 */}
            <div className={`p-4 rounded-lg border-2 ${
              challengeResults[2] || completedChallenges.includes(2)
                ? 'bg-green-50 border-green-500'
                : 'bg-white border-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-gray-900">
                  Challenge 2: Reveal Cookie Header (SENT)
                </h4>
                {(challengeResults[2] || completedChallenges.includes(2)) && (
                  <span className="text-2xl">✅</span>
                )}
              </div>
              <p className="text-sm text-gray-700 mb-2">
                Add a SENT handler to reveal the Cookie header from the request.
              </p>
              <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded">
                <code>
                  &#123; type: &apos;SENT&apos;, part: &apos;HEADERS&apos;, action: &apos;REVEAL&apos;,
                  params: &#123; key: &apos;cookie&apos; &#125; &#125;
                </code>
              </div>
            </div>

            {/* Challenge 3 */}
            <div className={`p-4 rounded-lg border-2 ${
              challengeResults[3] || completedChallenges.includes(3)
                ? 'bg-green-50 border-green-500'
                : 'bg-white border-gray-300'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-gray-900">
                  Challenge 3: Reveal Date Header (RECV)
                </h4>
                {(challengeResults[3] || completedChallenges.includes(3)) && (
                  <span className="text-2xl">✅</span>
                )}
              </div>
              <p className="text-sm text-gray-700 mb-2">
                Add a RECV handler to reveal the Date header from the response.
              </p>
              <div className="text-xs text-gray-600 bg-gray-100 p-2 rounded">
                <code>
                  &#123; type: &apos;RECV&apos;, part: &apos;HEADERS&apos;, action: &apos;REVEAL&apos;,
                  params: &#123; key: &apos;date&apos; &#125; &#125;
                </code>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
          <h3 className="font-bold text-purple-900 mb-3">💡 Documentation & Tips:</h3>
          <div className="space-y-3">
            {/* Inspection Tip */}
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
              <p className="text-xs font-semibold mb-1">💡 Pro Tip: Inspect First!</p>
              <p className="text-xs mb-2">
                Before targeting specific fields or headers, reveal everything to see what&apos;s
                available:
              </p>
              <div className="bg-white p-2 rounded space-y-1">
                <p className="text-xs font-mono">
                  &#123; type: &apos;RECV&apos;, part: &apos;BODY&apos;, action:
                  &apos;REVEAL&apos; &#125; // See all response body
                </p>
                <p className="text-xs font-mono">
                  &#123; type: &apos;SENT&apos;, part: &apos;HEADERS&apos;, action:
                  &apos;REVEAL&apos; &#125; // See all request headers
                </p>
                <p className="text-xs font-mono">
                  &#123; type: &apos;RECV&apos;, part: &apos;HEADERS&apos;, action:
                  &apos;REVEAL&apos; &#125; // See all response headers
                </p>
              </div>
            </div>

            {/* Nested JSON Documentation */}
            <div className="bg-white border border-gray-300 rounded-lg p-3">
              <p className="text-xs font-semibold mb-2">📚 Nested JSON Path Syntax:</p>
              <p className="text-xs text-gray-700 mb-2">
                Use dot notation to access nested fields in JSON objects:
              </p>
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs font-mono">params: &#123; type: &apos;json&apos;, path: &apos;parent.child&apos; &#125;</p>
              </div>
            </div>

            {/* Header Key Documentation */}
            <div className="bg-white border border-gray-300 rounded-lg p-3">
              <p className="text-xs font-semibold mb-2">📚 Targeting Specific Headers:</p>
              <p className="text-xs text-gray-700 mb-2">
                Use <code>params.key</code> to precisely target a header (case-insensitive):
              </p>
              <div className="bg-gray-50 p-2 rounded">
                <p className="text-xs font-mono">params: &#123; key: &apos;header-name&apos; &#125;</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold mb-4">Edit Plugin Code</h3>
        <CodeEditor value={code} onChange={handleCodeChange} height="600px" />
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex gap-4 mb-4">
          <Button onClick={handleTestCode} disabled={isExecuting} variant="primary">
            {isExecuting ? 'Testing...' : 'Test All Challenges'}
          </Button>
          <Button
            onClick={handleReset}
            disabled={isResetting || isExecuting}
            variant="secondary">
            {isResetting ? 'Resetting...' : 'Reset Code'}
          </Button>
        </div>

        <ConsoleOutput result={result} />
      </div>

      {allChallengesComplete && !isCompleted && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center mb-6">
          <p className="text-xl font-bold text-green-900 mb-2">All Challenges Completed! ✓</p>
          <p className="text-gray-700 mb-4">
            You&apos;ve successfully completed all advanced challenges!
          </p>
          <Button onClick={complete} variant="success">
            Complete Step 5 →
          </Button>
        </div>
      )}

      {isCompleted && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
          <p className="text-xl font-bold text-green-900">Step 5 Completed! ✓</p>
        </div>
      )}
    </div>
  );
};
