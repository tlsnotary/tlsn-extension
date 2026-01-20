import React from 'react';
import { Button } from '../components/shared/Button';
import { useStepProgress } from '../hooks/useStepProgress';

export const SwissBankAdvanced: React.FC = () => {
  const { complete, isCompleted } = useStepProgress(5);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8 animate-slide-in-up">
        <h1 className="text-3xl font-bold mb-6 gradient-text">Step 5: Swiss Bank - Advanced Challenges</h1>

        <p className="text-lg text-gray-700 mb-6">
          Practice your skills with these advanced challenges. Each builds on what you've learned.
        </p>

        <div className="space-y-4 mb-8">
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-bold text-blue-900 mb-2">Challenge 1: Reveal USD Balance Only</h4>
            <p className="text-gray-700">Modify the plugin to reveal only the USD balance, not CHF.</p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <h4 className="font-bold text-purple-900 mb-2">Challenge 2: Use PEDERSEN for EUR</h4>
            <p className="text-gray-700">Create a PEDERSEN commitment for the EUR balance instead of revealing it.</p>
          </div>

          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <h4 className="font-bold text-green-900 mb-2">Challenge 3: Reveal Request Method</h4>
            <p className="text-gray-700">Add SENT handlers to reveal the HTTP method and request path.</p>
          </div>
        </div>

        {!isCompleted && (
          <Button onClick={complete} variant="primary">
            Mark as Complete (Manual)
          </Button>
        )}

        {isCompleted && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
            <p className="text-xl font-bold text-green-900">All Challenges Completed! ✓</p>
          </div>
        )}
      </div>
    </div>
  );
};
