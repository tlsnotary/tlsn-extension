import { Parser, Range } from '@tlsn/plugin-sdk/src';
import { Handler, HandlerPart, HandlerType } from '@tlsn/plugin-sdk/src/types';

/**
 * Extracts byte ranges from HTTP transcript based on handler configuration.
 * This is a pure function that can be easily tested.
 *
 * @param handler - The handler configuration specifying what to extract
 * @param parser - The parsed HTTP transcript (request or response)
 * @returns Array of ranges matching the handler specification
 */
export function extractRanges(handler: Handler, parser: Parser): Range[] {
  switch (handler.part) {
    case HandlerPart.START_LINE:
      return parser.ranges.startLine();

    case HandlerPart.PROTOCOL:
      return parser.ranges.protocol();

    case HandlerPart.METHOD:
      return parser.ranges.method();

    case HandlerPart.REQUEST_TARGET:
      return parser.ranges.requestTarget();

    case HandlerPart.STATUS_CODE:
      return parser.ranges.statusCode();

    case HandlerPart.HEADERS:
      return extractHeaderRanges(handler, parser);

    case HandlerPart.BODY:
      return extractBodyRanges(handler, parser);

    case HandlerPart.ALL:
      return extractAllRanges(handler, parser);

    default:
      throw new Error(`Unknown handler part: ${(handler as any).part}`);
  }
}

/**
 * Extracts header ranges based on handler configuration.
 */
function extractHeaderRanges(handler: Handler, parser: Parser): Range[] {
  if (handler.part !== HandlerPart.HEADERS) {
    throw new Error('Handler part must be HEADERS');
  }

  const ranges: Range[] = [];

  // If no specific key is provided, extract all headers
  if (!handler.params?.key) {
    const json = parser.json();
    const headers = json.headers || {};

    Object.keys(headers).forEach((key) => {
      if (handler.params?.hideKey && handler.params?.hideValue) {
        throw new Error('Cannot hide both key and value');
      } else if (handler.params?.hideKey) {
        ranges.push(...parser.ranges.headers(key, { hideKey: true }));
      } else if (handler.params?.hideValue) {
        ranges.push(...parser.ranges.headers(key, { hideValue: true }));
      } else {
        ranges.push(...parser.ranges.headers(key));
      }
    });
  } else {
    // Extract specific header by key
    if (handler.params?.hideKey && handler.params?.hideValue) {
      throw new Error('Cannot hide both key and value');
    } else if (handler.params?.hideKey) {
      ranges.push(
        ...parser.ranges.headers(handler.params.key, { hideKey: true }),
      );
    } else if (handler.params?.hideValue) {
      ranges.push(
        ...parser.ranges.headers(handler.params.key, { hideValue: true }),
      );
    } else {
      ranges.push(...parser.ranges.headers(handler.params.key));
    }
  }

  return ranges;
}

/**
 * Extracts body ranges based on handler configuration.
 */
function extractBodyRanges(handler: Handler, parser: Parser): Range[] {
  if (handler.part !== HandlerPart.BODY) {
    throw new Error('Handler part must be BODY');
  }

  const ranges: Range[] = [];

  // If no params, return entire body
  if (!handler.params) {
    ranges.push(...parser.ranges.body());
  } else if (handler.params?.type === 'json') {
    // Extract JSON field
    ranges.push(
      ...parser.ranges.body(handler.params.path, {
        type: 'json',
        hideKey: handler.params?.hideKey,
        hideValue: handler.params?.hideValue,
      }),
    );
  }

  return ranges;
}

/**
 * Extracts ranges for the entire transcript, optionally filtered by regex.
 */
function extractAllRanges(handler: Handler, parser: Parser): Range[] {
  if (handler.part !== HandlerPart.ALL) {
    throw new Error('Handler part must be ALL');
  }

  // If regex parameter is provided, use regex matching
  if (handler.params?.type === 'regex' && handler.params?.regex) {
    return parser.ranges.regex(handler.params.regex);
  }

  // Otherwise, return entire transcript
  return parser.ranges.all();
}

/**
 * Processes all handlers for a given transcript and returns ranges with handler metadata.
 *
 * @param handlers - Array of handler configurations
 * @param parsedSent - Parsed sent (request) transcript
 * @param parsedRecv - Parsed received (response) transcript
 * @returns Object containing sent and received ranges with handler metadata
 */
export function processHandlers(
  handlers: Handler[],
  parsedSent: Parser,
  parsedRecv: Parser,
): {
  sentRanges: Range[];
  recvRanges: Range[];
  sentRangesWithHandlers: Array<Range & { handler: Handler }>;
  recvRangesWithHandlers: Array<Range & { handler: Handler }>;
} {
  const sentRanges: Range[] = [];
  const recvRanges: Range[] = [];
  const sentRangesWithHandlers: Array<Range & { handler: Handler }> = [];
  const recvRangesWithHandlers: Array<Range & { handler: Handler }> = [];

  for (const handler of handlers) {
    const transcript =
      handler.type === HandlerType.SENT ? parsedSent : parsedRecv;
    const ranges = handler.type === HandlerType.SENT ? sentRanges : recvRanges;
    const rangesWithHandlers =
      handler.type === HandlerType.SENT
        ? sentRangesWithHandlers
        : recvRangesWithHandlers;

    // Extract ranges for this handler
    const extractedRanges = extractRanges(handler, transcript);

    // Add to both plain ranges array and ranges with handler metadata
    ranges.push(...extractedRanges);
    extractedRanges.forEach((range) => {
      rangesWithHandlers.push({ ...range, handler });
    });
  }

  return {
    sentRanges,
    recvRanges,
    sentRangesWithHandlers,
    recvRangesWithHandlers,
  };
}
