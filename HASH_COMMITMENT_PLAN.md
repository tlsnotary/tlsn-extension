# Plan: Add Hash Commitment Support to tlsn-wasm

## Status: Implemented

## Goal

Enable plugins to use `action: 'HASH'` (replacing the existing `'PEDERSEN'`) on handlers so that
specific transcript ranges are **hash-committed** (blinded, never revealed as plaintext) instead
of revealed. Today `HandlerAction::Pedersen` exists in the type system but is silently treated
as `Reveal` — this plan wires it through to the real `prove_hash()` path that already exists in
the core prover.

## Current State

| Layer                                                          | What exists                                                                                                                                | What's missing                                                                |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **Core prover** (`tlsn/crates/tlsn/src/prover/prove.rs`)       | `prove_hash()` fully implemented; `ProveConfig` accepts `transcript_commit()` with `(Direction, RangeSet, HashAlgId)` tuples               | Nothing — this layer is complete                                              |
| **Core types** (`tlsn/crates/core/src/hash.rs`)                | `HashAlgId::SHA256`, `BLAKE3`, `KECCAK256`; `TranscriptCommitConfig` builder with `commit_sent()` / `commit_recv()` / `commit_with_kind()` | Nothing — hash infra is complete                                              |
| **SDK-core types** (`sdk-core/src/types.rs:328-336`)           | `HandlerAction::Reveal` and `HandlerAction::Pedersen` enum variants; `Commit` struct (unused)                                              | No hash algorithm field on `Pedersen`/`Hash`                                  |
| **SDK-core handler** (`sdk-core/src/handler/mod.rs:63-111`)    | `compute_reveal()` extracts byte ranges for ALL handlers                                                                                   | Never branches on `handler.action` — all ranges go into `Reveal`              |
| **SDK-core prover** (`sdk-core/src/prover.rs:254-294`)         | `SdkProver::reveal()` builds `ProveConfig` with reveal ranges only                                                                         | Never calls `builder.transcript_commit()` — `Commit` ranges are ignored       |
| **WASM bindings** (`wasm/src/handler.rs`, `wasm/src/types.rs`) | `compute_reveal` WASM export; `Commit` struct defined with Tsify                                                                           | `Commit` is never returned; prover has no commit path                         |
| **Extension TS** (`ProveManager/worker.ts`, `index.ts`)        | Calls `compute_reveal()`, sends reveal config to verifier                                                                                  | Only handles reveal ranges                                                    |
| **Plugin SDK** (`plugin-sdk/src/types.ts:157`)                 | `HandlerAction = 'REVEAL' \| 'PEDERSEN'`                                                                                                   | Naming misleading; needs `HASH` + algorithm selector                          |
| **Verifier** (`verifier/src/main.rs`)                          | Accepts reveal config, extracts plaintext from revealed ranges                                                                             | No awareness of committed (non-revealed) ranges; no `action` field on handler |

## Naming Decision

**Rename `PEDERSEN` → `HASH`** in the plugin-facing API. Rationale:

- The underlying hash algorithms are Blake3/SHA256/Keccak256, not Pedersen.
- `HASH` pairs naturally with `REVEAL` — plugin authors think "reveal this, hash that."
- Keep `PEDERSEN` as a deprecated serde alias for backward compatibility.
- Add optional `algorithm` field defaulting to `BLAKE3` (matching `TranscriptCommitConfigBuilder` default).

## Implementation Steps

### Step 1: SDK-core types (`sdk-core/src/types.rs`)

**File:** `packages/tlsn-wasm/tlsn/crates/sdk-core/src/types.rs`

1. Add a `HashAlgorithm` enum:

   ```rust
   #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
   #[serde(rename_all = "UPPERCASE")]
   pub enum HashAlgorithm {
       Blake3,
       Sha256,
       Keccak256,
   }

   impl Default for HashAlgorithm {
       fn default() -> Self { Self::Blake3 }
   }

   impl From<HashAlgorithm> for HashAlgId {
       fn from(alg: HashAlgorithm) -> Self {
           match alg {
               HashAlgorithm::Blake3 => HashAlgId::BLAKE3,
               HashAlgorithm::Sha256 => HashAlgId::SHA256,
               HashAlgorithm::Keccak256 => HashAlgId::KECCAK256,
           }
       }
   }
   ```

