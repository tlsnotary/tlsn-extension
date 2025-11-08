# useState Hook Documentation

## Overview

The `useState` hook provides state management capabilities for TLSN plugins, similar to React's useState but adapted for the QuickJS sandbox environment. It allows plugins to maintain state across renders and trigger UI updates when state changes.

## API Reference

### useState(key, defaultValue)

Retrieves the current value of a state variable or initializes it with a default value.

**Parameters:**
- `key` (string): Unique identifier for the state variable
- `defaultValue` (any, optional): Initial value if the state doesn't exist

**Returns:**
- The current state value

### setState(key, value)

Updates a state variable and triggers a re-render if the value has changed.

**Parameters:**
- `key` (string): Unique identifier for the state variable
- `value` (any): New value for the state

**Returns:**
- void

## Usage Examples

### Basic Counter Example

```javascript
function onClick() {
  const count = useState('count', 0);
  setState('count', count + 1);
}

function main() {
  const count = useState('count', 0);

  return div({}, [
    div({}, ['Count: ' + count]),
    button({ onclick: 'onClick' }, ['Increment'])
  ]);
}

export default { main, onClick };
```

### Loading State Example

```javascript
async function onClick() {
  // Prevent multiple concurrent requests
  const isLoading = useState('isLoading', false);
  if (isLoading) return;

  setState('isLoading', true);

  try {
    // Perform async operation
    const result = await prove(/* ... */);
    done(result);
  } finally {
    setState('isLoading', false);
  }
}

function main() {
  const isLoading = useState('isLoading', false);

  if (isLoading) {
    return div({}, [
      div({
        style: {
          width: '24px',
          height: '24px',
          border: '3px solid #f3f3f3',
          borderTop: '3px solid #4CAF50',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }
      }, []),
      div({}, ['Processing...'])
    ]);
  }

  return button({ onclick: 'onClick' }, ['Start']);
}

export default { main, onClick };
```

### UI Minimize/Expand Example

```javascript
function main() {
  const isMinimized = useState('isMinimized', false);

  // Show floating action button when minimized
  if (isMinimized) {
    return div({
      style: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: '#4CAF50',
        cursor: 'pointer',
      },
      onclick: () => setState('isMinimized', false),
    }, ['🔐']);
  }

  // Show full UI when expanded
  return div({
    style: {
      position: 'fixed',
      bottom: '0',
      right: '8px',
      width: '280px',
      borderRadius: '8px 8px 0 0',
      backgroundColor: 'white',
    },
  }, [
    // Header with minimize button
    div({
      style: {
        padding: '12px',
        display: 'flex',
        justifyContent: 'space-between',
      }
    }, [
      div({}, ['Plugin Title']),
      button({
        onclick: () => setState('isMinimized', true),
      }, ['−'])
    ]),
    // Content
    div({}, ['Plugin content here...'])
  ]);
}

export default { main };
```

### Multiple State Variables

```javascript
function toggleTheme() {
  const isDark = useState('isDark', false);
  setState('isDark', !isDark);
}

function updateUser() {
  setState('user', {
    name: 'John Doe',
    email: 'john@example.com'
  });
}

function main() {
  const isDark = useState('isDark', false);
  const user = useState('user', null);
  const counter = useState('counter', 0);

  return div({
    style: {
      backgroundColor: isDark ? '#333' : '#fff',
      color: isDark ? '#fff' : '#333',
    }
  }, [
    div({}, ['Theme: ' + (isDark ? 'Dark' : 'Light')]),
    button({ onclick: 'toggleTheme' }, ['Toggle Theme']),

    user ?
      div({}, ['Welcome, ' + user.name]) :
      button({ onclick: 'updateUser' }, ['Login']),

    div({}, ['Counter: ' + counter]),
    button({
      onclick: () => setState('counter', counter + 1)
    }, ['Increment'])
  ]);
}

export default { main, toggleTheme, updateUser };
```

## Best Practices

### 1. Use Descriptive State Keys

```javascript
// Good
const isRequestPending = useState('isRequestPending', false);
const userProfile = useState('userProfile', null);

// Bad
const state1 = useState('s1', false);
const data = useState('d', null);
```

### 2. Initialize with Appropriate Default Values

