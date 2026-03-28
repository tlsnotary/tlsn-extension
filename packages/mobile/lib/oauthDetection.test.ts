import { describe, it, expect } from 'vitest';
import { isOAuthUrl, shouldHandOffToSystemBrowser } from './oauthDetection';

describe('isOAuthUrl', () => {
  it('returns true for exact hostname match', () => {
    expect(
      isOAuthUrl('https://accounts.google.com/o/oauth2/auth?client_id=123', [
        'accounts.google.com',
      ]),
    ).toBe(true);
  });

  it('returns true when hostname is a subdomain of an oauthHost entry', () => {
    expect(
      isOAuthUrl('https://accounts.google.com/signin', ['google.com']),
    ).toBe(true);
  });

  it('does not match parent domain when oauthHost is a subdomain', () => {
    // oauthHosts says "accounts.google.com", URL is "google.com" — should NOT match
    expect(
      isOAuthUrl('https://google.com/', ['accounts.google.com']),
    ).toBe(false);
  });

  it('returns false when URL does not match any oauthHost', () => {
    expect(
      isOAuthUrl('https://developer.spotify.com/dashboard', [
        'accounts.google.com',
      ]),
    ).toBe(false);
  });

  it('returns false for empty oauthHosts array', () => {
    expect(isOAuthUrl('https://accounts.google.com/', [])).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isOAuthUrl('not-a-url', ['accounts.google.com'])).toBe(false);
  });

  it('returns false for non-http scheme', () => {
    expect(
      isOAuthUrl('ftp://accounts.google.com/', ['accounts.google.com']),
    ).toBe(false);
  });

  it('handles case-insensitive hostname matching', () => {
    expect(
      isOAuthUrl('https://Accounts.Google.Com/auth', ['accounts.google.com']),
    ).toBe(true);
  });

  it('matches against multiple hosts in the list', () => {
    const hosts = ['accounts.google.com', 'appleid.apple.com'];
    expect(isOAuthUrl('https://appleid.apple.com/auth', hosts)).toBe(true);
    expect(isOAuthUrl('https://accounts.google.com/auth', hosts)).toBe(true);
    expect(isOAuthUrl('https://login.microsoft.com/auth', hosts)).toBe(false);
  });

  it('does not match partial hostname overlaps', () => {
    // "evil-google.com" should NOT match oauthHost "google.com"
    expect(
      isOAuthUrl('https://evil-google.com/phish', ['google.com']),
    ).toBe(false);
  });
});

describe('shouldHandOffToSystemBrowser', () => {
  const oauthHosts = ['accounts.google.com'];

  it('returns true for OAuth URL in top frame, not in progress', () => {
    expect(
      shouldHandOffToSystemBrowser(
        'https://accounts.google.com/o/oauth2/auth',
        true,
        oauthHosts,
        false,
      ),
    ).toBe(true);
  });

  it('returns false when oauthHosts is empty', () => {
    expect(
      shouldHandOffToSystemBrowser(
        'https://accounts.google.com/o/oauth2/auth',
        true,
        [],
        false,
      ),
    ).toBe(false);
  });

  it('returns false when not top frame (iframe)', () => {
    expect(
      shouldHandOffToSystemBrowser(
        'https://accounts.google.com/o/oauth2/auth',
        false,
        oauthHosts,
        false,
      ),
    ).toBe(false);
  });

  it('returns false when OAuth handoff is already in progress', () => {
    expect(
      shouldHandOffToSystemBrowser(
        'https://accounts.google.com/o/oauth2/auth',
        true,
        oauthHosts,
        true,
      ),
    ).toBe(false);
  });

  it('returns false for non-OAuth URL', () => {
    expect(
      shouldHandOffToSystemBrowser(
        'https://developer.spotify.com/',
        true,
        oauthHosts,
        false,
      ),
    ).toBe(false);
  });

  it('returns false when oauthHosts is undefined', () => {
    expect(
      shouldHandOffToSystemBrowser(
        'https://accounts.google.com/auth',
        true,
        undefined as unknown as string[],
        false,
      ),
    ).toBe(false);
  });
});
