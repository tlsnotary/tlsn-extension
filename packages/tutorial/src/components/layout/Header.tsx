import React from 'react';
import { ProgressBar } from '../shared/ProgressBar';
import { useTutorial } from '../../context/TutorialContext';

export const Header: React.FC = () => {
  const { state } = useTutorial();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold gradient-text">TLSNotary Plugin Tutorial</h1>
          <div className="text-sm text-gray-600">
            Interactive Learning Platform
          </div>
        </div>
        <ProgressBar currentStep={state.currentStep + 1} totalSteps={8} />
      </div>
    </header>
  );
};
