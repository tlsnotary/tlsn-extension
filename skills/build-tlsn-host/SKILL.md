---
name: build-tlsn-host
description: Scaffold a TLSNotary host app on CLI, React Native, or browser extension. Use when the user asks to build, integrate, or add TLSNotary to a new project — including phrases like "add TLSN to my Expo app", "build a TLSN browser extension", "run TLSN plugins from a CLI", or any time the work involves writing a new consumer of the @tlsn/host-* adapter packages.
---

# Scaffold a TLSNotary host app

Help a developer build a new application that embeds TLSNotary — a CLI tool, a React Native mobile app, or a browser extension — by scaffolding the right files and wiring them to the appropriate `@tlsn/host-*` adapter.

## Arguments

`$ARGUMENTS` may specify the target platform (`cli`, `react-native`, `extension`) and/or the dev's starting directory. If neither is provided, ask.

## Process

### Step 1: Pick the platform

Detect first; ask only if ambiguous.

| If you see… | Pick |
|---|---|
| `package.json` with `"react-native"` or `"expo"` | `react-native` |
| `manifest.json` with `"manifest_version"` | `extension` |
| A plain Node `package.json` with `"type": "module"` or no `package.json` at all | `cli` |
| Multiple of the above | Ask the user which to scaffold |

> **Current status:** `cli` (`@tlsn/host-cli`), `react-native` (`@tlsn/host-react-native`), and `extension` (`@tlsn/host-extension`) adapters are all published.

### Step 2: Pick a starter plugin

Ask the user which plugin they want to run as their first proof. Surface the list from `@tlsn/plugins`:

```
swissbank        — Swiss bank balance proof (recommended; works against the dev verifier with no real auth)
twitter          — X/Twitter profile screen_name
swissbank_hash   — Same as swissbank, with a hash commitment
spotify          — Spotify top artist
duolingo         — Duolingo streak
discord_profile  — Discord username
discord_dm       — Discord DM (requires real Discord auth)
uber             — Uber rider profile
idme             — ID.me credentials
```

Default to `swissbank` if the user is just exploring — it works against the local dev verifier without requiring real credentials.

### Step 3: Confirm the verifier URL

By default the CLI talks to `http://localhost:7047` (the verifier from `servers/verifier`). If the user has it running on a different host/port, ask. If they don't have a verifier running, point them at `cargo run -p tlsn-verifier-server` from the monorepo root.

### Step 4: Scaffold the project

For the **`cli`** platform, write these files into the target directory:

#### `package.json`

```json
{
  "name": "<their-project-name>",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "prove": "tlsn-cli run <plugin-id> --verifier http://localhost:7047",
    "prove:auto": "tlsn-cli run <plugin-id> --verifier http://localhost:7047 --auto-approve"
  },
  "dependencies": {
    "@tlsn/host-cli": "^0.1.0",
    "@tlsn/plugins": "^0.1.0"
  }
}
```

For the **`react-native`** platform, you scaffold against a fresh Expo app. The lift here is more involved than CLI because RN needs native modules linked. Walk the dev through:

#### 4a. Bootstrap the Expo app (if they don't have one)

```bash
npx create-expo-app@latest my-tlsn-app --template
cd my-tlsn-app
```

#### 4b. Install host-react-native + peer deps

```bash
npx expo install react-native-webview @react-native-cookies/cookies
npm install @tlsn/host-react-native @tlsn/plugins
```

#### 4c. Wire the native modules

`@tlsn/host-react-native`'s NativeProver / MobilePluginHost expect a `tlsn-native` Expo module to be installed. Until the Phase 3 standalone npm package ships, point the dev at the tlsn-extension monorepo:

```bash
# Option A — git submodule
git submodule add https://github.com/tlsnotary/tlsn-extension vendor/tlsn-extension
ln -s ../../vendor/tlsn-extension/app/mobile/modules/tlsn-native modules/tlsn-native
ln -s ../../vendor/tlsn-extension/app/mobile/modules/quickjs-native modules/quickjs-native

# Then in package.json deps:
#   "tlsn-native": "file:./modules/tlsn-native",
#   "quickjs-native": "file:./modules/quickjs-native",

# Build the Rust prover once:
cd vendor/tlsn-extension/app/mobile && ./build.sh ios --skip-deps --no-run
```

#### 4d. Scaffold the runner screen

Drop a starter `PluginRunnerScreen.tsx` that wires the package's primitives. The dev owns the styling and the approval-sheet UI; the package provides the protocol/IO plumbing.

