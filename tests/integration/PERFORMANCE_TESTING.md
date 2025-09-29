# Performance Testing Guidelines

This document outlines performance testing procedures for the TLSN extension's multi-window management feature.

## Objectives

1. Verify extension performance with multiple concurrent windows
2. Identify memory leaks
3. Ensure responsive UI under load
4. Measure request tracking overhead
5. Validate cleanup efficiency

---

## Test Environment Setup

### Required Tools

1. **Chrome Task Manager**
   - Access via: Menu → More Tools → Task Manager (Shift+Esc)
   - Shows per-process memory and CPU usage

2. **Chrome DevTools Performance Panel**
   - Open DevTools (F12)
   - Navigate to Performance tab
   - Record and analyze performance profiles

3. **Chrome Memory Profiler**
   - DevTools → Memory tab
   - Take heap snapshots before/after tests

4. **System Monitor**
   - Windows: Task Manager
   - macOS: Activity Monitor
   - Linux: System Monitor / htop

### Baseline Metrics

Before running performance tests, establish baseline metrics:

```
Extension with NO windows open:
- Memory usage: ________ MB
- CPU usage: ________%
- Service worker memory: ________ MB
```

---

## Test 1: Multiple Windows Load Test

### Objective
Verify extension handles 5-10 concurrent windows efficiently.

### Procedure

1. **Setup**
   - Close all browser windows except test page
   - Clear browser cache
   - Restart browser
   - Take initial memory snapshot

2. **Test Execution**
   - Open test page: `tests/integration/test-page.html`
   - Click "Open 5 Windows" button
   - Wait for all windows to fully load
   - Let windows remain idle for 2 minutes
   - Take memory snapshot
   - Open Chrome Task Manager

3. **Measurements**
   - Memory per window: ________ MB
   - Total extension memory: ________ MB
   - Service worker memory: ________ MB
   - CPU usage during load: ________%
   - CPU usage at idle: ________%

4. **Repeat with 10 Windows**
   - Click "Open 10 Windows"
   - Record same metrics
   - Compare growth rate

### Expected Results

- **Memory per window**: < 50 MB
- **Total extension memory**: < 200 MB for 10 windows
- **CPU at idle**: < 1%
- **UI responsiveness**: No lag in overlay updates

### Acceptance Criteria

☐ Memory usage scales linearly (not exponentially)
☐ No memory growth during idle period
☐ CPU usage returns to baseline after page loads
☐ All overlays remain functional
☐ No console errors

---

## Test 2: Memory Leak Detection

### Objective
Ensure no memory leaks when windows are opened and closed repeatedly.

### Procedure

1. **Baseline**
   - Take heap snapshot (DevTools → Memory → Heap Snapshot)
   - Note initial memory usage

2. **Open/Close Cycle** (Repeat 10 times)
   - Open 5 windows
   - Wait 10 seconds
   - Close all 5 windows
   - Wait 10 seconds
   - Force garbage collection (DevTools → Memory → Collect garbage)

3. **Final Measurement**
   - Take heap snapshot
   - Compare with baseline
   - Analyze retained objects

### Expected Results

- **Memory after 10 cycles**: Within 10% of baseline
- **Detached DOM nodes**: 0
- **Event listeners**: All cleaned up
- **WindowManager map**: Empty after all windows closed

### Red Flags

⚠️ Memory continuously increasing after each cycle
⚠️ Detached DOM nodes accumulating
⚠️ Event listeners not being removed
⚠️ WindowManager retaining closed windows

### Acceptance Criteria

☐ Memory returns to baseline (±10%)
☐ No detached DOM nodes
☐ WindowManager.getAllWindows() returns empty map
☐ Garbage collection clears temporary objects

---

## Test 3: High-Traffic Site Performance

### Objective
Test performance with sites that generate many HTTP requests.

### Test Sites

1. **News Sites** (100+ requests)
   - https://cnn.com
   - https://bbc.com
   - https://nytimes.com

2. **Social Media** (continuous requests)
   - https://twitter.com
   - https://reddit.com

3. **E-commerce** (images/scripts)
   - https://amazon.com
   - https://ebay.com

### Procedure

1. Open each site in managed window
2. Let page fully load
3. Scroll through entire page
4. Measure:
   - Total requests captured: ________
   - Memory per window: ________ MB
   - Page load time vs. without extension: ________ seconds
   - Overlay update latency: ________ ms

### Expected Results

- **Requests tracked**: All HTTP/HTTPS requests
- **Overhead per request**: < 1 KB
- **Overlay update latency**: < 100ms
- **Page load overhead**: < 10%

