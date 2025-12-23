import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { logger, LogLevel } from '@tlsn/common';
import './index.scss';

// Initialize logger at DEBUG level for popup (no IndexedDB access)
logger.init(LogLevel.DEBUG);

interface RequestPermission {
  method: string;
  host: string;
  pathname: string;
  verifierUrl: string;
  proxyUrl?: string;
}

interface PluginInfo {
  name: string;
  description: string;
  version?: string;
  author?: string;
  requests?: RequestPermission[];
  urls?: string[];
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
    const requestsParam = params.get('requests');
    const urlsParam = params.get('urls');
    const reqId = params.get('requestId');

    if (!reqId) {
      setError('Missing request ID');
      return;
    }

    setRequestId(reqId);

    if (name) {
      // Parse permission arrays from JSON
      let requests: RequestPermission[] | undefined;
      let urls: string[] | undefined;

      try {
        if (requestsParam) {
          requests = JSON.parse(decodeURIComponent(requestsParam));
        }
      } catch (e) {
        logger.warn('Failed to parse requests param:', e);
      }

      try {
        if (urlsParam) {
          urls = JSON.parse(decodeURIComponent(urlsParam));
        }
      } catch (e) {
        logger.warn('Failed to parse urls param:', e);
      }

      setPluginInfo({
        name: decodeURIComponent(name),
        description: description
          ? decodeURIComponent(description)
          : 'No description provided',
        version: version ? decodeURIComponent(version) : undefined,
        author: author ? decodeURIComponent(author) : undefined,
        requests,
        urls,
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

        {/* Permissions Section */}
        {(pluginInfo.requests || pluginInfo.urls) && (
          <div className="confirm-popup__permissions">
            <h2 className="confirm-popup__permissions-title">Permissions</h2>

            {pluginInfo.requests && pluginInfo.requests.length > 0 && (
              <div className="confirm-popup__permission-group">
                <label>
                  <span className="confirm-popup__permission-icon">🌐</span>
                  Network Requests
                </label>
                <ul className="confirm-popup__permission-list">
                  {pluginInfo.requests.map((req, index) => (
                    <li key={index} className="confirm-popup__permission-item">
                      <span className="confirm-popup__method">
                        {req.method}
                      </span>
                      <span className="confirm-popup__host">{req.host}</span>
                      <span className="confirm-popup__pathname">
                        {req.pathname}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pluginInfo.urls && pluginInfo.urls.length > 0 && (
              <div className="confirm-popup__permission-group">
                <label>
                  <span className="confirm-popup__permission-icon">🔗</span>
                  Allowed URLs
                </label>
                <ul className="confirm-popup__permission-list">
                  {pluginInfo.urls.map((url, index) => (
                    <li key={index} className="confirm-popup__permission-item">
                      <span className="confirm-popup__url">{url}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* No permissions warning */}
        {!pluginInfo.requests && !pluginInfo.urls && !isUnknown && (
          <div className="confirm-popup__no-permissions">
            <span className="confirm-popup__warning-icon">!</span>
            <p>
              This plugin has no permissions defined. It will not be able to
              make network requests or open browser windows.
            </p>
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
