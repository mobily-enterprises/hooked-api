---
layout: default
title: API Reference
permalink: /API.html
---

[← Back to Home](./)

# API Reference

## Documentation

- 📚 **[Full Documentation](./README.md)** - Complete guide with examples
- 🔧 **[API Reference](./API.md)** - You're here!
- ⚡ **[Cheatsheet](./CHEATSHEET.md)** - Quick recipes and code snippets

## Public API Surface

The API instance exposes these public properties and methods:

- `await api.use(plugin, options)` - Install plugins with optional configuration
- `await api.customize(config)` - Add hooks, methods, vars, and helpers after initialization
- `await api.addScope(name, options, extras)` - Add scopes with configuration and optional customizations
- `api.setScopeAlias(aliasName, addScopeAlias)` - Create aliases for the scopes property and addScope method
- `api.scopes` - Access to defined scopes (e.g., `api.scopes.users.get()`)
  - `api.scopes.[scopeName].vars` - Direct access to scope variables (falls back to global vars)
  - `api.scopes.[scopeName].helpers` - Direct access to scope helpers (falls back to global helpers)
- `api.[aliasName]` - If setScopeAlias was called (e.g., `api.tables` for database APIs)
- `api.[addScopeAlias]` - If setScopeAlias was called with second parameter (e.g., `api.addTable`)
- `api.[methodName]()` - Direct calls to defined API methods
- `api.vars` - Direct proxy access to global variables
- `api.helpers` - Direct proxy access to global helpers
- `api.options` - Read-only access to the API configuration (includes name, version, and merged logging config)

### Static Methods

- `Api.registry.get(name, version)` - Get a registered API instance
- `Api.registry.list()` - List all registered APIs and their versions
- `Api.registry.has(name, version)` - Check if an API is registered
- `Api.registry.versions(name)` - Get all versions of a specific API


## Handler Context Reference

### Global API Methods

When you define an API method (via `apiMethods` in customize or via plugin), the handler receives:

```javascript
// Handler signature for global API methods:
async ({ 
  params,         // Parameters passed to the method call
  context,        // Mutable object for passing data between hooks
  vars,           // Variables proxy
  helpers,        // Helpers proxy
  scope,          // null (no current scope for global methods)
  scopes,         // Access to all scopes (api.scopes)
  runHooks,       // Function to run hooks: runHooks(hookName)
  log,            // Logger instance for this context
  name,           // The method name being called
  apiOptions,     // Frozen API configuration {name, version, ...}
  pluginOptions,  // Frozen plugin configurations {pluginName: options, ...}
  // If setScopeAlias was called:
  [aliasName]     // Same as 'scopes' but with custom name (e.g., 'tables')
}) => {
  // Implementation
  await runHooks('beforeProcess');
  const result = await doSomething(params);
  context.result = result;
  await runHooks('afterProcess');
  return context.result;
}
```

### Scope Methods

When you define a scope method (via `scopeMethods` in customize or via plugin), the handler receives:

```javascript
// Handler signature for scope methods:
async ({ 
  params,          // Parameters passed to the method call
  context,         // Mutable object for passing data between hooks
  vars,            // Variables proxy (merged: global + scope vars)
  helpers,         // Helpers proxy (merged: global + scope helpers)
  scope,           // Current scope object (e.g., api.scopes.users)
  scopes,          // All scopes proxy (api.scopes)
  runHooks,        // Function to run hooks: runHooks(hookName)
  log,             // Logger instance for this context
  name,            // The method name being called
  apiOptions,      // Frozen API configuration {name, version, ...}
  pluginOptions,   // Frozen plugin configurations {pluginName: options, ...}
  scopeOptions,    // Frozen scope-specific options (passed to addScope)
  scopeName,       // Current scope name as string (e.g., 'users')
  // If setScopeAlias was called:
  [aliasName]      // Same as 'scopes' but with custom name (e.g., 'tables')
}) => {
  // Implementation
  console.log(`Called ${name} on scope ${scopeName}`);
  
  // Can call other methods on current scope directly:
  await scope.validate(params);
  
  // Or access other scopes:
  const relatedData = await scopes.related.get({ id: params.relatedId });
  
  return processData(params, scopeOptions);
}
```

