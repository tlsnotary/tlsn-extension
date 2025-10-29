# Plugin SDK Test Summary

## Tests Implemented

### executePlugin.test.ts

Tests for the `executePlugin` functionality with focus on:

1. **Basic Infrastructure Tests**
   - ✅ Error handling when main function is not exported
   - ✅ Plugin code loading and main function detection
   - ✅ Syntax error handling in plugin code

2. **DOM JSON Creation Tests**
   - ✅ Creating div elements with options and children
   - ✅ Creating button elements with onclick handlers
   - ✅ Handling children as first parameter
   - ✅ Handling no parameters
   - ✅ Creating nested DOM structures

## Known Limitations

### Circular Reference Issue in Hooks

The current implementation has a **known limitation** with testing the React-like hooks (`useEffect`, `useRequests`, `useHeaders`). When these hooks are passed as capabilities into the QuickJS sandbox, they cause "Maximum call stack size exceeded" errors due to circular references in the capability closures.

**Root Cause:**
- The hooks close over complex objects like `executionContext`, `eventEmitter`, etc.
- When QuickJS tries to serialize these closures to pass them into the sandbox, it encounters circular references
- Even simple filter functions that return primitive values trigger this because the full request/header arrays need to be serialized first

**What Works:**
- ✅ DOM JSON creation (div, button)
- ✅ Plugin code execution framework
- ✅ Error handling and validation
- ✅ Basic sandbox isolation

**What Needs Refactoring:**
- ❌ useEffect hook testing
- ❌ useRequests hook testing
- ❌ useHeaders hook testing
- ❌ Window message handling with hooks
- ❌ Full plugin lifecycle with state management

## Future Improvements

To fully test the hook functionality, the implementation would need to be refactored to:

1. Avoid passing closures with circular references as capabilities
2. Serialize request/header data to simple objects before passing to sandbox
3. Implement hooks in a way that doesn't require complex object serialization
4. Consider alternative approaches for state management across the sandbox boundary

## Test Execution

All basic infrastructure tests pass:
```bash
npm test -- executePlugin.test.ts
```

**Result:** 8/8 tests passing ✅

## Additional Tests

The codebase also includes:
- **parser.test.ts**: Comprehensive HTTP message parser tests (all passing)
- **index.test.ts**: Basic Host class functionality tests
- **index.browser.test.ts**: Browser-specific tests
