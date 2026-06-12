---
name: create-plugin
description: Create a TLSNotary plugin — sandboxed JavaScript that targets a web API, intercepts the user's auth, and produces a selective-disclosure proof. Use when the user asks to author a new TLSN plugin, prove data from a specific web service (e.g. Twitter, Spotify, a bank), or add a plugin to the demo gallery.
---

# Create a TLSNotary plugin

Build a new demo plugin that proves data from a web service using TLSNotary.

## Arguments

$ARGUMENTS should describe the target service and what data to prove (e.g., "Garmin Connect badges", "Spotify top artist", "Duolingo streak").

## Process

Follow these steps in order. Ask the user for input when you need it.

### Step 1: Research the target API

Before writing any code, you need to find a **JSON API endpoint** on the target service that returns the data to prove.

**What to look for:**

- A GET or POST endpoint that returns JSON (not HTML)
- Small response size if possible (under 16KB ideal)
- Contains the data the user wants to prove (username, score, badges, etc.)
- Requires cookie-based or token-based auth (interceptable via browser)

**Try to discover the API automatically first:**

1. Search the web for the target service's known API endpoints, developer docs, or reverse-engineered APIs
2. Fetch the target website's main page and look for API URLs in the JavaScript source, `__NEXT_DATA__`, or inline `window.*` variables
3. Try common API patterns: `/api/v1/`, `/graphql`, `/gc-api/`, `/proxy/`
4. Check if there's an existing old plugin in https://github.com/tlsnotary/tlsn-plugin-boilerplate that can provide clues

**If automatic discovery fails, ask the user to help:**

1. Ask them to open the target website with Chrome DevTools Network tab (filter XHR/Fetch)
2. Ask them to copy the request as cURL (`Copy as cURL` from DevTools)
3. From the cURL, identify:
   - The exact URL and HTTP method
   - Which headers are needed for auth (Cookie, Authorization, CSRF tokens, custom headers)
   - The response structure (JSON fields available)

**If the user provides a cURL command**, test it with `curl` to verify it works and inspect the response:

- Check the response is JSON
- Check the response size (`wc -c`)
- Identify which JSON fields to reveal in the proof

**Examples from existing plugins:**

| Service    | API Endpoint                                                           | Method | Auth                                  |
| ---------- | ---------------------------------------------------------------------- | ------ | ------------------------------------- |
| Twitter/X  | `api.x.com/1.1/account/settings.json`                                  | GET    | Cookie + Authorization + x-csrf-token |
| Spotify    | `api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=1`     | GET    | Authorization (Bearer token)          |
| Uber       | `riders.uber.com/graphql`                                              | POST   | Cookie + x-csrf-token                 |
| Discord    | `discord.com/api/v9/users/@me`                                         | GET    | Authorization (Bot/User token)        |
| Duolingo   | `www.duolingo.com/2023-05-23/users/{id}?fields=longestStreak,username` | GET    | Authorization                         |
| Garmin     | `connect.garmin.com/gc-api/badge-service/badge/earned`                 | GET    | Cookie + connect-csrf-token           |
| Swiss Bank | `swissbank.tlsnotary.org/balances`                                     | GET    | Cookie                                |

### Step 2: Plan the plugin

Based on the API research, determine:

1. **Endpoint**: Full URL, HTTP method
2. **Auth strategy**: Which headers/cookies to intercept via `useHeaders()`
3. **Header interception filter**: What URL pattern to filter on
   - Use a BROAD filter for cookies (any request to the domain)
   - Use a SPECIFIC filter for custom headers (e.g., CSRF tokens only sent with API calls)
   - Important: Initial page load requests may fire BEFORE the listener is ready. Open a page that triggers ongoing requests, not a page that loads data once.
4. **Window URL**: What URL to open (prefer the home/dashboard page over a specific data page, to avoid race conditions with header interception)
5. **maxRecvData**: Based on response size (add ~15% buffer)
6. **maxSentData**: Based on request size — large cookies need 8192+, simple auth needs ~1000-2000
7. **Handlers**: Which JSON fields to reveal (displayName, score, etc.)
8. **Theme color**: A brand-appropriate color for the plugin UI

### Step 3: Create the plugin file

