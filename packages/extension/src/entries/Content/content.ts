// Note: This file runs in page context, not extension context
// We use console.log here intentionally as @tlsn/common may not be available

/**
 * ExtensionAPI - Public API exposed to web pages via window.tlsn
 *
 * Provides methods for web pages to interact with the TLSN extension,
 * including opening new windows for notarization.
 */
class ExtensionAPI {
  /**
   * Execute JavaScript code in a sandboxed environment
   *
   * @param code - The JavaScript code to execute
   * @param options - Optional settings
   * @param options.requestId - Caller-provided ID for correlating progress events.
   *   When provided, progress events are dispatched as `TLSN_PROVE_PROGRESS`
   *   window messages with this requestId so the caller can match them.
   * @returns Promise that resolves with the execution result or rejects with an error
   *
   * @example
   * ```javascript
   * // Listen for progress events
   * window.addEventListener('message', (event) => {
   *   if (event.data?.type === 'TLSN_PROVE_PROGRESS') {
   *     console.log(event.data.step, event.data.progress, event.data.message);
   *   }
   * });
   *
   * // Execute with progress tracking
   * const result = await window.tlsn.execCode(pluginCode, {
   *   requestId: 'my-request-123',
   * });
   * ```
   */
  async execCode(code: string, options?: { requestId?: string }): Promise<any> {
    if (!code || typeof code !== 'string') {
      throw new Error('Code must be a non-empty string');
    }

    return new Promise((resolve, reject) => {
      // Use caller-provided requestId or generate one
      const requestId =
        options?.requestId || `exec_${Date.now()}_${Math.random()}`;
      let timeout: any = null;

      // Set up one-time listener for the response
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'TLSN_EXEC_CODE_RESPONSE') return;
        if (event.data?.requestId !== requestId) return;

        if (timeout) {
          clearTimeout(timeout);
        }
        // Remove listener
        window.removeEventListener('message', handleMessage);

        // Handle response
        if (event.data.success) {
          resolve(event.data.result);
        } else {
          reject(new Error(event.data.error || 'Code execution failed'));
        }
      };

      window.addEventListener('message', handleMessage);

      // Send message to content script
      window.postMessage(
        {
          type: 'TLSN_EXEC_CODE',
          payload: {
            code,
            requestId,
          },
        },
        window.location.origin,
      );

      // Add timeout
      timeout = setTimeout(
        () => {
          window.removeEventListener('message', handleMessage);
          reject(new Error('Code execution timeout'));
        },
        15 * 60 * 1000,
      ); // 15 minute timeout
    });
  }
}

// Expose API to the page
(window as any).tlsn = new ExtensionAPI();

// Dispatch event to notify page that extension is loaded
window.dispatchEvent(new CustomEvent('tlsn_loaded'));
