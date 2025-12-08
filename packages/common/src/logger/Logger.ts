import { LogLevel, DEFAULT_LOG_LEVEL, logLevelToName } from './LogLevel.js';

/**
 * Centralized Logger class with configurable log levels.
 * Pure TypeScript implementation with no browser API dependencies.
 *
 * Usage:
 *   import { logger, LogLevel } from '@tlsn/common';
 *   logger.init(LogLevel.DEBUG); // or logger.init(LogLevel.WARN)
 *   logger.info('Application started');
 */
export class Logger {
  private static instance: Logger;
  private level: LogLevel = DEFAULT_LOG_LEVEL;
  private initialized = false;

  private constructor() {}

  /**
   * Get the singleton Logger instance
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Initialize the logger with a specific log level.
   * Must be called before logging.
   *
   * @param level - The minimum log level to display
   */
  init(level: LogLevel): void {
    this.level = level;
    this.initialized = true;
  }

  /**
   * Update the current log level
   *
   * @param level - The new minimum log level to display
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Check if the logger has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Format timestamp as HH:MM:SS
   */
  private formatTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Internal log method that checks level and formats output
   */
  private log(level: LogLevel, ...args: unknown[]): void {
    // Auto-initialize with default level if not initialized
    if (!this.initialized) {
      this.init(DEFAULT_LOG_LEVEL);
    }

    // Only log if message level >= current log level
    if (level < this.level) {
      return;
    }

    const timestamp = this.formatTimestamp();
    const levelName = logLevelToName(level);
    const prefix = `[${timestamp}] [${levelName}]`;

    switch (level) {
      case LogLevel.DEBUG:
        console.log(prefix, ...args);
        break;
      case LogLevel.INFO:
        console.info(prefix, ...args);
        break;
      case LogLevel.WARN:
        console.warn(prefix, ...args);
        break;
      case LogLevel.ERROR:
        console.error(prefix, ...args);
        break;
    }
  }

  /**
   * Log debug messages (most verbose)
   */
  debug(...args: unknown[]): void {
    this.log(LogLevel.DEBUG, ...args);
  }

  /**
   * Log informational messages
   */
  info(...args: unknown[]): void {
    this.log(LogLevel.INFO, ...args);
  }

  /**
   * Log warning messages
   */
  warn(...args: unknown[]): void {
    this.log(LogLevel.WARN, ...args);
  }

  /**
   * Log error messages (always shown unless level > ERROR)
   */
  error(...args: unknown[]): void {
    this.log(LogLevel.ERROR, ...args);
  }
}

/**
 * Convenience export of the singleton logger instance
 */
export const logger = Logger.getInstance();
