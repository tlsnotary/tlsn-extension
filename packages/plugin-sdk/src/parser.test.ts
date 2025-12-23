/**
 * Tests for HTTP Message Parser
 */

import { describe, it, expect } from 'vitest';
import Parser from './parser';

describe('Parser', () => {
  describe('HTTP Request Parsing', () => {
    it('should parse a simple GET request', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const json = parser.json();

      expect(json.method).toBe('GET');
      expect(json.requestTarget).toBe('/path');
      expect(json.protocol).toBe('HTTP/1.1');
      expect(json.headers.host).toBe('example.com');
    });

    it('should parse a POST request with JSON body', () => {
      const request =
        'POST /api/data HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John","age":30}';

      const parser = new Parser(request);
      const json = parser.json();

      expect(json.method).toBe('POST');
      expect(json.requestTarget).toBe('/api/data');
      expect(json.body.name).toBe('John');
      expect(json.body.age).toBe(30);
    });

    it('should parse request with URL containing spaces', () => {
      const request = 'GET /path with spaces HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const json = parser.json();

      expect(json.requestTarget).toBe('/path with spaces');
    });

    it('should parse the sample sent transcript from spec', () => {
      const request =
        'GET https://api.x.com/1.1/account/settings.json HTTP/1.1\r\n' +
        'x-csrf-token: REDACTED_CSRF_TOKEN_VALUE\r\n' +
        'x-client-transaction-id: REDACTED_CLIENT_TRANSACTION_ID\r\n' +
        'authorization: Bearer REDACTED_BEARER_TOKEN\r\n' +
        'cookie: guest_id=REDACTED_GUEST_ID\r\n' +
        'accept-encoding: identity\r\n' +
        'host: api.x.com\r\n' +
        'connection: close\r\n' +
        '\r\n';

      const parser = new Parser(request);
      const json = parser.json();

      expect(json.method).toBe('GET');
      expect(json.requestTarget).toBe('https://api.x.com/1.1/account/settings.json');
      expect(json.protocol).toBe('HTTP/1.1');
      expect(json.headers['x-csrf-token']).toContain('REDACTED');
      expect(json.headers['host']).toBe('api.x.com');
    });
  });

  describe('HTTP Response Parsing', () => {
    it('should parse a simple 200 response', () => {
      const response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nHello World';
      const parser = new Parser(response);
      const json = parser.json();

      expect(json.protocol).toBe('HTTP/1.1');
      expect(json.statusCode).toBe('200');
      expect(json.reasonPhrase).toBe('OK');
      expect(json.headers['content-type']).toBe('text/plain');
      expect(json.body).toBe('Hello World');
    });

    it('should parse response with JSON body', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"success":true,"data":"test"}';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.statusCode).toBe('200');
      expect(json.body.success).toBe(true);
      expect(json.body.data).toBe('test');
    });

    it('should parse response with chunked encoding', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '1e\r\n' +
        '{"success":true,"data":"test"}\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.statusCode).toBe('200');
      expect(json.body.success).toBe(true);
      expect(json.body.data).toBe('test');
    });

    it('should parse the sample received transcript from spec', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Date: Tue, 28 Oct 2025 14:46:24 GMT\r\n' +
        'Content-Type: application/json;charset=utf-8\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        'Connection: close\r\n' +
        'CF-RAY: 995b38f0d9250520-AMS\r\n' +
        'perf: 7402827104\r\n' +
        'pragma: no-cache\r\n' +
        'status: 200 OK\r\n' +
        '\r\n' +
        '45\r\n' +
        '{"protected":false,"screen_name":"test_user","always_use_https":true}\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.protocol).toBe('HTTP/1.1');
      expect(json.statusCode).toBe('200');
      expect(json.headers['content-type']).toBe('application/json;charset=utf-8');
      expect(json.body.protected).toBe(false);
      expect(json.body.screen_name).toBe('test_user');
    });
  });

  describe('Range Methods - Start Line', () => {
    it('should return correct range for request start line', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const ranges = parser.ranges.startLine();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(18); // "GET /path HTTP/1.1"
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('GET /path HTTP/1.1');
    });

    it('should return correct range for response start line', () => {
      const response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n';
      const parser = new Parser(response);
      const ranges = parser.ranges.startLine();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(15); // "HTTP/1.1 200 OK"
      expect(response.substring(ranges[0].start, ranges[0].end)).toBe('HTTP/1.1 200 OK');
    });
  });

  describe('Range Methods - Method', () => {
    it('should return correct range for GET method', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const ranges = parser.ranges.method();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(3);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('GET');
    });

    it('should return correct range for POST method', () => {
      const request = 'POST /api HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const ranges = parser.ranges.method();

      expect(ranges).toHaveLength(1);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('POST');
    });

    it('should throw error for response', () => {
      const response = 'HTTP/1.1 200 OK\r\n\r\n';
      const parser = new Parser(response);

      expect(() => parser.ranges.method()).toThrow('only available for requests');
    });
  });

  describe('Range Methods - Protocol', () => {
    it('should return correct range for request protocol', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const ranges = parser.ranges.protocol();

      expect(ranges).toHaveLength(1);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('HTTP/1.1');
    });

    it('should return correct range for response protocol', () => {
      const response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\n';
      const parser = new Parser(response);
      const ranges = parser.ranges.protocol();

      expect(ranges).toHaveLength(1);
      expect(response.substring(ranges[0].start, ranges[0].end)).toBe('HTTP/1.1');
    });
  });

  describe('Range Methods - Headers', () => {
    const request =
      'GET /path HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      'Content-Type: application/json\r\n' +
      '\r\n';

    it('should return full header range', () => {
      const parser = new Parser(request);
      const ranges = parser.ranges.headers('host');

      expect(ranges).toHaveLength(1);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('Host: example.com');
    });

    it('should return header value range with hideKey option', () => {
      const parser = new Parser(request);
      const ranges = parser.ranges.headers('host', { hideKey: true });

      expect(ranges).toHaveLength(1);
      const value = request.substring(ranges[0].start, ranges[0].end);
      expect(value).toBe('example.com');
      expect(value).not.toContain('Host:');
    });

    it('should return header key range with hideValue option', () => {
      const parser = new Parser(request);
      const ranges = parser.ranges.headers('host', { hideValue: true });

      expect(ranges).toHaveLength(1);
      const key = request.substring(ranges[0].start, ranges[0].end);
      expect(key).toBe('Host');
      expect(key).not.toContain('example.com');
    });

    it('should throw error when both hideKey and hideValue are true', () => {
      const parser = new Parser(request);
      expect(() => parser.ranges.headers('host', { hideKey: true, hideValue: true })).toThrow(
        'Cannot hide both key and value',
      );
    });

    it('should return empty array for non-existent header', () => {
      const parser = new Parser(request);
      const ranges = parser.ranges.headers('non-existent');

      expect(ranges).toHaveLength(0);
    });

    it('should handle case-insensitive header names', () => {
      const parser = new Parser(request);
      const ranges1 = parser.ranges.headers('Host');
      const ranges2 = parser.ranges.headers('host');
      const ranges3 = parser.ranges.headers('HOST');

      expect(ranges1).toEqual(ranges2);
      expect(ranges2).toEqual(ranges3);
    });
  });

  describe('Range Methods - Body', () => {
    it('should return entire body range when no path specified', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John","age":30}';

      const parser = new Parser(request);
      const ranges = parser.ranges.body();

      expect(ranges).toHaveLength(1);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('{"name":"John","age":30}');
    });

    it('should return JSON field range', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John","age":30}';

      const parser = new Parser(request);
      const ranges = parser.ranges.body('name', { type: 'json' });

      expect(ranges).toHaveLength(1);
      const field = request.substring(ranges[0].start, ranges[0].end);
      expect(field).toContain('"name"');
      expect(field).toContain('"John"');
    });

    it('should return JSON field value range with hideKey option', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John","age":30}';

      const parser = new Parser(request);
      const ranges = parser.ranges.body('name', { type: 'json', hideKey: true });

      expect(ranges).toHaveLength(1);
      const value = request.substring(ranges[0].start, ranges[0].end);
      expect(value).toContain('"John"');
      expect(value).not.toContain('"name"');
    });

    it('should return JSON field key range with hideValue option', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John","age":30}';

      const parser = new Parser(request);
      const ranges = parser.ranges.body('name', { type: 'json', hideValue: true });

      expect(ranges).toHaveLength(1);
      const key = request.substring(ranges[0].start, ranges[0].end);
      expect(key).toContain('"name"');
      expect(key).not.toContain('"John"');
    });

    it('should throw error when both hideKey and hideValue are true for JSON', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John"}';

      const parser = new Parser(request);
      expect(() =>
        parser.ranges.body('name', { type: 'json', hideKey: true, hideValue: true }),
      ).toThrow('Cannot hide both key and value');
    });

    it('should return empty array for non-existent JSON field', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"name":"John"}';

      const parser = new Parser(request);
      const ranges = parser.ranges.body('nonexistent', { type: 'json' });

      expect(ranges).toHaveLength(0);
    });

    it('should support regex type to find patterns in body', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n' +
        'hello world, hello universe';

      const parser = new Parser(request);
      const ranges = parser.ranges.body(/hello/gi, { type: 'regex' });

      expect(ranges).toHaveLength(2);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('hello');
      expect(request.substring(ranges[1].start, ranges[1].end)).toBe('hello');
    });

    it('should return empty array when regex finds no matches', () => {
      const request =
        'POST /api HTTP/1.1\r\n' + 'Content-Type: text/plain\r\n' + '\r\n' + 'hello world';

      const parser = new Parser(request);
      const ranges = parser.ranges.body(/goodbye/gi, { type: 'regex' });

      expect(ranges).toHaveLength(0);
    });

    it('should throw error for xpath type (not implemented)', () => {
      const request = 'POST /api HTTP/1.1\r\n\r\n<xml>test</xml>';
      const parser = new Parser(request);

      expect(() => parser.ranges.body('/xml', { type: 'xpath' })).toThrow('not yet implemented');
    });
  });

  describe('Edge Cases', () => {
    it('should handle request with no body', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const json = parser.json();

      expect(json.body).toBeUndefined();
    });

    it('should handle response with empty body', () => {
      const response = 'HTTP/1.1 204 No Content\r\n\r\n';
      const parser = new Parser(response);
      const json = parser.json();

      expect(json.statusCode).toBe('204');
      expect(json.body).toBeUndefined();
    });

    it('should handle headers with multiple colons', () => {
      const request = 'GET /path HTTP/1.1\r\n' + 'Authorization: Bearer abc:def:ghi\r\n' + '\r\n';

      const parser = new Parser(request);
      const json = parser.json();

      expect(json.headers.authorization).toBe('Bearer abc:def:ghi');
    });

    it('should handle headers with leading/trailing whitespace in values', () => {
      const request =
        'GET /path HTTP/1.1\r\n' + 'Custom-Header:   value with spaces   \r\n' + '\r\n';

      const parser = new Parser(request);
      const json = parser.json();

      expect(json.headers['custom-header']).toBe('value with spaces');
    });

    it('should handle response with reason phrase containing spaces', () => {
      const response = 'HTTP/1.1 404 Not Found\r\n\r\n';
      const parser = new Parser(response);
      const json = parser.json();

      expect(json.statusCode).toBe('404');
      expect(json.reasonPhrase).toBe('Not Found');
    });

    it('should handle multiple chunks in chunked encoding', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'Hello\r\n' +
        '7\r\n' +
        ' World!\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.body).toBe('Hello World!');
    });

    it('should handle chunked encoding with chunk extensions', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5;name=value\r\n' +
        'Hello\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.body).toBe('Hello');
    });

    it('should accept Uint8Array input', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const uint8Array = new TextEncoder().encode(request);
      const parser = new Parser(uint8Array);
      const json = parser.json();

      expect(json.method).toBe('GET');
      expect(json.headers.host).toBe('example.com');
    });

    it('should accept string input', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const json = parser.json();

      expect(json.method).toBe('GET');
      expect(json.headers.host).toBe('example.com');
    });

    it('should throw error for malformed start line', () => {
      const request = 'INVALID\r\nHost: example.com\r\n\r\n';
      expect(() => new Parser(request)).toThrow('Invalid HTTP');
    });

    it('should throw error for missing CRLF in start line', () => {
      const request = 'GET /path HTTP/1.1Host: example.com';
      expect(() => new Parser(request)).toThrow('no CRLF found');
    });

    it('should handle non-JSON body with application/json content-type', () => {
      const request =
        'POST /api HTTP/1.1\r\n' + 'Content-Type: application/json\r\n' + '\r\n' + 'not valid json';

      const parser = new Parser(request);
      const json = parser.json();

      // Should still parse as text
      expect(json.body).toBe('not valid json');
    });
  });

  describe('Real-world Examples', () => {
    it('should parse complex X.com API response', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Date: Tue, 28 Oct 2025 14:46:24 GMT\r\n' +
        'Content-Type: application/json;charset=utf-8\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        'Connection: close\r\n' +
        'Set-Cookie: lang=en; Path=/\r\n' +
        'Cache-Control: no-cache, no-store, must-revalidate\r\n' +
        '\r\n' +
        '3d\r\n' +
        '{"protected":false,"screen_name":"test_user","language":"en"}\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.statusCode).toBe('200');
      expect(json.headers['content-type']).toBe('application/json;charset=utf-8');
      expect(json.body.screen_name).toBe('test_user');

      // Test ranges
      const screenNameRanges = parser.ranges.body('screen_name', { type: 'json' });
      expect(screenNameRanges).toHaveLength(1);
    });

    it('should parse large chunked X.com settings response and extract field ranges', () => {
      // Full X.com account settings response with chunked encoding
      // Based on real API response but with sanitized values
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Date: Wed, 29 Oct 2025 12:11:44 GMT\r\n' +
        'Content-Type: application/json;charset=utf-8\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        'Connection: close\r\n' +
        'perf: 7402827104\r\n' +
        'pragma: no-cache\r\n' +
        'Server: cloudflare envoy\r\n' +
        'status: 200 OK\r\n' +
        'expires: Tue, 31 Mar 1981 05:00:00 GMT\r\n' +
        'vary: accept-encoding\r\n' +
        'Cache-Control: no-cache, no-store, must-revalidate, pre-check=0, post-check=0\r\n' +
        'last-modified: Wed, 29 Oct 2025 12:11:44 GMT\r\n' +
        'x-transaction: REDACTED_TRANSACTION_ID\r\n' +
        'x-access-level: read-write-directmessages\r\n' +
        'x-frame-options: SAMEORIGIN\r\n' +
        'x-transaction-id: REDACTED_TRANSACTION_ID\r\n' +
        'x-xss-protection: 0\r\n' +
        'x-rate-limit-limit: 100\r\n' +
        'x-rate-limit-reset: 1761740475\r\n' +
        'content-disposition: attachment; filename=json.json\r\n' +
        'x-client-event-enabled: true\r\n' +
        'x-content-type-options: nosniff\r\n' +
        'x-rate-limit-remaining: 93\r\n' +
        'x-twitter-response-tags: BouncerCompliant\r\n' +
        'X-Response-Time: 19\r\n' +
        'origin-cf-ray: REDACTED_CF_RAY-AMS\r\n' +
        'strict-transport-security: max-age=631138519; includeSubdomains\r\n' +
        'x-served-by: t4_a\r\n' +
        'cf-cache-status: DYNAMIC\r\n' +
        'Set-Cookie: guest_id_ads=; Path=/; Domain=x.com; Max-Age=0; Expires=Wed, 29 Oct 2025 12:11:44 GMT\r\n' +
        'Set-Cookie: guest_id_marketing=; Path=/; Domain=x.com; Max-Age=0; Expires=Wed, 29 Oct 2025 12:11:44 GMT\r\n' +
        'Set-Cookie: personalization_id=; Path=/; Domain=x.com; Max-Age=0; Expires=Wed, 29 Oct 2025 12:11:44 GMT\r\n' +
        'Set-Cookie: lang=en; Path=/\r\n' +
        'Set-Cookie: __cf_bm=REDACTED_COOKIE_VALUE; HttpOnly; Secure; Path=/; Expires=Wed, 29 Oct 2025 12:41:44 GMT\r\n' +
        'CF-RAY: REDACTED_CF_RAY-AMS\r\n' +
        '\r\n' +
        '430\r\n' +
        '{"protected":false,"screen_name":"test_user","always_use_https":true,"use_cookie_personalization":false,"sleep_time":{"enabled":false,"end_time":null,"start_time":null},"geo_enabled":false,"language":"en","discoverable_by_email":true,"discoverable_by_mobile_phone":false,"display_sensitive_media":false,"personalized_trends":true,"allow_media_tagging":"all","allow_contributor_request":"none","allow_ads_personalization":true,"allow_logged_out_device_personalization":true,"allow_location_history_personalization":true,"allow_sharing_data_for_third_party_personalization":false,"allow_dms_from":"verified","always_allow_dms_from_subscribers":null,"allow_dm_groups_from":"following","translator_type":"none","country_code":"us","address_book_live_sync_enabled":false,"universal_quality_filtering_enabled":"enabled","dm_receipt_setting":"all_enabled","allow_authenticated_periscope_requests":true,"protect_password_reset":false,"require_password_login":false,"requires_login_verification":false,"dm_quality_filter":"enabled","autoplay_disabled":false,"settings_metadata":{}}\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      // Verify basic parsing
      expect(json.statusCode).toBe('200');
      expect(json.headers['content-type']).toBe('application/json;charset=utf-8');
      expect(json.headers['transfer-encoding']).toBe('chunked');

      // Verify body parsed correctly
      expect(json.body).toBeDefined();
      expect(json.body.screen_name).toBe('test_user');
      expect(json.body.protected).toBe(false);
      expect(json.body.language).toBe('en');
      expect(json.body.country_code).toBe('us');
      expect(json.body.allow_dms_from).toBe('verified');

      // Test ranges for screen_name field (full key-value pair)
      const screenNameRanges = parser.ranges.body('screen_name', { type: 'json' });
      expect(screenNameRanges).toHaveLength(1);
      expect(screenNameRanges[0]).toBeDefined();

      // Verify the range points to the key-value pair in the original string
      const extractedField = response.substring(screenNameRanges[0].start, screenNameRanges[0].end);
      expect(extractedField).toContain('"screen_name"');
      expect(extractedField).toContain('"test_user"');

      // Test hideKey option to get just the value
      const valueOnlyRanges = parser.ranges.body('screen_name', {
        type: 'json',
        hideKey: true,
      });
      expect(valueOnlyRanges).toHaveLength(1);
      const extractedValue = response.substring(valueOnlyRanges[0].start, valueOnlyRanges[0].end);
      expect(extractedValue).toBe('"test_user"');

      // Test ranges for other fields
      const languageRanges = parser.ranges.body('language', { type: 'json' });
      expect(languageRanges).toHaveLength(1);

      const countryCodeRanges = parser.ranges.body('country_code', { type: 'json' });
      expect(countryCodeRanges).toHaveLength(1);

      // Note: Nested field access like 'sleep_time.enabled' is not yet supported
      // The parser only supports top-level field extraction
    });
  });

  describe('Range Methods - Regex', () => {
    it('should find all matches of a pattern in the entire transcript', () => {
      const request =
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'Authorization: Bearer REDACTED_TOKEN_123\r\n' +
        'X-Custom: Bearer REDACTED_TOKEN_456\r\n' +
        '\r\n' +
        'Bearer REDACTED_TOKEN_789';

      const parser = new Parser(request);
      const ranges = parser.ranges.regex(/Bearer [A-Z_0-9]+/g);

      expect(ranges).toHaveLength(3);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('Bearer REDACTED_TOKEN_123');
      expect(request.substring(ranges[1].start, ranges[1].end)).toBe('Bearer REDACTED_TOKEN_456');
      expect(request.substring(ranges[2].start, ranges[2].end)).toBe('Bearer REDACTED_TOKEN_789');
    });

    it('should return empty array when regex finds no matches', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const parser = new Parser(request);
      const ranges = parser.ranges.regex(/Bearer/g);

      expect(ranges).toHaveLength(0);
    });

    it('should handle regex with multi-byte UTF-8 characters', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"emoji":"🙈","name":"test","emoji2":"🔥"}';

      const parser = new Parser(request);
      const ranges = parser.ranges.regex(/"emoji[0-9]?":/g);

      expect(ranges).toHaveLength(2);

      // Use Buffer to extract bytes at the correct offsets
      const requestBytes = Buffer.from(request, 'utf8');
      const match1Bytes = requestBytes.slice(ranges[0].start, ranges[0].end);
      const match2Bytes = requestBytes.slice(ranges[1].start, ranges[1].end);
      const match1 = match1Bytes.toString('utf8');
      const match2 = match2Bytes.toString('utf8');

      expect(match1).toBe('"emoji":');
      expect(match2).toBe('"emoji2":');
    });

    it('should work with case-insensitive regex', () => {
      const request =
        'GET /path HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        'Content-Type: text/plain\r\n' +
        '\r\n';

      const parser = new Parser(request);
      const ranges = parser.ranges.regex(/host/gi);

      expect(ranges).toHaveLength(1);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe('Host');
    });

    it('should handle complex regex patterns', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Host: example.com\r\n' +
        '\r\n' +
        '{"token":"abc123","key":"xyz789"}';

      const parser = new Parser(request);
      // Match quoted strings (simplified)
      const ranges = parser.ranges.regex(/"[a-z0-9]+"/g);

      expect(ranges.length).toBeGreaterThan(0);
      ranges.forEach((range) => {
        const match = request.substring(range.start, range.end);
        expect(match).toMatch(/^"[a-z0-9]+"$/);
      });
    });
  });

  describe('Range Methods - All', () => {
    it('should return range for entire request transcript', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\nBody content';
      const parser = new Parser(request);
      const ranges = parser.ranges.all();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(request.length);
      expect(request.substring(ranges[0].start, ranges[0].end)).toBe(request);
    });

    it('should return range for entire response transcript', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' + 'Content-Type: application/json\r\n' + '\r\n' + '{"success":true}';

      const parser = new Parser(response);
      const ranges = parser.ranges.all();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(response.length);
      expect(response.substring(ranges[0].start, ranges[0].end)).toBe(response);
    });

    it('should handle chunked encoding correctly', () => {
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Transfer-Encoding: chunked\r\n' +
        '\r\n' +
        '5\r\n' +
        'Hello\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const ranges = parser.ranges.all();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(response.length);
    });

    it('should work with Uint8Array input', () => {
      const request = 'GET /path HTTP/1.1\r\nHost: example.com\r\n\r\n';
      const uint8Array = new TextEncoder().encode(request);
      const parser = new Parser(uint8Array);
      const ranges = parser.ranges.all();

      expect(ranges).toHaveLength(1);
      expect(ranges[0].start).toBe(0);
      expect(ranges[0].end).toBe(uint8Array.length);
    });
  });

  describe('Range Methods - Nested JSON Paths', () => {
    describe('Nested Object Paths', () => {
      it('should extract simple nested field', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"screen_name":"bob","a":{"b":2}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a.b', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"b"');
        expect(extracted).toContain('2');
      });

      it('should extract deep nested field', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"user":{"profile":{"name":"Alice","age":30}}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('user.profile.name', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"name"');
        expect(extracted).toContain('"Alice"');
      });

      it('should respect hideKey option for nested fields', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":{"b":2}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a.b', { type: 'json', hideKey: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('2');
        expect(extracted).not.toContain('"b"');
      });

      it('should respect hideValue option for nested fields', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":{"b":2}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a.b', { type: 'json', hideValue: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('"b"');
        expect(extracted).not.toContain('2');
      });

      it('should return empty array for non-existent nested path', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":{"b":2}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a.x', { type: 'json' });

        expect(ranges).toHaveLength(0);
      });
    });

    describe('Array Indexing', () => {
      it('should extract array element', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"c":[0,1,2,3]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('c[0]', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('0');
      });

      it('should extract element from middle of array', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"items":["a","b","c"]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('items[1]', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('"b"');
      });

      it('should ignore hideKey option for array elements', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"c":[0,1,2,3]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('c[0]', { type: 'json', hideKey: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('0'); // hideKey has no effect
      });

      it('should ignore hideValue option for array elements', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"c":[0,1,2,3]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('c[0]', { type: 'json', hideValue: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('0'); // hideValue has no effect
      });

      it('should return empty array for out of bounds index', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"c":[0,1,2]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('c[999]', { type: 'json' });

        expect(ranges).toHaveLength(0);
      });

      it('should extract entire array value when accessing array field directly', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":[{"b":1},{"c":2}]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        // Should include the key and the entire array value
        expect(extracted).toContain('"a"');
        expect(extracted).toContain('[{"b":1},{"c":2}]');
      });

      it('should extract only array value with hideKey option', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":[{"b":1},{"c":2}]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a', { type: 'json', hideKey: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('[{"b":1},{"c":2}]');
        expect(extracted).not.toContain('"a"');
      });

      it('should extract only array key with hideValue option', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":[{"b":1},{"c":2}]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a', { type: 'json', hideValue: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('"a"');
        expect(extracted).not.toContain('[');
      });

      it('should extract array of primitives', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"numbers":[1,2,3,4,5]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('numbers', { type: 'json', hideKey: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('[1,2,3,4,5]');
      });

      it('should extract nested array field', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"data":{"items":[1,2,3]}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('data.items', { type: 'json', hideKey: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('[1,2,3]');
      });
    });

    describe('Mixed Paths (Objects and Arrays)', () => {
      it('should extract nested field from array element', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"users":[{"name":"Alice"},{"name":"Bob"}]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('users[1].name', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"name"');
        expect(extracted).toContain('"Bob"');
      });

      it('should extract from complex nested structure', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"data":{"users":[{"profile":{"email":"alice@example.com"}}]}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('data.users[0].profile.email', {
          type: 'json',
          hideKey: true,
        });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('"alice@example.com"');
      });

      it('should handle array within nested object', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"user":{"addresses":[{"city":"NYC"},{"city":"LA"}]}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('user.addresses[0].city', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"city"');
        expect(extracted).toContain('"NYC"');
      });
    });

    describe('Example from Task Document', () => {
      it('should work with all examples from task document', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"screen_name":"bob","a":{"b":2},"c":[0,1,2,3]}';

        const parser = new Parser(request);

        // Test 1: Simple top-level field (should work as before)
        const ranges1 = parser.ranges.body('screen_name', { type: 'json' });
        expect(ranges1).toHaveLength(1);
        const extracted1 = request.substring(ranges1[0].start, ranges1[0].end);
        expect(extracted1).toContain('"screen_name"');
        expect(extracted1).toContain('"bob"');

        // Test 2: Nested object field
        const ranges2 = parser.ranges.body('a.b', { type: 'json' });
        expect(ranges2).toHaveLength(1);
        const extracted2 = request.substring(ranges2[0].start, ranges2[0].end);
        expect(extracted2).toContain('"b"');
        expect(extracted2).toContain('2');

        // Test 3: Nested object field with hideKey
        const ranges3 = parser.ranges.body('a.b', { type: 'json', hideKey: true });
        expect(ranges3).toHaveLength(1);
        const extracted3 = request.substring(ranges3[0].start, ranges3[0].end);
        expect(extracted3).toBe('2');

        // Test 4: Array element (hideKey/hideValue ignored)
        const ranges4 = parser.ranges.body('c[0]', { type: 'json' });
        expect(ranges4).toHaveLength(1);
        const extracted4 = request.substring(ranges4[0].start, ranges4[0].end);
        expect(extracted4).toBe('0');

        // Test 5: Array element with hideKey (should be ignored)
        const ranges5 = parser.ranges.body('c[0]', { type: 'json', hideKey: true });
        expect(ranges5).toHaveLength(1);
        const extracted5 = request.substring(ranges5[0].start, ranges5[0].end);
        expect(extracted5).toBe('0'); // Same as without hideKey
      });
    });

    describe('Edge Cases', () => {
      it('should handle compact JSON (whitespace in formatted JSON is complex)', () => {
        // Note: Handling arbitrary whitespace/formatting in nested JSON is complex
        // because we search for stringified values. This works fine for compact JSON
        // which is the typical format from API responses.
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"a":{"b":2},"c":[1,2,3]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('a.b', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"b"');
        expect(extracted).toContain('2');
      });

      it('should handle nested arrays', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"matrix":[[1,2],[3,4]]}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('matrix[0][1]', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('2');
      });

      it('should handle number field names', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"obj":{"123":"value"}}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('obj.123', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"123"');
        expect(extracted).toContain('"value"');
      });
    });

    describe('Backward Compatibility', () => {
      it('should maintain compatibility with simple top-level paths', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"name":"test","age":30}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('name', { type: 'json' });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toContain('"name"');
        expect(extracted).toContain('"test"');
      });

      it('should maintain hideKey behavior for top-level fields', () => {
        const request =
          'POST /api HTTP/1.1\r\n' +
          'Content-Type: application/json\r\n' +
          '\r\n' +
          '{"name":"test"}';

        const parser = new Parser(request);
        const ranges = parser.ranges.body('name', { type: 'json', hideKey: true });

        expect(ranges).toHaveLength(1);
        const extracted = request.substring(ranges[0].start, ranges[0].end);
        expect(extracted).toBe('"test"');
        expect(extracted).not.toContain('"name"');
      });
    });
  });

  describe('Byte Offset Handling (Bug Fix)', () => {
    it('should demonstrate string vs byte index difference with multi-byte UTF-8', () => {
      const textWithEmoji = '{"emoji":"🙈","name":"test"}';
      const bytes = Buffer.from(textWithEmoji);

      console.log('\n=== String vs Byte Index Test ===');
      console.log('Text:', textWithEmoji);
      console.log('String length:', textWithEmoji.length);
      console.log('Byte length:', bytes.length);

      // Find "name" in string
      const nameStringIndex = textWithEmoji.indexOf('"name"');
      console.log('String index of "name":', nameStringIndex);

      // Find "name" in bytes
      const nameBytes = Buffer.from('"name"');
      const nameByteIndex = bytes.indexOf(nameBytes);
      console.log('Byte index of "name":', nameByteIndex);

      // They should differ because 🙈 is 4 bytes but counts as 2 in JavaScript string length
      expect(nameByteIndex).toBeGreaterThan(nameStringIndex);
    });

    it('should calculate correct BYTE offsets for JSON with multi-byte characters', () => {
      // HTTP response with emoji in JSON (4-byte UTF-8 character)
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"emoji":"🙈","screen_name":"test"}';

      const parser = new Parser(response);
      const json = parser.json();

      console.log('\n=== Multi-byte Character Test ===');
      console.log('Full response:', response);
      console.log('Response bytes:', Buffer.from(response).length);
      console.log('Parsed JSON:', json);

      // Get byte range for "screen_name" field
      const screenNameRanges = parser.ranges.body('screen_name', {
        type: 'json',
      });

      console.log('screen_name ranges:', screenNameRanges);

      // The actual bytes in the response
      const responseBytes = Buffer.from(response);
      const extractedBytes = responseBytes.slice(
        screenNameRanges[0].start,
        screenNameRanges[0].end,
      );
      const extractedText = extractedBytes.toString('utf8');

      console.log('Extracted bytes length:', extractedBytes.length);
      console.log('Extracted text:', extractedText);

      // This should extract the full "screen_name":"test" pair
      // WITHOUT including any bytes from the emoji field
      expect(extractedText).toContain('screen_name');
      expect(extractedText).toContain('test');
      expect(extractedText).not.toContain('🙈'); // Should NOT contain emoji
    });

    it('should handle JSON value extraction with correct byte offsets', () => {
      // Response with emoji before the field we want
      const response =
        'HTTP/1.1 200 OK\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"emoji":"🙈","screen_name":"test_user"}';

      const parser = new Parser(response);

      // Get byte range for "screen_name" value only (hideKey: true)
      const valueRanges = parser.ranges.body('screen_name', {
        type: 'json',
        hideKey: true,
      });

      console.log('\n=== Value Extraction Test ===');
      console.log('Value ranges:', valueRanges);

      // Extract the actual bytes using the calculated range
      const responseBytes = Buffer.from(response);
      const extractedBytes = responseBytes.slice(valueRanges[0].start, valueRanges[0].end);
      const extractedText = extractedBytes.toString('utf8');

      console.log('Extracted value text:', extractedText);

      // Should extract just the value, not corrupted by the emoji
      expect(extractedText).toBe('"test_user"');
      expect(extractedText).not.toContain('🙈');
    });
  });
});
