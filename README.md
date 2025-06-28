# Hooked API

Hooked API allows you to create API calls that can be extended with hooks and variables.
For example you can create a library that connects to a database, and allow users to provide hooks to manipulate the
lifecycle of a call.

Your API users will be able to define scopes and hooks to manipulate how the API calls behave.

This library allows you to create APIs that can be extended with plugins and hooks.

The end result of a database layer API could look like this:

```javascript
import { DbApi } from './DbApi.js'
import { GeneratedOnPlugin } from './GeneratedOnPlugin.js'

const api = new DbApi()

// Add MySql connector with a Plugin
api.use(GeneratedOnPlugin)

// That's it, "api" is ready to use!
```

To use it:

```javascript
// Add scopes (one per table)
api.addScope('books',
  {
    schema: {
      title: 'string',
      rating: 'number',
    },
  },
  {
    hooks: {
      afterFetch: ({context}) => {
        context.record.titleAndRating = context.record.title + ' ' + context.record.rating
      }
    }
  }
)

api.addScope('authors',
  {
    schema: {
      fullName: 'string',
      bookId: 'id'
    },
  }
)


const author = await api.scopes.authors.get({ id: 10 });
/* Returns:
  { 
    id: 10,
    fullName: "Umberto Eco",
    generatedOn: 2025-06-28T01:35:40.971Z,
  } 
*/

const book = await api.scopes.books.get({ id: 20 });
/* Returns: 
  { 
    id: 20,
    title: "The Name Of the Rose",
    rating: 10,
    titleAndRating: "The Name Of The Rose 10",
    generatedOn: 2025-06-28T01:35:40.971Z,
  } 
*/
```

Note that `generatedOn` was added by the `GeneratedOn` plugin.

Note: in these examples, `db` will be mocked as an object that does very little:

```javascript
// db.js
export const db = {
  fetch: (table, id, params ) => {
    if (table === 'books') return { json: () => ({ title: "The Name Of The Rose", rating: 10, id }) }
    else if (table === 'authors') return { json: () => ({ fullName: "Umberto Eco", id, bookId: 100 }) }
  }
}
```

This guide is focussed on creating exactly the example API shown above.

## First steps: declare a simple function

Here's the simplest way to create an API with a single method:

```javascript
import { Api } from 'hooked-api';
import { db } from './db.js'

const api = new Api({
  name: 'library-api',
  version: '1.0.0',
}, {
  apiMethods: {
    getAuthor: async ({ params }) => { 
      const response = await db.fetch('authors', params.id, {})
      return response.json();
    }
  }
});
```

Anything defined in `apiMethods` will be automatically available as an API method:

To use this API, you simply call the `getAuthor()` method:

```javascript
const user = await api.getAuthor({ id: 100 });
```

Of course, you could do this by just plain Javascript:

```javascript
import { db } from './db.js'
const api = {}

api.getAuthor = async (params) => {
  const response = await db.fetch('authors', params.id, {})
  return response.json();
}
```

But you would miss out on all of the magic that this library offers (hooks, helpers, variables, plugins, scopes...)

## API features: Helpers and variables

You can set helpers function and variables within the API:

```javascript
import { Api } from 'hooked-api'
import { db } from './db.js'

const api = new Api({
  name: 'library-api',
  version: '1.0.0',
}, {
  apiMethods: {
    getAuthor: async ({ params, helpers, vars }) => { 
      const response = await db.fetch('authors', params.id, { timeout: vars.timeout })
      const data = response.json();
      data.generatedOn = helpers.makeDate()
      return data
    }
  },
  vars: {
    timeout: 10000
  },
  helpers: {
    makeDate: () => new Date()
  }
});

// Usage is identical
const user = await api.getAuthor({ id: 100 });
```

As you can see, you can create variables (`vars`) and helpers (`helpers`) when you create the API, and you are able to
use those in the functions defined in `apiMethods`.

## More API features: hooks

API methods can be made more configurable by adding hooks. Hooks allow you to intercept and modify behavior at specific points in your method execution. The `context` object is used to maintain state between hooks, allowing them to share data throughout the method's lifecycle.

Here is an example of how to improve this library providing hooks:

```javascript
import { Api } from 'hooked-api';
import { db } from './db.js'

const api = new Api({
  name: 'library-api',
  version: '1.0.0',
}, {
  apiMethods: {
    getAuthor: async ({ context, params, helpers, vars, runHooks }) => {       

      // Run the before-fetch hooks
      await runHooks('beforeFetch');
 
      // Fetch the data
      const response = await db.fetch('authors', params.id, { timeout: vars.timeout})
      context.record = response.json();

      // Run the after-fetch hooks
      await runHooks('afterFetch');
 
      return context.record
    }
  },
  vars: {
    timeout: 10000
  },
  helpers: {
    makeDate: () => new Date()
  },
  hooks: {
    afterFetch: ({context, helpers}) => {
      context.record.generatedOn = helpers.makeDate()
    }
  }
});
```

Here, the data manipulation was delegated to a hook, which added the random field to the returned data.

## Scopes: Organizing Different Types of Data

In many cases it's crucial to have `scopes`; in this case, we will map a scope to a database table.
Note that the property `scopeMethods` is used instead of `apiMethods`:

```javascript
import { Api } from 'hooked-api'
import { db } from './db.js'

const api = new Api({
  name: 'library-api',
  version: '1.0.0',
}, {
  // Note that we are now defining scope methods...
  scopeMethods: {
    get: async ({ context, scopeOptions, params, helpers, vars, scopeName, runHooks }) => { 

      // Run the before-fetch hooks
      await runHooks('beforeFetch', context);
 
      // Fetch the data. The table used will depend on the scope name
      const response = await db.fetch(scopeName, params.id, { timeout: vars.timeout})
      context.record = response.json();

      // Run the after-fetch hooks
      await runHooks('afterFetch', context);
 
      return context.record
    }
  },
  vars: {
    timeout: 10000
  },
  helpers: {
    makeDate: () => new Date()
  },
  hooks: {
    // No matter what table is fetched, every record will have this timestamp
    afterFetch: ({context, helpers}) => {
      context.record.generatedOn = helpers.makeDate()
    }
  }
});
```

Since we defined `scopeMethods` instead of `apiMethods`, those methods will only be available to defined scopes.
To define a scope:

```javascript
api.addScope('books',
  {
    schema: {
      title: 'string',
      rating: 'number',
    },
  },
  {
    hooks: {
      afterFetch: ({context}) => {
        context.record.titleAndRating = context.record.title + ' ' + context.record.rating
      }
    }
  }
)

api.addScope('authors',
  {
    schema: {
      fullName: 'string',
      bookId: 'id'
    },
  }
)
```
The first parameter is the scope's name (`books` or `authors`); the second parameter is the scope's options. In
this case, we defined `schema` (which at this point is not used in the current implementation).
Both scopes will return records with `generatedOn` set to the current date, but only `books` will have 
`titleAndRating` since the hook is limited to the `books` scope. 

## Logging

The API includes built-in logging capabilities with customizable log levels, formats, and outputs.

### Configuration

Configure logging when creating an API instance. The defaults are shown below:

```javascript
const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: {
    level: 'info',        // 'error', 'warn', 'info', 'debug', 'trace'
    format: 'pretty',     // 'pretty' or 'json'
    timestamp: true,      // Include timestamps in logs
    colors: true,         // Use ANSI colors (only with 'pretty' format)
    logger: console       // Custom logger object (must have log/error/warn methods)
  }
});
```

**Note:** When providing partial logging configuration, always include the `logger` property to avoid issues:

```javascript
// Good - includes logger
const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { level: 'debug', logger: console }
});

// May cause issues - missing logger
const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { level: 'debug' }  // Missing logger property
});
```

### Log Levels

Available log levels (from least to most verbose):
- `error` (0) - Only errors
- `warn` (1) - Warnings and errors
- `info` (2) - General information, warnings, and errors (default)
- `debug` (3) - Detailed debugging information
- `trace` (4) - Very detailed trace information

You can also use numeric levels with the `LogLevel` export:

```javascript
import { Api, LogLevel } from './index.js';

const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { level: LogLevel.DEBUG }
});
```