### Acceptance Criteria

☐ All requests captured accurately
☐ No requests dropped
☐ Overlay scrolling remains smooth
☐ Page performance not significantly impacted
☐ Memory usage stays within bounds

---

## Test 4: Request Tracking Overhead

### Objective
Measure the overhead of request interception and tracking.

### Procedure

1. **Without Extension**
   - Disable TLSN extension
   - Open https://httpbin.org/get
   - Record page load time (DevTools → Network → Load time)
   - Run 10 times, calculate average

2. **With Extension (Unmanaged Window)**
   - Enable extension
   - Open https://httpbin.org/get in regular browser window
   - Record page load time
   - Run 10 times, calculate average

3. **With Extension (Managed Window)**
   - Use `window.tlsn.open('https://httpbin.org/get')`
   - Record page load time
   - Run 10 times, calculate average

### Measurements

| Scenario | Avg Load Time | Overhead |
|----------|---------------|----------|
| No extension | ________ ms | 0% |
| Extension (regular) | ________ ms | ________% |
| Extension (managed) | ________ ms | ________% |

### Expected Results

- **Overhead (regular window)**: < 5%
- **Overhead (managed window)**: < 15%

### Acceptance Criteria

☐ Request interception overhead is minimal
☐ User-perceivable page load time not significantly affected
☐ No network errors introduced by interception

---

## Test 5: Cleanup Efficiency

### Objective
Verify window cleanup is fast and thorough.

### Procedure

1. **Setup**
   - Open 10 managed windows
   - Take memory snapshot

2. **Close All Windows**
   - Close all 10 windows
   - Immediately check background console logs
   - Wait 5 seconds
   - Force garbage collection
   - Take memory snapshot

3. **Verify Cleanup**
   - Check `windowManager.getAllWindows().size` (should be 0)
   - Check for orphaned event listeners
   - Check for remaining overlay DOM elements

### Measurements

- **Cleanup time per window**: ________ ms
- **Total cleanup time**: ________ ms
- **Memory released**: ________ MB

### Expected Results

- **Cleanup time per window**: < 50ms
- **Memory released**: > 80% of managed window memory
- **All resources cleaned up**: Yes

### Acceptance Criteria

☐ All windows removed from WindowManager
☐ No orphaned DOM elements
☐ No remaining event listeners
☐ Memory released to OS
☐ No errors during cleanup

---

## Test 6: Concurrent Request Handling

### Objective
Verify extension handles simultaneous requests from multiple windows.

### Procedure

1. Open 5 windows to different sites simultaneously
2. All sites should load at same time
3. Monitor:
   - Request interception in each window
   - Overlay updates
   - Console for errors

### Expected Results

- **All requests tracked**: Yes, in correct windows
- **No cross-window contamination**: Requests don't leak between windows
- **Overlay updates**: All overlays update correctly
- **Performance**: No significant slowdown

### Acceptance Criteria

☐ Each window tracks only its own requests
☐ No race conditions in WindowManager
☐ All overlays functional
☐ No console errors

---

## Test 7: Long-Running Window Test

### Objective
Verify no memory leaks or performance degradation over time.

### Procedure

1. Open 3 managed windows to high-traffic sites
2. Let run for 30 minutes
3. Periodically refresh pages (every 5 minutes)
4. Monitor memory usage every 5 minutes

### Memory Tracking Table

| Time | Window 1 | Window 2 | Window 3 | Total | Service Worker |
|------|----------|----------|----------|-------|----------------|
| 0 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |
| 5 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |
| 10 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |
| 15 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |
| 20 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |
| 25 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |
| 30 min | ___ MB | ___ MB | ___ MB | ___ MB | ___ MB |

### Expected Results

- **Memory growth**: < 20% over 30 minutes
- **Request array size**: Bounded (not growing infinitely)
- **Performance**: Consistent throughout test

### Acceptance Criteria

☐ Memory usage remains stable
☐ No continuous memory growth trend
☐ Overlays remain responsive
☐ Request tracking still accurate

---

## Test 8: Periodic Cleanup Verification

### Objective
Verify the periodic cleanup (5-minute interval) works correctly.

### Procedure

1. Open 3 managed windows
2. Manually close browser windows (not via extension)
3. Wait 6 minutes
4. Check background console for cleanup logs
5. Verify WindowManager state

### Expected Results

- **Cleanup runs**: After ~5 minutes
- **Invalid windows detected**: Yes
- **Cleanup successful**: All closed windows removed

