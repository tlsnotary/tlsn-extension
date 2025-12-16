/**
 * HTTP Message Parser with Range Tracking
 *
 * Parses HTTP requests and responses, tracking byte ranges for all components
 * to make it easier for plugin developers to specify what to reveal/redact.
 */

export interface Range {
  start: number;
  end: number;
}

export interface ParsedValue<T> {
  value: T;
  ranges: Range;
}

export interface ParsedHeader {
  value: string;
  ranges: Range;
  keyRange: Range;
  valueRange: Range;
}

export interface ParsedRequest {
  startLine: ParsedValue<string>;
  method: ParsedValue<string>;
  requestTarget: ParsedValue<string>;
  protocol: ParsedValue<string>;
  headers: Record<string, ParsedHeader>;
  body?: {
    raw: ParsedValue<Uint8Array>;
    text?: ParsedValue<string>;
    json?: Record<string, any>;
  };
}

export interface ParsedResponse {
  startLine: ParsedValue<string>;
  protocol: ParsedValue<string>;
  statusCode: ParsedValue<string>;
  reasonPhrase: ParsedValue<string>;
  headers: Record<string, ParsedHeader>;
  body?: {
    raw: ParsedValue<Uint8Array>;
    text?: ParsedValue<string>;
    json?: Record<string, any>;
  };
}

type ParsedMessage = ParsedRequest | ParsedResponse;

export interface HeaderRangeOptions {
  hideKey?: boolean;
  hideValue?: boolean;
}

export interface BodyRangeOptions {
  type?: 'json' | 'xpath' | 'regex' | 'text';
  hideKey?: boolean;
  hideValue?: boolean;
}

/**
 * Represents a segment in a JSON path
 */
type PathSegment = string | number;

export class Parser {
  private data: Uint8Array;
  private parsed: ParsedMessage | null = null;
  private isRequest = false;

  constructor(data: string | Uint8Array) {
    if (typeof data === 'string') {
      this.data = new TextEncoder().encode(data);
    } else {
      this.data = data;
    }
    this.parse();
  }

  private parse(): void {
    const offset = 0;

    // Parse start line
    const startLineEnd = this.findSequence(this.data, offset, '\r\n');
    if (startLineEnd === -1) {
      throw new Error('Invalid HTTP message: no CRLF found in start line');
    }

    const startLineBytes = this.data.slice(offset, startLineEnd);
    const startLine = new TextDecoder().decode(startLineBytes);

    // Determine if request or response
    this.isRequest = !startLine.startsWith('HTTP/');

    if (this.isRequest) {
      this.parsed = this.parseRequest(offset, startLineEnd);
    } else {
      this.parsed = this.parseResponse(offset, startLineEnd);
    }
  }

  private parseRequest(offset: number, startLineEnd: number): ParsedRequest {
    const startLineBytes = this.data.slice(offset, startLineEnd);
    const startLine = new TextDecoder().decode(startLineBytes);

    // Parse method, request target, and protocol
    const parts = startLine.split(' ');
    if (parts.length < 3) {
      throw new Error('Invalid HTTP request line');
    }

    const method = parts[0];
    const requestTarget = parts.slice(1, -1).join(' '); // Handle spaces in URL
    const protocol = parts[parts.length - 1];

    const methodEnd = offset + method.length;
    const requestTargetStart = methodEnd + 1;
    const requestTargetEnd = requestTargetStart + requestTarget.length;
    const protocolStart = requestTargetEnd + 1;
    const protocolEnd = startLineEnd;

    // Parse headers
    offset = startLineEnd + 2; // Skip \r\n
    const { headers, bodyStart } = this.parseHeaders(offset);

    // Parse body if present
    let body: ParsedRequest['body'] | undefined;
    if (bodyStart < this.data.length) {
      body = this.parseBody(bodyStart, headers);
    }

    return {
      startLine: {
        value: startLine,
        ranges: { start: 0, end: startLineEnd },
      },
      method: {
        value: method,
        ranges: { start: 0, end: methodEnd },
      },
      requestTarget: {
        value: requestTarget,
        ranges: { start: requestTargetStart, end: requestTargetEnd },
      },
      protocol: {
        value: protocol,
        ranges: { start: protocolStart, end: protocolEnd },
      },
      headers,
      body,
    };
  }

