import * as Comlink from 'comlink';
import init, {
  initThreadPool,
  notarize,
} from '../../../wasm/prover/pkg/tlsn_extension_rs';

// Configs
const MAX_TRANSCRIPT_SIZE = 1 << 14;
const NOTARY_HOST = 'notary.efprivacyscaling.org';
const NOTARY_PORT = 443;
const WEBSOCKET_PROXY_BASE_URL = 'ws://localhost:55688';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36';
const AUTH_TOKEN = '';
const ACCESS_TOKEN = '';
const CSRF_TOKEN = '';

async function notarizeTwitterDM() {
  const serverDomain = 'twitter.com';
  const route = 'i/api/1.1/dm/conversation';
  const conversationId = '';
  const clientUuid = '';
  const authToken = AUTH_TOKEN;
  const accessToken = ACCESS_TOKEN;
  const csrfToken = CSRF_TOKEN;
  const websocketTargetToken = 'twitter';
  const websocketProxyURL = `${WEBSOCKET_PROXY_BASE_URL}?token=${websocketTargetToken}`;

  const method = 'GET';
  const url = `https://${serverDomain}/${route}/${conversationId}.json`;
  const headers = [
    ['Host', serverDomain],
    ['Accept', '*/*'],
    ['Accept-Encoding', 'identity'],
    ['Connection', 'close'],
    ['User-Agent', USER_AGENT],
    ['Authorization', `Bearer ${accessToken}`],
    ['Cookie', `auth_token=${authToken}; ct0=${csrfToken}`],
    ['Authority', serverDomain],
    ['X-Twitter-Auth-Type', 'OAuth2Session'],
    ['x-twitter-active-user', 'yes'],
    ['X-Client-Uuid', clientUuid],
    ['X-Csrf-Token', csrfToken],
  ];
  const body = new Uint8Array([]);
  // values that should be kept private
  const secrets = [accessToken, authToken, csrfToken];
  // values that should be revealed
  const reveals = [];

  const resProver = await notarize(
    MAX_TRANSCRIPT_SIZE,
    NOTARY_HOST,
    NOTARY_PORT,
    serverDomain,
    websocketProxyURL,
    method,
    url,
    headers,
    body,
    secrets,
    reveals,
  );
  return JSON.parse(resProver);
}

async function notarizeTwitterProfile() {
  const serverDomain = 'api.twitter.com';
  const route = '1.1/account/settings.json';

  const userAgent = USER_AGENT;

  const authToken = AUTH_TOKEN;
  const accessToken = ACCESS_TOKEN;
  const csrfToken = CSRF_TOKEN;
  const twitterId = '';
  const websocketTargetToken = 'api-twitter';
  const websocketProxyURL = `${WEBSOCKET_PROXY_BASE_URL}?token=${websocketTargetToken}`;

  const method = 'GET';
  const url = `https://${serverDomain}/${route}`;
  const headers = [
    ['Host', serverDomain],
    ['Accept', '*/*'],
    ['Accept-Encoding', 'identity'],
    ['Connection', 'close'],
    ['User-Agent', userAgent],
    ['Authorization', `Bearer ${accessToken}`],
    ['Cookie', `auth_token=${authToken}; ct0=${csrfToken}`],
    ['X-Csrf-Token', csrfToken],
  ];
  const body = new Uint8Array([]);

  // values that should be kept private
  const secrets = [accessToken, authToken, csrfToken];
  // values that should be revealed
  const reveals = [`"screen_name":"${twitterId}"`];

  const resProver = await notarize(
    MAX_TRANSCRIPT_SIZE,
    NOTARY_HOST,
    NOTARY_PORT,
    serverDomain,
    websocketProxyURL,
    method,
    url,
    headers,
    body,
    secrets,
    reveals,
  );
  return JSON.parse(resProver);
}

class TLSN {
  constructor() {
    console.log('worker test module initiated.');
  }

  async prover() {
    try {
      console.log('start');
      const numConcurrency = navigator.hardwareConcurrency;
      console.log('!@# navigator.hardwareConcurrency=', numConcurrency);
      const res = await init();
      console.log('!@# res.memory=', res.memory);

      console.log(
        '!@# res.memory.buffer.length=',
        res.memory.buffer.byteLength,
      );
      await initThreadPool(numConcurrency);

      // const resJSON = await notarizeTwitterDM();
      const resJSON = await notarizeTwitterProfile();
      console.log('!@# res = ', resJSON);

      console.log('!@# resAfter.memory=', res.memory);
      // 1105920000 ~= 1.03 gb
      console.log(
        '!@# resAfter.memory.buffer.length=',
        res.memory.buffer.byteLength,
      );

      return resJSON;
    } catch (e: any) {
      console.log(e);
      return e;
    }
  }
}

Comlink.expose(TLSN);
