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
        'x-csrf-token: 5f73c808d6e672eacdb4ee89c7c70b4e9d991305cf48577fe97cc0f8ff6282c47ce696134260147a53322d11e629338b418c6ab9c242e19f31dbe48df1ce34de42b0e0f47cc3f8bfbe75940e5842e960\r\n' +
        'x-client-transaction-id: WaatVga41W8Ba7EoxhBDtikwBTdWPHv1zVVBAIE4lmZ6d1ynEMsfUqN0siut9dxQs5sq6F2aQq9/x9oYY9Ocx4Q9LFbiWg\r\n' +
        'authorization: Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA\r\n' +
        'cookie: guest_id=v1%3A174903000370998578\r\n' +
        'accept-encoding: identity\r\n' +
        'host: api.x.com\r\n' +
        'connection: close\r\n' +
        '\r\n';

      const parser = new Parser(request);
      const json = parser.json();

      expect(json.method).toBe('GET');
      expect(json.requestTarget).toBe('https://api.x.com/1.1/account/settings.json');
      expect(json.protocol).toBe('HTTP/1.1');
      expect(json.headers['x-csrf-token']).toContain('5f73c808d6e672eacdb4ee89c7c70b4e');
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
        '{"protected":false,"screen_name":"0xTsukino","always_use_https":true}\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.protocol).toBe('HTTP/1.1');
      expect(json.statusCode).toBe('200');
      expect(json.headers['content-type']).toBe('application/json;charset=utf-8');
      expect(json.body.protected).toBe(false);
      expect(json.body.screen_name).toBe('0xTsukino');
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
        '{"protected":false,"screen_name":"0xTsukino","language":"en"}\r\n' +
        '0\r\n' +
        '\r\n';

      const parser = new Parser(response);
      const json = parser.json();

      expect(json.statusCode).toBe('200');
      expect(json.headers['content-type']).toBe('application/json;charset=utf-8');
      expect(json.body.screen_name).toBe('0xTsukino');

      // Test ranges
      const screenNameRanges = parser.ranges.body('screen_name', { type: 'json' });
      expect(screenNameRanges).toHaveLength(1);
    });
  });
});
