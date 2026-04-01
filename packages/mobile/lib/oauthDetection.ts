/**
 * OAuth URL detection utilities for system browser handoff.
 *
 * When a plugin declares `oauthHosts` in its config, the WebView should
 * hand off navigation to those hosts to the system browser (which Google,
 * Apple, etc. trust for OAuth sign-in).
 */

/**
 * Check if a URL belongs to a declared OAuth provider host.
 *
 * Matches if the URL's hostname is exactly an entry in `oauthHosts`,
 * or is a subdomain of one (e.g., `accounts.google.com` matches `google.com`).
 * Only matches http/https URLs.
 */
export function isOAuthUrl(url: string, oauthHosts: string[]): boolean {
  if (!oauthHosts || oauthHosts.length === 0) return false;

  let hostname: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }

  return oauthHosts.some((host) => {
    const normalizedHost = host.toLowerCase();
    return hostname === normalizedHost || hostname.endsWith('.' + normalizedHost);
  });
}

/**
 * Determine whether a WebView navigation should be handed off
 * to the system browser for OAuth.
 */
export function shouldHandOffToSystemBrowser(
  url: string,
  isTopFrame: boolean,
  oauthHosts: string[],
  oauthInProgress: boolean,
): boolean {
  if (!oauthHosts || oauthHosts.length === 0) return false;
  if (!isTopFrame) return false;
  if (oauthInProgress) return false;
  return isOAuthUrl(url, oauthHosts);
}
