/**
 * Log level enum defining the severity hierarchy.
 * Lower values are more verbose.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * String names for log levels
 */
export type LogLevelName = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Default log level (WARN - shows warnings and errors only)
 */
export const DEFAULT_LOG_LEVEL = LogLevel.WARN;

/**
 * Convert LogLevel enum to string name
 */
export function logLevelToName(level: LogLevel): LogLevelName {
  switch (level) {
    case LogLevel.DEBUG:
      return 'DEBUG';
    case LogLevel.INFO:
      return 'INFO';
    case LogLevel.WARN:
      return 'WARN';
    case LogLevel.ERROR:
      return 'ERROR';
    default:
      return 'WARN';
  }
}

/**
 * Convert string name to LogLevel enum
 */
export function nameToLogLevel(name: string): LogLevel {
  switch (name.toUpperCase()) {
    case 'DEBUG':
      return LogLevel.DEBUG;
    case 'INFO':
      return LogLevel.INFO;
    case 'WARN':
      return LogLevel.WARN;
    case 'ERROR':
      return LogLevel.ERROR;
    default:
      return DEFAULT_LOG_LEVEL;
  }
}
