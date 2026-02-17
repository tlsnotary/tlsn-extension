# TODO

## Bugs

- [x] Fix `matchesPathnamePattern` wildcard behavior across path segments.
  `URLPattern` API treats `*` as a full wildcard (matches across `/`). Replaced with regex-only approach where `*` = single segment, `**` = multi-segment.
