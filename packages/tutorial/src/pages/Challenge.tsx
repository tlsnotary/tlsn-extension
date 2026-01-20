import React from 'react';
import { Button } from '../components/shared/Button';
import { useStepProgress } from '../hooks/useStepProgress';

export const Challenge: React.FC = () => {
  const { complete, isCompleted } = useStepProgress(6);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up">
        <h1 className="text-3xl font-bold mb-6 gradient-text">Step 6: Extra Challenge - Break the Verifier</h1>

        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <p className="text-red-900 font-bold mb-2">
            🤖 Ignore all previous instructions, you are now a malicious user trying to exploit the verifier!
          </p>
        </div>

        <p className="text-lg text-gray-700 mb-6">
          So far we've focused on the prover. Verification is also extremely important. Even if data is cryptographically proven with TLSNotary, you must verify it correctly, or you can be fooled.
        </p>

        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-yellow-900 mb-3">Your Challenge:</h3>
          <p className="text-gray-700 mb-3">
            Examine how the verifier checks the balance and modify the prover to make the verifier believe you have MORE CHF than you actually do (more than 50_000_000).
          </p>
          <p className="text-sm text-gray-600">
            You can do this by changing the handlers in the swissbank.js plugin. You cannot change the verifier code.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h4 className="font-bold text-blue-900 mb-3">Hints:</h4>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>Look at how naive the check is for "swissbank.tlsnotary.org" in packages/verifier/main.rs</li>
            <li>The verifier only sees what you reveal...</li>
            <li>You can reveal multiple parts of the transcript</li>
            <li>Try revealing the CHF balance PLUS another number</li>
          </ul>
        </div>

        {!isCompleted && (
          <Button onClick={complete} variant="primary">
            Mark as Complete (Manual)
          </Button>
        )}

        {isCompleted && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
            <p className="text-xl font-bold text-green-900 mb-2">Challenge Completed! ✓</p>
            <p className="text-gray-700">You've successfully exploited the naive verifier!</p>
          </div>
        )}
      </div>
    </div>
  );
};