#### Example: Using Scope Aliases

```javascript
api.setScopeAlias('tables');

// Now in handlers:
async ({ params, scope, scopes, tables, scopeName }) => {
  // 'tables' is the same as 'scopes'
  // 'scope' is the current scope object
  
  // Clean, domain-specific syntax:
  await scope.validate(params);  // Validate current table
  await tables.orders.get({ userId: params.id });  // Access orders table
}
```

### Hook Handlers

Hook handlers receive a different parameter name for user data:

```javascript
// Hook handler signature (when added via plugin or customize):
async ({ 
  methodParams,    // The params passed to the original method call
  context,         // The context object from the method (mutable, shared between hooks)
  vars,            // Variables (scope-aware if hook run with scope)
  helpers,         // Helpers (scope-aware if hook run with scope)
  scope,           // Current scope object if hook run in scope context, null otherwise
  scopes,          // All scopes proxy (api.scopes)
  runHooks,        // Function to run hooks (careful of recursion!)
  log,             // Logger instance for this context
  name,            // Hook name (e.g., 'beforeFetch', 'afterFetch')
  apiOptions,      // Frozen API configuration
  pluginOptions,   // Frozen plugin configurations
  scopeOptions,    // Frozen scope options (only if hook run with scope)
  scopeName,       // Scope name or null
  // If setScopeAlias was called:
  [aliasName]      // Same as 'scopes' but with custom name
}) => {
  // Hook handler implementation
  console.log(`Hook ${name} called with params:`, methodParams);
  
  // Modify context to share data with other hooks or the method
  context.processedBy = context.processedBy || [];
  context.processedBy.push(name);
  
  // Return false to stop the hook chain
  if (context.skipRemaining) {
    return false;
  }
}
```

#### Important Notes on Hooks:
- Hooks receive `methodParams` instead of `params` to distinguish from method handlers
- The `context` object is shared between all hooks and the method
- Returning `false` from a hook stops the execution of remaining hooks in the chain
- Hooks can be global (run for all scopes) or scope-specific

### Plugin-Level Hooks

Plugins can create their own hookable operations using the `runHooks` function provided in the install context. This extends the hook concept beyond method lifecycle to any plugin operation.

#### Naming Convention

- **Method lifecycle hooks**: `beforeSave`, `afterFetch`, `beforeDelete`, etc.
- **Plugin operation hooks**: Use plugin:operation format like `http:request`, `graphql:query`, `websocket:message`

#### Example: HTTP Plugin with Hookable Request Handling

```javascript
const HttpPlugin = {
  name: 'http',
  install({ runHooks, api, log }) {
    api.http = {
      async handleRequest(req, res) {
        // Create context for the operation
        const context = { 
          req, 
          res, 
          handled: false,
          auth: { userId: null, claims: null }
        };
        
        // Run hooks for HTTP request processing
        const shouldContinue = await runHooks('http:request', context, {
          url: req.url,
          method: req.method,
          headers: req.headers
        });
        
        // Check if a hook handled the request
        if (!shouldContinue || context.handled) {
          return; // Request was intercepted
        }
        
        // Continue with normal HTTP processing
        log.info(`Processing ${req.method} ${req.url}`);
        // ... rest of implementation
      }
    };
  }
};

// Another plugin can hook into HTTP requests
const AuthPlugin = {
  name: 'auth',
  install({ addHook }) {
    addHook('http:request', 'authenticate', {}, async ({ context, methodParams }) => {
      const { headers } = methodParams;
      
      // Handle auth endpoints
      if (methodParams.url.startsWith('/api/auth/')) {
        // Process authentication
        context.res.end(JSON.stringify({ token: 'new-token' }));
        context.handled = true;
        return false; // Stop processing
      }
      
      // Extract auth from headers
      if (headers.authorization) {
        context.auth.userId = extractUserId(headers.authorization);
        context.auth.claims = extractClaims(headers.authorization);
      }
      
      return true; // Continue to next hook/handler
    });
  }
};
```

