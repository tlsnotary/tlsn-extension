// Script injected into the page context
console.log('Page script injected');

// Simple API exposed to the page
class ExtensionAPI {
  sendMessage(data: any) {
    window.postMessage(
      {
        type: 'FROM_PAGE',
        payload: data,
      },
      window.location.origin,
    );
  }
}

// Expose API to the page
(window as any).extensionAPI = new ExtensionAPI();

// Listen for messages from the page
window.addEventListener('message', (event) => {
  // Only accept messages from the same origin
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === 'FROM_PAGE') {
    console.log('Received message from page:', event.data);

    // Forward to content script/extension
    window.postMessage(
      {
        type: 'TO_EXTENSION',
        payload: event.data.payload,
      },
      window.location.origin,
    );
  }
});

// Dispatch event to notify page that extension is loaded
window.dispatchEvent(new CustomEvent('extension_loaded'));

export {};