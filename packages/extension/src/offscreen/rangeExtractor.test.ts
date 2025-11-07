/**
 * Tests for range extraction functions
 */

import { describe, it, expect } from 'vitest';
import { Parser } from '@tlsn/plugin-sdk/src';
import {
  HandlerPart,
  HandlerType,
  HandlerAction,
  Handler,
} from '@tlsn/plugin-sdk/src/types';
import { extractRanges, processHandlers } from './rangeExtractor';

describe('rangeExtractor', () => {
  describe('extractRanges', () => {
    const sampleRequest =
      'GET /path HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      'Authorization: Bearer TOKEN123\r\n' +
      '\r\n' +
      '{"name":"test"}';

    const sampleResponse =
      'HTTP/1.1 200 OK\r\n' +
      'Content-Type: application/json\r\n' +
      '\r\n' +
      '{"result":"success"}';

    describe('START_LINE', () => {
      it('should extract start line from request', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.START_LINE,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'GET /path HTTP/1.1',
        );
      });

      it('should extract start line from response', () => {
        const parser = new Parser(sampleResponse);
        const handler: Handler = {
          type: HandlerType.RECV,
          part: HandlerPart.START_LINE,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleResponse.substring(ranges[0].start, ranges[0].end)).toBe(
          'HTTP/1.1 200 OK',
        );
      });
    });

    describe('PROTOCOL', () => {
      it('should extract protocol from request', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.PROTOCOL,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'HTTP/1.1',
        );
      });
    });

    describe('METHOD', () => {
      it('should extract method from request', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.METHOD,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'GET',
        );
      });
    });

    describe('REQUEST_TARGET', () => {
      it('should extract request target from request', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.REQUEST_TARGET,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          '/path',
        );
      });
    });

    describe('STATUS_CODE', () => {
      it('should extract status code from response', () => {
        const parser = new Parser(sampleResponse);
        const handler: Handler = {
          type: HandlerType.RECV,
          part: HandlerPart.STATUS_CODE,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleResponse.substring(ranges[0].start, ranges[0].end)).toBe(
          '200',
        );
      });
    });

    describe('HEADERS', () => {
      it('should extract all headers when no key specified', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.HEADERS,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges.length).toBeGreaterThan(0);
        // Should have ranges for all headers
        expect(ranges.length).toBe(2); // host and authorization
      });

      it('should extract specific header by key', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.HEADERS,
          action: HandlerAction.REVEAL,
          params: { key: 'host' },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'Host: example.com',
        );
      });

      it('should extract header value only with hideKey option', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.HEADERS,
          action: HandlerAction.REVEAL,
          params: { key: 'host', hideKey: true },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'example.com',
        );
      });

      it('should extract header key only with hideValue option', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.HEADERS,
          action: HandlerAction.REVEAL,
          params: { key: 'host', hideValue: true },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'Host',
        );
      });

      it('should throw error when both hideKey and hideValue are true', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.HEADERS,
          action: HandlerAction.REVEAL,
          params: { key: 'host', hideKey: true, hideValue: true },
        };

        expect(() => extractRanges(handler, parser)).toThrow(
          'Cannot hide both key and value',
        );
      });
    });

    describe('BODY', () => {
      it('should extract entire body when no params specified', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.BODY,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          '{"name":"test"}',
        );
      });

      it('should extract JSON field with path', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.BODY,
          action: HandlerAction.REVEAL,
          params: { type: 'json', path: 'name' },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        const extracted = sampleRequest.substring(
          ranges[0].start,
          ranges[0].end,
        );
        expect(extracted).toContain('"name"');
        expect(extracted).toContain('"test"');
      });

      it('should extract JSON field value only with hideKey', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.BODY,
          action: HandlerAction.REVEAL,
          params: { type: 'json', path: 'name', hideKey: true },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        const extracted = sampleRequest.substring(
          ranges[0].start,
          ranges[0].end,
        );
        expect(extracted).toContain('"test"');
        expect(extracted).not.toContain('"name"');
      });
    });

    describe('ALL', () => {
      it('should extract entire transcript when no regex specified', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.ALL,
          action: HandlerAction.REVEAL,
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(ranges[0].start).toBe(0);
        expect(ranges[0].end).toBe(sampleRequest.length);
      });

      it('should extract matches when regex is specified', () => {
        const parser = new Parser(sampleRequest);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.ALL,
          action: HandlerAction.REVEAL,
          params: { type: 'regex', regex: "/Bearer [A-Z0-9]+/g" },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(1);
        expect(sampleRequest.substring(ranges[0].start, ranges[0].end)).toBe(
          'Bearer TOKEN123',
        );
      });

      it('should return multiple matches with regex', () => {
        const request =
          'GET /path HTTP/1.1\r\n' +
          'Authorization: Bearer TOKEN1\r\n' +
          'X-Custom: Bearer TOKEN2\r\n' +
          '\r\n';
        const parser = new Parser(request);
        const handler: Handler = {
          type: HandlerType.SENT,
          part: HandlerPart.ALL,
          action: HandlerAction.REVEAL,
          params: { type: 'regex', regex: "/Bearer [A-Z0-9]+/g" },
        };

        const ranges = extractRanges(handler, parser);

        expect(ranges).toHaveLength(2);
        expect(request.substring(ranges[0].start, ranges[0].end)).toBe(
          'Bearer TOKEN1',
        );
        expect(request.substring(ranges[1].start, ranges[1].end)).toBe(
          'Bearer TOKEN2',
        );
      });
    });
  });

  describe('processHandlers', () => {
    const sampleRequest =
      'GET /path HTTP/1.1\r\n' +
      'Host: example.com\r\n' +
      'Authorization: Bearer TOKEN123\r\n' +
      '\r\n';

    const sampleResponse =
      'HTTP/1.1 200 OK\r\n' + 'Content-Type: application/json\r\n' + '\r\n';

    it('should process multiple handlers for sent transcript', () => {
      const parsedSent = new Parser(sampleRequest);
      const parsedRecv = new Parser(sampleResponse);

      const handlers: Handler[] = [
        {
          type: HandlerType.SENT,
          part: HandlerPart.METHOD,
          action: HandlerAction.REVEAL,
        },
        {
          type: HandlerType.SENT,
          part: HandlerPart.REQUEST_TARGET,
          action: HandlerAction.REVEAL,
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(2);
      expect(result.recvRanges).toHaveLength(0);
      expect(result.sentRangesWithHandlers).toHaveLength(2);
      expect(result.recvRangesWithHandlers).toHaveLength(0);

      // Check that handlers are attached
      expect(result.sentRangesWithHandlers[0].handler).toBe(handlers[0]);
      expect(result.sentRangesWithHandlers[1].handler).toBe(handlers[1]);
    });

    it('should process multiple handlers for received transcript', () => {
      const parsedSent = new Parser(sampleRequest);
      const parsedRecv = new Parser(sampleResponse);

      const handlers: Handler[] = [
        {
          type: HandlerType.RECV,
          part: HandlerPart.PROTOCOL,
          action: HandlerAction.REVEAL,
        },
        {
          type: HandlerType.RECV,
          part: HandlerPart.STATUS_CODE,
          action: HandlerAction.REVEAL,
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(0);
      expect(result.recvRanges).toHaveLength(2);
      expect(result.sentRangesWithHandlers).toHaveLength(0);
      expect(result.recvRangesWithHandlers).toHaveLength(2);

      // Check that handlers are attached
      expect(result.recvRangesWithHandlers[0].handler).toBe(handlers[0]);
      expect(result.recvRangesWithHandlers[1].handler).toBe(handlers[1]);
    });

    it('should process handlers for both sent and received transcripts', () => {
      const parsedSent = new Parser(sampleRequest);
      const parsedRecv = new Parser(sampleResponse);

      const handlers: Handler[] = [
        {
          type: HandlerType.SENT,
          part: HandlerPart.METHOD,
          action: HandlerAction.REVEAL,
        },
        {
          type: HandlerType.RECV,
          part: HandlerPart.STATUS_CODE,
          action: HandlerAction.REVEAL,
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(1);
      expect(result.recvRanges).toHaveLength(1);
      expect(result.sentRangesWithHandlers).toHaveLength(1);
      expect(result.recvRangesWithHandlers).toHaveLength(1);
    });

    it('should handle empty handlers array', () => {
      const parsedSent = new Parser(sampleRequest);
      const parsedRecv = new Parser(sampleResponse);

      const result = processHandlers([], parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(0);
      expect(result.recvRanges).toHaveLength(0);
      expect(result.sentRangesWithHandlers).toHaveLength(0);
      expect(result.recvRangesWithHandlers).toHaveLength(0);
    });

    it('should handle ALL handler with entire transcript', () => {
      const parsedSent = new Parser(sampleRequest);
      const parsedRecv = new Parser(sampleResponse);

      const handlers: Handler[] = [
        {
          type: HandlerType.SENT,
          part: HandlerPart.ALL,
          action: HandlerAction.REVEAL,
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(1);
      expect(result.sentRanges[0].start).toBe(0);
      expect(result.sentRanges[0].end).toBe(sampleRequest.length);
    });

    it('should handle ALL handler with regex parameter', () => {
      const parsedSent = new Parser(sampleRequest);
      const parsedRecv = new Parser(sampleResponse);

      const handlers: Handler[] = [
        {
          type: HandlerType.SENT,
          part: HandlerPart.ALL,
          action: HandlerAction.REVEAL,
          params: { type: 'regex', regex: "/example\.com/g" },
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(1);
      expect(
        sampleRequest.substring(
          result.sentRanges[0].start,
          result.sentRanges[0].end,
        ),
      ).toBe('example.com');
    });

    it('should handle nested JSON paths in body handlers', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"user":{"profile":{"email":"alice@example.com"}}}';

      const response = 'HTTP/1.1 200 OK\r\n\r\n';

      const parsedSent = new Parser(request);
      const parsedRecv = new Parser(response);

      const handlers: Handler[] = [
        {
          type: HandlerType.SENT,
          part: HandlerPart.BODY,
          action: HandlerAction.REVEAL,
          params: {
            type: 'json',
            path: 'user.profile.email',
            hideKey: true,
          },
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(1);
      const extracted = request.substring(
        result.sentRanges[0].start,
        result.sentRanges[0].end,
      );
      expect(extracted).toBe('"alice@example.com"');
      expect(extracted).not.toContain('"email"');
    });

    it('should handle array indexing in body handlers', () => {
      const request =
        'POST /api HTTP/1.1\r\n' +
        'Content-Type: application/json\r\n' +
        '\r\n' +
        '{"items":[{"name":"Alice"},{"name":"Bob"}]}';

      const response = 'HTTP/1.1 200 OK\r\n\r\n';

      const parsedSent = new Parser(request);
      const parsedRecv = new Parser(response);

      const handlers: Handler[] = [
        {
          type: HandlerType.SENT,
          part: HandlerPart.BODY,
          action: HandlerAction.REVEAL,
          params: {
            type: 'json',
            path: 'items[1].name',
            hideKey: true,
          },
        },
      ];

      const result = processHandlers(handlers, parsedSent, parsedRecv);

      expect(result.sentRanges).toHaveLength(1);
      const extracted = request.substring(
        result.sentRanges[0].start,
        result.sentRanges[0].end,
      );
      expect(extracted).toBe('"Bob"');
    });
  });
});
