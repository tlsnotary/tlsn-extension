import browser from 'webextension-polyfill';
import { logger } from '@tlsn/common';
import { RequestPermission } from '@tlsn/plugin-sdk/src/types';

/**
 * Represents a permission pattern with metadata for display.
 */
interface PermissionPattern {
  /** Browser permission pattern (e.g., "https://api.x.com/*") */
  origin: string;
  /** Original host from config */
  host: string;
  /** Original pathname pattern from config */
  pathname: string;
}

/**
 * Manages runtime host permissions for plugin execution.
 *
 * The extension uses optional_host_permissions instead of blanket host_permissions.
 * Permissions are requested before plugin execution and revoked after completion.
 */
export class PermissionManager {
  /** Track permissions currently in use by active plugin executions */
  private activePermissions: Map<string, number> = new Map();

  /**
   * Extract permission patterns from plugin's request permissions.
   * Uses req.host and req.pathname to build patterns.
   *
   * Note: Browser permissions API only supports origin-level permissions,
   * but we track pathname for display and internal validation.
   *
   * @example
   * // Input: { host: "api.x.com", pathname: "/1.1/users/*" }
   * // Output: { origin: "https://api.x.com/*", host: "api.x.com", pathname: "/1.1/users/*" }
   */
  extractPermissionPatterns(
    requests: RequestPermission[],
  ): PermissionPattern[] {
    const patterns: PermissionPattern[] = [];
    const seenOrigins = new Set<string>();

    for (const req of requests) {
      // Build origin pattern from req.host
      const origin = `https://${req.host}/*`;

      if (!seenOrigins.has(origin)) {
        seenOrigins.add(origin);
        patterns.push({
          origin,
          host: req.host,
          pathname: req.pathname,
        });
      }

      // Also add the verifier URL host if different
      try {
        const verifierUrl = new URL(req.verifierUrl);
        const verifierOrigin = `${verifierUrl.protocol}//${verifierUrl.host}/*`;

        if (!seenOrigins.has(verifierOrigin)) {
          seenOrigins.add(verifierOrigin);
          patterns.push({
            origin: verifierOrigin,
            host: verifierUrl.host,
            pathname: '/*', // Verifier needs full access
          });
        }
      } catch {
        // Invalid verifier URL, skip
      }
    }

    return patterns;
  }

  /**
   * Extract just the origin patterns for browser.permissions API.
   * Uses req.host to build origin-level patterns.
   */
  extractOrigins(requests: RequestPermission[]): string[] {
    return this.extractPermissionPatterns(requests).map((p) => p.origin);
  }

  /**
   * Format permissions for display in UI.
   * Shows both host and pathname for user clarity.
   */
  formatForDisplay(requests: RequestPermission[]): string[] {
    return requests.map((req) => `${req.host}${req.pathname}`);
  }

  /**
   * Request permissions for the given host patterns.
   * Tracks active permissions to handle concurrent plugin executions.
   *
   * @returns true if all permissions granted, false otherwise
   */
  async requestPermissions(origins: string[]): Promise<boolean> {
    if (origins.length === 0) return true;

    try {
      // Check if already have permissions
      const alreadyGranted = await this.hasPermissions(origins);
      if (alreadyGranted) {
        logger.debug(
          '[PermissionManager] Permissions already granted for:',
          origins,
        );
        // Track that we're using these permissions
        this.trackPermissionUsage(origins, 1);
        return true;
      }

      // Request new permissions
      const granted = await browser.permissions.request({ origins });
      logger.info(
        `[PermissionManager] Permissions ${granted ? 'granted' : 'denied'} for:`,
        origins,
      );

      if (granted) {
        this.trackPermissionUsage(origins, 1);
      }

      return granted;
    } catch (error) {
      logger.error('[PermissionManager] Failed to request permissions:', error);
      return false;
    }
  }

