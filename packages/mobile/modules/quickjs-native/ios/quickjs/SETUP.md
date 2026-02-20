# QuickJS C Sources

This directory should contain the QuickJS C engine source files.

## Setup

Download QuickJS sources from one of:
- https://bellard.org/quickjs/ (original by Fabrice Bellard)
- https://github.com/nicklockwood/QuickJS (iOS-friendly fork)
- https://github.com/nicklockwood/AcornVM (Swift wrapper option)

### Required files

Copy these files into this directory:

```
quickjs.h          - Main QuickJS header
quickjs.c          - Main QuickJS implementation
quickjs-libc.h     - Standard library header (optional)
quickjs-libc.c     - Standard library implementation (optional)
libbf.c            - BigFloat/BigDecimal support
libregexp.c        - Regular expression engine
libunicode.c       - Unicode support
cutils.h           - C utilities header
cutils.c           - C utilities
list.h             - Linked list utilities
quickjs-atom.h     - Atom definitions (auto-included by quickjs.h)
```

### Quick setup

```bash
# Option 1: Download from bellard.org
curl -L https://bellard.org/quickjs/quickjs-2024-02-14.tar.xz | tar xJ
cp quickjs-2024-02-14/*.{c,h} .

# Option 2: Clone nicklockwood's fork
git clone --depth 1 https://github.com/nicklockwood/QuickJS /tmp/quickjs-ios
cp /tmp/quickjs-ios/Sources/QuickJS/*.{c,h} .
```

### Build verification

After adding the C sources, run:
```bash
cd packages/mobile
expo prebuild --platform ios --clean
cd ios && pod install
```
