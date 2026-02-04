#!/bin/bash

set -e # Exit on error

# Set the directory to the location of the script
cd "$(dirname "$0")"

VERSION=${1:-origin/main} # use `main` branch if no version is set
NO_LOGGING=${2}

TARGET_DIR="../../tlsn-wasm-pkg/"

rm -rf "$TARGET_DIR"

rm -rf pkg

# Name of the directory where the repo will be cloned
REPO_DIR="tlsn"

# Check if the directory exists
if [ ! -d "$REPO_DIR" ]; then
    # Clone the repository if it does not exist
    git clone https://github.com/tlsnotary/tlsn.git "$REPO_DIR"
    cd "$REPO_DIR"
else
    # If the directory exists, just change to it
    cd "$REPO_DIR"
    # Fetch the latest changes in the repo without checkout
    git fetch
fi

# Checkout the specific tag
git checkout "${VERSION}" --force
git reset --hard

cd crates/wasm

# ---------------------------------------------------------------------------
# Nix-shell compatibility (macOS)
#
# When invoked inside `nix-shell -p llvmPackages_XX.clang ...`, `clang` is often a
# Nix cc-wrapper that injects hardening flags (e.g. `-fzero-call-used-regs`) that
# are not supported for the `wasm32-unknown-unknown` target. This breaks C
# compilation in dependencies like `ring`.
#
# Workaround:
# - Prefer an unwrapped clang (from Nix) or the system clang (via xcrun)
# - Disable Nix hardening flags for this build invocation
# ---------------------------------------------------------------------------

if [ -n "${IN_NIX_SHELL:-}" ]; then
    # Disable hardening flags injected by Nix cc-wrapper for this build.
    export NIX_HARDENING_ENABLE=""
    export NIX_CFLAGS_COMPILE=""
    export NIX_CFLAGS_LINK=""

    # Prefer an unwrapped clang if available; otherwise fall back to Xcode clang.
    if command -v clang-unwrapped >/dev/null 2>&1; then
        export CC_wasm32_unknown_unknown="$(command -v clang-unwrapped)"
    elif command -v xcrun >/dev/null 2>&1 && xcrun --find clang >/dev/null 2>&1; then
        export CC_wasm32_unknown_unknown="$(xcrun --find clang)"
    fi
fi

# Apply no-logging modification if requested
if [ "$NO_LOGGING" = "--no-logging" ]; then
    echo "Applying no-logging configuration..."
    
    # Add it to the wasm32 target section (after the section header)
    sed -i.bak '/^\[target\.\x27cfg(target_arch = "wasm32")\x27\.dependencies\]$/a\
# Disable tracing events as a workaround for issue 959.\
tracing = { workspace = true, features = ["release_max_level_off"] }' Cargo.toml
    
    # Clean up backup file
    rm Cargo.toml.bak
fi

cargo update
./build.sh
cd ../../

cp -r crates/wasm/pkg "$TARGET_DIR"
rm "$TARGET_DIR/.gitignore"