### Using Logging in Handlers

All handlers receive a `log` object with level-specific methods:

```javascript
apiMethods: {
  getData: async ({ params, log, vars }) => {
    log.debug('Getting data', { params });
    
    try {
      const result = await fetchData(params);
      log.info('Data retrieved successfully', { count: result.length });
      return result;
    } catch (error) {
      log.error('Failed to get data', { error: error.message });
      throw error;
    }
  }
}
```

### Scope-Specific Logging

Scopes can have their own log levels:

```javascript
api.addScope('users', {
  logging: { level: 'debug' },  // More verbose for this scope
  schema: { /* ... */ }
});
```

### Log Output Examples

**Pretty format (default):**
```
2025-06-28T12:00:00.000Z [INFO] [my-api:getData] Data retrieved successfully { count: 42 }
2025-06-28T12:00:01.000Z [ERROR] [my-api:users.create] Validation failed { field: 'email' }
```

**JSON format:**
```json
{"level":"INFO","api":"my-api","context":"getData","message":"Data retrieved successfully","data":{"count":42},"timestamp":"2025-06-28T12:00:00.000Z"}
```

### Custom Logger

You can provide a custom logger implementation:

```javascript
const customLogger = {
  log: (message) => fs.appendFileSync('app.log', message + '\n'),
  error: (message) => fs.appendFileSync('error.log', message + '\n'),
  warn: (message) => fs.appendFileSync('warn.log', message + '\n')
};

const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { logger: customLogger }
});
```

To use it:

```javascript
const author = await api.scopes.authors.get({id: 10});
/* Returns:
  { 
    id: 10,
    fullName: "Umberto Eco",
    generatedOn: 2025-06-28T01:35:40.971Z,
  } 
*/

const book = await api.scopes.books.get({id: 20});
/* Returns: 
  { 
    id: 20,
    title: "The Name Of the Rose",
    rating: 10,
    titleAndRating: "The Name Of The Rose 10",
    generatedOn: 2025-06-28T01:35:40.971Z,
  } 
*/
```

Notice how:
- The `get` method is defined once in `scopeMethods` and works the same for all scopes
- The `books` scope uses **hooks** to customize the record. 
- Each scope returns completely different data structures despite using the same method

## Scope Aliases

You can create custom aliases for the `scope` property to make your API more domain-specific:

```javascript

// Create an alias "table" that points to "scopes"
dbApi.setScopeAlias('tables', 'addTable');

// api.addTable('books', ...)
// api.tables.books.get(...)
```
The first parameter is the alias for `api.scopes`, the second parameter is the alias for `api.addScope`.
These aliases make the code more expressive and easy to understand.

## Plugins

Plugins are what make this library actually useful and demonstrate its true extensibility. They allow you to bundle reusable functionalities (API methods, scope methods, hooks, vars, helpers, and even new scopes) into self-contained modules that can be easily added to any Api instance. This promotes code reuse, separation of concerns, and simplifies the development of complex API behaviors.

Imagine you want to add a logging mechanism, authentication features, or a specialized data transformation pipeline that can be applied across different API instances without rewriting the code. That's where plugins shine.

This is the database code seen above, turned into a plugin.

```javascript
// DatabasePlugin.js
import { db } from './db.js'
export const DatabasePlugin = {
  name: 'DatabasePlugin',
  
  dependencies: [], // This plugin stands alone
  
  install: ({ setScopeAlias, addScopeMethod, addScope, vars, helpers, pluginName, apiOptions }) => {
  
    addScopeMethod('get', async ({ context, scopeOptions, params, helpers, scopeName, runHooks }) => {

      // Run the before-fetch hooks
      await runHooks('beforeFetch', context);
 
      // Fetch the data. The table used will depend on the scope name
      const response = await db.fetch(scopeName, params.id, { timeout: vars.timeout})
      context.record = response.json();

      // Run the after-fetch hooks
      await runHooks('afterFetch', context);


      return context.record
    });

    setScopeAlias('tables', 'addTable');

    // Set vars and helpers directly
    vars.timeout = 10000
  },
};

export default DatabasePlugin;
```

We should also add a GeneratedOnPlugin, like this:

