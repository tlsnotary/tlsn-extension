#!/bin/bash

set -e # Exit on error

# Set the directory to the location of the script
cd "$(dirname "$0")"

VERSION=${1:-origin/dev} # use `dev` branch if no version is set
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

# Apply no-logging modification if requested
if [ "$NO_LOGGING" = "--no-logging" ]; then
    echo "Applying no-logging configuration..."
    cd crates/wasm
    
    # Add it to the wasm32 target section (after the section header)
    sed -i.bak '/^\[target\.\x27cfg(target_arch = "wasm32")\x27\.dependencies\]$/a\
# Disable tracing events as a workaround for issue 959.\
tracing = { workspace = true, features = ["release_max_level_off"] }' Cargo.toml
    
    # Clean up backup file
    rm Cargo.toml.bak
    
    cd ../..
fi

cd crates/wasm
cargo update
./build.sh
cd ../../

cp -r crates/wasm/pkg "$TARGET_DIR"
rm "$TARGET_DIR/.gitignore"