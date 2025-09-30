import React from 'react';
import { createRoot } from 'react-dom/client';

const OffscreenApp: React.FC = () => {
  React.useEffect(() => {
    console.log('Offscreen document loaded');

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Offscreen received message:', request);

      // Example message handling
      if (request.type === 'PROCESS_DATA') {
        // Process data in offscreen context
        sendResponse({ success: true, data: 'Processed in offscreen' });
      }
    });
  }, []);

  return (
    <div className="offscreen-container">
      <h1>Offscreen Document</h1>
      <p>This document runs in the background for processing tasks.</p>
    </div>
  );
};

const container = document.getElementById('app-container');
if (container) {
  const root = createRoot(container);
  root.render(<OffscreenApp />);
}
