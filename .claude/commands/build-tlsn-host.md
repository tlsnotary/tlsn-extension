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

> **Phase 1 status:** only the `cli` adapter (`@tlsn/host-cli`) is currently published. If the user wants `react-native` or `extension`, tell them that scaffold isn't yet live and offer to scaffold the CLI to get them familiar with the contracts.

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

**Heads-up:** until the real Rust prover binary ships (Phase 1b), the CLI uses a stub prover that returns `{ stub: true, ... }`. The plugin executes correctly, windows open, headers are intercepted, the approval gate runs — but the proof object is a placeholder, not a real cryptographic attestation. Tell the dev this is expected.

### Step 6: Tell them where to go next

- **Customize approval UX**: `adapter.approval` is a `ClackApprovalUi` by default. They can replace it with their own via the `approval` option to `createCliAdapter`.
- **Write a CI-friendly headless run**: `tlsn-cli session save https://swissbank.tlsnotary.org` first to bake in cookies, then `tlsn-cli run swissbank --headless --storage-state ~/.tlsn/sessions/session.json --auto-approve`.
- **Write a custom plugin**: invoke `/create-plugin` (the existing skill) — its output drops into `packages/plugins/src/` and is auto-discovered.
- **Switch platforms later**: when the React Native / extension scaffolds land (Phase 2 / Phase 3), the same plugin code runs unchanged — only the adapter swaps.

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
