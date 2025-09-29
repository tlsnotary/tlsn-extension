console.log('Page script injected');

/**
 * ExtensionAPI - Public API exposed to web pages via window.tlsn
 *
 * Provides methods for web pages to interact with the TLSN extension,
 * including opening new windows for notarization.
 */
class ExtensionAPI {
  /**
   * Legacy sendMessage method
   * @deprecated Use specific methods like open() instead
   */
  sendMessage(data: any) {
    window.postMessage(
      {
        type: 'TLSN_CONTENT_SCRIPT_MESSAGE',
        payload: data,
      },
      window.location.origin,
    );
  }

  /**
   * Open a new browser window with the specified URL
   *
   * The window will have request interception enabled and display
   * the TLSN overlay showing all captured HTTP requests.
   *
   * @param url - The URL to open in the new window
   * @param options - Optional window configuration
   * @param options.width - Window width in pixels (default: 900)
   * @param options.height - Window height in pixels (default: 700)
   * @param options.showOverlay - Whether to show the TLSN overlay (default: true)
   * @returns Promise that resolves when the window is opened
   *
   * @example
   * ```javascript
   * // Open Twitter in a new window
   * await window.tlsn.open('https://twitter.com');
   *
   * // Open with custom dimensions
   * await window.tlsn.open('https://example.com', {
   *   width: 1200,
   *   height: 800,
   *   showOverlay: true
   * });
   * ```
   */
  async open(
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ): Promise<void> {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Send message to content script
    window.postMessage(
      {
        type: 'TLSN_OPEN_WINDOW',
        payload: {
          url,
          width: options?.width,
          height: options?.height,
          showOverlay: options?.showOverlay,
        },
      },
      window.location.origin,
    );

    // Return immediately - actual window opening is async
    // Future enhancement: Could return a Promise that resolves with window info
  }
}

// Expose API to the page
(window as any).tlsn = new ExtensionAPI();

// Dispatch event to notify page that extension is loaded
window.dispatchEvent(new CustomEvent('extension_loaded'));