  /**
   * Check if an origin is removable (not a manifest-defined wildcard pattern).
   * Manifest patterns like "http://*\/*" and "https://*\/*" cannot be removed.
   */
  private isRemovableOrigin(origin: string): boolean {
    // Manifest-defined patterns that cannot be removed
    const manifestPatterns = ['http://*/*', 'https://*/*', '<all_urls>'];
    if (manifestPatterns.includes(origin)) {
      return false;
    }
    // Check if host contains wildcards (not removable)
    try {
      const url = new URL(origin.replace('/*', '/'));
      if (url.hostname.includes('*')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove permissions for the given host patterns.
   * Only removes if no other plugin execution is using them.
   * Filters out non-removable (manifest-defined) patterns.
   */
  async removePermissions(origins: string[]): Promise<boolean> {
    logger.info('[PermissionManager] removePermissions called with:', origins);

    if (origins.length === 0) {
      logger.info('[PermissionManager] No origins to remove (empty array)');
      return true;
    }

    // Decrement usage count
    this.trackPermissionUsage(origins, -1);

    // Only remove permissions that are no longer in use AND are removable
    logger.info('[PermissionManager] Filtering origins for removal...');
    const originsToRemove = origins.filter((origin) => {
      const count = this.activePermissions.get(origin) || 0;
      const notInUse = count <= 0;
      const removable = this.isRemovableOrigin(origin);

      logger.info(
        `[PermissionManager] Origin "${origin}": count=${count}, notInUse=${notInUse}, removable=${removable}`,
      );

      if (!removable) {
        logger.debug(
          `[PermissionManager] Skipping non-removable origin: ${origin}`,
        );
      }

      return notInUse && removable;
    });

    logger.info(
      `[PermissionManager] After filtering: ${originsToRemove.length} origins to remove:`,
      originsToRemove,
    );

    if (originsToRemove.length === 0) {
      logger.info(
        '[PermissionManager] No removable permissions to remove from:',
        origins,
      );
      return true;
    }

    try {
      // Verify which permissions actually exist before removal
      const existingPermissions = await browser.permissions.getAll();
      logger.info(
        '[PermissionManager] Current permissions before removal:',
        existingPermissions.origins,
      );

      // Filter to only origins that actually exist
      const existingOrigins = new Set(existingPermissions.origins || []);
      const originsActuallyExist = originsToRemove.filter((o) =>
        existingOrigins.has(o),
      );

      if (originsActuallyExist.length === 0) {
        logger.info(
          '[PermissionManager] None of the origins to remove actually exist, skipping',
        );
        return true;
      }

      logger.info(
        '[PermissionManager] Calling browser.permissions.remove() for:',
        originsActuallyExist,
      );
      const removed = await browser.permissions.remove({
        origins: originsActuallyExist,
      });
      logger.info(
        `[PermissionManager] browser.permissions.remove() returned: ${removed}`,
      );

      // Log permissions after removal
      const afterPermissions = await browser.permissions.getAll();
      logger.info(
        '[PermissionManager] Permissions after removal:',
        afterPermissions.origins,
      );

      return removed;
    } catch (error) {
      // Handle "required permissions" error gracefully
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `[PermissionManager] browser.permissions.remove() threw error: ${errorMessage}`,
      );
      if (errorMessage.includes('required permissions')) {
        logger.warn(
          '[PermissionManager] Some permissions are required and cannot be removed:',
          originsToRemove,
        );
        return true; // Don't treat as failure
      }
      logger.error('[PermissionManager] Failed to remove permissions:', error);
      return false;
    }
  }

  /**
   * Check if permissions are already granted for the given origins.
   */
  async hasPermissions(origins: string[]): Promise<boolean> {
    if (origins.length === 0) return true;

    try {
      return await browser.permissions.contains({ origins });
    } catch (error) {
      logger.error('[PermissionManager] Failed to check permissions:', error);
      return false;
    }
  }

  /**
   * Track permission usage for concurrent plugin executions.
   * @param origins - Origins to track
   * @param delta - +1 for acquire, -1 for release
   */
  private trackPermissionUsage(origins: string[], delta: number): void {
    for (const origin of origins) {
      const current = this.activePermissions.get(origin) || 0;
      const newCount = current + delta;

      if (newCount <= 0) {
        this.activePermissions.delete(origin);
      } else {
        this.activePermissions.set(origin, newCount);
      }
    }
  }

  /**
   * Get the number of active usages for an origin.
   * Useful for debugging and testing.
   */
  getActiveUsageCount(origin: string): number {
    return this.activePermissions.get(origin) || 0;
  }
}

// Export singleton instance
export const permissionManager = new PermissionManager();
