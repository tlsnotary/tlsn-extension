#!/bin/bash
set -e

# Clean nix environment for Android cross-compilation
unset LIBRARY_PATH
unset LD_LIBRARY_PATH
unset DYLD_LIBRARY_PATH
unset NIX_LDFLAGS
unset NIX_CFLAGS_COMPILE

echo "Building for Android arm64-v8a (aarch64-linux-android)..."
# Force a fresh build of just this crate so the resulting libtlsn_mobile.so
# reflects current source. CI caches target/, and cargo can otherwise keep a
# stale cached .so after a source change. Cleaning only this package keeps
# the (expensive) dependency artifacts cached.
cargo clean -p tlsn-mobile
cargo ndk -t arm64-v8a build --release

EXPO_MODULE_DIR="../../app/mobile/modules/tlsn-native"
KOTLIN_BINDING_DEST="$EXPO_MODULE_DIR/android/src/main/java/uniffi/tlsn_mobile/tlsn_mobile.kt"

# The Kotlin binding is checked into git (deterministic from the Rust source).
# Regenerate only when explicitly asked OR when missing, otherwise leave the
# committed file alone — CI's cached `.so` can otherwise feed uniffi-bindgen
# stale metadata and silently overwrite a correct committed binding with a
# broken one, causing the EAS Kotlin compile to fail on the new types.
if [ ! -f "$KOTLIN_BINDING_DEST" ] || [ "${TLSN_REGEN_BINDINGS:-false}" = "true" ]; then
    echo "Generating Kotlin bindings..."
    cargo run --bin uniffi-bindgen -- generate \
        --library target/aarch64-linux-android/release/libtlsn_mobile.so \
        --language kotlin \
        --out-dir target/kotlin
else
    echo "Kotlin bindings present at $KOTLIN_BINDING_DEST; skipping uniffi-bindgen."
    echo "  (set TLSN_REGEN_BINDINGS=true to force regeneration)"
fi

echo "Stripping debug symbols..."
STRIP_TOOL=$(find "${ANDROID_NDK_HOME:-${ANDROID_HOME}/ndk/"$(ls "${ANDROID_HOME}/ndk/" 2>/dev/null | sort -V | tail -1)"}" \
    -name "llvm-strip" -path "*/aarch64-linux-android/*" 2>/dev/null | head -1)
if [ -n "$STRIP_TOOL" ]; then
    "$STRIP_TOOL" target/aarch64-linux-android/release/libtlsn_mobile.so
    echo "  Stripped with $STRIP_TOOL"
else
    echo "  Warning: llvm-strip not found, skipping strip"
fi

echo "Copying to Expo module..."

# Copy .so library (always — it's the runtime artifact and is gitignored).
mkdir -p "$EXPO_MODULE_DIR/android/src/main/jniLibs/arm64-v8a"
cp target/aarch64-linux-android/release/libtlsn_mobile.so \
    "$EXPO_MODULE_DIR/android/src/main/jniLibs/arm64-v8a/"

# Copy Kotlin bindings only if we just regenerated them.
if [ -f target/kotlin/uniffi/tlsn_mobile/tlsn_mobile.kt ]; then
    mkdir -p "$EXPO_MODULE_DIR/android/src/main/java/uniffi/tlsn_mobile"
    cp target/kotlin/uniffi/tlsn_mobile/tlsn_mobile.kt \
        "$EXPO_MODULE_DIR/android/src/main/java/uniffi/tlsn_mobile/"
fi

echo "Done! Output:"
echo "  - .so: target/aarch64-linux-android/release/libtlsn_mobile.so"
echo "  - Kotlin bindings: $KOTLIN_BINDING_DEST"
echo "  - Copied to: $EXPO_MODULE_DIR/android/"
