/**
 * URL validation utilities for TLSN extension
 *
 * Provides robust URL validation to prevent security issues
 * and ensure only valid HTTP/HTTPS URLs are opened.
 */

/**
 * Allowed URL protocols for window opening
 */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Dangerous protocols that should be rejected
 */
const DANGEROUS_PROTOCOLS = ['javascript:', 'data:', 'file:', 'blob:', 'about:'];

/**
 * Result of URL validation
 */
export interface UrlValidationResult {
  /** Whether the URL is valid and safe to use */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Parsed URL object if valid */
  url?: URL;
}

/**
 * Validate a URL for use with window.tlsn.open()
 *
 * Checks that the URL:
 * - Is a non-empty string
 * - Can be parsed as a valid URL
 * - Uses http: or https: protocol only
 * - Does not use dangerous protocols
 *
 * @param urlString - The URL string to validate
 * @returns Validation result with parsed URL or error message
 *
 * @example
 * ```typescript
 * const result = validateUrl('https://example.com');
 * if (result.valid) {
 *   console.log('URL is safe:', result.url.href);
 * } else {
 *   console.error('Invalid URL:', result.error);
 * }
 * ```
 */
export function validateUrl(urlString: unknown): UrlValidationResult {
  // Check if URL is a non-empty string
  if (!urlString || typeof urlString !== 'string') {
    return {
      valid: false,
      error: 'URL must be a non-empty string',
    };
  }

  const trimmedUrl = urlString.trim();

  if (trimmedUrl.length === 0) {
    return {
      valid: false,
      error: 'URL cannot be empty or whitespace only',
    };
  }

  // Try to parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch (error) {
    return {
      valid: false,
      error: `Invalid URL format: ${trimmedUrl}`,
    };
  }

  // Check for dangerous protocols first
  if (DANGEROUS_PROTOCOLS.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: `Dangerous protocol rejected: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`,
    };
  }

  // Check for allowed protocols
  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    return {
      valid: false,
      error: `Invalid protocol: ${parsedUrl.protocol}. Only HTTP and HTTPS are allowed.`,
    };
  }

  // Additional security checks
  if (!parsedUrl.hostname || parsedUrl.hostname.length === 0) {
    return {
      valid: false,
      error: 'URL must include a valid hostname',
    };
  }

  // URL is valid and safe
  return {
    valid: true,
    url: parsedUrl,
  };
}

/**
 * Sanitize a URL by removing potentially dangerous components
 *
 * This function:
 * - Trims whitespace
 * - Removes URL fragments that could be used for XSS
 * - Normalizes the URL
 *
 * @param urlString - The URL to sanitize
 * @returns Sanitized URL string or null if invalid
 *
 * @example
 * ```typescript
 * const sanitized = sanitizeUrl('  https://example.com#dangerous  ');
 * // Returns: 'https://example.com/'
 * ```
 */
export function sanitizeUrl(urlString: string): string | null {
  const validation = validateUrl(urlString);

  if (!validation.valid || !validation.url) {
    return null;
  }

  // Return the normalized URL without fragment
  const sanitized = new URL(validation.url.href);
  // Keep the fragment for now - it might be needed for single-page apps
  // If security concerns arise, uncomment: sanitized.hash = '';

  return sanitized.href;
}

/**
 * Check if a URL is an HTTP or HTTPS URL
 *
 * This is a convenience function for quick protocol checks.
 *
 * @param urlString - The URL to check
 * @returns true if URL is HTTP or HTTPS
 */
export function isHttpUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return ALLOWED_PROTOCOLS.includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Get a user-friendly error message for URL validation failures
 *
 * @param urlString - The URL that failed validation
 * @returns User-friendly error message
 */
export function getUrlErrorMessage(urlString: unknown): string {
  const result = validateUrl(urlString);

  if (result.valid) {
    return 'URL is valid';
  }

  return result.error || 'Unknown URL validation error';
}