#!/bin/bash
set -e

##############################################################################
# Unified build script for TLSN Mobile
#
# Usage:
#   ./build.sh ios          # Build & run iOS (default)
#   ./build.sh android      # Build & run Android
#   ./build.sh --deps-only  # Build JS dependencies only (no native build/run)
#   ./build.sh --native     # Rebuild native libraries (Rust → XCFramework/.so)
#
# Options:
#   --skip-deps             # Skip JS dependency builds
#   --skip-native-check     # Skip QuickJS/TLSN native setup checks
#   --rebuild-native        # Force rebuild of Rust native libraries
#   --no-run                # Build but don't launch the app
#   --clean                 # Clean prebuild before building
#
# Environment:
#   MOBILE_VERIFIER_URL     # Verifier URL for plugins (default: http://localhost:7047)
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/../.."
QUICKJS_DIR="$SCRIPT_DIR/modules/quickjs-native/ios/quickjs"
XCFRAMEWORK_DIR="$SCRIPT_DIR/modules/tlsn-native/ios/TlsnMobile.xcframework"
ANDROID_SO="$SCRIPT_DIR/modules/tlsn-native/android/src/main/jniLibs/arm64-v8a/libtlsn_mobile.so"

# Defaults
PLATFORM="ios"
SKIP_DEPS=false
SKIP_NATIVE_CHECK=false
REBUILD_NATIVE=false
NO_RUN=false
CLEAN=false
DEPS_ONLY=false

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    ios)              PLATFORM="ios" ;;
    android)          PLATFORM="android" ;;
    --deps-only)      DEPS_ONLY=true ;;
    --native)         REBUILD_NATIVE=true; NO_RUN=true ;;
    --skip-deps)      SKIP_DEPS=true ;;
    --skip-native-check) SKIP_NATIVE_CHECK=true ;;
    --rebuild-native) REBUILD_NATIVE=true ;;
    --no-run)         NO_RUN=true ;;
    --clean)          CLEAN=true ;;
    --help|-h)
      sed -n '3,/^##*$/p' "$0" | head -n -1
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

step() { echo -e "\n\033[1;34m▸ $1\033[0m"; }
ok()   { echo -e "  \033[32m✓ $1\033[0m"; }
skip() { echo -e "  \033[33m⊘ $1\033[0m"; }

########################################
# 1. JS Dependencies
########################################
if [ "$SKIP_DEPS" = false ]; then
  step "Building JS dependencies (@tlsn/common → @tlsn/plugin-sdk → @tlsn/plugins)"
  cd "$ROOT_DIR"
  npm run build:deps
  ok "JS dependencies built"
else
  skip "JS dependencies (--skip-deps)"
fi

if [ "$DEPS_ONLY" = true ]; then
  ok "Done (--deps-only)"
  exit 0
fi

########################################
# 2. QuickJS native sources
########################################
if [ "$SKIP_NATIVE_CHECK" = false ]; then
  if [ ! -f "$QUICKJS_DIR/quickjs.c" ]; then
    step "Setting up QuickJS native sources"
    "$SCRIPT_DIR/modules/quickjs-native/setup.sh"
    ok "QuickJS sources installed"
  else
    skip "QuickJS sources already present"
  fi
else
  skip "QuickJS native check (--skip-native-check)"
fi

########################################
# 3. TLSN native library (Rust)
########################################
if [ "$REBUILD_NATIVE" = true ]; then
  step "Building TLSN native library ($PLATFORM)"
  "$SCRIPT_DIR/modules/tlsn-native/build.sh" "$PLATFORM"
  ok "TLSN native library built"
elif [ "$SKIP_NATIVE_CHECK" = false ]; then
  if [ "$PLATFORM" = "ios" ] && [ ! -d "$XCFRAMEWORK_DIR" ]; then
    step "Building TLSN native library (iOS) — XCFramework not found"
    "$SCRIPT_DIR/modules/tlsn-native/build.sh" ios
    ok "TLSN native library built"
  elif [ "$PLATFORM" = "android" ] && [ ! -f "$ANDROID_SO" ]; then
    step "Building TLSN native library (Android) — .so not found"
    "$SCRIPT_DIR/modules/tlsn-native/build.sh" android
    ok "TLSN native library built"
  else
    skip "TLSN native library already present"
  fi
else
  skip "TLSN native check (--skip-native-check)"
fi

########################################
# 4. Expo prebuild + run
########################################
cd "$SCRIPT_DIR"

if [ "$CLEAN" = true ]; then
  step "Cleaning Expo prebuild"
  npx expo prebuild --platform "$PLATFORM" --clean
  ok "Prebuild cleaned"
fi

if [ "$NO_RUN" = false ]; then
  step "Building and launching $PLATFORM app"
  npx expo run:"$PLATFORM"
else
  skip "App launch (--no-run)"
  ok "Build complete"
fi