```typescript
// src/screens/PluginRunnerScreen.tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { View, Text } from 'react-native';
import {
  MobilePluginHost,
  PluginRenderer,
  PluginWebView,
  NativeProver,
  type NativeProverHandle,
  type ApprovalMode,
  type PluginConfig,
  type DomJson,
  type EventEmitter,
  type WindowMessage,
} from '@tlsn/host-react-native';

export function PluginRunnerScreen({ pluginCode, pluginConfig }: {
  pluginCode: string;
  pluginConfig: PluginConfig;
}) {
  // ...wire MobilePluginHost ↔ NativeProver ↔ PluginWebView ↔ PluginRenderer
  // ...show your own ApprovalSheet / RevealApprovalSheet
  // ...call onComplete with the proof
}
```

For a fuller worked example, point the dev at `app/mobile/components/tlsn/PluginScreen.tsx` in the tlsn-extension repo — that's the reference consumer for the same package.

For the **`extension`** platform, you scaffold a Manifest-V3 Chrome extension with the four required entry points wired to `@tlsn/host-extension`.

#### 4a. Bootstrap

```bash
mkdir my-tlsn-extension && cd my-tlsn-extension
npm init -y
npm install @tlsn/host-extension @tlsn/plugin-sdk @tlsn/plugins comlink webextension-polyfill tlsn-wasm
npm install --save-dev webpack webpack-cli ts-loader typescript copy-webpack-plugin html-webpack-plugin
```

#### 4b. Minimum `manifest.json`

```json
{
  "manifest_version": 3,
  "name": "My TLSN Extension",
  "version": "0.1.0",
  "permissions": [
    "offscreen",
    "webRequest",
    "storage",
    "activeTab",
    "tabs",
    "windows"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.bundle.js", "type": "module" },
  "content_scripts": [
    { "matches": ["http://*/*", "https://*/*"], "js": ["contentScript.bundle.js"] }
  ],
  "web_accessible_resources": [
    { "resources": ["content.bundle.js", "icons/*"], "matches": ["<all_urls>"] }
  ],
  "action": { "default_popup": "popup.html" },
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'"
  }
}
```

#### 4c. Background entry — `src/background.ts`

```typescript
import browser from 'webextension-polyfill';
import {
  WindowManager,
  installRequestInterceptor,
  confirmationManager,
} from '@tlsn/host-extension/background';

const windowManager = new WindowManager();
installRequestInterceptor({ windowManager });

browser.runtime.onMessage.addListener(async (msg, sender) => {
  // … route OPEN_WINDOW / CLOSE_WINDOW / EXEC_CODE / RENDER_PLUGIN_UI / PLUGIN_CONFIRM_RESPONSE
  // (mirror packages/extension/src/entries/Background/index.ts as the reference)
});
```

#### 4d. Content script — `src/content.ts`

```typescript
import browser from 'webextension-polyfill';
import { renderPluginUI } from '@tlsn/host-extension/content';
import type { ContentMessage } from '@tlsn/host-extension/types';

browser.runtime.onMessage.addListener((msg: unknown) => {
  const req = msg as ContentMessage;
  if (req.type === 'RENDER_PLUGIN_UI') {
    renderPluginUI(req.json, req.windowId, {
      onPluginAction: (onclick, windowId) =>
        browser.runtime.sendMessage({ type: 'PLUGIN_UI_CLICK', onclick, windowId }),
    });
  }
});
```

#### 4e. Offscreen entry — `src/offscreen.ts`

```typescript
import browser from 'webextension-polyfill';
import { SessionManager } from '@tlsn/host-extension/offscreen';

const sessionManager = new SessionManager();
browser.runtime.onMessage.addListener(async (msg) => {
  // route GET_PLUGIN_STATS_OFFSCREEN / EXEC_CODE_OFFSCREEN to sessionManager
  // (mirror packages/extension/src/entries/Offscreen/index.tsx)
});
```

#### 4f. Approval popup — `src/confirm-popup.tsx`

The popup is opened by `confirmationManager.requestConfirmation()`; the dev writes the React shell (plugin name, requests list, three buttons). See `packages/extension/src/entries/ConfirmPopup/index.tsx` for the reference layout.

For a fuller worked example, point the dev at `packages/extension/src/entries/Background/index.ts` in the tlsn-extension repo — that's the reference consumer for `@tlsn/host-extension`.

If the developer wants to write their own JS driver instead of using the bin, also scaffold:

#### `run.ts` (optional, for programmatic use)

