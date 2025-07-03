# Hooked API

Hooked API allows you to create API calls that can be extended with hooks and variables.
For example you can create a library that connects to a database, and allow users to provide hooks to manipulate the
lifecycle of a call.

## Documentation

📖 **[View the official documentation site](https://mobily-enterprises.github.io/hooked-api/)** for the best reading experience.

Or browse the docs here on GitHub:
- 📚 **[Full Documentation](./README.md)** - You're here!
- 🔧 **[API Reference](./API.md)** - Detailed API documentation
- ⚡ **[Cheatsheet](./CHEATSHEET.md)** - Quick recipes and code snippets

Your API users will be able to define scopes and hooks to manipulate how the API calls behave.

This library allows you to create APIs that can be extended with plugins and hooks.

The end result of a database layer API could look like this:

```javascript
import { DbApi } from './DbApi.js'
import { GeneratedOnPlugin } from './GeneratedOnPlugin.js'

const api = new DbApi()

// Add MySql connector with a Plugin
await api.use(GeneratedOnPlugin)

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
});

api.customize({
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
});

api.customize({
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
});

api.customize({
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

You don't know how many hooks will be run when you run `runHooks()`. However, `runHooks()` will return `true`
if _all_ hooks ran, and `false` if the running chain was interrupted.

A hook can interrupt the running chain by returning `false`.

## Scopes: Organizing Different Types of Data

In many cases it's crucial to have `scopes`; in this case, we will map a scope to a database table.
Note that the property `scopeMethods` is used instead of `apiMethods`:

```javascript
import { Api } from 'hooked-api'
import { db } from './db.js'

const api = new Api({
  name: 'library-api',
  version: '1.0.0',
});

api.customize({
  // Note that we are now defining scope methods...
  scopeMethods: {
    get: async ({ context, scopeOptions, params, helpers, vars, scopeName, runHooks }) => { 

      // Run the before-fetch hooks
      await runHooks('beforeFetch');
 
      // Fetch the data. The table used will depend on the scope name
      const response = await db.fetch(scopeName, params.id, { timeout: vars.timeout})
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

Attempting to call a scope directly throws a helpful error:

```javascript
api.scopes.users() // Throws: "Direct scope call not supported. Use api.scopes.users.methodName()"
```

### Advanced Scope Features

Scopes support several advanced features that make them powerful for organizing your API:

#### Scope-Specific Customization

Each scope can have its own hooks, vars, and helpers that are merged with global ones:

```javascript
// Global hooks and vars
api.customize({
  vars: { timeout: 5000 },
  helpers: { formatDate: (d) => d.toISOString() },
  hooks: {
    beforeSave: ({ context }) => {
      context.timestamp = new Date();
    }
  }
});

// Scope-specific customization
api.addScope('users', 
  { schema: { name: 'string', email: 'string' } },
  {
    // These vars override global vars of the same name
    vars: { timeout: 10000 },  // Users need longer timeout
    
    // These helpers are added to global helpers
    helpers: { 
      validateEmail: (email) => email.includes('@') 
    },
    
    // These hooks only run for user operations
    hooks: {
      beforeSave: ({ context, helpers }) => {
        if (!helpers.validateEmail(context.record.email)) {
          throw new Error('Invalid email');
        }
      }
    }
  }
);

// Scope methods can override global scope methods
api.addScope('products', 
  { schema: { name: 'string', price: 'number' } },
  {
    scopeMethods: {
      // Override the global 'get' method just for products
      get: async ({ params, scope }) => {
        const product = await globalGet(params);
        product.formattedPrice = `$${product.price}`;
        return product;
      }
    }
  }
);
```

#### Direct Scope Access in Hooks

When hooks run in a scope context, they receive the current scope object, allowing direct method calls:

```javascript
api.customize({
  scopeMethods: {
    validate: async ({ params, scopeOptions }) => {
      // Validation logic based on scope's schema
      return validateAgainstSchema(params, scopeOptions.schema);
    },
    save: async ({ params, scope, runHooks }) => {
      // Can call other methods on the same scope directly
      await scope.validate(params);
      
      if (await runHooks('beforeSave')) {
        return await database.save(params);
      }
    }
  },
  hooks: {
    beforeSave: async ({ context, scope, scopeName }) => {
      // The scope parameter lets you call methods on the current scope
      const isValid = await scope.validate(context.record);
      
      console.log(`Validating record for ${scopeName}:`, isValid);
      return isValid; // Return false to cancel the save
    }
  }
});
```

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
      await runHooks('beforeFetch');
 
      // Fetch the data. The table used will depend on the scope name
      const response = await db.fetch(scopeName, params.id, { timeout: vars.timeout})
      context.record = response.json();

      // Run the after-fetch hooks
      await runHooks('afterFetch');


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
    addHook('afterFetch', 'addGeneratedOn', {}, ({context, helpers}) => {
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

await api.use(DatabasePlugin)
await api.use(GeneratedOnPlugin)

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

  constructor(apiOptions = {}) {
    
    // This will add the API to the registry
    super(apiOptions);

    // Use the core plugin by default
    this.use(DatabasePlugin)
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
// await api.use(DatabasePlugin)

// You can add "GeneratedOnPlugin" if you like
await api.use(GeneratedOnPlugin)

// Then add books as you wish
// api.addScope('books', ...)
// api.addScope('authors', ...)
```

## Hook Placement Options

When adding hooks, you can control their execution order using placement options. This is useful when you need hooks to run in a specific sequence, regardless of when plugins are installed.

Consider this scenario: You want to add console messages to DbApi, but you need to write the message BEFORE any modifications:

```javascript
// WriteMessagePlugin.js - A plugin that logs data access
const WriteMessagePlugin = {
  name: 'WriteMessagePlugin',
  install: ({ addHook }) => {
    // Run BEFORE any hooks from GeneratedOnPlugin
    addHook('afterFetch', 'logFetch', {
      beforePlugin: 'GeneratedOnPlugin'
    }, ({ context, log }) => {
      log.debug('Original fetched record:', context.record);
      // This logs the record WITHOUT generatedOn
    });
  }
};

// DbApi.js - Updated to include WriteMessagePlugin
import { DatabasePlugin } from './DatabasePlugin.js'
import { WriteMessagePlugin } from './WriteMessagePlugin.js'
import { Api } from './index.js';

class DbApi extends Api {
  constructor(apiOptions = {}) {
    super(apiOptions);

    // Use the core plugins
    this.use(DatabasePlugin);
    this.use(WriteMessagePlugin);  // WriteMessage added to base API
  }
}

// Usage
const api = new DbApi({ name: 'library-api', version: '1.0.0' });
await api.use(GeneratedOnPlugin);  // User adds this plugin

// Even though WriteMessagePlugin was installed BEFORE GeneratedOnPlugin,
// the 'beforePlugin' option ensures it logs the original record
```

### Available Placement Options

- `beforePlugin: 'PluginName'` - Run before all hooks from the specified plugin
- `afterPlugin: 'PluginName'` - Run after all hooks from the specified plugin
- `beforeFunction: 'functionName'` - Run before a specific hook function
- `afterFunction: 'functionName'` - Run after a specific hook function

Only one placement option can be used per hook.

### Example: Using beforeFunction/afterFunction

The `beforeFunction` and `afterFunction` options let you target specific hook functions by name, which is useful when you need fine-grained control:

```javascript
// ValidationPlugin with multiple hooks
const ValidationPlugin = {
  name: 'ValidationPlugin',
  install: ({ addHook }) => {
    // First validation - check required fields
    addHook('beforeSave', 'validateRequired', {}, ({ context }) => {
      if (!context.record.title) {
        throw new Error('Title is required');
      }
    });
    
    // Second validation - check data types
    addHook('beforeSave', 'validateTypes', {}, ({ context }) => {
      if (typeof context.record.rating !== 'number') {
        throw new Error('Rating must be a number');
      }
    });
  }
};

// SanitizationPlugin needs to run between the two validations
const SanitizationPlugin = {
  name: 'SanitizationPlugin',
  install: ({ addHook }) => {
    addHook('beforeSave', 'sanitize', {
      afterFunction: 'validateRequired',  // Run AFTER required field check
      // This ensures we sanitize before type validation
    }, ({ context }) => {
      // Convert rating to number if it's a string
      if (typeof context.record.rating === 'string') {
        context.record.rating = parseInt(context.record.rating, 10);
      }
    });
  }
};

// Usage
await api.use(ValidationPlugin);
await api.use(SanitizationPlugin);

// Hook execution order for 'beforeSave':
// 1. validateRequired (checks if title exists)
// 2. sanitize (converts rating "10" to 10)
// 3. validateTypes (now passes because rating is a number)
```

This example shows why `beforeFunction`/`afterFunction` are useful: they let you insert hooks at specific points within a plugin's hook chain, not just before or after the entire plugin.

Please note that plugin order still matters in the sense that hook ordering is established at adding time.
This means that a plugin can only place hooks before others, but only relative to the plugins already installed.
This is how the API is meant to work. 

### Hook Execution Control

Hooks can return `false` to stop the execution of remaining hooks in the chain.

## Logging

Hooked API includes a comprehensive logging system that helps you debug API behavior and monitor performance. The logging system is integrated throughout the library and available in all handlers.

### Configuring Logging

When creating an API instance, you can configure logging through the options. The defaults are shown below:

```javascript
import { Api, LogLevel } from './index.js';

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

// Using numeric log level
const api2 = new Api({
  name: 'my-api-2',
  version: '1.0.0',
  logging: {
    level: LogLevel.DEBUG,  // Using the exported enum
    logger: console
  }
});

// Using string log level
const api3 = new Api({
  name: 'my-api-3',
  version: '1.0.0',
  logging: {
    level: 'debug',  // Case-insensitive string
    logger: console
  }
});
```

### Log Levels

The library supports five log levels, from least to most verbose:

| Level | Numeric Value | String Value | Description |
|-------|---------------|--------------|-------------|
| ERROR | 0 | 'error' | Critical errors only |
| WARN  | 1 | 'warn'  | Warnings and errors |
| INFO  | 2 | 'info'  | General information (default) |
| DEBUG | 3 | 'debug' | Detailed debugging information |
| TRACE | 4 | 'trace' | Very detailed execution traces |

You can set the log level using either:
- **Numeric values**: 0-4 (using the exported `LogLevel` enum is recommended)
- **String values**: 'error', 'warn', 'info', 'debug', 'trace' (case-insensitive)

```javascript
import { LogLevel } from './index.js';

// All these are equivalent ways to set DEBUG level:
logging: { level: LogLevel.DEBUG, logger: console }
logging: { level: 3, logger: console }
logging: { level: 'debug', logger: console }
logging: { level: 'DEBUG', logger: console }
```

Invalid log levels will default to INFO (2), except numbers outside 0-4 which throw a ConfigurationError.

### Using the Logger in Handlers

Every handler receives a `log` object that provides logging methods:

```javascript
// In your DbApi implementation
class DbApi extends Api {
  constructor() {
    super({ name: 'db-api', version: '1.0.0' });
    
    this.customize({
      apiMethods: {
        healthCheck: async ({ log }) => {
          log.trace('Health check started');
          
          try {
            // Check database connection
            const result = await db.ping();
            log.debug('Database ping successful', result);
            log.info('Health check passed');
            return { status: 'healthy' };
          } catch (error) {
            log.error('Health check failed', error);
            throw error;
          }
        }
      }
    });
  }
}
```

### Logger Methods

The `log` object provides these methods:

```javascript
// Inside any handler, hook, or plugin
async function myHandler({ log, params }) {
  log('Simple info message');           // Shorthand for log.info()
  log.error('Error occurred', error);   // Log errors with details
  log.warn('Deprecation warning');      // Log warnings
  log.info('Processing request', params); // Log general information
  log.debug('Detailed state', state);   // Log debugging details
  log.trace('Method entry/exit');       // Log execution traces
}
```

### Logging in Plugins

Plugins can also use logging during installation and in their hooks:

```javascript
const PerformancePlugin = {
  name: 'PerformancePlugin',
  install: ({ addHook, log }) => {
    log.info('Installing PerformancePlugin');
    
    addHook('beforeMethod', 'startTimer', {}, ({ context, log }) => {
      context.startTime = Date.now();
      log.trace('Timer started');
    });
    
    addHook('afterMethod', 'logDuration', {}, ({ context, log }) => {
      const duration = Date.now() - context.startTime;
      log.debug(`Method completed in ${duration}ms`);
      
      if (duration > 1000) {
        log.warn(`Slow method detected: ${duration}ms`);
      }
    });
  }
};
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

### What Gets Logged Automatically

At different log levels, the library automatically logs:

**INFO level**:
- API initialization
- Plugin installations
- Scope additions

**DEBUG level**:
- Method calls with parameters
- Hook executions
- Configuration changes

**TRACE level**:
- Detailed execution flow
- All proxy accesses
- Internal method resolutions
- Timing information for all operations
- Empty hook chains (when no handlers are registered)
- All `customize()` operations (what methods, hooks, vars, helpers are being added)
- All plugin installation steps (what each plugin adds during install)

### Performance Monitoring

The library automatically tracks execution time for all operations when using DEBUG or TRACE log levels:

```javascript
// Enable timing logs
const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { level: 'debug', logger: console }
});

// Example output when calling a method:
// [DEBUG] [my-api] API method 'getData' called { params: { id: 123 } }
// [DEBUG] [my-api] API method 'getData' completed { duration: '45ms' }

// Hook execution timing:
// [DEBUG] [my-api] Running hook 'beforeFetch' { handlerCount: 3 }
// [DEBUG] [my-api] Hook 'beforeFetch' completed { handlersRun: 3, duration: '12ms' }

// Plugin installation timing:
// [INFO] [my-api] Installing plugin 'CachePlugin' { options: { ttl: 300 } }
// [INFO] [my-api] Plugin 'CachePlugin' installed successfully { duration: '8ms' }
```

This timing information helps you:
- Identify performance bottlenecks
- Monitor method execution times
- Track hook overhead
- Measure plugin initialization impact

For production environments, consider using a custom logger to send timing metrics to your monitoring system:

```javascript
const metricsLogger = {
  log: (message) => {
    // Parse timing information and send to metrics service
    if (message.includes('duration:')) {
      const match = message.match(/duration: '(\d+)ms'/);
      if (match) {
        metricsService.recordTiming(match[1]);
      }
    }
  },
  error: console.error,
  warn: console.warn
};

const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { level: 'info', logger: metricsLogger }
});
```

### Custom Logger

You can provide a custom logger implementation:

```javascript
const customLogger = {
  log: (message, data) => {
    const logEntry = data ? `${message} ${JSON.stringify(data)}` : message;
    fs.appendFileSync('app.log', logEntry + '\n');
  },
  error: (message, data) => {
    const logEntry = data ? `${message} ${JSON.stringify(data)}` : message;
    fs.appendFileSync('error.log', logEntry + '\n');
  },
  warn: (message, data) => {
    const logEntry = data ? `${message} ${JSON.stringify(data)}` : message;
    fs.appendFileSync('warn.log', logEntry + '\n');
  }
};

const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { logger: customLogger }
});
```

Alternatively, you can use the spread operator to handle all arguments:

```javascript
const customLogger = {
  error: (...args) => myLoggingService.log('error', ...args),
  warn: (...args) => myLoggingService.log('warn', ...args),
  info: (...args) => myLoggingService.log('info', ...args),
  debug: (...args) => myLoggingService.log('debug', ...args),
  trace: (...args) => myLoggingService.log('trace', ...args),
};
```

### Best Practices

1. **Production**: Use ERROR or WARN level to minimize overhead
2. **Development**: Use INFO or DEBUG for helpful insights
3. **Debugging**: Use TRACE to see complete execution flow
4. **Custom Logger**: You can provide any logger that implements the console interface
5. **Sensitive Data**: Be careful not to log sensitive information like passwords or API keys

## Security

Hooked API includes several security features to protect against common vulnerabilities and ensure safe operation.

### Prototype Pollution Protection

The library actively prevents prototype pollution attacks by blocking access to dangerous properties:

```javascript
// These property names are blocked in all contexts
const DANGEROUS_PROPS = ['__proto__', 'constructor', 'prototype'];

// Attempting to use these will throw an error
api.addScope('__proto__', {});  // Throws ValidationError
api.customize({
  apiMethods: {
    constructor: async () => {}  // Throws ValidationError
  }
});
```

### Input Validation

All method and scope names must be valid JavaScript identifiers to prevent injection attacks:

```javascript
// Valid names (matching /^[a-zA-Z_$][a-zA-Z0-9_$]*$/)
api.addScope('users', {});         // ✓ Valid
api.addScope('_private', {});      // ✓ Valid
api.addScope('$special', {});      // ✓ Valid

// Invalid names throw ValidationError with helpful messages
api.addScope('user-list', {});     // ✗ Invalid: contains '-'
api.addScope('123users', {});      // ✗ Invalid: starts with number
api.addScope('user.list', {});     // ✗ Invalid: contains '.'
```

When validation fails, the library provides detailed error messages:
- Lists the invalid characters found
- Suggests valid alternatives (e.g., "user_list" instead of "user-list")
- Shows examples of valid names

### Reserved Names and Conflict Prevention

The library prevents overwriting critical API properties:

```javascript
// Reserved plugin names
await api.use({
  name: 'api',      // Throws PluginError: 'api' is reserved
  install: () => {}
});

await api.use({
  name: 'scopes',   // Throws PluginError: 'scopes' is reserved
  install: () => {}
});

// Property conflict detection
api.customize({
  apiMethods: {
    use: async () => {}  // Throws MethodError: 'use' already exists
  }
});
```

### Duplicate Detection

The library prevents duplicate registrations across multiple contexts:

```javascript
// Duplicate API versions
new Api({ name: 'my-api', version: '1.0.0' });
new Api({ name: 'my-api', version: '1.0.0' }); // Throws ConfigurationError

// Duplicate scope names
api.addScope('users', {});
api.addScope('users', {});  // Throws ScopeError

// Duplicate plugin names
api.use(MyPlugin);
api.use(MyPlugin);  // Throws PluginError
```

### Frozen Options

All options objects are frozen when passed to handlers, preventing accidental or malicious modifications:

```javascript
api.customize({
  apiMethods: {
    test: async ({ params, options }) => {
      // options is frozen - modifications will fail
      options.name = 'hacked';        // TypeError: Cannot assign to read only property
      options.newProp = 'value';       // TypeError: Cannot add property
      delete options.version;          // TypeError: Cannot delete property
    }
  }
});
```

### Symbol and Numeric Property Filtering

The library filters certain property types when accessing scopes for security:

```javascript
// Symbols are filtered to prevent symbol-based attacks
const sym = Symbol('hidden');
api.scopes[sym] = 'malicious';  // Silently ignored
console.log(api.scopes[sym]);   // undefined

// Numeric string properties are also filtered
api.scopes['123'] = 'malicious';  // Silently ignored
console.log(api.scopes['123']);   // undefined

// This prevents array-like access patterns
api.scopes.users[0]  // undefined (security feature)

// Use proper API methods instead
api.scopes.users.get({ id: 123 })  // Correct approach
```

### Best Practices for API Developers

When building APIs with hooked-api, follow these security best practices:

1. **Validate all parameters in your API methods** - Never trust input from API consumers:
   ```javascript
   apiMethods: {
     updateUser: async ({ params }) => {
       // Validate before using
       if (!params.id || typeof params.id !== 'number') {
         throw new Error('Invalid user ID');
       }
       if (params.email && !isValidEmail(params.email)) {
         throw new Error('Invalid email format');
       }
       // Now safe to use params
     }
   }
   ```

2. **Carefully review third-party plugins** - Plugins have full access to your API:
   - Check what hooks they add
   - Review what data they access
   - Ensure they don't expose sensitive operations
   - Consider the plugin's source and maintenance status

3. **Sanitize data in hooks** - Hooks can modify shared context:
   ```javascript
   hooks: {
     beforeSave: ({ context }) => {
       // Sanitize any HTML/scripts from user content
       context.record.description = sanitizeHtml(context.record.description);
       // Remove any unexpected fields
       delete context.record.internalField;
     }
   }
   ```

4. **Implement authentication and authorization** - The library doesn't provide this:
   ```javascript
   apiMethods: {
     deleteUser: async ({ params, vars }) => {
       // Check authentication
       if (!vars.currentUser) {
         throw new Error('Authentication required');
       }
       // Check authorization
       if (!vars.currentUser.isAdmin) {
         throw new Error('Admin access required');
       }
       // Proceed with deletion
     }
   }
   ```

5. **Use logging for security monitoring** - Track suspicious activities:
   ```javascript
   apiMethods: {
     login: async ({ params, log }) => {
       const result = await authenticate(params);
       if (!result.success) {
         log.warn('Failed login attempt', { 
           username: params.username,
           ip: params.clientIp,
           timestamp: new Date()
         });
       }
       return result;
     }
   }
   ```

6. **Handle errors carefully** - Don't expose internal details:
   ```javascript
   apiMethods: {
     getData: async ({ params }) => {
       try {
         return await internalDatabaseQuery(params);
       } catch (error) {
         // Log the full error internally
         log.error('Database query failed', error);
         // Return sanitized error to API consumer
         throw new Error('Unable to retrieve data');
       }
     }
   }
   ```

7. **Protect sensitive operations in helpers** - Don't expose dangerous functions:
   ```javascript
   helpers: {
     // DON'T expose direct database access
     // db: database,  // ❌ Bad
     
     // DO create safe, limited helpers
     findUserByEmail: async (email) => {  // ✓ Good
       // Only returns public user data
       const user = await database.findUser({ email });
       return { id: user.id, name: user.name };
     }
   }
   ```

8. **Consider rate limiting** - Implement in your API methods:
   ```javascript
   apiMethods: {
     search: async ({ params, vars }) => {
       // Simple rate limit check
       const key = `search:${vars.clientId}`;
       const count = await rateLimiter.increment(key);
       if (count > 100) {
         throw new Error('Rate limit exceeded');
       }
       return await performSearch(params);
     }
   }
   ```

## Event System

In addition to hooks (which intercept and modify behavior of methors), Hooked API provides an event system for lifecycle notifications  to the API itself. Events are simpler than hooks - they notify about system changes but cannot modify behavior or stop execution.

### Events vs Hooks

| Aspect | Hooks | Events |
|--------|-------|---------|
| **Purpose** | Modify behavior during execution | Notify about system changes |
| **Can stop execution** | Yes (return false) | No |
| **Error handling** | Errors propagate and stop execution | Errors are logged but isolated |
| **Use cases** | Validation, transformation, cancellation | Logging, synchronization, monitoring |
| **Context** | Full method context with params | Simpler event-specific data |

### Available Events

The following system events are emitted:

- `scope:added` - When a new scope is added to the API
- `method:api:added` - When a new API method is added
- `method:scope:added` - When a new scope method is added
- `plugin:installed` - When a plugin is successfully installed

### Using Events in Plugins

Plugins can register event listeners using the `on` method:

```javascript
const LoggingPlugin = {
  name: 'logging-plugin',
  
  install({ on, log }) {
    // Listen for scope creation
    on('scope:added', 'logNewScope', ({ eventData }) => {
      log.info(`New scope created: ${eventData.scopeName}`);
    });
    
    // Listen for plugin installations
    on('plugin:installed', 'logPlugin', ({ eventData }) => {
      log.info(`Plugin installed: ${eventData.pluginName}`);
    });
  }
};
```

### Event Handler Context

Event handlers receive a context object with:

```javascript
{
  eventName: 'scope:added',        // The event that was triggered
  eventData: {                     // Event-specific data
    scopeName: 'users',
    scopeOptions: { ... },
    // ... other event-specific fields
  },
  api: {                          // API access
    vars: { ... },                // API variables (proxy)
    helpers: { ... },             // API helpers (proxy)
    scopes: { ... },              // All scopes
    options: { ... },             // API options (frozen)
    pluginOptions: { ... }        // Plugin options (frozen)
  },
  log: { ... }                    // Logger for this event context
}
```

### Practical Event Examples

#### Auto-Configuration Plugin

Automatically configure new scopes as they're added:

```javascript
const AutoConfigPlugin = {
  name: 'auto-config',
  
  install({ on, addHook }) {
    on('scope:added', 'configureScope', ({ eventData, api }) => {
      const { scopeName } = eventData;
      
      // Add scope-specific configuration
      api.vars[`${scopeName}CacheTimeout`] = 5000;
      
      // Log the configuration
      console.log(`Auto-configured scope: ${scopeName}`);
    });
  }
};
```

#### Cross-Plugin Communication

React to other plugins being installed:

```javascript
const IntegrationPlugin = {
  name: 'integration-plugin',
  
  install({ on, vars }) {
    on('plugin:installed', 'integrateWithPlugin', ({ eventData }) => {
      // React to specific plugins
      if (eventData.pluginName === 'auth-plugin') {
        console.log('Auth plugin detected, enabling authentication features');
        vars.authEnabled = true;
      }
    });
  }
};
```

#### Monitoring Plugin

Track all API changes for auditing:

```javascript
const MonitoringPlugin = {
  name: 'monitoring-plugin',
  
  install({ on }) {
    const changes = [];
    
    // Track all system changes
    on('scope:added', 'trackScope', ({ eventData }) => {
      changes.push({ type: 'scope', name: eventData.scopeName, time: Date.now() });
    });
    
    on('method:api:added', 'trackApiMethod', ({ eventData }) => {
      changes.push({ type: 'api-method', name: eventData.methodName, time: Date.now() });
    });
    
    on('method:scope:added', 'trackScopeMethod', ({ eventData }) => {
      changes.push({ type: 'scope-method', name: eventData.methodName, time: Date.now() });
    });
    
    // Expose the audit log
    api.getAuditLog = () => changes;
  }
};
```

### Error Handling

Event handler errors are isolated and logged but don't break execution:

```javascript
const SafePlugin = {
  name: 'safe-plugin',
  
  install({ on }) {
    on('scope:added', 'mightFail', ({ eventData }) => {
      if (eventData.scopeName === 'special') {
        throw new Error('This error is logged but isolated');
      }
      console.log('Normal processing continues');
    });
  }
};

// Usage - the error doesn't stop scope creation
api.use(SafePlugin);
api.addScope('special');  // Error is logged, but scope is still created
api.addScope('normal');   // Processes normally
```

### Best Practices

1. **Use events for notifications, not control flow** - Events cannot stop or modify operations
2. **Keep event handlers lightweight** - They run synchronously and can impact performance
3. **Handle errors gracefully** - Event errors are logged but isolated
4. **Don't modify critical state** - Use hooks for state modifications that affect behavior
5. **Consider event ordering** - Listeners execute in registration order

## API Registry and Versioning

Hooked API includes a global registry that tracks all API instances by name and version. This enables powerful versioning capabilities and allows different parts of your application to access specific API versions.

### Creating Versioned APIs

Every API instance must have a unique name and version combination:

```javascript
import { Api } from './index.js';

// Create version 1.0.0
const apiV1 = new Api({
  name: 'user-api',
  version: '1.0.0'
});

// Create version 2.0.0 with breaking changes
const apiV2 = new Api({
  name: 'user-api',
  version: '2.0.0'
});

// Attempting to create a duplicate throws an error
const duplicate = new Api({
  name: 'user-api',
  version: '1.0.0'  // Throws ConfigurationError
});
```

### Accessing API Instances

The `Api.registry` provides methods to retrieve and query registered APIs:

```javascript
// Get the latest version (highest semver)
const latest = Api.registry.get('user-api');
const alsoLatest = Api.registry.get('user-api', 'latest');

// Get a specific version
const v1 = Api.registry.get('user-api', '1.0.0');
const v2 = Api.registry.get('user-api', '2.0.0');

// Use semver ranges
const compatible = Api.registry.get('user-api', '^1.0.0');  // Gets 1.x.x
const minor = Api.registry.get('user-api', '~1.0.0');       // Gets 1.0.x
const anyV2 = Api.registry.get('user-api', '2.x');          // Gets 2.x.x

// Returns null for non-existent versions
const missing = Api.registry.get('user-api', '3.0.0');      // null
const invalid = Api.registry.get('user-api', 'invalid');    // null
```

### Registry Methods

```javascript
// List all registered APIs and their versions
const registry = Api.registry.list();
// Returns: { 'user-api': ['2.0.0', '1.0.0'], 'product-api': ['1.0.0'] }

// Check if an API exists
Api.registry.has('user-api');           // true
Api.registry.has('user-api', '1.0.0');  // true
Api.registry.has('user-api', '3.0.0');  // false

// Get all versions of a specific API
const versions = Api.registry.versions('user-api');
// Returns: ['2.0.0', '1.0.0'] (sorted by semver, highest first)
```

### Version Migration Example

The registry enables smooth version migrations:

```javascript
// Old code using v1
function oldFeature() {
  const api = Api.registry.get('user-api', '^1.0.0');
  return api.scopes.users.list();
}

// New code using v2
function newFeature() {
  const api = Api.registry.get('user-api', '^2.0.0');
  return api.scopes.users.query();  // v2 uses 'query' instead of 'list'
}

// Adapter for backward compatibility
function adaptedFeature(version = 'latest') {
  const api = Api.registry.get('user-api', version);
  
  if (api.options.version.startsWith('1.')) {
    return api.scopes.users.list();
  } else {
    return api.scopes.users.query();
  }
}
```

### Best Practices

1. **Semantic Versioning**: Follow semver conventions (major.minor.patch)
2. **Version Documentation**: Document breaking changes between major versions
3. **Gradual Migration**: Use the registry to run multiple versions during transitions
4. **Version Detection**: Check `api.options.version` when behavior differs between versions
5. **Testing**: Use `resetGlobalRegistryForTesting()` between tests to avoid conflicts

```javascript
import { resetGlobalRegistryForTesting } from './index.js';

// In your test setup
beforeEach(() => {
  resetGlobalRegistryForTesting();
});
```



