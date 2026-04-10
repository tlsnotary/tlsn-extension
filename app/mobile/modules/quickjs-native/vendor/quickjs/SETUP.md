# QuickJS C Sources

These are vendored QuickJS C engine source files with the BOOL → JS_BOOL patch applied.

See `../../QUICKJS_VERSION` for the upstream commit hash and date.

## Re-vendoring

To update to a newer upstream version:

```bash
cd app/mobile/modules/quickjs-native
./setup.sh <commit-hash>    # or omit hash to re-vendor current version
```

Then commit the updated sources and `QUICKJS_VERSION` file.
