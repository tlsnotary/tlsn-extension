# Releasing tlsn-extension

## Version Scheme

`0.1.0.AABB` — `AA` is the TLSNotary alpha version, `BB` is the extension release within that alpha (e.g., `0.1.0.1402` = alpha.14, release 02).

## Prerequisites

The following GitHub secrets must be configured for automated Chrome Web Store publishing:

- `OAUTH_CLIENT_ID`
- `OAUTH_CLIENT_SECRET`
- `OAUTH_REFRESH_TOKEN`

See [Chrome Web Store API docs](https://developer.chrome.com/docs/webstore/using-api#beforeyoubegin) and [chrome-webstore-upload-keys](https://github.com/fregante/chrome-webstore-upload-keys) for setup.

## Release Steps

### 1. Bump the version

Update the version in **both** files (they must match):

- `packages/extension/package.json` → `"version": "0.1.0.XXXX"`
- `packages/extension/src/manifest.json` → `"version": "0.1.0.XXXX"`

Then run `npm install` from the root to update `package-lock.json`.

**If this release changes the extension's public API** or behavior the demo relies on, also bump `MIN_EXTENSION_VERSION` in `packages/demo/src/config.ts` to `0.1.0.XXXX` in the same commit. The demo deploys on every push to `main`, so this must land together with the extension version bump — otherwise the demo will use new APIs without enforcing the minimum, and users on the old extension hit confusing failures instead of a clear "update extension" message.

During the Chrome Web Store approval window, users on the old extension will see the "update extension" warning. That's the intended behavior — the StatusBar message already tells them the store update can take a while to roll out.

### 2. Commit the version bump

```bash
git add packages/extension/package.json packages/extension/src/manifest.json package-lock.json
# Plus packages/demo/src/config.ts if you bumped MIN_EXTENSION_VERSION
git commit -m "chore(extension): version 0.1.0.XXXX"
```

### 3. Push and merge to main

Open a PR, get it reviewed, and merge to `main`.

### 4. Create a GitHub Release

From the GitHub UI or CLI, create a new release:

```bash
gh release create 0.1.0.XXXX --target main --title "0.1.0.XXXX" --generate-notes
```

Use `--generate-notes` to auto-populate the description from merged PRs, or write release notes manually.

### 5. CI takes over

Publishing the GitHub Release triggers the `ci.yaml` workflow which:

1. **Builds** the extension (`npm run build`) and produces `extension-0.1.0.XXXX.zip`
2. **Lints** and **tests** all packages
3. **Uploads** the zip to the GitHub Release as an asset
4. **Publishes** to the Chrome Web Store automatically (extension ID: `gmffafnhddcekoffnikeijhpnlgmomhl`)

### 6. Verify

- Check the [GitHub Actions run](https://github.com/tlsnotary/tlsn-extension/actions) succeeded
- Confirm the zip appears on the [GitHub Release](https://github.com/tlsnotary/tlsn-extension/releases)
- Check the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) for the published update

## Important Notes

- The extension version must match the notary server version it connects to
- Chrome Web Store review can take hours to days after upload
- The `demo.yml` workflow is triggered separately by version tags matching `[v]?[0-9]+.[0-9]+.[0-9]+*` and publishes Docker images for the verifier and demo frontend to GHCR
