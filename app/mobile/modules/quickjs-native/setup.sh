#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
QUICKJS_DIR="$SCRIPT_DIR/vendor/quickjs"

# Use GitHub archive for reliable downloading
QUICKJS_REPO="https://github.com/bellard/quickjs"
QUICKJS_BRANCH="master"

echo "QuickJS Native Module Setup"
echo "==========================="

# Check if QuickJS C sources already exist
if [ -f "$QUICKJS_DIR/quickjs.c" ] && [ -f "$QUICKJS_DIR/quickjs.h" ]; then
    echo "QuickJS C sources already present in vendor/quickjs/"
    echo "Skipping download. Delete vendor/quickjs/quickjs.c to force re-download."
else
    echo "Downloading QuickJS from $QUICKJS_REPO..."
    TMPDIR=$(mktemp -d)

    curl -L "$QUICKJS_REPO/archive/refs/heads/$QUICKJS_BRANCH.tar.gz" -o "$TMPDIR/quickjs.tar.gz"
    tar xf "$TMPDIR/quickjs.tar.gz" -C "$TMPDIR"

    EXTRACTED_DIR="$TMPDIR/quickjs-$QUICKJS_BRANCH"

    echo "Copying C sources to vendor/quickjs/..."
    mkdir -p "$QUICKJS_DIR"

    # Core engine files
    cp "$EXTRACTED_DIR"/quickjs.c "$QUICKJS_DIR/"
    cp "$EXTRACTED_DIR"/quickjs.h "$QUICKJS_DIR/"
    cp "$EXTRACTED_DIR"/quickjs-atom.h "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/quickjs-opcode.h "$QUICKJS_DIR/" 2>/dev/null || true

    # Standard library (optional, for console.log etc.)
    cp "$EXTRACTED_DIR"/quickjs-libc.c "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/quickjs-libc.h "$QUICKJS_DIR/" 2>/dev/null || true

    # Utility libraries
    cp "$EXTRACTED_DIR"/cutils.c "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/cutils.h "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/dtoa.c "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/dtoa.h "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/libregexp.c "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/libregexp.h "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/libregexp-opcode.h "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/libunicode.c "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/libunicode.h "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/libunicode-table.h "$QUICKJS_DIR/" 2>/dev/null || true

    # Legacy files (older versions)
    cp "$EXTRACTED_DIR"/libbf.c "$QUICKJS_DIR/" 2>/dev/null || true
    cp "$EXTRACTED_DIR"/list.h "$QUICKJS_DIR/" 2>/dev/null || true

    rm -rf "$TMPDIR"

    # Rename BOOL → JS_BOOL to avoid conflict with Apple's ObjC BOOL type
    echo "Patching QuickJS sources: renaming BOOL → JS_BOOL..."
    for f in "$QUICKJS_DIR"/*.c "$QUICKJS_DIR"/*.h; do
        [ -f "$f" ] && perl -pi -e 's/\bBOOL\b/JS_BOOL/g' "$f"
    done

    echo "Done! QuickJS sources installed."
    ls -la "$QUICKJS_DIR"/*.{c,h} 2>/dev/null | wc -l | xargs -I{} echo "  ({} files)"
fi

echo ""
echo "Setup complete! Next steps:"
echo "  1. cd app/mobile"
echo "  2. expo prebuild --clean"
echo "  3. npm run ios (or android)"
