console.log('Page script injected');

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
   * @returns Promise that resolves with the execution result or rejects with an error
   *
   * @example
   * ```javascript
   * // Execute simple code
   * const result = await window.tlsn.execCode('1 + 2');
   * console.log(result); // 3
   *
   * // Handle errors
   * try {
   *   await window.tlsn.execCode('throw new Error("test")');
   * } catch (error) {
   *   console.error(error);
   * }
   * ```
   */
  async execCode(code: string): Promise<any> {
    if (!code || typeof code !== 'string') {
      throw new Error('Code must be a non-empty string');
    }

    return new Promise((resolve, reject) => {
      // Generate a unique request ID for this execution
      const requestId = `exec_${Date.now()}_${Math.random()}`;

      // Set up one-time listener for the response
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== 'TLSN_EXEC_CODE_RESPONSE') return;
        if (event.data?.requestId !== requestId) return;

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
      setTimeout(() => {
        window.removeEventListener('message', handleMessage);
        reject(new Error('Code execution timeout'));
      }, 30000); // 30 second timeout
    });
  }
}

// Expose API to the page
(window as any).tlsn = new ExtensionAPI();

// Dispatch event to notify page that extension is loaded
window.dispatchEvent(new CustomEvent('extension_loaded'));
