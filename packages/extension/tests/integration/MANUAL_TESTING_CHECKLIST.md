# Manual Testing Checklist - Multi-Window Management

This checklist covers comprehensive manual testing of the TLSN extension's multi-window management feature.

## Pre-Testing Setup

- [ ] Build extension: `npm run build`
- [ ] Load unpacked extension in Chrome from `build/` directory
- [ ] Open test page: `tests/integration/test-page.html`
- [ ] Open Chrome DevTools Console (F12)
- [ ] Verify extension icon appears in toolbar

## Test Environment

**Browser**: Chrome (version: ________)
**Extension Version**: 0.1.0
**Test Date**: ___________
**Tester**: ___________

---

## 1. Basic Window Opening

### 1.1 Single Window Test
- [ ] Click "Open example.com" button
- [ ] **Expected**: New popup window opens with example.com
- [ ] **Expected**: TLSN overlay appears with dark background
- [ ] **Expected**: Overlay shows "TLSN Plugin In Progress" title
- [ ] **Expected**: Request list updates as page loads
- [ ] **Expected**: Console shows successful window creation logs

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 1.2 Different URLs
- [ ] Open httpbin.org
- [ ] Open jsonplaceholder.typicode.com
- [ ] **Expected**: Each window opens independently
- [ ] **Expected**: Each overlay tracks its own requests
- [ ] **Expected**: No cross-contamination between windows

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 2. Custom URL Testing

### 2.1 Valid HTTP URL
- [ ] Enter `http://example.com` in custom URL field
- [ ] Click "Open URL"
- [ ] **Expected**: Window opens successfully
- [ ] **Expected**: Overlay displays correctly

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 2.2 Valid HTTPS URL
- [ ] Enter `https://github.com` in custom URL field
- [ ] Click "Open URL"
- [ ] **Expected**: Window opens successfully
- [ ] **Expected**: Multiple requests appear in overlay

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 2.3 URL with Path
- [ ] Enter `https://example.com/path/to/page`
- [ ] Click "Open URL"
- [ ] **Expected**: Full URL loads correctly
- [ ] **Expected**: Requests tracked properly

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 2.4 URL with Query Parameters
- [ ] Enter `https://example.com/search?q=test&lang=en`
- [ ] Click "Open URL"
- [ ] **Expected**: Query parameters preserved
- [ ] **Expected**: Window opens normally

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 3. Window Options

### 3.1 Custom Dimensions
- [ ] Set width to 1200, height to 800
- [ ] Keep "Show TLSN Overlay" checked
- [ ] Click "Open with Custom Options"
- [ ] **Expected**: Window opens with specified dimensions
- [ ] **Expected**: Overlay visible

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 3.2 Small Window
- [ ] Set width to 600, height to 400
- [ ] Click "Open with Custom Options"
- [ ] **Expected**: Small window opens
- [ ] **Expected**: Overlay scales appropriately

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 3.3 Overlay Disabled
- [ ] Uncheck "Show TLSN Overlay"
- [ ] Click "Open with Custom Options"
- [ ] **Expected**: Window opens WITHOUT overlay
- [ ] **Expected**: Requests still tracked (check background console)

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 4. Multiple Windows

### 4.1 Three Windows
- [ ] Click "Open 3 Windows"
- [ ] **Expected**: 3 windows open sequentially
- [ ] **Expected**: Each has its own overlay
- [ ] **Expected**: Window count updates to 3
- [ ] **Expected**: No errors in console

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 4.2 Five Windows
- [ ] Click "Open 5 Windows"
- [ ] **Expected**: 5 windows open
- [ ] **Expected**: All overlays functional
- [ ] **Expected**: Window count updates correctly

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 4.3 Ten Windows (Stress Test)
- [ ] Click "Open 10 Windows"
- [ ] **Expected**: All 10 windows open
- [ ] **Expected**: System remains responsive
- [ ] **Expected**: Each window tracks requests independently
- [ ] **Monitor**: Chrome memory usage (should not spike excessively)

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 5. Request Interception

### 5.1 Request Display
- [ ] Open any website with multiple resources (e.g., news site)
- [ ] Observe overlay during page load
- [ ] **Expected**: Requests appear in real-time
- [ ] **Expected**: Each request shows method (GET/POST) and URL
- [ ] **Expected**: Request count increases as page loads
- [ ] **Expected**: Requests are ordered chronologically

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 5.2 Different Request Types
- [ ] Open https://httpbin.org/forms/post
- [ ] Submit the form
- [ ] **Expected**: POST request appears in overlay
- [ ] **Expected**: Both GET and POST requests tracked
- [ ] **Expected**: Request method clearly labeled

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 5.3 Multiple Tabs in Single Window
- [ ] Open a managed window
- [ ] Open a new tab within that window (Ctrl+T)
- [ ] Navigate to different URL in new tab
- [ ] **Expected**: Only first tab's requests tracked
- [ ] **Expected**: New tab's requests not added to overlay

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 6. Error Handling