```javascript
// Boolean states
const isLoading = useState('isLoading', false);

// Numeric states
const count = useState('count', 0);

// Object states
const user = useState('user', null);

// Array states
const items = useState('items', []);
```

### 3. Prevent Unnecessary Re-renders

```javascript
function onClick() {
  const currentValue = useState('value');
  const newValue = calculateNewValue();

  // Only update if value actually changed
  if (currentValue !== newValue) {
    setState('value', newValue);
  }
}
```

### 4. Handle Async Operations Properly

```javascript
async function fetchData() {
  setState('loading', true);
  setState('error', null);

  try {
    const data = await fetch(/* ... */);
    setState('data', data);
  } catch (error) {
    setState('error', error.message);
  } finally {
    setState('loading', false);
  }
}
```

### 5. Group Related State Updates

```javascript
function resetForm() {
  // Update multiple related states together
  setState('formData', {});
  setState('formErrors', {});
  setState('isSubmitting', false);
  setState('submitSuccess', false);
}
```

## Implementation Details

### State Persistence
- State is stored in a Map structure within the plugin execution context
- State persists across renders during the plugin lifecycle
- State is isolated per plugin instance

### Re-rendering Behavior
- Calling `setState` with a different value triggers a re-render
- The `main()` function is called again after state changes
- Re-renders are synchronous and immediate

### Deep Equality Checking
- State updates use deep equality checking to prevent unnecessary re-renders
- Objects and arrays are compared by value, not reference
- Primitive values are compared directly

## Common Patterns

### Toggle Pattern

```javascript
function toggleState() {
  const isEnabled = useState('isEnabled', false);
  setState('isEnabled', !isEnabled);
}
```

### Counter Pattern

```javascript
function increment() {
  const count = useState('count', 0);
  setState('count', count + 1);
}

function decrement() {
  const count = useState('count', 0);
  setState('count', Math.max(0, count - 1));
}
```

### Form Input Pattern

```javascript
function updateInput(field, value) {
  const formData = useState('formData', {});
  setState('formData', {
    ...formData,
    [field]: value
  });
}
```

### Conditional Rendering Pattern

```javascript
function main() {
  const view = useState('view', 'home');

  switch(view) {
    case 'home':
      return renderHomeView();
    case 'settings':
      return renderSettingsView();
    case 'profile':
      return renderProfileView();
    default:
      return renderHomeView();
  }
}
```

## Troubleshooting

### State Not Updating
- Ensure you're using `setState` to update state, not direct assignment
- Check that the key is consistent across `useState` and `setState` calls
- Verify that the new value is actually different from the current value

### Infinite Re-renders
- Avoid calling `setState` directly in `main()` without conditions
- Use `useEffect` for side effects that should only run once

### State Not Persisting
- Make sure you're using the same key consistently
- Check that you're not accidentally resetting state elsewhere

## Migration Guide

### From Direct Variables

**Before:**
```javascript
let isLoading = false;

function onClick() {
  isLoading = true;
  // No automatic re-render
}

function main() {
  return div({}, [isLoading ? 'Loading...' : 'Ready']);
}
```

**After:**
```javascript
function onClick() {
  setState('isLoading', true);
  // Automatic re-render triggered
}

function main() {
  const isLoading = useState('isLoading', false);
  return div({}, [isLoading ? 'Loading...' : 'Ready']);
}
```

### From External State Management

If migrating from external state management, useState provides a simpler, built-in alternative:

```javascript
// No need for external state stores or contexts
// State is managed internally by the plugin SDK

function main() {
  // State is automatically injected and managed
  const appState = useState('appState', {
    user: null,
    settings: {},
    ui: {
      theme: 'light',
      sidebarOpen: false
    }
  });

  // Use state directly in rendering
  return renderApp(appState);
}
```

## Performance Considerations

1. **State Granularity**: Keep state variables focused and granular to minimize re-render scope
2. **Complex Objects**: When updating nested objects, create new references to trigger re-renders
3. **Computed Values**: Calculate derived values during render rather than storing in state
4. **Batch Updates**: Multiple `setState` calls in the same execution context will trigger only one re-render

## Related APIs

- `useEffect`: For managing side effects
- `useHeaders`: For subscribing to HTTP headers
- `useRequests`: For subscribing to HTTP requests
- `openWindow`: For opening browser windows
- `prove`: For generating TLS proofs