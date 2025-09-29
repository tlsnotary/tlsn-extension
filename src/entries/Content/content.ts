console.log('Page script injected');

// Simple API exposed to the page
class ExtensionAPI {
  sendMessage(data: any) {
    window.postMessage(
      {
        type: 'TLSN_CONTENT_SCRIPT_MESSAGE',
        payload: data,
      },
      window.location.origin,
    );
  }
}

// Expose API to the page
(window as any).tlsn = new ExtensionAPI();

// Dispatch event to notify page that extension is loaded
window.dispatchEvent(new CustomEvent('extension_loaded'));
