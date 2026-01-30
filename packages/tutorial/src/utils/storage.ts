import { TutorialState } from '../types';

const STORAGE_KEY = 'tlsn-tutorial-progress';
const AUTO_SAVE_DELAY = 1000; // 1 second debounce

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const getDefaultState = (): TutorialState => ({
  currentStep: 0,
  completedSteps: new Set<number>(),
  userCode: {},
  pluginResults: {},
  attempts: {},
  completedChallenges: {},
  preferences: {
    showHints: true,
    editorTheme: 'dark',
  },
});

export const loadState = (): TutorialState => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return getDefaultState();

    const parsed = JSON.parse(saved);

    // Convert completedSteps array back to Set
    // Add backward compatibility for completedChallenges
    return {
      ...parsed,
      completedSteps: new Set(parsed.completedSteps || []),
      completedChallenges: parsed.completedChallenges || {},
    };
  } catch (error) {
    console.error('Failed to load tutorial state:', error);
    return getDefaultState();
  }
};

export const saveState = (state: TutorialState): void => {
  try {
    // Convert Set to array for JSON serialization
    const toSave = {
      ...state,
      completedSteps: Array.from(state.completedSteps),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (error) {
    console.error('Failed to save tutorial state:', error);
  }
};

export const saveStateDebounced = (state: TutorialState): void => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  saveTimeout = setTimeout(() => {
    saveState(state);
  }, AUTO_SAVE_DELAY);
};

export const clearState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear tutorial state:', error);
  }
};
