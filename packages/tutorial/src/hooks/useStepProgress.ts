import { useTutorial } from '../context/TutorialContext';

export const useStepProgress = (stepId: number) => {
  const { state, actions } = useTutorial();

  const isCompleted = state.completedSteps.has(stepId);
  const isCurrent = state.currentStep === stepId;
  const isLocked = stepId > 0 && !state.completedSteps.has(stepId - 1) && stepId !== state.currentStep;
  const attempts = state.attempts[stepId] || 0;
  const userCode = state.userCode[stepId] || '';
  const pluginResult = state.pluginResults[stepId];

  const complete = () => {
    actions.completeStep(stepId);
  };

  const updateCode = (code: string) => {
    actions.updateUserCode(stepId, code);
  };

  const saveResult = (result: any) => {
    actions.savePluginResult(stepId, result);
  };

  const incrementAttempts = () => {
    actions.incrementAttempts(stepId);
  };

  return {
    isCompleted,
    isCurrent,
    isLocked,
    attempts,
    userCode,
    pluginResult,
    complete,
    updateCode,
    saveResult,
    incrementAttempts,
  };
};
