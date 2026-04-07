#!/bin/bash
set -e

##############################################################################
# QuickJS re-vendoring script
#
# Re-downloads QuickJS C sources from a specific upstream commit, applies
# the BOOL → JS_BOOL patch, and copies to both iOS and Android directories.
#
# Usage:
#   ./setup.sh                  # Re-vendor from commit in QUICKJS_VERSION
#   ./setup.sh <commit-hash>    # Vendor from a specific commit
#
# After running, commit the updated sources and QUICKJS_VERSION file.
##############################################################################

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION_FILE="$SCRIPT_DIR/QUICKJS_VERSION"
QUICKJS_DIR="$SCRIPT_DIR/ios/quickjs"
ANDROID_JNI_DIR="$SCRIPT_DIR/android/src/main/jni"
QUICKJS_REPO="https://github.com/bellard/quickjs"

# Determine commit to fetch
if [ -n "$1" ]; then
  COMMIT="$1"
else
  COMMIT=$(grep '^# Commit:' "$VERSION_FILE" | awk '{print $3}')
  if [ -z "$COMMIT" ]; then
    echo "Error: No commit hash provided and none found in QUICKJS_VERSION"
    exit 1
  fi
fi

echo "QuickJS Re-vendoring"
echo "===================="
echo "Commit: $COMMIT"

# Download from specific commit
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading from $QUICKJS_REPO at $COMMIT..."
curl -sL "$QUICKJS_REPO/archive/$COMMIT.tar.gz" -o "$TMPDIR/quickjs.tar.gz"
tar xf "$TMPDIR/quickjs.tar.gz" -C "$TMPDIR"

EXTRACTED_DIR="$TMPDIR/quickjs-$COMMIT"
if [ ! -d "$EXTRACTED_DIR" ]; then
  # GitHub may use short or full hash in dirname
  EXTRACTED_DIR=$(find "$TMPDIR" -maxdepth 1 -type d -name "quickjs-*" | head -1)
fi

if [ ! -f "$EXTRACTED_DIR/quickjs.c" ]; then
  echo "Error: quickjs.c not found in downloaded archive"
  exit 1
fi

# List of QuickJS source files to vendor
QUICKJS_FILES=(
  quickjs.c quickjs.h quickjs-atom.h quickjs-opcode.h
  quickjs-libc.c quickjs-libc.h
  cutils.c cutils.h
  dtoa.c dtoa.h
  libregexp.c libregexp.h libregexp-opcode.h
  libunicode.c libunicode.h libunicode-table.h
  libbf.c list.h
)

# Copy to iOS directory (preserving bridge files)
echo "Copying C sources to ios/quickjs/..."
for f in "${QUICKJS_FILES[@]}"; do
  if [ -f "$EXTRACTED_DIR/$f" ]; then
    cp "$EXTRACTED_DIR/$f" "$QUICKJS_DIR/"
  fi
done

# Apply BOOL → JS_BOOL patch (avoids conflict with Apple's ObjC BOOL type)
echo "Patching: BOOL → JS_BOOL..."
for f in "$QUICKJS_DIR"/*.c "$QUICKJS_DIR"/*.h; do
  [ -f "$f" ] && perl -pi -e 's/\bBOOL\b/JS_BOOL/g' "$f"
done

# Copy patched sources to Android JNI directory (preserving bridge files)
echo "Copying patched sources to android/src/main/jni/..."
for f in "${QUICKJS_FILES[@]}"; do
  if [ -f "$QUICKJS_DIR/$f" ]; then
    cp "$QUICKJS_DIR/$f" "$ANDROID_JNI_DIR/"
  fi
done

# Update QUICKJS_VERSION file
COMMIT_DATE=$(curl -sL "https://api.github.com/repos/bellard/quickjs/commits/$COMMIT" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['commit']['committer']['date'][:10])" 2>/dev/null \
  || echo "unknown")

cat > "$VERSION_FILE" << EOF
# QuickJS vendored sources
# Repository: $QUICKJS_REPO
# Commit: $COMMIT
# Date: $COMMIT_DATE
#
# Patches applied:
#   - BOOL → JS_BOOL rename (avoids conflict with Apple's ObjC BOOL type)
#   - Sources duplicated to both ios/quickjs/ and android/src/main/jni/
#
# To re-vendor from a newer upstream commit, run:
#   ./setup.sh [commit-hash]
EOF

IOS_COUNT=$(ls "$QUICKJS_DIR"/*.{c,h} 2>/dev/null | wc -l | tr -d ' ')
ANDROID_COUNT=$(ls "$ANDROID_JNI_DIR"/*.{c,h} 2>/dev/null | wc -l | tr -d ' ')
echo ""
echo "Done! Vendored $IOS_COUNT files (iOS) and $ANDROID_COUNT files (Android)."
echo "Commit these changes along with the updated QUICKJS_VERSION file."
