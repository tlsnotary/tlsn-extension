/**
 * Log level enum defining the severity hierarchy.
 * Lower values are more verbose.
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (LogLevel = {}));
/**
 * Default log level (WARN - shows warnings and errors only)
 */
export const DEFAULT_LOG_LEVEL = LogLevel.WARN;
/**
 * Convert LogLevel enum to string name
 */
export function logLevelToName(level) {
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
export function nameToLogLevel(name) {
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
//# sourceMappingURL=LogLevel.js.map