---
name: tlsnotary
description: Orient developers integrating TLSNotary into an app, browser extension, or web-service plugin. Use when the user asks how TLSNotary works, what TLSN packages exist, what the difference is between a plugin and a host, which integration path to pick, or any open question about adding TLSN to their own project — before routing them to the focused build-tlsn-host or create-plugin skills.
---

# TLSNotary — developer entry point

TLSNotary is a protocol for producing **cryptographic proofs of HTTPS traffic** that selectively reveal only the data the user wants to disclose. A user can prove "I have a Spotify account with these top artists" to a third-party verifier without handing over their session cookie or the full response body. The verifier is convinced the data really came from `api.spotify.com` because the proof commits to the TLS transcript itself.

This monorepo ships **everything a developer needs to add TLSNotary to a real product**: the protocol core, the contract that every platform adapter implements, three reference adapters (CLI, React Native, browser extension), a reference mobile app, the existing TLSN browser extension, and a Claude Code skill that scaffolds new consumers.

There are **three paths** a developer typically takes — pick whichever matches the work.

## 1 — Build a plugin

A plugin is sandboxed JavaScript that targets a specific web API, intercepts the user's auth, calls `prove()`, and emits a proof. Plugins are platform-agnostic: the same plugin runs on the browser extension, the mobile app, and the CLI.

- **When to pick this:** you want to prove data from a specific website or API (Twitter, your bank, a SaaS dashboard) but you don't need to ship a host.
- **Skill:** [`create-plugin`](../create-plugin/SKILL.md) walks through research, plugin source, build registration, and verification.
- **Reference:** [`PLUGIN.md`](../../../PLUGIN.md) is the canonical architecture deep-dive — capabilities, lifecycle, security model, worked X-Profile example.

## 2 — Build your own browser extension

A new Chrome/Firefox/Safari extension that runs TLSN plugins. Reuses the existing offscreen WASM prover and `webRequest` interception, all packaged as `@tlsn/host-extension`. You own the manifest, the popup UI, and your own plugin gallery.

- **When to pick this:** you want a TLSN-powered extension with your own branding / plugin curation, not the upstream one in `packages/extension/`.
- **Skill:** [`build-tlsn-host`](../build-tlsn-host/SKILL.md), extension flow.
- **Reference implementation:** `packages/extension/` — the upstream extension; reads identically to what the skill scaffolds.

## 3 — Build your own mobile app

A new React Native / Expo app that runs TLSN plugins. Uses the native Rust prover under the hood (`tlsn-native` Expo module), WebView-based header interception, and React Native's primitives for the plugin UI. Packaged as `@tlsn/host-react-native`.

- **When to pick this:** you want TLSN on iOS / Android with your own UX, gallery, theming.
- **Skill:** [`build-tlsn-host`](../build-tlsn-host/SKILL.md), React Native flow.
- **Reference implementation:** `app/mobile/` — the TLSN mobile app; consumes the same package an external dev would.

## The package map

```
@tlsn/plugin-sdk          ← protocol core: HostCore, types, handlers, sandbox
        ▲
@tlsn/host-contracts      ← interface spec: HostAdapter, ProverClient,
        ▲                   WindowManager, RequestInterceptor,
        │                   PluginRenderer, ApprovalUi (+ ApprovalMode,
        │                   translateHandler for the native bridge)
        │
   ┌────┴────────────────────────────────┐
   │                                     │
@tlsn/host-react-native   @tlsn/host-extension   @tlsn/host-cli
   │                                     │             │
   └──── platform-specific glue ─────────┘             │
                                                       │
   imports both plugin-sdk + the host-* it needs ──────┘

Consumer (your app)
   - imports plugin-sdk for protocol types (Handler, PluginConfig, DomJson, …)
   - imports the host-* package for the platform glue
   - implements/owns its own UI on top
```

`@tlsn/plugin-sdk` is **platform-agnostic** — types, the `HostCore` engine, the QuickJS / NativeFunction evaluator. Consumers always import from it directly.

`@tlsn/host-contracts` defines the shape every host adapter implements. Most consumers don't import it; adapter authors do.

`@tlsn/host-react-native`, `@tlsn/host-extension`, `@tlsn/host-cli` are platform glue — each pairs `HostCore` with a real `chrome.windows` / `react-native-webview` / Playwright `BrowserContext`, a real prover (WASM in the extension, native in mobile, a Rust binary on CLI), and a real renderer.

A consumer app imports the `host-*` package matching its platform AND `@tlsn/plugin-sdk` for shared types — that's the canonical pattern, the same way `react-dom` sits alongside `react`.

## Where to read more

- **`PLUGIN.md`** — the deep-dive on plugin architecture, capabilities, and security.
- **`CLAUDE.md`** — repo-level conventions and command reference for working in this monorepo.
- **`packages/host-contracts/src/index.ts`** — the source of truth for what an adapter must implement (all the interface definitions).
- **`app/mobile/`** — the canonical reference mobile consumer (uses `@tlsn/host-react-native`).
- **`packages/extension/`** — the canonical reference extension consumer (uses `@tlsn/host-extension`).
- **TLSNotary blog** — narrative posts at https://tlsnotary.org/blog, including the mobile-launch announcement.

## How to use this skill

This `tlsnotary` skill is the entry-point router. It exists so a developer can ask Claude "I want to add TLSN to my Expo app, where do I start?" and get oriented before being routed.

When the developer has picked a path:

- Plugin work → invoke the `create-plugin` skill.
- Host work (extension / mobile / CLI) → invoke the `build-tlsn-host` skill, which detects the platform from the project and walks through scaffolding.

Don't duplicate scaffolding here — defer to those focused skills.
