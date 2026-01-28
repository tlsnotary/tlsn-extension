import React, { useState } from 'react';
import { Button } from '../shared/Button';

interface HintSystemProps {
  hints: string[];
  maxHints?: number;
  solution?: string;
  unlockSolutionAfterAttempts?: number;
  currentAttempts: number;
}

export const HintSystem: React.FC<HintSystemProps> = ({
  hints,
  maxHints = 3,
  solution,
  unlockSolutionAfterAttempts = 2,
  currentAttempts,
}) => {
  const [revealedHints, setRevealedHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const canShowNextHint = revealedHints < Math.min(hints.length, maxHints);
  const canShowSolution = solution && currentAttempts >= unlockSolutionAfterAttempts;

  const handleRevealHint = () => {
    if (canShowNextHint) {
      setRevealedHints(revealedHints + 1);
    }
  };

  const handleShowSolution = () => {
    setShowSolution(true);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <h4 className="font-bold text-blue-900 mb-3">Need Help?</h4>

      {hints.slice(0, revealedHints).map((hint, index) => (
        <div key={index} className="mb-3 p-3 bg-white rounded border border-blue-200">
          <div className="font-medium text-blue-800 mb-1">Hint {index + 1}:</div>
          <div className="text-gray-700">{hint}</div>
        </div>
      ))}

      <div className="flex gap-2">
        {canShowNextHint && (
          <Button onClick={handleRevealHint} variant="secondary">
            Show Hint {revealedHints + 1} ({hints.length - revealedHints} remaining)
          </Button>
        )}

        {canShowSolution && !showSolution && (
          <Button onClick={handleShowSolution} variant="secondary">
            View Solution
          </Button>
        )}
      </div>

      {showSolution && solution && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-300 rounded">
          <div className="font-bold text-yellow-900 mb-2">Solution:</div>
          <pre className="text-sm bg-white p-3 rounded border border-yellow-200 overflow-x-auto whitespace-pre-wrap">
            {solution}
          </pre>
        </div>
      )}

      {!canShowSolution && solution && currentAttempts < unlockSolutionAfterAttempts && (
        <div className="mt-2 text-sm text-gray-600">
          Solution unlocks after {unlockSolutionAfterAttempts} attempts (current: {currentAttempts})
        </div>
      )}
    </div>
  );
};
