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

/**
 * Extract unique domains from request permissions.
 */
function extractDomains(requests?: RequestPermission[]): string[] {
  const domains = new Set<string>();

  if (requests) {
    for (const req of requests) {
      domains.add(req.host);
    }
  }

  return Array.from(domains);
}

/**
 * Format domains for display in the title.
 * Shows up to 3 domains, with "+N more" if there are extras.
 */
function formatDomainsForTitle(domains: string[]): string {
  if (domains.length === 0) return '';

  if (domains.length <= 3) {
    return domains.join(', ');
  }

  return `${domains.slice(0, 3).join(', ')} +${domains.length - 3} more`;
}

const ConfirmPopup: React.FC = () => {
  const [pluginInfo, setPluginInfo] = useState<PluginInfo | null>(null);
  const [requestId, setRequestId] = useState<string>('');
  const [senderOrigin, setSenderOrigin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const name = params.get('name');
    const description = params.get('description');
    const version = params.get('version');
    const author = params.get('author');
    const requestsParam = params.get('requests');
    const urlsParam = params.get('urls');
    const senderOriginParam = params.get('senderOrigin');
    const reqId = params.get('requestId');

    if (!reqId) {
      setError('Missing request ID');
      return;
    }

    setRequestId(reqId);

    if (senderOriginParam) {
      try {
        const url = new URL(decodeURIComponent(senderOriginParam));
        setSenderOrigin(url.hostname);
      } catch {
        setSenderOrigin(decodeURIComponent(senderOriginParam));
      }
    }

    if (name) {
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

  const handleViewSource = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (!requestId) return;

      try {
        const response = await browser.runtime.sendMessage({
          type: 'GET_PLUGIN_CODE',
          requestId,
        });

        if (response?.code) {
          setSourceCode(response.code);
        } else {
          logger.warn('Plugin source code not available');
        }
      } catch (err) {
        logger.error('Failed to load plugin source:', err);
      }
    },
    [requestId],
  );

  if (error) {
    return (
      <div className="confirm-popup confirm-popup--error">
        <div className="confirm-popup__header">
          <span className="confirm-popup__icon">!</span>
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
  const requestDomains = extractDomains(pluginInfo.requests);
  const hasRequestDomains = requestDomains.length > 0;

  // Source code view
  if (sourceCode) {
    return (
      <div className="confirm-popup">
        <div className="confirm-popup__nav-header">
          <button
            className="confirm-popup__back-btn"
            onClick={() => setSourceCode(null)}
          >
            &larr; Back
          </button>
          <span className="confirm-popup__nav-title">Plugin source</span>
        </div>
        <pre className="confirm-popup__source-code">{sourceCode}</pre>
      </div>
    );
  }

  // Details view
  if (showDetails) {
    return (
      <div className="confirm-popup">
        <div className="confirm-popup__nav-header">
          <button
            className="confirm-popup__back-btn"
            onClick={() => setShowDetails(false)}
          >
            &larr; Back
          </button>
          <span className="confirm-popup__nav-title">Plugin details</span>
        </div>
        <div className="confirm-popup__details">
          <div className="confirm-popup__detail-row">
            <label>Title</label>
            <p>{pluginInfo.name}</p>
          </div>
          <div className="confirm-popup__detail-row">
            <label>Description</label>
            <p>{pluginInfo.description}</p>
          </div>
          {pluginInfo.requests && pluginInfo.requests.length > 0 && (
            <div className="confirm-popup__detail-row">
              <label>Request URLs</label>
              <ul className="confirm-popup__detail-list">
                {pluginInfo.requests.map((req, i) => (
                  <li key={i}>
                    <span className="confirm-popup__detail-method">
                      {req.method}
                    </span>
                    {req.host}
                    {req.pathname}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pluginInfo.urls && pluginInfo.urls.length > 0 && (
            <div className="confirm-popup__detail-row">
              <label>Navigation URLs</label>
              <ul className="confirm-popup__detail-list">
                {pluginInfo.urls.map((url, i) => (
                  <li key={i}>{url}</li>
                ))}
              </ul>
            </div>
          )}
          <a
            href="#"
            className="confirm-popup__link"
            onClick={handleViewSource}
          >
            View plugin source
          </a>
        </div>
      </div>
    );
  }

  // Build meta line: "v1.0.0 by AuthorName"
  const metaParts: string[] = [];

  if (pluginInfo.version) metaParts.push(`v${pluginInfo.version}`);
  if (pluginInfo.author) metaParts.push(`by ${pluginInfo.author}`);

  const metaLine = metaParts.join(' ');

  // Main confirmation view
  return (
    <div className="confirm-popup">
      <div className="confirm-popup__content">
        <h1 className="confirm-popup__title">
          {isUnknown ? (
            'An unknown plugin wants to run'
          ) : hasRequestDomains ? (
            <>
              Allow <strong>{senderOrigin || pluginInfo.name}</strong> to access
              your data on{' '}
              <strong>{formatDomainsForTitle(requestDomains)}</strong>?
            </>
          ) : (
            <>
              Allow <strong>{senderOrigin || pluginInfo.name}</strong> to run?
            </>
          )}
        </h1>

        <p className="confirm-popup__description">{pluginInfo.description}</p>

        {metaLine && <p className="confirm-popup__meta">{metaLine}</p>}

        {isUnknown && (
          <div className="confirm-popup__warning">
            <span className="confirm-popup__warning-icon">!</span>
            <p>
              This plugin could not be verified. Only allow it if you trust
              where it came from.
            </p>
          </div>
        )}

        <div className="confirm-popup__links">
          <a
            href="#"
            className="confirm-popup__link"
            onClick={(e) => {
              e.preventDefault();
              setShowDetails(true);
            }}
          >
            More details
          </a>
        </div>
      </div>

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

      <div className="confirm-popup__footer">
        <p className="confirm-popup__hint">
          Press <kbd>Enter</kbd> to allow or <kbd>Esc</kbd> to deny
        </p>
        <a
          href="https://tlsnotary.org/docs/extension/plugins"
          target="_blank"
          rel="noopener noreferrer"
          className="confirm-popup__link"
        >
          Learn more
        </a>
      </div>
    </div>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<ConfirmPopup />);
}
