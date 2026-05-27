# Releasing the TLSNotary Mobile apps

The mobile app is built and submitted to the App Store and Play Store with **Expo**. Production builds run on **EAS** (Expo Application Services) cloud builders.

## Version Scheme

`0.1.AABB` — `AA` is the TLSNotary alpha version, `BB` is the mobile release within that alpha (e.g., `0.1.1500` = alpha.15, release 00).

This intentionally diverges from the extension's `0.1.0.AABB` scheme: iOS `CFBundleShortVersionString` only accepts three numeric components (`MAJOR.MINOR.PATCH`), so a 4-part version fails App Store validation. The same alpha/release info is packed into the PATCH slot instead.

## Prerequisites

### Accounts

- **Expo account** with access to the `tlsnotary` org (`extra.eas.projectId` is set in [app.json](app.json))
- **Apple Developer Program** membership for iOS store distribution (bundle id `org.tlsnotary.mobile`)
- **Google Play Console** access for Android store distribution (package `org.tlsnotary.mobile`)

### Local tooling

```bash
npx eas-cli login            # one-time
npx eas-cli whoami           # confirm logged-in user
```

### One-time setup

**Submit credentials.** `eas.json`'s `submit.production` block starts empty. Before the first `eas submit`, run `npx eas-cli submit:configure` and follow the interactive prompts to provision iOS signing + Android keystore and populate `submit.production`.

**Auto-incrementing build numbers.** `build.production` has `"autoIncrement": true` in [eas.json](eas.json), so EAS bumps Android `versionCode` and iOS `buildNumber` on every production build. You only edit the user-facing `version` string in [app.json](app.json). Without this, a second submit fails with `Version code N has already been used` (Play permanently locks each `versionCode` to one upload).

## Release Steps

### 1. Bump the version

Edit [app.json](app.json):

```json
"version": "0.1.XXXX"
```

Only edit the user-facing `version` string — iOS `buildNumber` and Android `versionCode` are auto-bumped by EAS via `autoIncrement` on the production profile (see [One-time setup](#one-time-setup)).

### 2. Commit the version bump

```bash
git add app/mobile/app.json
git commit -m "chore(mobile): version 0.1.XXXX"
```

### 3. Push and merge to main

Open a PR, get it reviewed, and merge to `main`.

### 4. Build on EAS

From `app/mobile/`:

```bash
npx eas-cli build --profile production --platform all
```

The command prints a build URL — monitor progress at https://expo.dev/accounts/tlsnotary/projects/tlsn-mobile/builds.

> First production build will prompt to generate / upload signing credentials if not already provisioned. Choose "let EAS manage" unless you have specific reasons to use existing keys.

### 5. Submit to the stores

Once both builds finish:

```bash
npx eas-cli submit --profile production --platform all
```

This pulls the latest finished production builds and uploads them to App Store Connect and Google Play Console using the credentials configured in `submit.production`.

### 6. Promote in the stores

`eas submit` only uploads the binary — it does not release to end users.

- **App Store Connect**: builds appear under TestFlight after Apple's processing. Add release notes, push to App Store review, then release manually or schedule.
- **Play Console**: builds appear in the Internal testing / Production track depending on `submit.production.android.track` (default: `internal`). Promote between tracks via the Play Console UI.
