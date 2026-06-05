# @tlsn/plugins

Shared TLSNotary plugins and their registry — the **single source of truth** consumed
by both clients: the browser extension (via [`packages/demo`](../demo)) and the
[mobile app](../../app/mobile).

A plugin logs the user into a service, captures auth (cookies/headers), calls an API
endpoint through the TLS prover, and produces a selectively-disclosed proof of the
response. See [`PLUGIN.md`](../../PLUGIN.md) for the authoring guide and capabilities.

## Layout

```
packages/plugins/
├── src/
│   ├── *.plugin.ts     # Plugin sources (twitter, swissbank, spotify, duolingo, uber, discord, ...)
│   └── registry.ts     # Shared metadata; each entry declares platforms: ('demo' | 'mobile')[]
├── build.js            # esbuild bundler → dist/demo + dist/mobile
└── dist/
    ├── registry.js     # Compiled registry (tsc)
    ├── demo/*.js       # ESM bundles for the browser extension
    └── mobile/*.js     # Hermes-compatible string modules for the mobile app
```

The `registry.ts` `platforms` field controls where each plugin appears, and `debug: true`
hides a work-in-progress plugin behind the mobile app's Debug mode (and adds a "WIP"
badge on the demo).

## Build

```bash
npm run build            # both targets (from this package) — runs build.js + tsc registry
npm run build:demo       # demo target only
npm run build:mobile     # mobile target only

# From the repo root:
npm run build:plugins
```

### Targets

- **demo** (`dist/demo/*.js`): standard ESM bundles loaded by the extension demo. The
  verifier/proxy URLs are baked in from `VITE_VERIFIER_HOST` / `VITE_SSL`.
- **mobile** (`dist/mobile/*.js`): bundled with esbuild `target: 'es2016'` (Hermes cannot
  parse `async/await` in dynamically-evaluated code), then wrapped as an exported string
  constant (`<NAME>_PLUGIN_CODE`). The mobile app evaluates this string via `new Function()`
  in `MobilePluginHost`. The verifier URL is baked in from `MOBILE_VERIFIER_URL`.

### Environment variables

| Variable              | Target | Default                 | Description                            |
| --------------------- | ------ | ----------------------- | -------------------------------------- |
| `VITE_VERIFIER_HOST`  | demo   | `localhost:7047`        | Verifier host                          |
| `VITE_SSL`            | demo   | `false`                 | Use `https`/`wss`                      |
| `MOBILE_VERIFIER_URL` | mobile | `http://localhost:7047` | Verifier URL baked into mobile plugins |

```bash
# Point mobile plugins at the public demo verifier
MOBILE_VERIFIER_URL=https://demo.tlsnotary.org npm run build:plugins
```

## Adding a plugin

Use the Claude Code command `/create-plugin` (see [`.claude/commands/create-plugin.md`](../../.claude/commands/create-plugin.md)),
or manually:

1. Add `src/<name>.plugin.ts`.
2. Add an entry to `src/registry.ts` with the right `platforms`.
3. Add the plugin id to the `plugins` array in `build.js`.
4. `npm run build:plugins`.
