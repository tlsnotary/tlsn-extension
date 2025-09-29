/**
 * Resource limits and constraints for the TLSN extension
 *
 * These limits prevent resource exhaustion and ensure good performance.
 */

/**
 * Maximum number of managed windows that can be open simultaneously
 *
 * This prevents memory exhaustion from opening too many windows.
 * Each window tracks its own requests and overlay state.
 *
 * @default 10
 */
export const MAX_MANAGED_WINDOWS = 10;

/**
 * Maximum number of requests to store per window
 *
 * Prevents unbounded memory growth from high-traffic sites.
 * Older requests are removed when limit is reached.
 *
 * @default 1000
 */
export const MAX_REQUESTS_PER_WINDOW = 1000;

/**
 * Timeout for overlay display attempts (milliseconds)
 *
 * If overlay cannot be shown within this timeout, stop retrying.
 * This prevents infinite retry loops if content script never loads.
 *
 * @default 5000 (5 seconds)
 */
export const OVERLAY_DISPLAY_TIMEOUT_MS = 5000;

/**
 * Retry delay for overlay display (milliseconds)
 *
 * Time to wait between retry attempts when content script isn't ready.
 *
 * @default 500 (0.5 seconds)
 */
export const OVERLAY_RETRY_DELAY_MS = 500;

/**
 * Maximum number of retry attempts for overlay display
 *
 * Calculated as OVERLAY_DISPLAY_TIMEOUT_MS / OVERLAY_RETRY_DELAY_MS
 *
 * @default 10 (5000ms / 500ms)
 */
export const MAX_OVERLAY_RETRY_ATTEMPTS = Math.floor(
  OVERLAY_DISPLAY_TIMEOUT_MS / OVERLAY_RETRY_DELAY_MS,
);

/**
 * Interval for periodic cleanup of invalid windows (milliseconds)
 *
 * WindowManager periodically checks for windows that have been closed
 * and removes them from tracking.
 *
 * @default 300000 (5 minutes)
 */
export const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;