```typescript
import { createCliAdapter } from '@tlsn/host-cli';
import { PluginEventEmitter } from '@tlsn/host-cli/event-emitter';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const registry = require('@tlsn/plugins/dist/registry.js');
const plugin = registry.PLUGIN_REGISTRY.find((p) => p.id === '<plugin-id>');
const code = readFileSync(require.resolve(`@tlsn/plugins/dist/demo/${plugin.id}.js`), 'utf8');

const adapter = await createCliAdapter({ mode: 'capture' });
try {
  const mode = await adapter.approval.requestPluginApproval({
    config: plugin.pluginConfig,
    source: code,
  });
  if (mode === 'rejected') process.exit(1);

  const host = await adapter.createHost({
    verifierUrl: 'http://localhost:7047',
    proxyUrl: '',
    approvalMode: mode,
    pluginConfig: plugin.pluginConfig,
  });

  const result = await host.executePlugin(code, { eventEmitter: new PluginEventEmitter() });
  console.log(result);
} finally {
  await adapter.dispose();
}
```

### Step 5: Install + sanity-check

```bash
cd <their-project-dir>
npm install
npx playwright install chromium    # First-time browser fetch
npm run prove
```

Tell the dev what to expect:

1. A Chromium window opens pointed at the plugin's target host (e.g. `swissbank.tlsnotary.org`).
2. They sign in (if needed) and click around — the extension captures auth headers in the background.
3. The CLI prompts them to approve the proof (`all-session`, `manual`, or `reject`).
4. If approved, the CLI calls `prove()` and prints the resulting proof JSON to stdout.

**Heads-up — Rust prover binary.** `@tlsn/host-cli` ships a `RustProverClient` that spawns a separate `tlsn-prover` binary built from `packages/tlsn-mobile/`. From the monorepo:

```bash
cd packages/tlsn-mobile && cargo build --bin tlsn-prover --release
```

`createCliAdapter` auto-detects the binary in `packages/tlsn-mobile/target/release/tlsn-prover` (or via the `TLSN_PROVER_BIN` env var) and uses the Rust prover by default. If neither is found, it falls back to the `NullProverClient` stub that returns `{ stub: true, ... }` — so plugins still run end-to-end for UI / approval / interception testing without needing the binary.

### Step 6: Tell them where to go next

- **Customize approval UX**: `adapter.approval` is a `ClackApprovalUi` by default. They can replace it with their own via the `approval` option to `createCliAdapter`.
- **Write a CI-friendly headless run**: `tlsn-cli session save https://swissbank.tlsnotary.org` first to bake in cookies, then `tlsn-cli run swissbank --headless --storage-state ~/.tlsn/sessions/session.json --auto-approve`.
- **Write a custom plugin**: invoke `/create-plugin` (the existing skill) — its output drops into `packages/plugins/src/` and is auto-discovered.
- **Switch platforms later**: the same plugin code runs unchanged on CLI / React Native / browser extension — only the adapter swaps.

## Reference: what each adapter contract does

So the dev knows where to plug in:

| Contract | CLI impl | Mobile impl (future) | Extension impl (future) |
|---|---|---|---|
| `WindowManager` | Playwright `BrowserContext.newPage()` | `react-native-webview` source-change | `chrome.windows.create` |
| `RequestInterceptor` | `page.route('**/*', …)` | Injected JS wrapping `fetch`/`XHR` + `@react-native-cookies/cookies` | `webRequest.onBeforeRequest` + `extraHeaders` |
| `ProverClient` | Spawns the Rust prover binary (stub for now) | tlsn-native (uniffi) Expo module | tlsn-wasm in offscreen document |
| `PluginRenderer` | JSON pretty-print to stdout (or `ink` TUI) | `<PluginRenderer>` over RN primitives | DOM elements in content script |
| `ApprovalUi` | `@clack/prompts` (or `--auto-approve`) | `PluginApprovalSheet` + `RevealApprovalSheet` bottom sheets | Approval modal in content script + Options strict-mode |

## Notes

- The CLI deliberately doesn't constrain UI — the dev owns their approval prompts, renderer, theming. The adapter ships defaults; replace any of them via `createCliAdapter({ approval, renderer, prover })`.
- The `--auto-approve` flag is for trusted CI / first-run smoke tests. **Don't** ship it into a user-facing wrapper.
- A session captured via `session save` is just a Playwright `storageState` JSON. Treat it as sensitive — it contains the user's cookies.
- If the verifier isn't running, the CLI will hang at the prove step. Tell the user to check `cargo run -p tlsn-verifier-server` is up.
