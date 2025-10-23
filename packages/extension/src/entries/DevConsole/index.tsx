import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.scss';

const DevConsole: React.FC = () => {
  return (
    <div className="app">
      <h1>Hello</h1>
    </div>
  );
};

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<DevConsole />);
