#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Path to the tlsn-mobile Rust crate. Override via env var if the crate moves
# (e.g., to the tlsn repo): TLSN_MOBILE_CRATE_DIR=/path/to/tlsn-mobile
TLSN_MOBILE_DIR="${TLSN_MOBILE_CRATE_DIR:-$SCRIPT_DIR/../../../../packages/tlsn-mobile}"

PLATFORM="${1:-all}"

build_ios() {
    echo "Building tlsn-mobile for iOS..."
    cd "$TLSN_MOBILE_DIR"
    ./build-ios.sh
    echo "Done! iOS artifacts copied."
}

build_android() {
    echo "Building tlsn-mobile for Android..."
    cd "$TLSN_MOBILE_DIR"
    ./build-android.sh
    echo "Done! Android artifacts copied."
}

case "$PLATFORM" in
    ios)     build_ios ;;
    android) build_android ;;
    all)     build_ios; build_android ;;
    *)       echo "Usage: $0 [ios|android|all]"; exit 1 ;;
esac
