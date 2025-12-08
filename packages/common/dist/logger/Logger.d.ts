import { LogLevel } from './LogLevel.js';
/**
 * Centralized Logger class with configurable log levels.
 * Pure TypeScript implementation with no browser API dependencies.
 *
 * Usage:
 *   import { logger, LogLevel } from '@tlsn/common';
 *   logger.init(LogLevel.DEBUG); // or logger.init(LogLevel.WARN)
 *   logger.info('Application started');
 */
export declare class Logger {
    private static instance;
    private level;
    private initialized;
    private constructor();
    /**
     * Get the singleton Logger instance
     */
    static getInstance(): Logger;
    /**
     * Initialize the logger with a specific log level.
     * Must be called before logging.
     *
     * @param level - The minimum log level to display
     */
    init(level: LogLevel): void;
    /**
     * Update the current log level
     *
     * @param level - The new minimum log level to display
     */
    setLevel(level: LogLevel): void;
    /**
     * Get the current log level
     */
    getLevel(): LogLevel;
    /**
     * Check if the logger has been initialized
     */
    isInitialized(): boolean;
    /**
     * Format timestamp as HH:MM:SS
     */
    private formatTimestamp;
    /**
     * Internal log method that checks level and formats output
     */
    private log;
    /**
     * Log debug messages (most verbose)
     */
    debug(...args: unknown[]): void;
    /**
     * Log informational messages
     */
    info(...args: unknown[]): void;
    /**
     * Log warning messages
     */
    warn(...args: unknown[]): void;
    /**
     * Log error messages (always shown unless level > ERROR)
     */
    error(...args: unknown[]): void;
}
/**
 * Convenience export of the singleton logger instance
 */
export declare const logger: Logger;
//# sourceMappingURL=Logger.d.ts.map