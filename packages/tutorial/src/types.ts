// Global type declarations
declare const __GIT_HASH__: string;

// Window extension for tlsn API
declare global {
  interface Window {
    tlsn?: {
      execCode: (code: string) => Promise<string>;
      open: (url: string, options?: { width?: number; height?: number; showOverlay?: boolean }) => Promise<void>;
    };
  }
}

// Tutorial state types
export interface TutorialState {
  currentStep: number; // 0-7
  completedSteps: Set<number>; // Unlocked steps
  userCode: Record<number, string>; // step -> code mapping
  pluginResults: Record<number, PluginResult>; // step -> execution result
  attempts: Record<number, number>; // step -> attempt count
  completedChallenges: Record<number, number[]>; // step -> array of completed challenge IDs
  preferences: {
    showHints: boolean;
    editorTheme: 'light' | 'dark';
  };
}

export interface TutorialActions {
  goToStep: (step: number) => void;
  completeStep: (step: number) => void;
  updateUserCode: (step: number, code: string) => void;
  savePluginResult: (step: number, result: PluginResult) => void;
  incrementAttempts: (step: number) => void;
  completeChallenge: (step: number, challengeId: number) => void;
  resetProgress: () => void;
  startOver: () => void;
}

export interface TutorialContextType {
  state: TutorialState;
  actions: TutorialActions;
}

// Plugin execution types
export interface PluginResult {
  success: boolean;
  output?: string;
  error?: string;
  results?: Array<{ type: string; part?: string; value: string }>;
  timestamp: number;
}

// Validation types
export interface ValidationRule {
  type: 'code' | 'result';
  check: (params: { code: string; pluginOutput?: PluginResult }) => ValidationResult;
  errorMessage: string;
  hint?: string;
}

export interface ValidationResult {
  valid: boolean;
  message: string;
}

// Step configuration types
export interface StepConfig {
  id: number;
  title: string;
  description: string;
  canSkip: boolean;
  validators?: ValidationRule[];
}

// Quiz types
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

// Challenge types
export interface Challenge {
  id: string;
  title: string;
  description: string;
  hints: string[];
  validators: ValidationRule[];
}

// System check types
export interface SystemCheck {
  name: string;
  status: 'checking' | 'success' | 'error';
  message: string;
}

export interface CheckResult {
  extensionReady: boolean;
  verifierReady: boolean;
  browserCompatible: boolean;
}
