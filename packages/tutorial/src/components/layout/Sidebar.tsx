import React from 'react';
import { useTutorial } from '../../context/TutorialContext';

const steps = [
  { id: 0, title: 'Welcome' },
  { id: 1, title: 'Setup' },
  { id: 2, title: 'Concepts' },
  { id: 3, title: 'Twitter Example' },
  { id: 4, title: 'Swiss Bank Basic' },
  { id: 5, title: 'Swiss Bank Advanced' },
  { id: 6, title: 'Challenge' },
  { id: 7, title: 'Completion' },
];

export const Sidebar: React.FC = () => {
  const { state, actions } = useTutorial();

  const isStepAccessible = (stepId: number): boolean => {
    if (stepId === 0) return true;
    return state.completedSteps.has(stepId - 1) || state.currentStep >= stepId;
  };

  return (
    <aside className="w-64 bg-white shadow-lg border-r border-gray-200 h-full overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Tutorial Steps</h2>
        <nav>
          <ul className="space-y-2">
            {steps.map((step) => {
              const isCompleted = state.completedSteps.has(step.id);
              const isCurrent = state.currentStep === step.id;
              const isLocked = !isStepAccessible(step.id);

              return (
                <li key={step.id}>
                  <button
                    onClick={() => !isLocked && actions.goToStep(step.id)}
                    disabled={isLocked}
                    className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                      isCurrent
                        ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white'
                        : isCompleted
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : isLocked
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {step.id}. {step.title}
                      </span>
                      {isCompleted && <span>✓</span>}
                      {isLocked && <span>🔒</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <button
            onClick={actions.startOver}
            className="w-full px-4 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors mb-2"
          >
            Start Over
          </button>
          <button
            onClick={actions.resetProgress}
            className="w-full px-4 py-2 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
          >
            Reset Progress
          </button>
        </div>
      </div>
    </aside>
  );
};
