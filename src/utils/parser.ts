import { HTTPParser } from 'http-parser-js';

export function parseHttpMessage(buffer: Buffer, type: 'request' | 'response') {
  const parser = new HTTPParser(
    type === 'request' ? HTTPParser.REQUEST : HTTPParser.RESPONSE,
  );
  const body: Buffer[] = [];
  let complete = false;
  let headers: string[] = [];

  parser.onBody = (t) => {
    body.push(t);
  };

  parser.onHeadersComplete = (res) => {
    headers = res.headers;
  };

  parser.onMessageComplete = () => {
    complete = true;
  };

  parser.execute(buffer);
  parser.finish();

  if (!complete) throw new Error(`Could not parse ${type.toUpperCase()}`);

  return {
    info: buffer.toString('utf-8').split('\r\n')[0],
    headers,
    body,
  };
}
