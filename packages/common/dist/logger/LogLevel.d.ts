/**
 * Log level enum defining the severity hierarchy.
 * Lower values are more verbose.
 */
export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}
/**
 * String names for log levels
 */
export type LogLevelName = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
/**
 * Default log level (WARN - shows warnings and errors only)
 */
export declare const DEFAULT_LOG_LEVEL = LogLevel.WARN;
/**
 * Convert LogLevel enum to string name
 */
export declare function logLevelToName(level: LogLevel): LogLevelName;
/**
 * Convert string name to LogLevel enum
 */
export declare function nameToLogLevel(name: string): LogLevel;
//# sourceMappingURL=LogLevel.d.ts.map