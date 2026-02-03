#!/bin/bash
set -e

# Clean nix environment for iOS cross-compilation
unset LIBRARY_PATH
unset LD_LIBRARY_PATH
unset DYLD_LIBRARY_PATH
unset NIX_LDFLAGS
unset NIX_CFLAGS_COMPILE

echo "Building for iOS device (aarch64-apple-ios)..."
cargo build --target aarch64-apple-ios --release

echo "Building for iOS simulator (aarch64-apple-ios-sim)..."
SDKROOT=$(xcrun --sdk iphonesimulator --show-sdk-path) \
cargo build --target aarch64-apple-ios-sim --release

echo "Generating Swift bindings..."
cargo run --bin uniffi-bindgen -- generate \
    --library target/aarch64-apple-ios/release/libtlsn_mobile.a \
    --language swift \
    --out-dir target/swift

echo "Creating XCFramework..."
rm -rf target/TlsnMobile.xcframework

# Create module map
mkdir -p target/headers
cp target/swift/tlsn_mobileFFI.h target/headers/
cp target/swift/tlsn_mobileFFI.modulemap target/headers/module.modulemap

# Create XCFramework with both architectures
xcodebuild -create-xcframework \
    -library target/aarch64-apple-ios/release/libtlsn_mobile.a \
    -headers target/headers \
    -library target/aarch64-apple-ios-sim/release/libtlsn_mobile.a \
    -headers target/headers \
    -output target/TlsnMobile.xcframework

echo "Copying to Expo module..."
EXPO_MODULE_DIR="../mobile/modules/tlsn-native"

# Copy Swift bindings
cp target/swift/tlsn_mobile.swift "$EXPO_MODULE_DIR/ios/"

# Copy XCFramework
rm -rf "$EXPO_MODULE_DIR/ios/TlsnMobile.xcframework"
cp -R target/TlsnMobile.xcframework "$EXPO_MODULE_DIR/ios/"

echo "Done! Output:"
echo "  - XCFramework: target/TlsnMobile.xcframework"
echo "  - Swift bindings: target/swift/tlsn_mobile.swift"
echo "  - Copied to: $EXPO_MODULE_DIR/ios/"