### 6.1 Invalid URL
- [ ] Click "Invalid URL" button
- [ ] **Expected**: Error message appears in test page
- [ ] **Expected**: No window opens
- [ ] **Expected**: Console shows validation error
- [ ] **Expected**: Error count increments

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 6.2 Empty URL
- [ ] Click "Empty URL" button
- [ ] **Expected**: Error message shows
- [ ] **Expected**: No window opens

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 6.3 JavaScript URL
- [ ] Click "JavaScript URL" button
- [ ] **Expected**: Client-side validation accepts (URL is valid)
- [ ] **Expected**: Background script rejects with protocol error
- [ ] **Expected**: No window opens

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 6.4 FTP URL
- [ ] Click "FTP URL" button
- [ ] **Expected**: Background rejects FTP protocol
- [ ] **Expected**: Error message indicates only HTTP/HTTPS allowed

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 7. Window Cleanup

### 7.1 Manual Close
- [ ] Open 3 windows using test page
- [ ] Manually close one window
- [ ] **Expected**: Window closes normally
- [ ] **Expected**: Background console shows cleanup log
- [ ] **Expected**: No errors in console

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 7.2 Close All Windows
- [ ] Open 5 windows
- [ ] Close all windows manually
- [ ] **Expected**: All windows close cleanly
- [ ] **Expected**: Background shows cleanup for each
- [ ] **Expected**: Memory usage drops (check Task Manager)

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 7.3 Rapid Open/Close
- [ ] Open 3 windows quickly
- [ ] Close them immediately in rapid succession
- [ ] **Expected**: No race conditions or errors
- [ ] **Expected**: All cleanup logs appear

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 8. Backward Compatibility

### 8.1 Legacy sendMessage API
- [ ] Click "Test Legacy sendMessage API" button
- [ ] **Expected**: Window opens to https://x.com
- [ ] **Expected**: Overlay appears
- [ ] **Expected**: Requests tracked
- [ ] **Expected**: Console shows legacy API handler used

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 9. Overlay Functionality

### 9.1 Overlay Visibility
- [ ] Open any window
- [ ] **Expected**: Overlay appears after page loads (status: complete)
- [ ] **Expected**: Overlay covers entire window
- [ ] **Expected**: Dark semi-transparent background

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 9.2 Overlay Content
- [ ] Check overlay text and styling
- [ ] **Expected**: Title: "TLSN Plugin In Progress"
- [ ] **Expected**: Subtitle: "Intercepting network requests from this window"
- [ ] **Expected**: Request count displayed
- [ ] **Expected**: Scrollable request list

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 9.3 Real-time Updates
- [ ] Open a news website or social media
- [ ] Watch overlay during page load
- [ ] **Expected**: Request list updates dynamically
- [ ] **Expected**: No flickering or UI glitches
- [ ] **Expected**: Smooth scrolling in request list

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 10. Cross-Browser Compatibility (Optional)

### 10.1 Firefox (with webextension-polyfill)
- [ ] Load extension in Firefox
- [ ] Run basic window opening tests
- [ ] **Expected**: Similar behavior to Chrome

**Result**: ☐ Pass ☐ Fail ☐ N/A
**Notes**: _________________________________

---

## 11. Edge Cases

### 11.1 Network Offline
- [ ] Disconnect internet
- [ ] Try opening a window
- [ ] **Expected**: Window opens but page doesn't load
- [ ] **Expected**: Overlay still appears
- [ ] **Expected**: Minimal requests captured

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 11.2 Redirect URLs
- [ ] Open `http://example.com` (redirects to HTTPS)
- [ ] **Expected**: Redirect request captured
- [ ] **Expected**: Final HTTPS page loads
- [ ] **Expected**: Both requests in overlay

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 11.3 Very Long URL
- [ ] Create URL with 1000+ character path
- [ ] Open in window
- [ ] **Expected**: URL handled correctly
- [ ] **Expected**: Overlay truncates long URLs appropriately

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 11.4 Page with 100+ Requests
- [ ] Open a complex site (e.g., CNN, BBC News)
- [ ] **Expected**: All requests tracked
- [ ] **Expected**: Overlay remains responsive
- [ ] **Expected**: Scrolling works in request list

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## 12. Console Logs Verification

### 12.1 Background Script Logs
- [ ] Open background service worker console
- [ ] Perform various operations
- [ ] **Expected**: Clear log messages for each operation
- [ ] **Expected**: Window registration logs with UUIDs
- [ ] **Expected**: Request interception logs
- [ ] **Expected**: Cleanup logs when windows close

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

### 12.2 Content Script Logs
- [ ] Open DevTools in managed window
- [ ] **Expected**: Content script loaded message
- [ ] **Expected**: Overlay show/hide messages
- [ ] **Expected**: Request update messages

**Result**: ☐ Pass ☐ Fail
**Notes**: _________________________________

---

## Summary

**Total Tests**: ________
**Passed**: ________
**Failed**: ________
**Pass Rate**: ________%

## Critical Issues Found

1. ________________________________________________
2. ________________________________________________
3. ________________________________________________

## Minor Issues Found

1. ________________________________________________
2. ________________________________________________
3. ________________________________________________

## Recommendations

________________________________________________
________________________________________________
________________________________________________

## Sign-off

**Tester**: ___________________
**Date**: ___________________
**Signature**: ___________________

---

## Appendix: Performance Observations

**Browser Memory Usage Before Tests**: ________ MB
**Browser Memory Usage After Tests**: ________ MB
**CPU Usage During Tests**: ________%
**Any Performance Concerns**: ___________________