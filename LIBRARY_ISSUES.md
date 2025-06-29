# Library Issues Found During Testing

This document outlines potential issues with the hooked-api library discovered during comprehensive testing.

## 1. Logger Robustness Issues

### Problem
The library doesn't handle edge cases in custom loggers:

1. **Missing methods**: When a custom logger lacks required methods (error, warn), the library throws TypeError
2. **Throwing loggers**: If a logger method throws an error, it crashes the API call
3. **Circular references**: JSON format logging fails with circular reference errors

### Current Behavior
```javascript
// This crashes:
const api = new Api({
  logging: { logger: { log: () => {} } } // Missing error/warn
});
api._logger.error('test'); // TypeError: customLogger.error is not a function
```

### Suggested Fix
- Add method existence checks before calling logger methods
- Wrap logger calls in try-catch blocks
- Use JSON.stringify with a replacer for circular references

## 2. Hooks System Limitations

### Problem
The `customize()` method can only add one hook handler per hook name. Subsequent calls replace rather than add hooks.

### Current Behavior
```javascript
api.customize({ hooks: { test: handler1 } });
api.customize({ hooks: { test: handler2 } }); // Replaces handler1
```

### Design Consideration
This might be intentional to keep customize simple. Multiple hooks are expected to be added via plugins.

## 3. Vars Mutability in Scopes

### Problem
Scope-specific vars passed via options are frozen, preventing mutation patterns that users might expect.

### Current Behavior
```javascript
api.addScope('test', { messages: [] }); // This array becomes immutable
// In scope methods, vars.messages.push() will fail
```

### Design Consideration
This might be for immutability/safety, but it limits certain patterns.

## 4. Helper Context Access

### Problem
Helpers are plain functions and don't automatically receive context like handlers do.

### Current Behavior
```javascript
helpers: {
  increment: ({ vars }) => vars.count++ // This pattern doesn't work
}
// When called: helpers.increment() - no context passed
```

### Design Consideration
This keeps helpers simple but may confuse users expecting automatic context injection.

## 5. Scope Proxy Limitations

### Problem
The scopes proxy doesn't implement all standard object operations:
- No `has` trap (so `'scopeName' in api.scopes` doesn't work)
- No proper enumeration support

### Impact
Standard JavaScript patterns don't work as expected with scopes.

## 6. Error Type Inconsistencies

### Problem
Some operations throw unexpected error types:
- Missing plugin name throws PluginError instead of ValidationError
- Various validation errors use different error classes

### Impact
Makes error handling less predictable for library users.

## 7. Registry Reference Equality

### Problem
Getting an API from the registry may not return the exact same instance.

### Impact
Reference comparisons might fail unexpectedly.

## Summary

Most of these issues are minor and may be intentional design choices. The library works well for its intended use cases, but could benefit from:

1. More robust error handling in the logging system
2. Clearer documentation about the single-hook limitation in customize()
3. Better proxy implementation for more natural JavaScript patterns
4. Consistent error types for similar validation failures

These improvements would make the library more resilient to edge cases and easier to use in complex scenarios.