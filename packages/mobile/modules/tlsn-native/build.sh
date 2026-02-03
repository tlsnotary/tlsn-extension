#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TLSN_MOBILE_DIR="$SCRIPT_DIR/../../../tlsn-mobile"
IOS_DIR="$SCRIPT_DIR/ios"

echo "Building tlsn-mobile for iOS..."
cd "$TLSN_MOBILE_DIR"
./build-ios.sh

echo "Copying artifacts to Expo module..."

# Copy simulator library (for development)
cp "$TLSN_MOBILE_DIR/target/aarch64-apple-ios-sim/release/libtlsn_mobile.a" "$IOS_DIR/lib/"

# Copy Swift bindings
cp "$TLSN_MOBILE_DIR/target/swift/tlsn_mobile.swift" "$IOS_DIR/"

# Copy FFI header and modulemap
cp "$TLSN_MOBILE_DIR/target/swift/tlsn_mobileFFI.h" "$IOS_DIR/include/"
cp "$TLSN_MOBILE_DIR/target/swift/tlsn_mobileFFI.modulemap" "$IOS_DIR/include/"

echo "Done! Artifacts copied to $IOS_DIR"
