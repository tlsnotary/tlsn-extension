import { PluginConfig, RequestPermission } from '@tlsn/plugin-sdk/src/types';

/**
 * Derives the default proxy URL from a verifier URL.
 * https://verifier.example.com -> wss://verifier.example.com/proxy?token={host}
 * http://localhost:7047 -> ws://localhost:7047/proxy?token={host}
 */
export function deriveProxyUrl(
  verifierUrl: string,
  targetHost: string,
): string {
  const url = new URL(verifierUrl);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/proxy?token=${targetHost}`;
}

/**
 * Matches a URL pathname against a URLPattern pathname pattern.
 * Uses the URLPattern API for pattern matching.
 */
export function matchesPathnamePattern(
  pathname: string,
  pattern: string,
): boolean {
  try {
    // URLPattern is available in modern browsers
    const urlPattern = new URLPattern({ pathname: pattern });
    return urlPattern.test({ pathname });
  } catch {
    // Fallback: simple wildcard matching
    // Convert * to regex .* and ** to multi-segment match
    const regexPattern = pattern
      .replace(/\*\*/g, '<<<MULTI>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<MULTI>>>/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(pathname);
  }
}

/**
 * Validates that a prove() call is allowed by the plugin's permissions.
 * Throws an error if the permission is not granted.
 */
export function validateProvePermission(
  requestOptions: { url: string; method: string },
  proverOptions: { verifierUrl: string; proxyUrl: string },
  config: PluginConfig | null,
): void {
  // If no config or no requests permissions defined, deny by default
  if (!config?.requests || config.requests.length === 0) {
    throw new Error(
      `Permission denied: Plugin has no request permissions defined. ` +
        `Cannot make ${requestOptions.method} request to ${requestOptions.url}`,
    );
  }

  const url = new URL(requestOptions.url);
  const requestMethod = requestOptions.method.toUpperCase();

  const matchingPermission = config.requests.find((perm: RequestPermission) => {
    // Check method (case-insensitive)
    const methodMatch = perm.method.toUpperCase() === requestMethod;
    if (!methodMatch) return false;

    // Check host
    const hostMatch = perm.host === url.hostname;
    if (!hostMatch) return false;

    // Check pathname pattern
    const pathnameMatch = matchesPathnamePattern(url.pathname, perm.pathname);
    if (!pathnameMatch) return false;

    // Check verifier URL
    const verifierMatch = perm.verifierUrl === proverOptions.verifierUrl;
    if (!verifierMatch) return false;

    // Check proxy URL (use derived default if not specified in permission)
    const expectedProxyUrl =
      perm.proxyUrl ?? deriveProxyUrl(perm.verifierUrl, url.hostname);
    const proxyMatch = expectedProxyUrl === proverOptions.proxyUrl;
    if (!proxyMatch) return false;

    return true;
  });

  if (!matchingPermission) {
    const permissionsSummary = config.requests
      .map(
        (p: RequestPermission) =>
          `  - ${p.method} ${p.host}${p.pathname} (verifier: ${p.verifierUrl})`,
      )
      .join('\n');

    throw new Error(
      `Permission denied: Plugin does not have permission to make ${requestMethod} request to ${url.hostname}${url.pathname} ` +
        `with verifier ${proverOptions.verifierUrl} and proxy ${proverOptions.proxyUrl}.\n` +
        `Declared request permissions:\n${permissionsSummary}`,
    );
  }
}

/**
 * Validates that an openWindow() call is allowed by the plugin's permissions.
 * Throws an error if the permission is not granted.
 */
export function validateOpenWindowPermission(
  url: string,
  config: PluginConfig | null,
): void {
  // If no config or no urls permissions defined, deny by default
  if (!config?.urls || config.urls.length === 0) {
    throw new Error(
      `Permission denied: Plugin has no URL permissions defined. ` +
        `Cannot open URL ${url}`,
    );
  }

  const hasPermission = config.urls.some((allowedPattern: string) => {
    try {
      // Try URLPattern first
      const pattern = new URLPattern(allowedPattern);
      return pattern.test(url);
    } catch {
      // Fallback: treat as simple glob pattern
      // Convert * to regex
      const regexPattern = allowedPattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars except *
        .replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(url);
    }
  });

  if (!hasPermission) {
    throw new Error(
      `Permission denied: Plugin does not have permission to open URL ${url}.\n` +
        `Declared URL permissions:\n${config.urls.map((u: string) => `  - ${u}`).join('\n')}`,
    );
  }
}