This pattern allows plugins to create extensible operations that other plugins can participate in, just like methods have lifecycle hooks.


## Plugin System

### Plugin Structure

```javascript
const myPlugin = {
  name: 'myPlugin',              // Required: unique plugin name
  dependencies: ['otherPlugin'], // Optional: array of required plugin names
  install: (installContext) => { // Required: installation function
    // Plugin setup code
  }
};
```

### Plugin Install Context

The install function receives a context object with these properties:

```javascript
install: ({
  // Setup methods
  addApiMethod,       // Function to add global API methods
  addScopeMethod,     // Function to define scope methods
  addScope,           // Function to add scopes
  setScopeAlias,      // Function to create scope aliases
  
  // Hook management
  addHook,            // Special function that auto-injects plugin name:
                      // addHook(hookName, functionName, hookOptions, handler)
  runHooks,           // Run hooks from plugin context:
                      // runHooks(hookName, context, params)
  
  // Event management
  on,                 // Register event listeners:
                      // on(eventName, listenerName, handler)
  
  // Data access
  vars,               // Variables proxy (mutable)
  helpers,            // Helpers proxy (mutable)
  scopes,             // Access to all scopes
  
  // Logging
  log,                // Logger instance for this plugin context
  
  // Plugin metadata
  name,               // Plugin name (same as plugin.name)
  apiOptions,         // Frozen API configuration
  pluginOptions,      // Frozen plugin configurations
  context,            // Empty context object for plugin use
  
  // API instance
  api                 // The API instance itself (to define more properties)
}) => {
  // Example usage:
  
  // Add a global method
  addApiMethod('getData', async ({ params, vars, helpers }) => {
    return await helpers.fetch(params.url);
  });
  
  // Add a scope method
  addScopeMethod('validate', async ({ params, scopeOptions }) => {
    return validateAgainstSchema(params, scopeOptions.schema);
  });
  
  // Add a hook
  addHook('beforeFetch', 'addAuth', {}, async ({ context, vars }) => {
    context.headers = { ...context.headers, Authorization: vars.apiKey };
  });
  
  // Create a hookable operation in your plugin
  api.handleRequest = async (req, res) => {
    const requestContext = { req, res, handled: false };
    
    // Run hooks for this plugin operation
    const shouldContinue = await runHooks('http:request', requestContext, {
      url: req.url,
      method: req.method
    });
    
    if (!shouldContinue || requestContext.handled) {
      return; // Request was intercepted by a hook
    }
    
    // Continue with normal processing
  };
  
  // Set variables
  vars.apiKey = 'default-key';
  
  // Add helpers
  helpers.fetch = async (url) => {
    // Custom fetch implementation
  };
}
```

### Using Plugins

```javascript
// Install a plugin
await api.use(myPlugin);

// Install with options
await api.use(myPlugin, {
  apiKey: 'custom-key',
  endpoint: 'https://api.example.com'
});

// Options are available in handlers via pluginOptions
async ({ pluginOptions }) => {
  const options = pluginOptions.myPlugin; // { apiKey: 'custom-key', ... }
}
```

## Event System

### Overview

The event system provides lifecycle notifications separate from the hook system. While hooks intercept and can modify behavior, events are fire-and-forget notifications about system changes.

### Event Registration

Plugins can register event listeners using the `on` method in their install context:

```javascript
const myPlugin = {
  name: 'my-plugin',
  install({ on }) {
    // on(eventName, listenerName, handler)
    on('scope:added', 'handleNewScope', async (eventContext) => {
      console.log(`Scope ${eventContext.eventData.scopeName} was added`);
    });
  }
};
```

### Event Handler Context

Event handlers receive a context object with:

