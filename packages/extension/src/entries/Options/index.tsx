import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { LogLevel, logLevelToName, logger } from '@tlsn/common';
import {
  getStoredLogLevel,
  setStoredLogLevel,
} from '../../utils/logLevelStorage';
import './index.scss';

// Initialize logger
logger.init(LogLevel.DEBUG);

type TabId = 'logging' | 'permissions';

interface LogLevelOption {
  level: LogLevel;
  name: string;
  description: string;
}

const LOG_LEVEL_OPTIONS: LogLevelOption[] = [
  {
    level: LogLevel.DEBUG,
    name: 'DEBUG',
    description: 'All logs (verbose)',
  },
  {
    level: LogLevel.INFO,
    name: 'INFO',
    description: 'Informational and above',
  },
  {
    level: LogLevel.WARN,
    name: 'WARN',
    description: 'Warnings and errors only (default)',
  },
  {
    level: LogLevel.ERROR,
    name: 'ERROR',
    description: 'Errors only',
  },
];

const Options: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('logging');
  const [currentLevel, setCurrentLevel] = useState<LogLevel>(LogLevel.WARN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Permissions state
  const [hostPermissions, setHostPermissions] = useState<string[]>([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Load current log level on mount
  useEffect(() => {
    const loadLevel = async () => {
      try {
        const level = await getStoredLogLevel();
        setCurrentLevel(level);
        logger.setLevel(level);
      } catch (error) {
        logger.error('Failed to load log level:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLevel();
  }, []);

  // Load permissions when permissions tab is active
  useEffect(() => {
    if (activeTab === 'permissions') {
      loadPermissions();
    }
  }, [activeTab]);

  // Manifest-defined patterns that cannot be removed via permissions API
  // Note: Since we removed declarative content_scripts from manifest.json,
  // we no longer have required host permissions. Only web_accessible_resources
  // uses <all_urls>, but that doesn't create host permissions.
  // We still filter out wildcard patterns as a safety measure.
  const MANIFEST_PATTERNS = new Set([
    'http://*/*',
    'https://*/*',
    '<all_urls>',
  ]);

  /**
   * Check if an origin is removable (runtime-granted optional permission)
   * A permission is removable if:
   * 1. It's not a manifest-defined pattern (http://*\/* or https://*\/*)
   * 2. It's a specific host pattern (e.g., https://api.x.com/*)
   */
  const isRemovableOrigin = (origin: string): boolean => {
    // Not removable if it's a manifest pattern
    if (MANIFEST_PATTERNS.has(origin)) {
      return false;
    }
    // Only consider specific host patterns as removable
    // These are patterns like "https://api.x.com/*" (not wildcards)
    try {
      const url = new URL(origin.replace('/*', '/'));
      // If host contains wildcards, it's not a specific host
      if (url.hostname.includes('*')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const loadPermissions = async () => {
    setPermissionsLoading(true);
    try {
      const permissions = await browser.permissions.getAll();
      logger.debug('All permissions:', permissions.origins);
      // Filter to only show removable host permissions
      const origins = (permissions.origins || []).filter(isRemovableOrigin);
      logger.debug('Removable permissions:', origins);
      setHostPermissions(origins);
    } catch (error) {
      logger.error('Failed to load permissions:', error);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const handleLevelChange = useCallback(async (level: LogLevel) => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      await setStoredLogLevel(level);
      setCurrentLevel(level);
      logger.setLevel(level);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      logger.error('Failed to save log level:', error);
    } finally {
      setSaving(false);
    }
  }, []);

  const handleDeletePermission = useCallback(async (origin: string) => {
    logger.info('[Options] handleDeletePermission called for:', origin);
    logger.info(
      '[Options] isRemovableOrigin check:',
      isRemovableOrigin(origin),
    );

    // Double-check that this origin is actually removable
    if (!isRemovableOrigin(origin)) {
      logger.warn('[Options] Origin is not removable, skipping:', origin);
      setHostPermissions((prev) => prev.filter((o) => o !== origin));
      setConfirmDelete(null);
      return;
    }

    setDeleting(origin);
    try {
      // Get current permissions to verify the origin exists
      const currentPerms = await browser.permissions.getAll();
      logger.info('[Options] Current permissions:', currentPerms.origins);

      if (!currentPerms.origins?.includes(origin)) {
        logger.info(
          '[Options] Origin not in current permissions, removing from UI',
        );
        setHostPermissions((prev) => prev.filter((o) => o !== origin));
        return;
      }

      logger.info('[Options] Calling browser.permissions.remove for:', origin);
      const removed = await browser.permissions.remove({ origins: [origin] });
      if (removed) {
        setHostPermissions((prev) => prev.filter((o) => o !== origin));
        logger.info('[Options] Permission removed:', origin);
      } else {
        logger.warn('[Options] Failed to remove permission:', origin);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('[Options] Error removing permission:', errorMessage);

      // If Chrome says it's a required permission, remove from UI anyway
      if (errorMessage.includes('required permissions')) {
        logger.warn(
          '[Options] Chrome considers this a required permission, removing from UI:',
          origin,
        );
        setHostPermissions((prev) => prev.filter((o) => o !== origin));
      }
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }, []);

  const handleDeleteAllPermissions = useCallback(async () => {
    if (hostPermissions.length === 0) return;

    logger.info(
      '[Options] handleDeleteAllPermissions called for:',
      hostPermissions,
    );

    setDeleting('all');
    try {
      // Filter to only actually removable permissions
      const removableOrigins = hostPermissions.filter(isRemovableOrigin);
      logger.info('[Options] Filtered removable origins:', removableOrigins);

      if (removableOrigins.length === 0) {
        logger.info('[Options] No removable permissions');
        setHostPermissions([]);
        return;
      }

      // Get current permissions to verify
      const currentPerms = await browser.permissions.getAll();
      const existingOrigins = new Set(currentPerms.origins || []);
      const originsToRemove = removableOrigins.filter((o) =>
        existingOrigins.has(o),
      );

      logger.info('[Options] Origins that actually exist:', originsToRemove);

      if (originsToRemove.length === 0) {
        logger.info('[Options] None of the origins exist in permissions');
        setHostPermissions([]);
        return;
      }

      const removed = await browser.permissions.remove({
        origins: originsToRemove,
      });
      if (removed) {
        setHostPermissions([]);
        logger.info('[Options] All permissions removed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('[Options] Error removing all permissions:', errorMessage);

      // If it's a "required permissions" error, just clear the UI
      if (errorMessage.includes('required permissions')) {
        logger.warn('[Options] Some permissions are required, clearing UI');
        // Reload to show actual state
        loadPermissions();
      }
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }, [hostPermissions]);

  if (loading) {
    return (
      <div className="options options--loading">
        <div className="options__spinner"></div>
        <p>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="options">
      <header className="options__header">
        <h1>TLSN Extension Settings</h1>
      </header>

      {/* Tabs */}
      <nav className="options__tabs">
        <button
          className={`options__tab ${activeTab === 'logging' ? 'options__tab--active' : ''}`}
          onClick={() => setActiveTab('logging')}
        >
          Logging
        </button>
        <button
          className={`options__tab ${activeTab === 'permissions' ? 'options__tab--active' : ''}`}
          onClick={() => setActiveTab('permissions')}
        >
          Permissions
        </button>
      </nav>

      <main className="options__content">
        {/* Logging Tab */}
        {activeTab === 'logging' && (
          <section className="options__section">
            <h2>Log Level</h2>
            <p className="options__section-description">
              Control the verbosity of console logs. Lower levels include all
              higher severity logs.
            </p>

            <div className="options__log-levels">
              {LOG_LEVEL_OPTIONS.map((option) => (
                <label
                  key={option.level}
                  className={`options__radio-label ${
                    currentLevel === option.level
                      ? 'options__radio-label--selected'
                      : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="logLevel"
                    value={option.level}
                    checked={currentLevel === option.level}
                    onChange={() => handleLevelChange(option.level)}
                    disabled={saving}
                    className="options__radio-input"
                  />
                  <span className="options__radio-custom"></span>
                  <span className="options__radio-text">
                    <span className="options__radio-name">{option.name}</span>
                    <span className="options__radio-description">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="options__status">
              {saving && <span className="options__saving">Saving...</span>}
              {saveSuccess && (
                <span className="options__success">Settings saved!</span>
              )}
              <span className="options__current">
                Current: {logLevelToName(currentLevel)}
              </span>
            </div>
          </section>
        )}

        {/* Permissions Tab */}
        {activeTab === 'permissions' && (
          <section className="options__section">
            <h2>Host Permissions</h2>
            <p className="options__section-description">
              These are the hosts the extension currently has access to. You can
              revoke access by clicking the trash icon.
            </p>

            {permissionsLoading ? (
              <div className="options__permissions-loading">
                <div className="options__spinner options__spinner--small"></div>
                <span>Loading permissions...</span>
              </div>
            ) : hostPermissions.length === 0 ? (
              <div className="options__permissions-empty">
                <span className="options__permissions-empty-icon">🔒</span>
                <p>No host permissions granted</p>
                <p className="options__permissions-empty-hint">
                  Permissions are requested when you run plugins that need
                  network access.
                </p>
              </div>
            ) : (
              <>
                <div className="options__permissions-header">
                  <span className="options__permissions-count">
                    {hostPermissions.length} host
                    {hostPermissions.length !== 1 ? 's' : ''}
                  </span>
                  {hostPermissions.length > 1 && (
                    <button
                      className="options__delete-all-btn"
                      onClick={() => setConfirmDelete('all')}
                      disabled={deleting !== null}
                    >
                      Remove All
                    </button>
                  )}
                </div>

                <ul className="options__permissions-list">
                  {hostPermissions.map((origin) => (
                    <li key={origin} className="options__permission-item">
                      <span className="options__permission-origin">
                        {origin}
                      </span>
                      <button
                        className="options__permission-delete"
                        onClick={() => setConfirmDelete(origin)}
                        disabled={deleting !== null}
                        title="Remove permission"
                      >
                        {deleting === origin ? (
                          <span className="options__spinner options__spinner--tiny"></span>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                          </svg>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Confirmation Dialog */}
            {confirmDelete && (
              <div className="options__confirm-overlay">
                <div className="options__confirm-dialog">
                  <h3>Confirm Removal</h3>
                  <p>
                    {confirmDelete === 'all'
                      ? `Remove all ${hostPermissions.length} host permissions?`
                      : `Remove permission for "${confirmDelete}"?`}
                  </p>
                  <p className="options__confirm-warning">
                    Plugins will need to request this permission again to access
                    these hosts.
                  </p>
                  <div className="options__confirm-actions">
                    <button
                      className="options__confirm-cancel"
                      onClick={() => setConfirmDelete(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className="options__confirm-delete"
                      onClick={() =>
                        confirmDelete === 'all'
                          ? handleDeleteAllPermissions()
                          : handleDeletePermission(confirmDelete)
                      }
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="options__footer">
        <p>Changes are saved automatically and take effect immediately.</p>
      </footer>
    </div>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Options />);
}
