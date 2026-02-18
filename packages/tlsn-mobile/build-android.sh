#!/bin/bash
set -e

# Clean nix environment for Android cross-compilation
unset LIBRARY_PATH
unset LD_LIBRARY_PATH
unset DYLD_LIBRARY_PATH
unset NIX_LDFLAGS
unset NIX_CFLAGS_COMPILE

echo "Building for Android arm64-v8a (aarch64-linux-android)..."
cargo ndk -t arm64-v8a build --release

echo "Generating Kotlin bindings..."
cargo run --bin uniffi-bindgen -- generate \
    --library target/aarch64-linux-android/release/libtlsn_mobile.so \
    --language kotlin \
    --out-dir target/kotlin

echo "Copying to Expo module..."
EXPO_MODULE_DIR="../mobile/modules/tlsn-native"

# Copy .so library
mkdir -p "$EXPO_MODULE_DIR/android/src/main/jniLibs/arm64-v8a"
cp target/aarch64-linux-android/release/libtlsn_mobile.so \
    "$EXPO_MODULE_DIR/android/src/main/jniLibs/arm64-v8a/"

# Copy Kotlin bindings
mkdir -p "$EXPO_MODULE_DIR/android/src/main/java/uniffi/tlsn_mobile"
cp target/kotlin/uniffi/tlsn_mobile/tlsn_mobile.kt \
    "$EXPO_MODULE_DIR/android/src/main/java/uniffi/tlsn_mobile/"

echo "Done! Output:"
echo "  - .so: target/aarch64-linux-android/release/libtlsn_mobile.so"
echo "  - Kotlin bindings: target/kotlin/uniffi/tlsn_mobile/tlsn_mobile.kt"
echo "  - Copied to: $EXPO_MODULE_DIR/android/"