### Acceptance Criteria

☐ Periodic cleanup timer fires
☐ Invalid windows detected and removed
☐ Cleanup logs appear in console
☐ No errors during automated cleanup

---

## Baseline Performance Targets

### Memory Usage

| Scenario | Target | Maximum |
|----------|--------|---------|
| Extension installed (idle) | < 10 MB | 20 MB |
| 1 managed window | < 30 MB | 50 MB |
| 5 managed windows | < 120 MB | 200 MB |
| 10 managed windows | < 220 MB | 350 MB |

### CPU Usage

| Scenario | Target | Maximum |
|----------|--------|---------|
| Idle | < 0.1% | 1% |
| During page load | < 5% | 15% |
| Overlay update | < 1% | 3% |

### Request Processing

| Metric | Target | Maximum |
|--------|--------|---------|
| Request interception overhead | < 1ms | 5ms |
| Overlay update latency | < 50ms | 200ms |
| Memory per request | < 500 bytes | 2 KB |

### Cleanup Performance

| Metric | Target | Maximum |
|--------|--------|---------|
| Window cleanup time | < 20ms | 100ms |
| Memory release after cleanup | > 90% | > 70% |

---

## Performance Issues to Watch For

### Critical Issues

⛔ **Memory leaks** - Memory continuously growing
⛔ **High CPU usage** - > 10% when idle
⛔ **UI freezing** - Overlay becomes unresponsive
⛔ **Request drops** - Not all requests captured
⛔ **Crash or hang** - Extension becomes unresponsive

### Warning Signs

⚠️ Memory growth > 20% over 30 minutes
⚠️ Cleanup takes > 100ms per window
⚠️ Page load overhead > 20%
⚠️ Overlay update latency > 200ms

---

## Tools and Commands

### Chrome Task Manager
```
Shift+Esc (Windows/Linux)
Cmd+Opt+Esc (macOS)
```

### Force Garbage Collection (DevTools Console)
```javascript
// Run in DevTools Console
performance.memory; // Check current memory
```

### Check WindowManager State (Background Console)
```javascript
// Access background service worker console
// chrome://extensions → TLSN Extension → Service worker "Inspect"

// Check managed windows
windowManager.getAllWindows();

// Check specific window
windowManager.getWindow(windowId);
```

### Monitor Extension Memory
```bash
# Chrome flags for debugging
chrome --enable-precise-memory-info
```

---

## Reporting Format

### Performance Test Report Template

```
TLSN Extension - Performance Test Report
Date: ___________
Tester: ___________
Chrome Version: ___________
OS: ___________

## Test Results Summary

✅ Passed Tests: _____ / _____
❌ Failed Tests: _____ / _____

## Memory Usage

- Baseline: _____ MB
- With 5 windows: _____ MB (_____ MB/window)
- With 10 windows: _____ MB (_____ MB/window)
- After cleanup: _____ MB

## CPU Usage

- Idle: _____%
- During load: _____%
- Average: _____%

## Critical Issues

1. ___________________________________
2. ___________________________________

## Performance Bottlenecks

1. ___________________________________
2. ___________________________________

## Recommendations

1. ___________________________________
2. ___________________________________

## Conclusion

☐ Performance meets all targets
☐ Performance meets most targets with minor issues
☐ Performance issues require optimization
☐ Critical performance problems found
```

---

## Continuous Performance Monitoring

### Automated Metrics (Future)

Consider adding automated performance tests:

1. **Unit test performance assertions**
   ```javascript
   it('should register window in < 50ms', async () => {
     const start = performance.now();
     await windowManager.registerWindow(config);
     const duration = performance.now() - start;
     expect(duration).toBeLessThan(50);
   });
   ```

2. **Memory leak detection in CI/CD**
   - Run open/close cycles
   - Assert memory returns to baseline

3. **Bundle size monitoring**
   - Track extension build size
   - Alert on significant increases

---

## Performance Optimization Checklist

If performance issues are found:

☐ Profile code with Chrome DevTools Performance panel
☐ Check for unnecessary re-renders in overlays
☐ Verify event listeners are properly cleaned up
☐ Look for memory retention in closures
☐ Consider implementing request limits per window
☐ Optimize request storage (e.g., use fixed-size buffer)
☐ Review webRequest listener efficiency
☐ Consider debouncing overlay updates

---

## Conclusion

Regular performance testing ensures the TLSN extension remains fast and efficient as features are added. Use this document as a guide for both manual and automated performance validation.