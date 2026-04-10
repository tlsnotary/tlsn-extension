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
QUICKJS_DIR="$SCRIPT_DIR/modules/quickjs-native/vendor/quickjs"
XCFRAMEWORK_DIR="$SCRIPT_DIR/modules/tlsn-native/ios/TlsnMobile.xcframework"
ANDROID_SO="$SCRIPT_DIR/modules/tlsn-native/android/src/main/jniLibs/arm64-v8a/libtlsn_mobile.so"
TLSN_REPO_DIR="$ROOT_DIR/packages/tlsn-wasm/tlsn"
SDK_CORE_DIR="$TLSN_REPO_DIR/crates/sdk-core"

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
      sed -n '/^# Usage:/,/^#####/p' "$0" | grep -v '^#####' | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

step() { echo -e "\n\033[1;34m▸ $1\033[0m"; }
ok()   { echo -e "  \033[32m✓ $1\033[0m"; }
skip() { echo -e "  \033[33m⊘ $1\033[0m"; }
fail() { echo -e "  \033[31m✗ $1\033[0m"; }
hint() { echo -e "    \033[90m→ $1\033[0m"; }

########################################
# 0. Auto-detect ANDROID_HOME
########################################
if [ "$PLATFORM" = "android" ] && [ -z "$ANDROID_HOME" ]; then
  for candidate in \
    "$HOME/Library/Android/sdk" \
    "$HOME/Android/Sdk" \
    "/usr/local/share/android-sdk" \
    "${ANDROID_SDK_ROOT:-}"; do
    if [ -d "$candidate/platform-tools" ]; then
      export ANDROID_HOME="$candidate"
      break
    fi
  done

  if [ -z "$ANDROID_HOME" ]; then
    fail "ANDROID_HOME not set and could not auto-detect Android SDK"
    hint "Install Android Studio, then add to ~/.zshrc:"
    hint '  export ANDROID_HOME="$HOME/Library/Android/sdk"'
    hint '  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"'
    exit 1
  fi
  echo -e "  \033[90mAuto-detected ANDROID_HOME=$ANDROID_HOME\033[0m"
fi

########################################
# 0b. Ensure tlsn repo has sdk-core
#     (needed for native Rust build)
########################################
ensure_tlsn_repo() {
  if [ ! -d "$TLSN_REPO_DIR" ]; then
    step "Cloning tlsn repository (needed for native library)"
    git clone https://github.com/tlsnotary/tlsn.git "$TLSN_REPO_DIR"
    ok "Cloned tlsn repository"
  fi

  if [ ! -d "$SDK_CORE_DIR" ]; then
    step "Updating tlsn repository (sdk-core crate not found on current checkout)"
    cd "$TLSN_REPO_DIR"
    git fetch origin
    git stash -q 2>/dev/null || true
    git checkout origin/main
    cd "$SCRIPT_DIR"
    if [ ! -d "$SDK_CORE_DIR" ]; then
      fail "sdk-core crate still not found after updating to origin/main"
      hint "Check https://github.com/tlsnotary/tlsn for crates/sdk-core"
      exit 1
    fi
    ok "Updated tlsn to origin/main — sdk-core found"
  fi
}

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
# 2. QuickJS native sources (vendored)
########################################
if [ "$SKIP_NATIVE_CHECK" = false ]; then
  if [ ! -f "$QUICKJS_DIR/quickjs.c" ]; then
    fail "QuickJS C sources missing from vendor/quickjs/"
    hint "These should be vendored in git. To re-vendor, run:"
    hint "  cd modules/quickjs-native && ./setup.sh"
    exit 1
  else
    skip "QuickJS sources present (vendored)"
  fi
else
  skip "QuickJS native check (--skip-native-check)"
fi

########################################
# 3. TLSN native library (Rust)
########################################
needs_native_build() {
  if [ "$REBUILD_NATIVE" = true ]; then
    return 0
  fi
  if [ "$SKIP_NATIVE_CHECK" = true ]; then
    return 1
  fi
  if [ "$PLATFORM" = "ios" ] && [ ! -d "$XCFRAMEWORK_DIR" ]; then
    return 0
  fi
  if [ "$PLATFORM" = "android" ] && [ ! -f "$ANDROID_SO" ]; then
    return 0
  fi
  return 1
}

if needs_native_build; then
  # Check Rust toolchain
  if ! command -v rustup &>/dev/null; then
    fail "Rust is required to build the native library but is not installed"
    hint "Install: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
  fi

  # Auto-install missing Rust targets and tools
  if [ "$PLATFORM" = "android" ]; then
    if ! rustup target list --installed 2>/dev/null | grep -q "aarch64-linux-android"; then
      step "Installing Rust target: aarch64-linux-android"
      rustup target add aarch64-linux-android
      ok "Rust Android target installed"
    fi

    if ! command -v cargo-ndk &>/dev/null; then
      step "Installing cargo-ndk (required for Android cross-compilation)"
      cargo install cargo-ndk
      ok "cargo-ndk installed"
    fi
  elif [ "$PLATFORM" = "ios" ]; then
    for target in aarch64-apple-ios aarch64-apple-ios-sim; do
      if ! rustup target list --installed 2>/dev/null | grep -q "$target"; then
        step "Installing Rust target: $target"
        rustup target add "$target"
        ok "Installed $target"
      fi
    done
  fi

  # Ensure tlsn repo has sdk-core
  ensure_tlsn_repo

  step "Building TLSN native library ($PLATFORM)"
  "$SCRIPT_DIR/modules/tlsn-native/build.sh" "$PLATFORM"
  ok "TLSN native library built"
  # Native artifacts changed — force clean prebuild so CocoaPods/Gradle picks them up
  CLEAN=true
elif [ "$SKIP_NATIVE_CHECK" = false ]; then
  skip "TLSN native library already present"
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
