import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { logger, LogLevel } from '@tlsn/common';
import './index.scss';

// Initialize logger at DEBUG level for popup (no IndexedDB access)
logger.init(LogLevel.DEBUG);

interface PluginInfo {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

const ConfirmPopup: React.FC = () => {
  const [pluginInfo, setPluginInfo] = useState<PluginInfo | null>(null);
  const [requestId, setRequestId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Parse URL params to get plugin info
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const description = params.get('description');
    const version = params.get('version');
    const author = params.get('author');
    const reqId = params.get('requestId');

    if (!reqId) {
      setError('Missing request ID');
      return;
    }

    setRequestId(reqId);

    if (name) {
      setPluginInfo({
        name: decodeURIComponent(name),
        description: description
          ? decodeURIComponent(description)
          : 'No description provided',
        version: version ? decodeURIComponent(version) : undefined,
        author: author ? decodeURIComponent(author) : undefined,
      });
    } else {
      // No plugin info available - show unknown plugin warning
      setPluginInfo({
        name: 'Unknown Plugin',
        description:
          'Plugin configuration could not be extracted. Proceed with caution.',
      });
    }
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDeny();
      } else if (
        e.key === 'Enter' &&
        document.activeElement?.id === 'allow-btn'
      ) {
        handleAllow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestId]);

  const handleAllow = useCallback(async () => {
    if (!requestId) return;

    try {
      await browser.runtime.sendMessage({
        type: 'PLUGIN_CONFIRM_RESPONSE',
        requestId,
        allowed: true,
      });
      window.close();
    } catch (err) {
      logger.error('Failed to send allow response:', err);
    }
  }, [requestId]);

  const handleDeny = useCallback(async () => {
    if (!requestId) return;

    try {
      await browser.runtime.sendMessage({
        type: 'PLUGIN_CONFIRM_RESPONSE',
        requestId,
        allowed: false,
      });
      window.close();
    } catch (err) {
      logger.error('Failed to send deny response:', err);
    }
  }, [requestId]);

  if (error) {
    return (
      <div className="confirm-popup confirm-popup--error">
        <div className="confirm-popup__header">
          <span className="confirm-popup__icon">Error</span>
          <h1>Configuration Error</h1>
        </div>
        <div className="confirm-popup__content">
          <p className="confirm-popup__error-message">{error}</p>
        </div>
        <div className="confirm-popup__actions">
          <button
            className="confirm-popup__btn confirm-popup__btn--deny"
            onClick={() => window.close()}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!pluginInfo) {
    return (
      <div className="confirm-popup confirm-popup--loading">
        <div className="confirm-popup__spinner"></div>
        <p>Loading plugin information...</p>
      </div>
    );
  }

  const isUnknown = pluginInfo.name === 'Unknown Plugin';

  return (
    <div className="confirm-popup">
      <div className="confirm-popup__header">
        <span className="confirm-popup__icon">{isUnknown ? '?' : 'P'}</span>
        <h1>Plugin Execution Request</h1>
      </div>

      <div className="confirm-popup__content">
        <div className="confirm-popup__field">
          <label>Plugin Name</label>
          <p
            className={`confirm-popup__value ${isUnknown ? 'confirm-popup__value--warning' : ''}`}
          >
            {pluginInfo.name}
          </p>
        </div>

        <div className="confirm-popup__field">
          <label>Description</label>
          <p
            className={`confirm-popup__value confirm-popup__value--description ${isUnknown ? 'confirm-popup__value--warning' : ''}`}
          >
            {pluginInfo.description}
          </p>
        </div>

        {pluginInfo.version && (
          <div className="confirm-popup__field confirm-popup__field--inline">
            <label>Version</label>
            <p className="confirm-popup__value">{pluginInfo.version}</p>
          </div>
        )}

        {pluginInfo.author && (
          <div className="confirm-popup__field confirm-popup__field--inline">
            <label>Author</label>
            <p className="confirm-popup__value">{pluginInfo.author}</p>
          </div>
        )}

        {isUnknown && (
          <div className="confirm-popup__warning">
            <span className="confirm-popup__warning-icon">!</span>
            <p>
              This plugin's configuration could not be verified. Only proceed if
              you trust the source.
            </p>
          </div>
        )}
      </div>

      <div className="confirm-popup__divider"></div>

      <div className="confirm-popup__actions">
        <button
          className="confirm-popup__btn confirm-popup__btn--deny"
          onClick={handleDeny}
          tabIndex={1}
        >
          Deny
        </button>
        <button
          id="allow-btn"
          className="confirm-popup__btn confirm-popup__btn--allow"
          onClick={handleAllow}
          tabIndex={0}
          autoFocus
        >
          Allow
        </button>
      </div>

      <p className="confirm-popup__hint">
        Press <kbd>Enter</kbd> to allow or <kbd>Esc</kbd> to deny
      </p>
    </div>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<ConfirmPopup />);
}