```javascript
{
  eventName: string,        // The event that was triggered
  eventData: Object,        // Event-specific data (see events below)
  api: {                    // Read-only API access
    vars: Proxy,            // API variables (proxy)
    helpers: Proxy,         // API helpers (proxy)
    scopes: Proxy,          // All scopes
    options: Object,        // Frozen API options
    pluginOptions: Object   // Frozen plugin options
  },
  log: Logger              // Context-specific logger
}
```

### Available Events

#### `scope:added`
Emitted after a scope is successfully added to the API.

```javascript
eventData: {
  scopeName: string,      // Name of the added scope
  scopeOptions: Object,   // Options passed to addScope
  scopeExtras: Object     // Extras (hooks, methods, etc.) passed to addScope
}
```

#### `method:api:added`
Emitted after an API method is added.

```javascript
eventData: {
  methodName: string,     // Name of the added method
  handler: Function       // The method handler function
}
```

#### `method:scope:added`
Emitted after a scope method template is added.

```javascript
eventData: {
  methodName: string,     // Name of the added method
  handler: Function       // The method handler function
}
```

#### `plugin:installed`
Emitted after a plugin is successfully installed.

```javascript
eventData: {
  pluginName: string,     // Name of the installed plugin
  pluginOptions: Object,  // Options passed to await api.use()
  plugin: Object          // The plugin object itself
}
```

### Event System Internals

The event system uses three private methods on the Api instance:

#### `_on(eventName, pluginName, listenerName, handler)`
Registers an event listener. Called automatically by the plugin install context's `on` method.

#### `_emit(eventName, eventData)`
Emits an event to all registered listeners. Called internally when system changes occur.

#### `_removeListener(eventName, listenerName)`
Removes a specific event listener. Returns true if the listener was found and removed.

### Error Handling

Event handler errors are isolated - they are logged but don't propagate or stop execution:

```javascript
on('scope:added', 'mightFail', async ({ eventData }) => {
  throw new Error('This error is logged but does not stop scope creation');
});
```

### Best Practices

1. **Use unique listener names** - Makes debugging easier and allows specific removal
2. **Keep handlers lightweight** - Events run synchronously and can impact performance
3. **Don't rely on event ordering** - While listeners execute in registration order, this shouldn't be depended upon
4. **Use events for side effects only** - Events cannot cancel operations or modify behavior
5. **Access API state read-only** - While `api.vars` is technically mutable, avoid modifications that affect core behavior

### Example: Comprehensive Event Plugin

```javascript
const EventMonitorPlugin = {
  name: 'event-monitor',
  
  install({ on, addApiMethod, vars }) {
    // Initialize tracking
    vars.eventLog = [];
    
    // Register for all events
    on('scope:added', 'logScope', ({ eventData, api }) => {
      api.vars.eventLog.push({
        type: 'scope',
        name: eventData.scopeName,
        timestamp: Date.now()
      });
    });
    
    on('method:api:added', 'logApiMethod', ({ eventData, api }) => {
      api.vars.eventLog.push({
        type: 'api-method',
        name: eventData.methodName,
        timestamp: Date.now()
      });
    });
    
    on('plugin:installed', 'logPlugin', ({ eventData, api }) => {
      if (eventData.pluginName !== 'event-monitor') {
        api.vars.eventLog.push({
          type: 'plugin',
          name: eventData.pluginName,
          timestamp: Date.now()
        });
      }
    });
    
    // Expose the event log
    addApiMethod('getEventLog', async ({ vars }) => {
      return vars.eventLog;
    });
  }
};
```

## Testing

### Registry Management

The library maintains a global registry of API instances by name and version. For testing, you can reset this registry:

```javascript
import { resetGlobalRegistryForTesting } from './index.js';

// In your test setup
beforeEach(() => {
  resetGlobalRegistryForTesting();
});

// Now you can create APIs with the same name/version in each test
test('my test', () => {
  const api = new Api({ name: 'test-api', version: '1.0.0' });
  // ... test code
});
```

### Testing Best Practices