2. Extend `HandlerAction` — add `Hash` variant, keep `Pedersen` as alias:

   ```rust
   #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
   #[serde(rename_all = "UPPERCASE")]
   pub enum HandlerAction {
       Reveal,
       Hash,
       /// Deprecated alias for Hash. Kept for backward compatibility.
       #[serde(alias = "PEDERSEN")]
       #[deprecated(note = "Use Hash instead")]
       Pedersen,
   }

   impl HandlerAction {
       pub fn is_hash(&self) -> bool {
           matches!(self, Self::Hash | Self::Pedersen)
       }
   }
   ```

   > **Alternative (simpler):** Just rename `Pedersen` to `Hash` with `#[serde(alias = "PEDERSEN")]`
   > and avoid two variants. This is cleaner if we don't need to distinguish them at runtime.

3. Add optional `algorithm` field to `Handler`:
   ```rust
   pub struct Handler {
       pub handler_type: HandlerType,
       pub part: HandlerPart,
       pub action: HandlerAction,
       pub params: Option<HandlerParams>,
       /// Hash algorithm for HASH actions. Ignored when action is Reveal.
       /// Defaults to Blake3.
       #[serde(default, skip_serializing_if = "Option::is_none")]
       pub algorithm: Option<HashAlgorithm>,
   }
   ```

### Step 2: SDK-core `compute_reveal()` (`sdk-core/src/handler/mod.rs`)

**File:** `packages/tlsn-wasm/tlsn/crates/sdk-core/src/handler/mod.rs` (lines 46-111)

1. Extend `ComputeRevealOutput` to include commit ranges:

   ```rust
   pub struct ComputeRevealOutput {
       pub reveal: Reveal,
       /// `None` when no handlers use `action: HASH`.
       pub commit: Option<Commit>,
       pub sent_ranges_with_handlers: Vec<RangeWithHandler>,
       pub recv_ranges_with_handlers: Vec<RangeWithHandler>,
   }
   ```

   Where `Commit` uses per-range algorithms via `CommitRange`:

   ```rust
   pub struct CommitRange {
       pub start: usize,
       pub end: usize,
       pub algorithm: Option<HashAlgorithm>, // None = BLAKE3 default
   }

   pub struct Commit {
       pub sent: Vec<CommitRange>,
       pub recv: Vec<CommitRange>,
   }
   ```

2. In `compute_reveal()`, branch on `handler.action`. Each HASH range carries its
   handler's `algorithm`, so different handlers can use different hash algorithms:

   ```rust
   if handler.action.is_hash() {
       for range in extracted {
           commit_vec.push(CommitRange {
               start: range.start,
               end: range.end,
               algorithm: handler.algorithm,
           });
       }
   } else {
       reveal_vec.extend(extracted);
   }
   ```

### Step 3: SDK-core `SdkProver::reveal()` (`sdk-core/src/prover.rs`)

**File:** `packages/tlsn-wasm/tlsn/crates/sdk-core/src/prover.rs` (lines 254-294)

Extend `reveal()` to accept both `Reveal` and `Commit`:

```rust
pub async fn reveal(&mut self, reveal: Reveal, commit: Option<Commit>) -> Result<()> {
    // ... reveal ranges as before ...

    // Each CommitRange carries its own algorithm (per-range).
    if let Some(commit) = commit {
        let mut commit_builder =
            TranscriptCommitConfig::builder(prover.transcript());

        for cr in &commit.sent {
            let alg: HashAlgId = cr.algorithm.unwrap_or_default().into();
            commit_builder.commit_with_kind(
                cr.start..cr.end, Direction::Sent,
                TranscriptCommitmentKind::Hash { alg },
            )?;
        }
        for cr in &commit.recv {
            let alg: HashAlgId = cr.algorithm.unwrap_or_default().into();
            commit_builder.commit_with_kind(
                cr.start..cr.end, Direction::Received,
                TranscriptCommitmentKind::Hash { alg },
            )?;
        }

        builder.transcript_commit(commit_builder.build()?);
    }
    // ...
}
```

