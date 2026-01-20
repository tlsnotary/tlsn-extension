import { ValidationRule } from '../types';

// Step 4: Swiss Bank Basic - CHF Handler Validation
export const step4Validators: ValidationRule[] = [
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /type:\s*['"]RECV['"]/.test(code),
      message: /type:\s*['"]RECV['"]/.test(code)
        ? 'Handler structure looks good'
        : 'Missing RECV handler',
    }),
    errorMessage: 'You need to add a handler with type: "RECV"',
    hint: 'Look for the TODO comment and add the handler object there',
  },
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /regex:\s*['"].*CHF.*['"]/.test(code),
      message: /regex:\s*['"].*CHF.*['"]/.test(code)
        ? 'Regex pattern found for CHF'
        : 'Missing regex pattern for CHF balance',
    }),
    errorMessage: 'Add a regex pattern to match the CHF balance',
    hint: 'Use the regex pattern: "CHF"\\s*:\\s*"[^"]+"',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      const outputStr = JSON.stringify(pluginOutput);
      const match = outputStr.match(/"CHF":\s*"(\d+(_\d+)*)"/);

      if (!match) {
        return { valid: false, message: 'CHF balance not found in result' };
      }

      const balance = match[1].replace(/_/g, '');
      const isCorrect = balance === '50000000';

      return {
        valid: isCorrect,
        message: isCorrect
          ? `Verified CHF balance: ${match[1]}`
          : `Found CHF balance: ${match[1]}, but expected 50_000_000`,
      };
    },
    errorMessage: 'The proof should contain the verified CHF balance of 50_000_000',
  },
];

// Step 5: Swiss Bank Advanced - Multiple Challenges
export const step5Challenge1Validators: ValidationRule[] = [
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /regex:\s*['"].*USD.*['"]/.test(code),
      message: /regex:\s*['"].*USD.*['"]/.test(code)
        ? 'USD regex pattern found'
        : 'Add regex pattern for USD balance',
    }),
    errorMessage: 'Add a regex handler to reveal the USD balance',
    hint: 'Use a similar pattern to CHF but match "USD" instead',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      const outputStr = JSON.stringify(pluginOutput);
      const hasUSD = /"USD":\s*"\d+(_\d+)*"/.test(outputStr);
      const hasCHF = /"CHF":\s*"\d+(_\d+)*"/.test(outputStr);

      if (hasUSD && !hasCHF) {
        return { valid: true, message: 'Successfully revealed only USD balance' };
      }

      if (hasUSD && hasCHF) {
        return { valid: false, message: 'Both USD and CHF found. Only reveal USD for this challenge.' };
      }

      return { valid: false, message: 'USD balance not found in proof' };
    },
    errorMessage: 'The proof should contain only the USD balance',
  },
];

export const step5Challenge2Validators: ValidationRule[] = [
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /action:\s*['"]PEDERSEN['"]/.test(code) && /regex:\s*['"].*EUR.*['"]/.test(code),
      message:
        /action:\s*['"]PEDERSEN['"]/.test(code) && /regex:\s*['"].*EUR.*['"]/.test(code)
          ? 'PEDERSEN handler found for EUR'
          : 'Add PEDERSEN handler for EUR balance',
    }),
    errorMessage: 'Use PEDERSEN commitment instead of REVEAL for the EUR balance',
    hint: 'Change action: "REVEAL" to action: "PEDERSEN"',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      // With PEDERSEN, we should not see the EUR value in plaintext
      const outputStr = JSON.stringify(pluginOutput);
      const hasEURPlaintext = /"EUR":\s*"\d+(_\d+)*"/.test(outputStr);

      if (!hasEURPlaintext) {
        return { valid: true, message: 'EUR balance hidden with PEDERSEN commitment' };
      }

      return { valid: false, message: 'EUR balance should be hidden (use PEDERSEN, not REVEAL)' };
    },
    errorMessage: 'EUR balance should be committed with PEDERSEN, not revealed in plaintext',
  },
];

export const step5Challenge3Validators: ValidationRule[] = [
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /type:\s*['"]SENT['"]/.test(code) && /part:\s*['"]START_LINE['"]/.test(code),
      message:
        /type:\s*['"]SENT['"]/.test(code) && /part:\s*['"]START_LINE['"]/.test(code)
          ? 'SENT START_LINE handler found'
          : 'Add SENT handler for START_LINE',
    }),
    errorMessage: 'Add a handler to reveal the request start line (method and path)',
    hint: '{ type: "SENT", part: "START_LINE", action: "REVEAL" }',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      const outputStr = JSON.stringify(pluginOutput);
      const hasMethod = /GET|POST|PUT|DELETE/.test(outputStr);
      const hasPath = /\/balances/.test(outputStr);

      if (hasMethod && hasPath) {
        return { valid: true, message: 'Request method and path verified' };
      }

      return { valid: false, message: 'Request start line not found in proof' };
    },
    errorMessage: 'The proof should contain the HTTP method and request path',
  },
];

// Step 6: Challenge - Break the Verifier
export const step6Validators: ValidationRule[] = [
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      const outputStr = JSON.stringify(pluginOutput);
      const match = outputStr.match(/Verified Swiss Frank \(CHF\) balance:\s*"?(\d+(_\d+)*)"?/);

      if (!match) {
        return { valid: false, message: 'No CHF balance found in verification' };
      }

      const balance = match[1].replace(/_/g, '');
      const balanceInt = parseInt(balance, 10);
      const originalAmount = 50000000;

      if (balanceInt > originalAmount) {
        return { valid: true, message: `Successfully fooled the verifier with ${match[1]} CHF` };
      }

      if (balanceInt === originalAmount) {
        return {
          valid: false,
          message: 'Balance is correct. Try to make the verifier believe you have MORE CHF.',
        };
      }

      return { valid: false, message: 'Balance is lower than expected' };
    },
    errorMessage: 'Make the verifier believe you have more than 50_000_000 CHF',
    hint: 'The verifier only sees what you reveal. Try revealing additional numbers that the naive check will add together.',
  },
];

// Step 2: Concepts Quiz Answers
export const quizAnswers = [
  1, // Question 1: What is the verifier's role? -> Cryptographically verify without seeing private data
  0, // Question 2: PEDERSEN vs REVEAL -> Hashes data for commitment
  1, // Question 3: RECV meaning -> Data received from the server
];
