# Integration Testing Suite

This directory contains comprehensive integration and performance testing tools for the TLSN extension's multi-window management feature.

## Quick Start

### 1. Run Integration Tests

```bash
# Build the extension
npm run build

# Load extension in Chrome
# 1. Navigate to chrome://extensions/
# 2. Enable Developer Mode
# 3. Click "Load unpacked"
# 4. Select the build/ directory

# Open test page
open tests/integration/test-page.html
# Or navigate to: file:///path/to/tlsn-extension/tests/integration/test-page.html
```

### 2. Run Manual Tests

Follow the checklist in `MANUAL_TESTING_CHECKLIST.md`:
- Print or open the checklist
- Work through each test category
- Check off completed tests
- Document any issues found

### 3. Run Performance Tests

Follow the procedures in `PERFORMANCE_TESTING.md`:
- Establish baseline metrics
- Run each performance test
- Document results
- Compare against target metrics

## Files

### `test-page.html`
**Interactive HTML test page** for exercising the `window.tlsn.open()` API.

**Features:**
- 6 test sections covering all functionality
- Real-time statistics tracking
- Custom URL input
- Window options configuration
- Error handling verification
- Multiple window stress testing
- Legacy API compatibility test

**Usage:**
1. Open in any browser (works as file:// URL)
2. Ensure TLSN extension is installed
3. Click buttons to run tests
4. Monitor status messages and console logs

### `MANUAL_TESTING_CHECKLIST.md`
**Comprehensive manual testing checklist** with 50+ test cases.

**Test Categories:**
1. Basic Window Opening
2. Custom URL Testing
3. Window Options
4. Multiple Windows
5. Request Interception
6. Error Handling
7. Window Cleanup
8. Backward Compatibility
9. Overlay Functionality
10. Cross-Browser Compatibility (optional)
11. Edge Cases
12. Console Logs Verification

**Usage:**
1. Print or open in editor
2. Follow each test step
3. Mark pass/fail for each test
4. Document issues in notes section
5. Complete summary and sign-off

### `PERFORMANCE_TESTING.md`
**Detailed performance testing guidelines** and procedures.

**Test Suite:**
1. Multiple Windows Load Test
2. Memory Leak Detection
3. High-Traffic Site Performance
4. Request Tracking Overhead
5. Cleanup Efficiency
6. Concurrent Request Handling
7. Long-Running Window Test (30 min)
8. Periodic Cleanup Verification

**Baseline Targets:**
- Memory per window: < 50 MB
- CPU at idle: < 1%
- Request interception overhead: < 1ms
- Cleanup time per window: < 20ms

**Usage:**
1. Follow test procedures in order
2. Record measurements in provided tables
3. Compare against baseline targets
4. Document performance issues
5. Generate performance test report

## Test Flow

```
┌─────────────────────────────────────────────────┐
│ 1. Unit Tests (npm test)                       │
│    - WindowManager tests (30 tests)            │
│    - Type definition tests (11 tests)          │
│    - Client API tests (17 tests)               │
│    - UUID tests (7 tests)                      │
│    Result: All 72 tests passing ✅              │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 2. Integration Tests (test-page.html)          │
│    - Open test page in browser                 │
│    - Run automated test scenarios              │
│    - Verify window.tlsn.open() API             │
│    - Check overlay functionality               │
│    Result: Visual inspection + console logs    │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 3. Manual Testing (MANUAL_TESTING_CHECKLIST)   │
│    - Systematic verification of all features   │
│    - Edge case testing                         │
│    - Cross-browser testing (optional)          │
│    - Documentation of issues                   │
│    Result: Completed checklist with sign-off   │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 4. Performance Testing (PERFORMANCE_TESTING)   │
│    - Memory usage measurement                  │
│    - CPU usage monitoring                      │
│    - Memory leak detection                     │
│    - Load testing with multiple windows        │
│    Result: Performance test report             │
└─────────────────────────────────────────────────┘
```

## Testing Best Practices

### Before Testing
- [ ] Build extension with latest changes: `npm run build`
- [ ] Clear browser cache and restart
- [ ] Close unnecessary browser tabs
- [ ] Open Chrome Task Manager (Shift+Esc)
- [ ] Open background service worker console

### During Testing
- [ ] Monitor console logs (both page and background)
- [ ] Check for errors or warnings
- [ ] Verify overlay appearance and content
- [ ] Test in incognito mode (if applicable)
- [ ] Document unexpected behavior

### After Testing
- [ ] Clean up opened windows
- [ ] Check for memory leaks
- [ ] Verify background cleanup logs
- [ ] Document all findings
- [ ] Create bug reports for issues

## Common Issues and Troubleshooting

### Issue: "window.tlsn not available"
**Cause**: Extension not loaded or content script failed to inject
**Solution**:
- Reload extension in chrome://extensions/
- Check extension permissions
- Verify content script injected: Check page console for "Content script loaded"

### Issue: Overlay doesn't appear
**Cause**: Content script not ready or showOverlay=false
**Solution**:
- Check tab status (must be 'complete')
- Verify content script console logs
- Check showOverlay parameter in test

### Issue: Requests not tracked
**Cause**: Window not managed or webRequest listener issue
**Solution**:
- Verify window opened via window.tlsn.open()
- Check background console for registration log
- Ensure URL is HTTP/HTTPS (not file://)

### Issue: High memory usage
**Cause**: Memory leak or too many requests stored
**Solution**:
- Run memory leak detection test
- Check WindowManager for orphaned windows
- Consider implementing request limit per window

## Reporting Issues

When reporting issues found during testing, include:

1. **Test Details**
   - Which test was running
   - Step-by-step reproduction
   - Expected vs actual behavior

2. **Environment**
   - Chrome version
   - OS version
   - Extension version

3. **Evidence**
   - Console logs (both page and background)
   - Screenshots of issues
   - Performance metrics (if applicable)

4. **Severity**
   - Critical: Blocks core functionality
   - Major: Significant feature broken
   - Minor: Edge case or cosmetic issue

## Continuous Integration (Future)

Consider automating tests in CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Run unit tests
  run: npm test

- name: Build extension
  run: npm run build

- name: Run integration tests (headless)
  run: npm run test:integration
  # Would use Puppeteer or Playwright
```

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
- [Vitest Documentation](https://vitest.dev/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

## Contributing

When adding new tests:
1. Add test cases to appropriate checklist
2. Update performance baselines if needed
3. Document any new test procedures
4. Update this README if adding new files

---

**Questions?** Check the main [CLAUDE.md](../../CLAUDE.md) for architecture documentation.