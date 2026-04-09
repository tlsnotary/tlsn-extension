# QuickJS C Sources

Shared QuickJS engine sources used by both iOS and Android builds.

These files are committed to the repo so EAS cloud builds work without running setup.sh.
To update QuickJS, run `./setup.sh` from the quickjs-native module root — it downloads
from https://github.com/bellard/quickjs and patches `BOOL -> JS_BOOL` for iOS compatibility.

Platform-specific bridge files live outside this directory:
- iOS: `ios/quickjs/quickjs_bridge.{c,h}` + `module.modulemap`
- Android: `android/src/main/jni/quickjs_jni.c`