Create a TypeScript plugin file at `packages/plugins/src/{name}.plugin.ts`. Plugins live in
the shared [`@tlsn/plugins`](../../packages/plugins) package so they run on **both** clients
(the browser extension and the mobile app).

Use this template, adapting it to the target service:

```typescript
import type {
  PluginConfig,
  RequestPermission,
  Handler,
  DomJson,
  InterceptedRequestHeader,
} from '@tlsn/plugin-sdk';

declare const __VERIFIER_URL__: string;
declare const __PROXY_URL__: string;

const api = '{target.hostname}';
const apiPath = '{/api/endpoint/path}';

const config: PluginConfig = {
  name: '{Plugin Name}',
  description: '{What this plugin proves}',
  requests: [
    {
      method: '{GET or POST}',
      host: api,
      pathname: apiPath,
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://{target.hostname}/*'],
};

const onClick = async (): Promise<void> => {
  const isRequestPending = useState<boolean>('isRequestPending', false);
  if (isRequestPending) return;
  setState('isRequestPending', true);

  // Read cached auth from state
  const cachedCookie = useState<string | null>('cookie', null);
  // Add other auth headers as needed (csrf tokens, authorization, etc.)

  if (!cachedCookie) {
    setState('isRequestPending', false);
    return;
  }

  const headers: Record<string, string> = {
    Host: api,
    Cookie: cachedCookie,
    // Add other required headers here
    'Accept-Encoding': 'identity', // REQUIRED: prevents compressed response
    Connection: 'close', // REQUIRED: clean TLS termination
  };

  const resp = await prove(
    {
      url: `https://${api}${apiPath}`,
      method: 'GET',
      headers,
      // body: JSON.stringify({...}),  // For POST requests
    },
    {
      verifierUrl: __VERIFIER_URL__,
      proxyUrl: __PROXY_URL__ + api,
      maxRecvData: { size },
      maxSentData: { size },
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' } satisfies Handler,
        {
          type: 'RECV',
          part: 'HEADERS',
          action: 'REVEAL',
          params: { key: 'date' },
        } satisfies Handler,
        // Add RECV BODY handlers for each JSON field to reveal:
        {
          type: 'RECV',
          part: 'BODY',
          action: 'REVEAL',
          params: { type: 'json', path: '{field.path}' },
        } satisfies Handler,
      ],
    },
  );

  done(JSON.stringify(resp));
};

const expandUI = (): void => {
  setState('isMinimized', false);
};
const minimizeUI = (): void => {
  setState('isMinimized', true);
};

const proveProgressBar = (): DomJson[] => {
  const progress = useState<{ step: string; progress: number; message: string } | null>(
    '_proveProgress',
    null,
  );
  if (!progress) return [];
  const pct = `${Math.round(progress.progress * 100)}%`;
  return [
    div({ style: { marginTop: '12px' } }, [
      div(
        {
          style: {
            height: '6px',
            backgroundColor: '#e5e7eb',
            borderRadius: '3px',
            overflow: 'hidden',
          },
        },
        [
          div(
            {
              style: {
                height: '100%',
                width: pct,
                background: 'linear-gradient(90deg, {COLOR1}, {COLOR2})',
                borderRadius: '3px',
                transition: 'width 0.4s ease',
              },
            },
            [],
          ),
        ],
      ),
      div(
        { style: { fontSize: '12px', color: '#6b7280', marginTop: '6px', textAlign: 'center' } },
        [progress.message],
      ),
    ]),
  ];
};

