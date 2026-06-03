export interface Plugin {
  name: string;
  description: string;
  logo: string;
  file: string;
  parseResult: (json: PluginResult) => string;
  /** Work-in-progress / experimental plugin — shown with a "WIP" badge. */
  debug?: boolean;
}

export interface PluginResult {
  results: Array<{
    value: string;
  }>;
}

export interface ConsoleEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export type CheckStatus = 'checking' | 'success' | 'error';

export interface SystemCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  showInstructions?: boolean;
}

export interface ProgressData {
  step: string;
  progress: number;
  message: string;
}

declare global {
  interface Window {
    tlsn?: {
      version?: string;
      execCode: (
        code: string,
        options?: { requestId?: string; sessionData?: Record<string, string> },
      ) => Promise<string>;
    };
  }

  interface Navigator {
    brave?: {
      isBrave: () => Promise<boolean>;
    };
  }
}

export {};
