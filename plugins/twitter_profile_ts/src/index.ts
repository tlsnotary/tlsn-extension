import { icon } from '../dist/assets/icon';
import config_json from '../config.json';
/**
 * Plugin configuration
 * This configurations defines the plugin, most importantly:
 *  * the different steps
 *  * the user data (headers, cookies) it will access
 *  * the web requests it will query (or notarize)
 */
export function config() {
  Host.outputString(
    JSON.stringify({
      ...config_json,
      icon: icon
    }),
  );
}

function isValidHost(urlString: string) {
  const url = new URL(urlString);
  return url.hostname === 'twitter.com' || url.hostname === 'x.com';
}

/**
 * Redirect the browser window to x.com
 * This uses the `redirect` host function (see index.d.ts)
 */
function gotoTwitter() {
  const { redirect } = Host.getFunctions() as any;
  const mem = Memory.fromString('https://x.com');
  redirect(mem.offset);
}

/**
 * Implementation of the first (start) plugin step
  */
export function start() {
  if (!isValidHost(Config.get('tabUrl'))) {
    gotoTwitter();
    Host.outputString(JSON.stringify(false));
    return;
  }
  Host.outputString(JSON.stringify(true));
}

/**
 * Implementation of step "two".
 * This step collects and validates authentication cookies and headers for 'api.x.com'. 
 * If all required information, it creates the request object.
 * Note that the url needs to be specified in the `config` too, otherwise the request will be refused.
 */
export function two() {
  const cookies = JSON.parse(Config.get('cookies'))['api.x.com'];
  const headers = JSON.parse(Config.get('headers'))['api.x.com'];
  if (
    !cookies.auth_token ||
    !cookies.ct0 ||
    !headers['x-csrf-token'] ||
    !headers['authorization']
  ) {
    Host.outputString(JSON.stringify(false));
    return;
  }

  Host.outputString(
    JSON.stringify({
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers: {
        'x-twitter-client-language': 'en',
        'x-csrf-token': headers['x-csrf-token'],
        Host: 'api.x.com',
        authorization: headers.authorization,
        Cookie: `lang=en; auth_token=${cookies.auth_token}; ct0=${cookies.ct0}`,
        'Accept-Encoding': 'identity',
        Connection: 'close',
      },
      secretHeaders: [
        `x-csrf-token: ${headers['x-csrf-token']}`,
        `cookie: lang=en; auth_token=${cookies.auth_token}; ct0=${cookies.ct0}`,
        `authorization: ${headers.authorization}`,
      ],
    }),
  );
}

/**
 * This method is used to parse the Twitter response and specify what information is revealed (i.e. **not** redacted)
 * This method is optional in the notarization request. When it is not specified nothing is redacted.
 * 
 * In this example it locates the `screen_name` and excludes that range from the revealed response.
 */
export function parseTwitterResp() {
  const bodyString = Host.inputString();
  const params = JSON.parse(bodyString);

  // console.log("params");
  // console.log(JSON.stringify(params));

  if (params.screen_name) {
    const revealed = `"screen_name":"${params.screen_name}"`;
    const selectionStart = bodyString.indexOf(revealed);
    const selectionEnd =
      selectionStart + revealed.length;
    const secretResps = [
      bodyString.substring(0, selectionStart),
      bodyString.substring(selectionEnd, bodyString.length),
    ];
    Host.outputString(JSON.stringify(secretResps));
  } else {
    Host.outputString(JSON.stringify(false));
  }
}

/**
 * Step 3: calls the `notarize` host function
 */
export function three() {
  const params = JSON.parse(Host.inputString());
  const { notarize } = Host.getFunctions() as any;

  if (!params) {
    Host.outputString(JSON.stringify(false));
  } else {
    const mem = Memory.fromString(JSON.stringify({
      ...params,
      getSecretResponse: 'parseTwitterResp',
    }));
    const idOffset = notarize(mem.offset);
    const id = Memory.find(idOffset).readString();
    Host.outputString(JSON.stringify(id));
  }
}