const main = (): DomJson => {
  const isMinimized = useState<boolean>('isMinimized', false);
  const isRequestPending = useState<boolean>('isRequestPending', false);
  const cachedCookie = useState<string | null>('cookie', null);

  // Intercept auth headers from browser requests
  if (!cachedCookie) {
    const headers = useHeaders((h: InterceptedRequestHeader[]) =>
      h.filter((x) => x.url.startsWith(`https://${api}/`)),
    );
    const cookie = headers.flatMap((h) => h.requestHeaders).find((h) => h.name === 'Cookie')?.value;
    if (cookie) setState('cookie', cookie);
  }

  const isConnected = !!cachedCookie;

  useEffect(() => {
    openWindow('https://{target.hostname}/');
  }, []);

  if (isMinimized) {
    return div(
      {
        style: {
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '{THEME_COLOR}',
          boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
          zIndex: '999999',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          fontSize: '24px',
          color: 'white',
        },
        onclick: 'expandUI',
      },
      ['{EMOJI}'],
    );
  }

  return div(
    {
      style: {
        position: 'fixed',
        bottom: '0',
        right: '8px',
        width: '280px',
        borderRadius: '8px 8px 0 0',
        backgroundColor: 'white',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
        zIndex: '999999',
        fontSize: '14px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        overflow: 'hidden',
      },
    },
    [
      div(
        {
          style: {
            background: 'linear-gradient(135deg, {COLOR1} 0%, {COLOR2} 100%)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: 'white',
          },
        },
        [
          div({ style: { fontWeight: '600', fontSize: '16px' } }, ['{Plugin Name}']),
          button(
            {
              style: {
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '0',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              },
              onclick: 'minimizeUI',
            },
            ['\u2212'],
          ),
        ],
      ),
      div({ style: { padding: '20px', backgroundColor: '#f8f9fa' } }, [
        div(
          {
            style: {
              marginBottom: '16px',
              padding: '12px',
              borderRadius: '6px',
              backgroundColor: isConnected ? '#d4edda' : '#f8d7da',
              color: isConnected ? '#155724' : '#721c24',
              border: `1px solid ${isConnected ? '#c3e6cb' : '#f5c6cb'}`,
              fontWeight: '500',
            },
          },
          [isConnected ? '\u2713 Session detected' : '\u26A0 No session detected'],
        ),
        isConnected
          ? button(
              {
                style: {
                  width: '100%',
                  padding: '12px 24px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'linear-gradient(135deg, {COLOR1} 0%, {COLOR2} 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  opacity: isRequestPending ? '0.5' : '1',
                  cursor: isRequestPending ? 'not-allowed' : 'pointer',
                },
                onclick: 'onClick',
              },
              [isRequestPending ? 'Generating Proof...' : 'Generate Proof'],
            )
          : div(
              {
                style: {
                  textAlign: 'center',
                  color: '#666',
                  padding: '12px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '6px',
                  border: '1px solid #ffeaa7',
                },
              },
              ['Please login to {Service Name} to continue'],
            ),
        ...proveProgressBar(),
      ]),
    ],
  );
};

export default { main, onClick, expandUI, minimizeUI, config };
```

### Step 4: Register the plugin

Register it so both clients pick it up:

1. Add an entry to `packages/plugins/src/registry.ts` (copy an existing entry's shape) and set `platforms` — `['demo', 'mobile']`, or a subset.
2. Add the plugin id to the `plugins` array in `packages/plugins/build.js`.

### Step 5: Build and verify

```bash
npm run build:plugins   # builds dist/demo + dist/mobile
```

Then load the plugin in the demo (`npm run demo`). Keep plugin code browser-DOM-free so it also runs under React Native on mobile; `async`/`await` is fine (the mobile target is transpiled to `es2016`). See `PLUGIN.md` for details.

### Step 6: Review for personal information

Before committing, review ALL created/modified files to ensure no personal data (usernames, tokens, cookies, emails, IDs) leaked into the code.

## Key patterns learned from existing plugins

### Auth interception strategies (by service type)

| Auth Type              | Example Plugins    | Headers to Intercept                      | useHeaders Filter                   |
| ---------------------- | ------------------ | ----------------------------------------- | ----------------------------------- |
| Cookie only            | Swiss Bank, Garmin | `Cookie`                                  | Broad: any request to domain        |
| Bearer token           | Spotify, Discord   | `Authorization`                           | API requests to domain              |
| Cookie + CSRF          | Uber, Garmin       | `Cookie` + custom CSRF header             | Broad for cookie, specific for CSRF |
| Cookie + Bearer + CSRF | Twitter            | `Cookie`, `authorization`, `x-csrf-token` | Specific API endpoint               |

### Race condition with header interception

The `useHeaders()` hook only captures requests that happen AFTER the plugin's listener is active. If you open a page that loads all its data on initial render (SPA pattern), the API requests fire before interception is ready.

**Solutions (from real plugins):**

- **Garmin plugin**: Opens the home page (`connect.garmin.com/`) instead of the badges page, because the badges page fires its API call on load before interception is ready
- **Garmin plugin**: Uses a broad URL filter (any request to domain) for cookies, and a separate specific filter for CSRF tokens that only appear on `/gc-api/` requests
- **Spotify plugin**: Opens `developer.spotify.com` (not `api.spotify.com`) so the user's browsing generates API calls the plugin can intercept
- **Discord DM plugin**: Opens `discord.com/channels/@me` and uses `useRequests()` to detect which channel the user selects

### POST requests (Uber GraphQL example)

For POST requests, add a `body` field to `requestOptions` and a SENT BODY handler:

```typescript
// From the Uber plugin — proves rider profile via GraphQL
const resp = await prove(
  {
    url: 'https://riders.uber.com/graphql',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cachedCookie,
      'x-csrf-token': cachedCsrfToken || 'x',
      Host: 'riders.uber.com',
      'Accept-Encoding': 'identity',
      Connection: 'close',
    },
    body: JSON.stringify({ query: '{ currentUser { firstName signupCountry } }' }),
  },
  {
    handlers: [
      { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
      { type: 'SENT', part: 'BODY', action: 'REVEAL' }, // Reveals the GraphQL query
      { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
      { type: 'RECV', part: 'HEADERS', action: 'REVEAL', params: { key: 'date' } },
      { type: 'RECV', part: 'BODY', action: 'REVEAL', params: { type: 'json', path: 'data' } },
    ],
  },
);
```

### Multiple useHeaders() calls (Garmin example)

When different auth credentials appear on different types of requests, use separate `useHeaders()` calls:

```typescript
// Broad filter for cookies — catches page resource loads (JS, CSS, images)
if (!cachedCookie) {
  const headers = useHeaders((h) => h.filter((x) => x.url.startsWith(`https://${api}/`)));
  const cookie = headers.flatMap((h) => h.requestHeaders).find((h) => h.name === 'Cookie')?.value;
  if (cookie) setState('cookie', cookie);
}

// Specific filter for CSRF token — only sent with API calls
if (!cachedCsrfToken) {
  const apiHeaders = useHeaders((h) => h.filter((x) => x.url.startsWith(`https://${api}/gc-api/`)));
  const csrfToken = apiHeaders
    .flatMap((h) => h.requestHeaders)
    .find((h) => h.name === 'connect-csrf-token')?.value;
  if (csrfToken) setState('csrf-token', csrfToken);
}
```

### maxRecvData / maxSentData sizing guide

| Plugin          | Response Size | maxRecvData | maxSentData | Notes                              |
| --------------- | ------------- | ----------- | ----------- | ---------------------------------- |
| Swiss Bank      | ~200B         | 460         | 180         | Tiny response, simple cookie       |
| Spotify         | ~1.5KB        | 2400        | 600         | Small JSON, Bearer token           |
| Discord Profile | ~1KB          | 2500        | 1000        | Small JSON, Bearer token           |
| Twitter         | ~3KB          | 4000        | 2000        | Medium JSON, multiple auth headers |
| Discord DM      | ~5KB          | 10000       | 2000        | Medium JSON, message content       |
| Uber            | ~2KB          | 16384       | 4096        | GraphQL POST, cookie auth          |
| Garmin          | ~62KB         | 70000       | 8192        | Large array, huge session cookie   |

Large session cookies (e.g., Garmin's ~3KB `session` cookie) require higher `maxSentData`.

### Handler JSON path syntax

- Top-level field: `'screen_name'` (Twitter)
- Nested field: `'accounts.CHF'` (Swiss Bank), `'data'` (Uber GraphQL)
- Array element: `'items.0.name'` (Spotify), `'0.displayName'` (Garmin)
- Multiple fields: Use multiple RECV BODY handlers, one per field (Discord reveals `'0.timestamp'` + `'0.content'`)

### Required headers in every prove() call

Always include these two headers — they are required for TLSNotary to work:

```typescript
'Accept-Encoding': 'identity',  // Prevents compressed responses
Connection: 'close',             // Clean TLS session termination
```

## Reference

- Full plugin SDK docs: `PLUGIN.md` in repo root
- Example plugins: `packages/plugins/src/*.plugin.ts`
- Plugin SDK types: `packages/plugin-sdk/src/types.ts`
- Plugin SDK globals (available in sandbox): `packages/plugin-sdk/src/globals.ts`
