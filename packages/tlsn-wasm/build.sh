#!/bin/bash

set -e # Exit on error

# Set the directory to the location of the script
cd "$(dirname "$0")"

VERSION=${1:-origin/dev} # use `dev` branch if no version is set

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
cargo update
./build.sh
cd ../../

cp -r crates/wasm/pkg ../../tlsn-wasm-pkg/
rm ../../tlsn-wasm-pkg/.gitignore
