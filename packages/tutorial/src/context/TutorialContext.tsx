import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { TutorialState, TutorialActions, TutorialContextType, PluginResult } from '../types';
import { loadState, saveStateDebounced, clearState, getDefaultState } from '../utils/storage';

const TutorialContext = createContext<TutorialContextType | undefined>(undefined);

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<TutorialState>(() => loadState());

  // Auto-save state changes with debounce
  useEffect(() => {
    saveStateDebounced(state);
  }, [state]);

  const goToStep = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  const completeStep = useCallback((step: number) => {
    setState((prev) => {
      const newCompletedSteps = new Set(prev.completedSteps);
      newCompletedSteps.add(step);

      return {
        ...prev,
        completedSteps: newCompletedSteps,
        currentStep: Math.min(step + 1, 7), // Auto-advance to next step (max 7)
      };
    });
  }, []);

  const updateUserCode = useCallback((step: number, code: string) => {
    setState((prev) => ({
      ...prev,
      userCode: {
        ...prev.userCode,
        [step]: code,
      },
    }));
  }, []);

  const savePluginResult = useCallback((step: number, result: PluginResult) => {
    setState((prev) => ({
      ...prev,
      pluginResults: {
        ...prev.pluginResults,
        [step]: result,
      },
    }));
  }, []);

  const incrementAttempts = useCallback((step: number) => {
    setState((prev) => ({
      ...prev,
      attempts: {
        ...prev.attempts,
        [step]: (prev.attempts[step] || 0) + 1,
      },
    }));
  }, []);

  const completeChallenge = useCallback((step: number, challengeId: number) => {
    setState((prev) => {
      const stepChallenges = prev.completedChallenges[step] || [];
      if (stepChallenges.includes(challengeId)) {
        return prev; // Already completed
      }

      return {
        ...prev,
        completedChallenges: {
          ...prev.completedChallenges,
          [step]: [...stepChallenges, challengeId],
        },
      };
    });
  }, []);

  const resetProgress = useCallback(() => {
    clearState();
    setState(getDefaultState());
  }, []);

  const startOver = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStep: 0,
    }));
  }, []);

  const actions: TutorialActions = {
    goToStep,
    completeStep,
    updateUserCode,
    savePluginResult,
    incrementAttempts,
    completeChallenge,
    resetProgress,
    startOver,
  };

  const contextValue: TutorialContextType = {
    state,
    actions,
  };

  return <TutorialContext.Provider value={contextValue}>{children}</TutorialContext.Provider>;
};

export const useTutorial = (): TutorialContextType => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within TutorialProvider');
  }
  return context;
};