> **Note:** The signature of `reveal()` adds `commit: Option<Commit>`.
> Existing callers pass `None` for the new parameter.

### Step 4: WASM bindings

#### 4a. `wasm/src/handler.rs` — no changes needed

The existing `compute_reveal` WASM export is a thin serde passthrough. The new `commit` and
`commit_algorithm` fields on `ComputeRevealOutput` will serialize automatically.

#### 4b. `wasm/src/prover.rs` — update `reveal()` export

**File:** `packages/tlsn-wasm/tlsn/crates/wasm/src/prover.rs`

Find the `reveal()` WASM-exported method. It currently accepts a `Reveal` struct. Extend it
to accept an optional `Commit` struct and optional algorithm string:

```rust
#[wasm_bindgen]
pub async fn reveal(&mut self, reveal: Reveal, commit: Option<Commit>,
                     algorithm: Option<String>) -> Result<(), JsError> {
    let alg = algorithm.map(|s| serde_json::from_str(&format!("\"{s}\""))
        .map_err(|e| JsError::new(&format!("invalid algorithm: {e}"))))
        .transpose()?;

    self.prover.reveal(reveal.into(), commit.map(Into::into), alg).await
        .map_err(|e| JsError::new(&e.to_string()))
}
```

#### 4c. `tlsn_wasm.d.ts` — update type declarations

**File:** `packages/tlsn-wasm-pkg/tlsn_wasm.d.ts`

Add algorithm type and update signatures:

```typescript
export type HashAlgorithm = "BLAKE3" | "SHA256" | "KECCAK256";

export interface Commit {
    sent: { start: number; end: number }[];
    recv: { start: number; end: number }[];
}

// Update Prover.reveal() signature:
reveal(reveal: Reveal, commit?: Commit, algorithm?: HashAlgorithm): Promise<void>;
```

### Step 5: Extension ProveManager

#### 5a. `worker.ts`

**File:** `packages/extension/src/offscreen/ProveManager/worker.ts`

In `computeReveal()` (line ~314), parse the new commit fields from WASM output:

```typescript
return {
  sentRangesWithHandlers: typed.sent_ranges_with_handlers,
  recvRangesWithHandlers: typed.recv_ranges_with_handlers,
  // New:
  commitSent: typed.commit?.sent ?? [],
  commitRecv: typed.commit?.recv ?? [],
  commitAlgorithm: typed.commit_algorithm ?? 'BLAKE3',
};
```

#### 5b. `index.ts`

**File:** `packages/extension/src/offscreen/ProveManager/index.ts`

In the `reveal()` method, pass commit data to the prover:

```typescript
const commit =
  commitSent.length || commitRecv.length ? { sent: commitSent, recv: commitRecv } : undefined;

await workerApi.reveal(proverId, revealConfig, commit, commitAlgorithm);
```

In `sendRevealConfig()`, include an `action` field per range so the verifier knows
which ranges are committed vs revealed.

### Step 6: Plugin SDK types

**File:** `packages/plugin-sdk/src/types.ts`

```typescript
export type HashAlgorithm = 'BLAKE3' | 'SHA256' | 'KECCAK256';

export type HandlerAction = 'REVEAL' | 'HASH';

// Add optional algorithm to handler types that support HASH:
export type BodyHandler = {
  type: HandlerType;
  part: 'BODY';
  action: HandlerAction;
  /** Hash algorithm for HASH action. Default: BLAKE3. Ignored for REVEAL. */
  algorithm?: HashAlgorithm;
  params?: { type?: 'json'; path?: string; hideKey?: boolean; hideValue?: boolean };
};
```

Apply the same `algorithm?: HashAlgorithm` field to `StartLineHandler`, `HeadersHandler`,
and `AllHandler`.

### Step 7: Verifier changes

**File:** `packages/verifier/src/main.rs`