  private parseResponse(offset: number, startLineEnd: number): ParsedResponse {
    const startLineBytes = this.data.slice(offset, startLineEnd);
    const startLine = new TextDecoder().decode(startLineBytes);

    // Parse protocol, status code, and reason phrase
    const parts = startLine.split(' ');
    if (parts.length < 2) {
      throw new Error('Invalid HTTP response line');
    }

    const protocol = parts[0];
    const statusCode = parts[1];
    const reasonPhrase = parts.slice(2).join(' ');

    const protocolEnd = offset + protocol.length;
    const statusCodeStart = protocolEnd + 1;
    const statusCodeEnd = statusCodeStart + statusCode.length;
    const reasonPhraseStart = statusCodeEnd + (reasonPhrase ? 1 : 0);
    const reasonPhraseEnd = startLineEnd;

    // Parse headers
    offset = startLineEnd + 2; // Skip \r\n
    const { headers, bodyStart } = this.parseHeaders(offset);

    // Parse body if present
    let body: ParsedResponse['body'] | undefined;
    if (bodyStart < this.data.length) {
      body = this.parseBody(bodyStart, headers);
    }

    return {
      startLine: {
        value: startLine,
        ranges: { start: 0, end: startLineEnd },
      },
      protocol: {
        value: protocol,
        ranges: { start: 0, end: protocolEnd },
      },
      statusCode: {
        value: statusCode,
        ranges: { start: statusCodeStart, end: statusCodeEnd },
      },
      reasonPhrase: {
        value: reasonPhrase,
        ranges: { start: reasonPhraseStart, end: reasonPhraseEnd },
      },
      headers,
      body,
    };
  }

  private parseHeaders(startOffset: number): {
    headers: Record<string, ParsedHeader>;
    bodyStart: number;
  } {
    const headers: Record<string, ParsedHeader> = {};
    let offset = startOffset;

    while (offset < this.data.length) {
      // Check for end of headers (empty line)
      if (
        this.data[offset] === 0x0d &&
        offset + 1 < this.data.length &&
        this.data[offset + 1] === 0x0a
      ) {
        offset += 2;
        break;
      }

      // Find end of header line
      const lineEnd = this.findSequence(this.data, offset, '\r\n');
      if (lineEnd === -1) {
        throw new Error('Invalid HTTP headers: no CRLF found');
      }

      const headerLine = new TextDecoder().decode(this.data.slice(offset, lineEnd));
      const colonIndex = headerLine.indexOf(':');
      if (colonIndex === -1) {
        throw new Error(`Invalid header line: ${headerLine}`);
      }

      const key = headerLine.substring(0, colonIndex).toLowerCase();
      const rawValue = headerLine.substring(colonIndex + 1);
      const value = rawValue.trim();

      const keyStart = offset;
      const keyEnd = offset + colonIndex;
      // Calculate leading whitespace to find where value actually starts
      const leadingWhitespace = rawValue.length - rawValue.trimStart().length;
      const valueStart = keyEnd + 1 + leadingWhitespace;
      const valueEnd = valueStart + value.length;

      headers[key] = {
        value,
        ranges: { start: offset, end: lineEnd },
        keyRange: { start: keyStart, end: keyEnd },
        valueRange: { start: valueStart, end: valueEnd },
      };

      offset = lineEnd + 2; // Move past \r\n
    }

    return { headers, bodyStart: offset };
  }

  private parseBody(
    startOffset: number,
    headers: Record<string, ParsedHeader>,
  ): ParsedRequest['body'] | ParsedResponse['body'] {
    const transferEncoding = headers['transfer-encoding']?.value.toLowerCase();
    const contentType = headers['content-type']?.value.toLowerCase() || '';

    let bodyBytes: Uint8Array;
    let bodyStart = startOffset;
    let bodyEnd = this.data.length;

    // Handle chunked encoding
    let jsonBaseOffset = bodyStart; // For non-chunked or for JSON range tracking
    if (transferEncoding === 'chunked') {
      const dechunked = this.dechunkBody(startOffset);
      bodyBytes = dechunked.data;
      bodyStart = startOffset;
      bodyEnd = dechunked.originalEnd;
      jsonBaseOffset = dechunked.firstChunkDataStart; // Use actual data start for JSON ranges
    } else {
      bodyBytes = this.data.slice(startOffset);
    }

    const body: any = {
      raw: {
        value: bodyBytes,
        ranges: { start: bodyStart, end: bodyEnd },
      },
    };

    // Try to parse as text
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bodyBytes);
      body.text = {
        value: text,
        ranges: { start: bodyStart, end: bodyEnd },
      };

