import { describe, it, expect } from 'vitest';
import {
  deriveProxyUrl,
  matchesPathnamePattern,
  validateProvePermission,
  validateOpenWindowPermission,
} from '../../src/offscreen/permissionValidator';
import { PluginConfig } from '@tlsn/plugin-sdk/src/types';

describe('deriveProxyUrl', () => {
  it('should derive wss proxy URL from https verifier', () => {
    const result = deriveProxyUrl('https://verifier.example.com', 'api.x.com');
    expect(result).toBe('wss://verifier.example.com/proxy?token=api.x.com');
  });

  it('should derive ws proxy URL from http verifier', () => {
    const result = deriveProxyUrl('http://localhost:7047', 'api.x.com');
    expect(result).toBe('ws://localhost:7047/proxy?token=api.x.com');
  });

  it('should preserve port in proxy URL', () => {
    const result = deriveProxyUrl(
      'https://verifier.example.com:8080',
      'api.x.com',
    );
    expect(result).toBe(
      'wss://verifier.example.com:8080/proxy?token=api.x.com',
    );
  });
});

describe('matchesPathnamePattern', () => {
  it('should match exact pathname', () => {
    expect(matchesPathnamePattern('/api/v1/users', '/api/v1/users')).toBe(true);
  });

  it('should not match different pathname', () => {
    expect(matchesPathnamePattern('/api/v1/users', '/api/v1/posts')).toBe(
      false,
    );
  });

  it('should match wildcard at end', () => {
    expect(matchesPathnamePattern('/api/v1/users/123', '/api/v1/users/*')).toBe(
      true,
    );
  });

  it('should match wildcard in middle', () => {
    expect(
      matchesPathnamePattern(
        '/api/v1/users/123/profile',
        '/api/v1/users/*/profile',
      ),
    ).toBe(true);
  });

  it('should not match wildcard across segments', () => {
    // Single * should only match one segment
    expect(
      matchesPathnamePattern('/api/v1/users/123/456', '/api/v1/users/*'),
    ).toBe(false);
  });

  it('should match double wildcard across segments', () => {
    expect(
      matchesPathnamePattern(
        '/api/v1/users/123/456/profile',
        '/api/v1/users/**',
      ),
    ).toBe(true);
  });
});

describe('validateProvePermission', () => {
  const baseConfig: PluginConfig = {
    name: 'Test Plugin',
    description: 'Test',
    requests: [
      {
        method: 'GET',
        host: 'api.x.com',
        pathname: '/1.1/account/settings.json',
        verifierUrl: 'https://verifier.tlsnotary.org',
      },
      {
        method: 'POST',
        host: 'api.example.com',
        pathname: '/api/v1/*',
        verifierUrl: 'http://localhost:7047',
        proxyUrl: 'ws://localhost:7047/proxy?token=api.example.com',
      },
    ],
  };

  it('should allow matching request with exact pathname', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/1.1/account/settings.json', method: 'GET' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.x.com',
        },
        baseConfig,
      ),
    ).not.toThrow();
  });

  it('should allow matching request with wildcard pathname', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.example.com/api/v1/users', method: 'POST' },
        {
          verifierUrl: 'http://localhost:7047',
          proxyUrl: 'ws://localhost:7047/proxy?token=api.example.com',
        },
        baseConfig,
      ),
    ).not.toThrow();
  });

  it('should deny request with wrong method', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/1.1/account/settings.json', method: 'POST' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.x.com',
        },
        baseConfig,
      ),
    ).toThrow('Permission denied');
  });

  it('should deny request with wrong host', () => {
    expect(() =>
      validateProvePermission(
        {
          url: 'https://api.twitter.com/1.1/account/settings.json',
          method: 'GET',
        },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.twitter.com',
        },
        baseConfig,
      ),
    ).toThrow('Permission denied');
  });

  it('should deny request with wrong pathname', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/1.1/users/show.json', method: 'GET' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.x.com',
        },
        baseConfig,
      ),
    ).toThrow('Permission denied');
  });

  it('should deny request with wrong verifier URL', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/1.1/account/settings.json', method: 'GET' },
        {
          verifierUrl: 'http://localhost:7047',
          proxyUrl: 'ws://localhost:7047/proxy?token=api.x.com',
        },
        baseConfig,
      ),
    ).toThrow('Permission denied');
  });

  it('should deny request with wrong proxy URL', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/1.1/account/settings.json', method: 'GET' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://malicious.com/proxy?token=api.x.com',
        },
        baseConfig,
      ),
    ).toThrow('Permission denied');
  });

  it('should deny request when no permissions defined', () => {
    const noPermConfig: PluginConfig = {
      name: 'No Perm Plugin',
      description: 'Test',
    };

    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/test', method: 'GET' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.x.com',
        },
        noPermConfig,
      ),
    ).toThrow('Plugin has no request permissions defined');
  });

  it('should deny request when config is null', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/test', method: 'GET' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.x.com',
        },
        null,
      ),
    ).toThrow('Plugin has no request permissions defined');
  });

  it('should be case-insensitive for HTTP method', () => {
    expect(() =>
      validateProvePermission(
        { url: 'https://api.x.com/1.1/account/settings.json', method: 'get' },
        {
          verifierUrl: 'https://verifier.tlsnotary.org',
          proxyUrl: 'wss://verifier.tlsnotary.org/proxy?token=api.x.com',
        },
        baseConfig,
      ),
    ).not.toThrow();
  });
});

describe('validateOpenWindowPermission', () => {
  const baseConfig: PluginConfig = {
    name: 'Test Plugin',
    description: 'Test',
    urls: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://example.com/specific/page',
    ],
  };

  it('should allow matching URL with wildcard', () => {
    expect(() =>
      validateOpenWindowPermission('https://x.com/user/profile', baseConfig),
    ).not.toThrow();
  });

  it('should allow exact URL match', () => {
    expect(() =>
      validateOpenWindowPermission(
        'https://example.com/specific/page',
        baseConfig,
      ),
    ).not.toThrow();
  });

  it('should deny URL not in permissions', () => {
    expect(() =>
      validateOpenWindowPermission(
        'https://malicious.com/phishing',
        baseConfig,
      ),
    ).toThrow('Permission denied');
  });

  it('should deny URL when no permissions defined', () => {
    const noPermConfig: PluginConfig = {
      name: 'No Perm Plugin',
      description: 'Test',
    };

    expect(() =>
      validateOpenWindowPermission('https://x.com/test', noPermConfig),
    ).toThrow('Plugin has no URL permissions defined');
  });

  it('should deny URL when config is null', () => {
    expect(() =>
      validateOpenWindowPermission('https://x.com/test', null),
    ).toThrow('Plugin has no URL permissions defined');
  });

  it('should match wildcard at end of URL', () => {
    expect(() =>
      validateOpenWindowPermission('https://x.com/', baseConfig),
    ).not.toThrow();
    expect(() =>
      validateOpenWindowPermission('https://x.com/any/path/here', baseConfig),
    ).not.toThrow();
  });
});
