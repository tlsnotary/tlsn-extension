import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { initMatomo } from './analytics';

initMatomo();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
