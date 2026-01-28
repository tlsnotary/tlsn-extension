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

      // Find the CHF result in the results array
      const chfResult = pluginOutput.results?.find(
        (r) => r.type === 'RECV' && r.value && r.value.includes('CHF')
      );

      if (!chfResult) {
        return { valid: false, message: 'CHF balance not found in result' };
      }

      // Extract the CHF value from the result
      const match = chfResult.value.match(/"CHF"\s*:\s*"(\d+(_\d+)*)"/);

      if (!match) {
        return { valid: false, message: 'CHF balance pattern not matched in result' };
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
      valid:
        /type:\s*['"]RECV['"]/.test(code) &&
        /part:\s*['"]BODY['"]/.test(code) &&
        /type:\s*['"]json['"]/.test(code) &&
        /path:\s*['"]accounts\.USD['"]/.test(code),
      message:
        /type:\s*['"]RECV['"]/.test(code) &&
        /part:\s*['"]BODY['"]/.test(code) &&
        /type:\s*['"]json['"]/.test(code) &&
        /path:\s*['"]accounts\.USD['"]/.test(code)
          ? 'RECV BODY handler with nested JSON path found'
          : 'Add RECV BODY handler with nested JSON path for USD',
    }),
    errorMessage: 'Add a handler to reveal the USD balance from accounts.USD',
    hint: '{ type: "RECV", part: "BODY", action: "REVEAL", params: { type: "json", path: "accounts.USD" } }',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      // Find USD result in the results array
      const usdResult = pluginOutput.results?.find(
        (r) => r.type === 'RECV' && r.part === 'BODY' && r.value && r.value.includes('USD')
      );

      if (!usdResult) {
        return { valid: false, message: 'USD balance not found in proof' };
      }

      // Check that it contains a USD value
      const hasUSDValue = /USD.*\d+/.test(usdResult.value) || /"USD"/.test(usdResult.value);

      if (hasUSDValue) {
        return { valid: true, message: 'Successfully revealed USD balance from nested path' };
      }

      return { valid: false, message: 'USD balance format not recognized' };
    },
    errorMessage: 'The proof should contain the USD balance from accounts.USD',
  },
];

export const step5Challenge2Validators: ValidationRule[] = [
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /type:\s*['"]SENT['"]/.test(code) && /part:\s*['"]HEADERS['"]/.test(code),
      message:
        /type:\s*['"]SENT['"]/.test(code) && /part:\s*['"]HEADERS['"]/.test(code)
          ? 'SENT HEADERS handler found'
          : 'Add SENT handler for HEADERS',
    }),
    errorMessage: 'Add a handler to reveal the Cookie header from the request',
    hint: '{ type: "SENT", part: "HEADERS", action: "REVEAL", params: { key: "cookie" } }',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      // Find SENT HEADERS result with Cookie
      const sentHeaderResult = pluginOutput.results?.find(
        (r) => r.type === 'SENT' && r.part === 'HEADERS' && r.value && /cookie/i.test(r.value)
      );

      if (!sentHeaderResult) {
        return { valid: false, message: 'Cookie header not found in proof' };
      }

      return { valid: true, message: 'Cookie header successfully revealed' };
    },
    errorMessage: 'The proof should contain the Cookie header from the request',
  },
];

export const step5Challenge3Validators: ValidationRule[] = [
  {
    type: 'code',
    check: ({ code }) => ({
      valid: /type:\s*['"]RECV['"]/.test(code) && /part:\s*['"]HEADERS['"]/.test(code),
      message:
        /type:\s*['"]RECV['"]/.test(code) && /part:\s*['"]HEADERS['"]/.test(code)
          ? 'RECV HEADERS handler found'
          : 'Add RECV handler for HEADERS',
    }),
    errorMessage: 'Add a handler to reveal the Date header from the response',
    hint: '{ type: "RECV", part: "HEADERS", action: "REVEAL", params: { key: "date" } }',
  },
  {
    type: 'result',
    check: ({ pluginOutput }) => {
      if (!pluginOutput || !pluginOutput.success) {
        return { valid: false, message: 'Plugin execution failed' };
      }

      // Find RECV HEADERS result with Date
      const recvHeaderResult = pluginOutput.results?.find(
        (r) => r.type === 'RECV' && r.part === 'HEADERS' && r.value && /date/i.test(r.value)
      );

      if (!recvHeaderResult) {
        return { valid: false, message: 'Date header not found in proof' };
      }

      return { valid: true, message: 'Date header successfully revealed' };
    },
    errorMessage: 'The proof should contain the Date header from the response',
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

      // Concatenate all revealed values to show the redacted transcript
      const revealedValues = pluginOutput.results
        ?.map((r) => r.value || '')
        .filter((v) => v.length > 0)
        .join('');

      if (!revealedValues) {
        return { valid: false, message: 'No revealed data found in proof' };
      }

      // Check if the redacted transcript contains inflated CHF amounts
      const hasInflatedAmount =
        /"CHF"\s*:\s*"275_000_000"/.test(revealedValues) ||
        /"CHF"\s*:\s*"125_000_000"/.test(revealedValues);

      if (hasInflatedAmount) {
        return {
          valid: true,
          message: `✅ Successfully fooled the verifier! Redacted transcript: ${revealedValues.substring(0, 200)}${revealedValues.length > 200 ? '...' : ''}`,
        };
      }

      // Check if it contains the original amount
      if (/"CHF"\s*:\s*"50_000_000"/.test(revealedValues)) {
        return {
          valid: false,
          message: `❌ Redacted transcript shows correct amount. Try revealing multiple CHF values! Transcript: ${revealedValues.substring(0, 200)}${revealedValues.length > 200 ? '...' : ''}`,
        };
      }

      return {
        valid: false,
        message: `❌ No CHF balance found. Redacted transcript: ${revealedValues.substring(0, 200)}${revealedValues.length > 200 ? '...' : ''}`,
      };
    },
    errorMessage: 'Make the verifier believe you have more than 50_000_000 CHF',
    hint: 'The verifier only sees what you reveal. Try revealing the CHF balance multiple times with different amounts.',
  },
];

// Step 2: Concepts Quiz Answers
export const quizAnswers = [
  1, // Question 1: What is the verifier's role? -> Cryptographically verify without seeing private data
  0, // Question 2: PEDERSEN vs REVEAL -> Hashes data for commitment
  1, // Question 3: RECV meaning -> Data received from the server
];