      // Try to parse as JSON
      if (contentType.includes('application/json') || this.isJsonString(text)) {
        try {
          // For chunked encoding, use firstChunkDataStart as base offset
          // This points to where the actual JSON data begins (after chunk size line)
          body.json = this.parseJsonWithRanges(text, jsonBaseOffset);
        } catch (e) {
          // Not valid JSON, skip
        }
      }
    } catch (e) {
      // Not valid UTF-8 text
    }

    return body;
  }

  private dechunkBody(startOffset: number): {
    data: Uint8Array;
    originalEnd: number;
    firstChunkDataStart: number;
  } {
    const chunks: Uint8Array[] = [];
    let offset = startOffset;
    let firstChunkDataStart = -1;

    while (offset < this.data.length) {
      // Read chunk size line
      const sizeLineEnd = this.findSequence(this.data, offset, '\r\n');
      if (sizeLineEnd === -1) break;

      const sizeLine = new TextDecoder().decode(this.data.slice(offset, sizeLineEnd));
      const chunkSize = parseInt(sizeLine.split(';')[0].trim(), 16);

      offset = sizeLineEnd + 2; // Skip \r\n

      if (chunkSize === 0) {
        // Last chunk
        offset += 2; // Skip final \r\n
        break;
      }

      // Track where the first chunk's data starts (for range tracking)
      if (firstChunkDataStart === -1) {
        firstChunkDataStart = offset;
      }

      // Read chunk data
      const chunkData = this.data.slice(offset, offset + chunkSize);
      chunks.push(chunkData);

      offset += chunkSize + 2; // Skip data and \r\n
    }

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let position = 0;
    for (const chunk of chunks) {
      combined.set(chunk, position);
      position += chunk.length;
    }

    return { data: combined, originalEnd: offset, firstChunkDataStart };
  }

  private parseJsonWithRanges(text: string, baseOffset: number): any {
    // Parse JSON and track ranges for each key-value pair (including nested)
    const json = JSON.parse(text);
    const result: any = {};

    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      // Convert text to bytes for accurate byte offset calculation
      const textBytes = Buffer.from(text, 'utf8');

      // Recursively process all fields
      this.processJsonObject(json, textBytes, baseOffset, result, []);
    }

    return result;
  }

  /**
   * Recursively processes a JSON object and tracks ranges for all fields (including nested).
   * Stores fields with flat keys like "a.b" for nested paths.
   */
  private processJsonObject(
    obj: any,
    textBytes: Buffer,
    baseOffset: number,
    result: any,
    pathPrefix: PathSegment[],
  ): void {
    for (const key in obj) {
      const keyStr = `"${key}"`;
      const keyBytes = Buffer.from(keyStr, 'utf8');

      // Find key in bytes (not string index!)
      const keyByteIndex = textBytes.indexOf(keyBytes);
      if (keyByteIndex === -1) continue;

      // Find the colon after the key
      const colonBytes = Buffer.from(':', 'utf8');
      const colonByteIndex = textBytes.indexOf(colonBytes, keyByteIndex);
      if (colonByteIndex === -1) continue;

      const value = obj[key];

      // Build the full path for this field
      const currentPath = [...pathPrefix, key];
      const pathKey = this.pathToString(currentPath);

      // Find where the value actually starts (skip whitespace after colon)
      let actualValueByteStart = colonByteIndex + 1;
      while (
        actualValueByteStart < textBytes.length &&
        (textBytes[actualValueByteStart] === 0x20 || // space
          textBytes[actualValueByteStart] === 0x09 || // tab
          textBytes[actualValueByteStart] === 0x0a || // newline
          textBytes[actualValueByteStart] === 0x0d) // carriage return
      ) {
        actualValueByteStart++;
      }

      // Handle different value types
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          // Handle array
          this.processJsonArray(
            value,
            textBytes,
            baseOffset,
            result,
            currentPath,
            actualValueByteStart,
          );
        } else {
          // Handle nested object
          const valueStr = JSON.stringify(value);
          const valueBytes = Buffer.from(valueStr, 'utf8');
          const valueByteIndex = textBytes.indexOf(valueBytes, actualValueByteStart);

          if (valueByteIndex !== -1) {
            const valueByteEnd = valueByteIndex + valueBytes.length;

            // Store the nested object itself
            result[pathKey] = {
              value: value,
              ranges: {
                start: baseOffset + keyByteIndex,
                end: baseOffset + valueByteEnd,
              },
              keyRange: {
                start: baseOffset + keyByteIndex,
                end: baseOffset + keyByteIndex + keyBytes.length,
              },
              valueRange: {
                start: baseOffset + valueByteIndex,
                end: baseOffset + valueByteEnd,
              },
            };

            // Recursively process nested fields
            // Extract the nested object's JSON text
            const nestedText = textBytes.slice(valueByteIndex, valueByteEnd).toString('utf8');
            const nestedTextBytes = Buffer.from(nestedText, 'utf8');
            this.processJsonObject(
              value,
              nestedTextBytes,
              baseOffset + valueByteIndex,
              result,
              currentPath,
            );
          }
        }
      } else {
        // Primitive value (string, number, boolean, null)
        const valueStr = JSON.stringify(value);
        const valueBytes = Buffer.from(valueStr, 'utf8');
        const valueByteIndex = textBytes.indexOf(valueBytes, actualValueByteStart);

        if (valueByteIndex !== -1) {
          const valueByteEnd = valueByteIndex + valueBytes.length;
          result[pathKey] = {
            value: value,
            ranges: {
              start: baseOffset + keyByteIndex,
              end: baseOffset + valueByteEnd,
            },
            keyRange: {
              start: baseOffset + keyByteIndex,
              end: baseOffset + keyByteIndex + keyBytes.length,
            },
            valueRange: {
              start: baseOffset + valueByteIndex,
              end: baseOffset + valueByteEnd,
            },
          };
        } else {
          // Fallback for values not found exactly
          const valueByteEnd = actualValueByteStart + valueBytes.length;
          result[pathKey] = {
            value: value,
            ranges: {
              start: baseOffset + keyByteIndex,
              end: baseOffset + valueByteEnd,
            },
            keyRange: {
              start: baseOffset + keyByteIndex,
              end: baseOffset + keyByteIndex + keyBytes.length,
            },
            valueRange: {
              start: baseOffset + actualValueByteStart,
              end: baseOffset + valueByteEnd,
            },
          };
        }
      }
    }
  }

  /**
   * Recursively processes a JSON array and tracks ranges for all elements.
   * Stores elements with keys like "items[0]".
   */
  private processJsonArray(
    arr: any[],
    textBytes: Buffer,
    baseOffset: number,
    result: any,
    pathPrefix: PathSegment[],
    arrayStartOffset: number,
  ): void {
    // For each array element
    for (let i = 0; i < arr.length; i++) {
      const element = arr[i];
      const currentPath = [...pathPrefix, i];
      const pathKey = this.pathToString(currentPath);

      // Serialize the element to find it in the byte stream
      const elementStr = JSON.stringify(element);
      const elementBytes = Buffer.from(elementStr, 'utf8');

      // Search for the element starting from the array start
      const elementByteIndex = textBytes.indexOf(elementBytes, arrayStartOffset);

      if (elementByteIndex !== -1) {
        const elementByteEnd = elementByteIndex + elementBytes.length;

        // Store the array element (no keyRange for array elements)
        result[pathKey] = {
          value: element,
          ranges: {
            start: baseOffset + elementByteIndex,
            end: baseOffset + elementByteEnd,
          },
          valueRange: {
            start: baseOffset + elementByteIndex,
            end: baseOffset + elementByteEnd,
          },
        };

        // If element is an object, recursively process it
        if (typeof element === 'object' && element !== null && !Array.isArray(element)) {
          const nestedText = textBytes.slice(elementByteIndex, elementByteEnd).toString('utf8');
          const nestedTextBytes = Buffer.from(nestedText, 'utf8');
          this.processJsonObject(
            element,
            nestedTextBytes,
            baseOffset + elementByteIndex,
            result,
            currentPath,
          );
        } else if (Array.isArray(element)) {
          // Nested array
          const nestedText = textBytes.slice(elementByteIndex, elementByteEnd).toString('utf8');
          const nestedTextBytes = Buffer.from(nestedText, 'utf8');
          this.processJsonArray(
            element,
            nestedTextBytes,
            baseOffset + elementByteIndex,
            result,
            currentPath,
            0,
          );
        }
      }
    }
  }

  /**
   * Converts a path array to a string key.
   * Examples: ["a", "b"] → "a.b", ["items", 0] → "items[0]"
   */
  private pathToString(path: PathSegment[]): string {
    if (path.length === 0) return '';

    return path
      .reduce((acc, segment, index) => {
        if (typeof segment === 'number') {
          return `${acc}[${segment}]`;
        } else {
          return index === 0 ? segment : `${acc}.${segment}`;
        }
      }, '' as string)
      .toString();
  }

  private findSequence(data: Uint8Array, startOffset: number, sequence: string): number {
    const seqBytes = new TextEncoder().encode(sequence);
    for (let i = startOffset; i <= data.length - seqBytes.length; i++) {
      let match = true;
      for (let j = 0; j < seqBytes.length; j++) {
        if (data[i + j] !== seqBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) return i;
    }
    return -1;
  }

  private isJsonString(str: string): boolean {
    const trimmed = str.trim();
    return (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    );
  }

  /**
   * Returns a JSON representation of the parsed HTTP message
   */
  json(): any {
    if (!this.parsed) {
      throw new Error('Message not parsed');
    }

    const result: any = {};

    if ('method' in this.parsed) {
      // Request
      result.startLine = this.parsed.startLine.value;
      result.method = this.parsed.method.value;
      result.requestTarget = this.parsed.requestTarget.value;
      result.protocol = this.parsed.protocol.value;
    } else {
      // Response
      result.startLine = this.parsed.startLine.value;
      result.protocol = this.parsed.protocol.value;
      result.statusCode = this.parsed.statusCode.value;
      result.reasonPhrase = this.parsed.reasonPhrase.value;
    }

    // Headers
    result.headers = {};
    for (const [key, header] of Object.entries(this.parsed.headers)) {
      result.headers[key] = header.value;
    }

    // Body
    if (this.parsed.body) {
      if (this.parsed.body.json) {
        // Check if json is a plain object (chunked encoding) or parsed with ranges
        const jsonData = this.parsed.body.json;
        if (typeof jsonData === 'object' && jsonData !== null) {
          // Check if it has the range structure
          const firstKey = Object.keys(jsonData)[0];
          if (firstKey && typeof jsonData[firstKey] === 'object' && 'value' in jsonData[firstKey]) {
            // Has range structure - extract values
            result.body = {};
            for (const [key, value] of Object.entries(jsonData)) {
              result.body[key] = (value as any).value;
            }
          } else {
            // Plain JSON object (from chunked encoding)
            result.body = jsonData;
          }
        } else {
          // Primitive JSON value
          result.body = jsonData;
        }
      } else if (this.parsed.body.text) {
        result.body = this.parsed.body.text.value;
      }
    }

    return result;
  }

  /**
   * Range helper methods
   */
  ranges = {
    startLine: (): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      return [this.parsed.startLine.ranges];
    },

    protocol: (): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      if ('method' in this.parsed) {
        return [this.parsed.protocol.ranges];
      } else {
        return [this.parsed.protocol.ranges];
      }
    },

    method: (): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      if (!('method' in this.parsed)) {
        throw new Error('method() is only available for requests');
      }
      return [this.parsed.method.ranges];
    },

    requestTarget: (): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      if (!('method' in this.parsed)) {
        throw new Error('requestTarget() is only available for requests');
      }
      return [this.parsed.requestTarget.ranges];
    },

    statusCode: (): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      if ('method' in this.parsed) {
        throw new Error('statusCode() is only available for responses');
      }
      return [this.parsed.statusCode.ranges];
    },

    headers: (name: string, options?: HeaderRangeOptions): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');

      const header = this.parsed.headers[name.toLowerCase()];
      if (!header) {
        return [];
      }

      if (options?.hideKey && options?.hideValue) {
        throw new Error('Cannot hide both key and value');
      }

      if (options?.hideKey) {
        return [header.valueRange];
      }

      if (options?.hideValue) {
        return [header.keyRange];
      }

      return [header.ranges];
    },

    body: (path?: string | RegExp, options?: BodyRangeOptions): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      if (!this.parsed.body) return [];

      // If no path specified, return entire body range
      if (path === undefined) {
        return [this.parsed.body.raw.ranges];
      }

      const type = options?.type || 'json';

      if (type === 'json') {
        if (!this.parsed.body.json) {
          throw new Error('Body is not JSON');
        }

        if (typeof path !== 'string') {
          throw new Error('Path must be a string for JSON type');
        }

        // Check if path contains nested notation (. or [)
        const isNestedPath = path.includes('.') || path.includes('[');

        // For nested paths, parse and look up by the constructed key
        const lookupKey = isNestedPath ? path : path;

        const field = this.parsed.body.json[lookupKey];
        if (!field) {
          return [];
        }

        // Check if this is an array element (no keyRange)
        const isArrayElement = !field.keyRange;

        if (isArrayElement) {
          // For array elements, ignore hideKey/hideValue and return the element value
          return [field.valueRange];
        }

        // For object fields, respect hideKey/hideValue options
        if (options?.hideKey && options?.hideValue) {
          throw new Error('Cannot hide both key and value');
        }

        if (options?.hideKey) {
          return [field.valueRange];
        }

        if (options?.hideValue) {
          return [field.keyRange];
        }

        return [field.ranges];
      }

      if (type === 'regex') {
        if (!(path instanceof RegExp)) {
          throw new Error('Path must be a RegExp for regex type');
        }

        if (!this.parsed.body.text) {
          throw new Error('Body is not text');
        }

        const text = this.parsed.body.text.value;
        const baseOffset = this.parsed.body.raw.ranges.start;
        const ranges: Range[] = [];

        let match;
        while ((match = path.exec(text)) !== null) {
          // match.index is a STRING index, need to convert to BYTE offset
          const matchedText = match[0];
          const matchedBytes = Buffer.from(matchedText, 'utf8');

          // Get substring before the match
          const beforeMatch = text.substring(0, match.index);
          const beforeMatchBytes = Buffer.from(beforeMatch, 'utf8');

          // Byte offset is the length of bytes before the match
          const byteOffset = beforeMatchBytes.length;

          ranges.push({
            start: baseOffset + byteOffset,
            end: baseOffset + byteOffset + matchedBytes.length,
          });
        }

        return ranges;
      }

      if (type === 'xpath') {
        throw new Error('XPath parsing not yet implemented');
      }

      if (type === 'text') {
        if (!this.parsed.body.text) {
          throw new Error('Body is not text');
        }
        return [this.parsed.body.text.ranges];
      }

      throw new Error(`Unknown type: ${type}`);
    },

    /**
     * Returns byte ranges for all matches of a regular expression in the entire transcript.
     * Uses byte-accurate offset calculation to handle multi-byte UTF-8 characters correctly.
     *
     * @param regExp - Regular expression to match (must have global flag for multiple matches)
     * @returns Array of ranges for all matches found in the transcript
     *
     * @example
     * const parser = new Parser(httpMessage);
     * const ranges = parser.ranges.regex(/Bearer [A-Za-z0-9-_]+/g);
     * // Returns ranges for all Bearer token matches
     */
    regex: (regExp: RegExp): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');

      // Convert entire data to text for searching
      const text = new TextDecoder('utf-8', { fatal: false }).decode(this.data);
      const ranges: Range[] = [];

      let match;
      while ((match = regExp.exec(text)) !== null) {
        // match.index is a STRING index, need to convert to BYTE offset
        const matchedText = match[0];
        const matchedBytes = Buffer.from(matchedText, 'utf8');

        // Get substring before the match
        const beforeMatch = text.substring(0, match.index);
        const beforeMatchBytes = Buffer.from(beforeMatch, 'utf8');

        // Byte offset is the length of bytes before the match
        const byteOffset = beforeMatchBytes.length;

        ranges.push({
          start: byteOffset,
          end: byteOffset + matchedBytes.length,
        });
      }

      return ranges;
    },

    /**
     * Returns a single range covering the entire HTTP message transcript.
     *
     * @returns Array containing a single range from start (0) to end of transcript
     *
     * @example
     * const parser = new Parser(httpMessage);
     * const range = parser.ranges.all();
     * // Returns [{ start: 0, end: <length of transcript> }]
     */
    all: (): Range[] => {
      if (!this.parsed) throw new Error('Message not parsed');
      return [{ start: 0, end: this.data.length }];
    },
  };
}

export default Parser;