1. **Reset the registry between tests** to avoid conflicts
2. **Use unique API names** per test if running tests in parallel
3. **Mock external dependencies** in your plugins
4. **Test hooks independently** by creating minimal APIs

```javascript
// Example: Testing a plugin
import { Api } from './index.js';

test('myPlugin adds expected functionality', async () => {
  const api = new Api({ name: 'test', version: '1.0.0' });
  
  const myPlugin = {
    name: 'test-plugin',
    install: ({ addApiMethod, vars }) => {
      vars.testValue = 'plugin-loaded';
      addApiMethod('getValue', async ({ vars }) => vars.testValue);
    }
  };
  
  await api.use(myPlugin);
  
  const result = await api.getValue();
  expect(result).toBe('plugin-loaded');
});
```

## Error Handling

The library exports several error classes that it throws in different scenarios. You can catch these for specific error handling:

### Error Classes

All errors extend from `HookedApiError` which includes a `code` property for programmatic error handling.

#### ValidationError
Thrown when validation fails (invalid method names, scope names, parameters, etc.)
```javascript
try {
  api.addScope('123-invalid-name', {});
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.code);        // 'VALIDATION_ERROR'
    console.log(error.field);       // 'name'
    console.log(error.value);       // '123-invalid-name'
    console.log(error.validValues); // 'valid JavaScript identifier'
  }
}
```

Properties:
- `field` - The field that failed validation
- `value` - The invalid value provided
- `validValues` - Description of what's expected

#### PluginError
Thrown when plugin operations fail (installation, dependencies, naming conflicts)
```javascript
try {
  await api.use({ name: 'api' }); // Reserved name
} catch (error) {
  if (error instanceof PluginError) {
    console.log(error.code);             // 'PLUGIN_ERROR'
    console.log(error.pluginName);       // 'api'
    console.log(error.installedPlugins); // ['other-plugin', ...]
  }
}
```

Properties:
- `pluginName` - The plugin that caused the error
- `installedPlugins` - Array of currently installed plugins

#### ConfigurationError
Thrown when API configuration is invalid (missing name, invalid version, etc.)
```javascript
try {
  const api = new Api({ version: 'invalid' });
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.log(error.code);     // 'CONFIGURATION_ERROR'
    console.log(error.received); // 'invalid'
    console.log(error.expected); // 'semver format (e.g., 1.0.0)'
    console.log(error.example);  // "{ version: '1.0.0' }"
  }
}
```

Properties:
- `received` - What was provided
- `expected` - What was expected
- `example` - Example of correct usage

#### ScopeError
Thrown when scope operations fail (scope not found, duplicate scope names)
```javascript
try {
  await api.scopes.nonexistent.method();
} catch (error) {
  if (error instanceof ScopeError) {
    console.log(error.code);            // 'SCOPE_ERROR'
    console.log(error.scopeName);       // 'nonexistent'
    console.log(error.availableScopes); // ['users', 'posts', ...]
  }
}
```

Properties:
- `scopeName` - The scope that caused the error
- `availableScopes` - Array of available scope names

#### MethodError
Thrown when method operations fail (conflicts, invalid calls)
```javascript
try {
  api.scopes.users(); // Direct scope call
} catch (error) {
  if (error instanceof MethodError) {
    console.log(error.code);       // 'METHOD_ERROR'
    console.log(error.methodName); // 'users'
    console.log(error.suggestion); // 'api.scopes.users.methodName()'
  }
}
```

Properties:
- `methodName` - The method that caused the error
- `suggestion` - Suggested correct usage

### Importing Error Classes and Constants

```javascript
import { 
  Api, 
  LogLevel,
  HookedApiError,
  ValidationError,
  PluginError,
  ConfigurationError,
  ScopeError,
  MethodError 
} from './index.js';

// Catch all library errors
try {
  // ... api operations
} catch (error) {
  if (error instanceof HookedApiError) {
    console.log('Library error:', error.code, error.message);
  }
}
```

