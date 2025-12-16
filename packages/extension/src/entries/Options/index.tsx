import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { LogLevel, logLevelToName, logger } from '@tlsn/common';
import {
  getStoredLogLevel,
  setStoredLogLevel,
} from '../../utils/logLevelStorage';
import './index.scss';

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
  const [currentLevel, setCurrentLevel] = useState<LogLevel>(LogLevel.WARN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load current log level on mount
  useEffect(() => {
    const loadLevel = async () => {
      try {
        const level = await getStoredLogLevel();
        setCurrentLevel(level);
        // Initialize the logger with the stored level
        logger.init(level);
      } catch (error) {
        logger.error('Failed to load log level:', error);
      } finally {
        setLoading(false);
      }
    };

    loadLevel();
  }, []);

  const handleLevelChange = useCallback(async (level: LogLevel) => {
    setSaving(true);
    setSaveSuccess(false);

    try {
      await setStoredLogLevel(level);
      setCurrentLevel(level);
      // Update the logger immediately
      logger.setLevel(level);

      setSaveSuccess(true);
      // Clear success message after 2 seconds
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      logger.error('Failed to save log level:', error);
    } finally {
      setSaving(false);
    }
  }, []);

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

      <main className="options__content">
        <section className="options__section">
          <h2>Logging</h2>
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