```javascript
// GeneratedOnPlugin.js
export const GeneratedOnPlugin = {
  name: 'GeneratedOnPlugin',
  
  dependencies: ['DatabasePlugin'],
  
  install: ({ addScopeMethod, addHook, vars, helpers, pluginName, apiOptions }) => {

    // The helper used by the hook
    helpers.makeDate = () => new Date()

    // The hook that will adds the generatedOn to all records
    addHook('afterFetch', 'addGeneratedOn', ({context, helpers}) => {
      context.record.generatedOn = helpers.makeDate()
    })
  },
}
```

This plugin will be available to library users who want to add the `generatedOn` field to their records.
At this point, you can just make a new Api object, and add the two plugins to it:

```javascript
import { DatabasePlugin } from './DatabasePlugin.js'
import { GeneratedOnPlugin } from './GeneratedOnPlugin.js'


const api = new Api({
  name: 'library-api',
  version: '1.0.0'
})

api.use(DatabasePlugin)
api.use(GeneratedOnPlugin)

// api.addScope('books', ...)
// api.addScope('authors', ...)
```

## Making a pre-hooked Api class

Most of the time (in fact, probably all of the time) you will want to distribute a ready-to-go class with a
base, initial plugin pre-used in it.
Here is what you do:

```javascript
// DbApi.js
import { DatabasePlugin } from './DatabasePlugin.js'
import { Api } from 'hooked-api'; // Adjust the path to your Api class

class DbApi extends Api {

  constructor(apiOptions = {}, customizeOptions = {}) {
    
    // This will add the API to the registry
    super(apiOptions);

    // Use the core plugin by default
    this.use(DatabasePlugin)

    // NOW, after setting all of the defaults, apply user-provided customizeOptions.
    // These will override any default customizations if keys conflict,
    this.customize(customizeOptions);
  }
}

export default DbApi;
```

To use it:

```javascript
import { DbApi } from './DbApi.js'
import { GeneratedOnPlugin } from './GeneratedOnPlugin.js'


const api = new DbApi({
  name: 'library-api',
  version: '1.0.0'
})

// NO NEED to do this, since DbApi already comes with it
// api.use(DatabasePlugin)

// You can add "GeneratedOnPlugin" if you like
api.use(GeneratedOnPlugin)

// Then add books as you wish
// api.addScope('books', ...)
// api.addScope('authors', ...)
```

## Public API Surface

The API instance exposes these public properties and methods:

- `api.use(plugin, options)` - Install plugins with optional configuration
- `api.customize(config)` - Add hooks, methods, vars, and helpers after initialization
- `api.addScope(name, options, extras)` - Add scopes with configuration and optional customizations
- `api.setScopeAlias(aliasName, addScopeAlias)` - Create aliases for the scopes property and addScope method
- `api.scopes` - Access to defined scopes (e.g., `api.scopes.users.get()`)
- `api.[aliasName]` - If setScopeAlias was called (e.g., `api.tables` for database APIs)
- `api.[addScopeAlias]` - If setScopeAlias was called with second parameter (e.g., `api.addTable`)
- `api.[methodName]()` - Direct calls to defined API methods
- `api.options` - The API configuration (name, version, etc.)

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
  runHooks,           // Function to run hooks
  
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
  context             // Empty context object for plugin use
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
api.use(myPlugin);

// Install with options
api.use(myPlugin, {
  apiKey: 'custom-key',
  endpoint: 'https://api.example.com'
});