1. Add `action` field to the `Handler` struct (~line 118) with a default of `"REVEAL"`:

   ```rust
   #[derive(Deserialize)]
   struct Handler {
       #[serde(rename = "type")]
       handler_type: String,
       part: String,
       #[serde(default = "default_reveal")]
       action: String,
       params: Option<HandlerParams>,
   }

   fn default_reveal() -> String { "REVEAL".to_string() }
   ```

2. In `process_ranges()` (~line 1103), branch on action:
   - `REVEAL`: extract plaintext from transcript as today.
   - `HASH` / `PEDERSEN`: report a `HandlerResult` with `hashed: true` and no
     plaintext value. Include the hash algorithm used.

3. Extend `HandlerResult` to indicate hashed vs revealed:

   ```rust
   struct HandlerResult {
       // existing fields...
       hashed: bool,
       algorithm: Option<String>,
   }
   ```

4. In webhook payload: hashed ranges appear as `{ "hashed": true, "algorithm": "BLAKE3" }`
   instead of plaintext values.

### Step 8: Tests

1. **Rust unit tests** (`sdk-core/src/handler/tests.rs`):
   - Add tests with mixed `REVEAL` and `HASH` handlers.
   - Verify `compute_reveal()` separates ranges into `reveal` vs `commit`.
   - Verify `PEDERSEN` serde alias still deserializes to `Hash`.
   - Verify default algorithm is Blake3.

2. **Rust integration test** (new test in `sdk-core` or `wasm`):
   - Full prove flow with `SdkProver::reveal(reveal, Some(commit), None)`.
   - Verify the prover completes without error.
   - Verify the verifier output contains hash-commitment metadata.

3. **Plugin smoke test**:
   - Modify `packages/plugins/src/idme.plugin.ts` line 90: change `full_name` handler
     from `action: 'REVEAL'` to `action: 'HASH'`.
   - Verify prove flow completes and proof contains the hash commitment (not plaintext).

## Implementation Order

```
Step 1  SDK-core types          (no dependencies, pure type additions)
  │
Step 2  compute_reveal()        (depends on Step 1 types)
  │
Step 3  SdkProver::reveal()     (depends on Step 2 output shape)
  │
Step 4  WASM bindings           (depends on Step 3 Rust API)
  │
  ├── Step 5  Extension TS      (depends on Step 4 WASM API)
  │
  ├── Step 6  Plugin SDK types  (independent, can parallel with Step 5)
  │
  └── Step 7  Verifier          (independent, can parallel with Step 5)
  │
Step 8  Tests                   (after all code changes)
```

Steps 5, 6, and 7 can be done in parallel once Step 4 is complete.

## Risks and Open Questions

1. **`ProveConfig` with both reveal and commit:** The `prove.rs` code (lines 33-41) already
   merges both into the same prove call. This should work, but needs an integration test to
   confirm the MPC protocol handles both simultaneously.

2. **Verifier-side proof verification:** When the prover sends a proof with both revealed and
   committed ranges, does the verifier automatically verify the hash commitments? Need to
   confirm in `tlsn/crates/tlsn/src/verifier/` that `verify()` handles `TranscriptCommitConfig`.

3. **Breaking change on `SdkProver::reveal()` signature:** Adding `commit` and `algorithm`
   parameters changes the public API. Mitigate by making them `Option<_>` — existing callers
   passing only `reveal` will need a minor update (`reveal(r, None, None)`), or use a builder
   / config struct.

4. **WASM binary size:** The hash algorithms (blake3, sha2, tiny_keccak) are already compiled
   into the WASM binary for the core prover. No size increase expected.

5. **Mobile parity:** `packages/tlsn-mobile/src/lib.rs` has the same gap — it maps
   `HandlerAction::Pedersen` but doesn't call the commit path. Same fix needed there, but
   out of scope for this plan.

6. **Per-handler algorithm:** ~~Deferred~~ **Implemented.** Each `CommitRange` carries its own
   `algorithm` from its originating handler. The prover calls `commit_with_kind()` per-range
   with the appropriate algorithm. This matches `tlsn-core`'s `TranscriptCommitConfig` which
   stores `Vec<((Direction, RangeSet), TranscriptCommitmentKind)>` — each range gets its own kind.