// Options are available in handlers via pluginOptions
async ({ pluginOptions }) => {
  const options = pluginOptions.myPlugin; // { apiKey: 'custom-key', ... }
}
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
  
  api.use(myPlugin);
  
  const result = await api.getValue();
  expect(result).toBe('plugin-loaded');
});
```

## Undocumented Features

The following features are implemented in index.js but not covered in this documentation:

### 1. Error Classes and Error Handling
- **Exported Error Classes**: `HookedApiError`, `ConfigurationError`, `ValidationError`, `PluginError`, `ScopeError`, `MethodError`
- Each error class has specific properties (e.g., `code`, `received`, `expected`, `field`, `validValues`)
- Error codes: 'CONFIGURATION_ERROR', 'VALIDATION_ERROR', 'PLUGIN_ERROR', 'SCOPE_ERROR', 'METHOD_ERROR'
- Comprehensive error messages with examples and suggestions

### 2. Hook Placement Options
The `addHook` function accepts placement options that aren't documented:
- `beforePlugin` - Insert before all hooks from a specific plugin
- `afterPlugin` - Insert after all hooks from a specific plugin  
- `beforeFunction` - Insert before a specific function
- `afterFunction` - Insert after a specific function
- Only one placement option allowed per hook

### 3. Registry Version Handling
`Api.registry.get()` supports more than just 'latest':
- Exact versions: `Api.registry.get('my-api', '1.0.0')`
- Semver ranges: `Api.registry.get('my-api', '^1.0.0')`
- Returns `null` for invalid/empty version strings

### 4. Security Features
- **Prototype Pollution Protection**: Blocks dangerous properties (`__proto__`, `constructor`, `prototype`)
- **Symbol Property Filtering**: Symbols are filtered in scope proxy access
- **Property Conflict Detection**: Prevents overwriting existing API properties
- **Frozen Options**: All options objects are frozen when passed to handlers

### 5. LogLevel Export
- `LogLevel` enum is exported with numeric constants:
  ```javascript
  import { LogLevel } from './index.js';
  // LogLevel.ERROR = 0, LogLevel.WARN = 1, etc.
  ```

### 6. Validation Rules
- Method and scope names must be valid JavaScript identifiers (`/^[a-zA-Z_$][a-zA-Z0-9_$]*$/`)
- Reserved plugin names: 'api' and 'scopes' are forbidden
- Duplicate detection for: API versions, scope names, plugin names

### 7. Advanced Customize Options
The `customize()` method can accept hooks as objects with additional properties:
```javascript
{
  hooks: {
    myHook: {
      handler: async () => {},
      functionName: 'customName',
      beforePlugin: 'other-plugin'
    }
  }
}
```

### 8. Direct Scope Call Error
Attempting to call a scope directly throws a helpful error:
```javascript
api.scopes.users() // Throws: "Direct scope call not supported. Use api.scopes.users.methodName()"
```

### 9. Performance Logging
- All method calls, hook executions, and plugin installations include timing information
- Debug/trace logs show detailed execution flow with durations

### 10. Scope-Specific Features
- **Scope-specific methods**: Can override global scope methods
- **Scope-specific vars/helpers**: Merged with global ones (scope takes precedence)
- **Scope-specific hooks**: Only run when methods are called on that scope

### 11. Context Logger Methods
The `log` object in handlers is a full logger with all methods:
```javascript
log('message')        // Same as log.info()
log.error('message')
log.warn('message')
log.info('message')
log.debug('message')
log.trace('message')
```

### 12. Internal Method Access
When adding methods or using customize, the library logs detailed trace information about what's being added (visible at trace log level).

### 13. Hook Execution Control
Hooks can return `false` to stop the execution of remaining hooks in the chain.

### 14. Empty Hook Chains
The system handles empty hook chains gracefully with trace logging.

### 15. Customize During Construction
The constructor accepts a second parameter for immediate customization:
```javascript
const api = new Api(options, {
  apiMethods: {},
  scopeMethods: {},
  hooks: {},
  vars: {},
  helpers: {}
});
```

### 16. Plugin Install Context Details
- `addHook` in plugins automatically injects the plugin name
- All add* methods in plugin context include trace logging
- Plugin context methods are bound to maintain proper `this` context

### 17. Method Name Validation
The library provides detailed error messages for invalid method names, including:
- Listing invalid characters
- Suggestions for fixes
- Examples of valid names

### 18. Logging Configuration Merge Behavior
When providing partial logging configuration, the library merges with defaults, but missing `logger` can cause issues (documented as a warning, but the full merge behavior isn't explained).

### 19. Hook Handler Full Signature
Hook handlers in scope context receive the scope object at `handlerParams.scope`, allowing direct method calls on the current scope.

### 20. API Options Access
The `api.options` property provides read access to the full configuration, including the merged logging configuration.

