---
layout: default
title: Cheatsheet
permalink: /CHEATSHEET.html
---

[← Back to Home](./)

# Hooked API Cheatsheet

Quick recipes for common tasks with Hooked API.

## Quick Links
- [API Reference](./API.md) - Detailed API documentation
- [Full Documentation](./README.md) - Complete guide and examples

## Table of Contents
- [Basic Setup](#basic-setup)
- [Adding Methods](#adding-methods)
- [Working with Scopes](#working-with-scopes)
- [Using Hooks](#using-hooks)
- [Creating Plugins](#creating-plugins)
- [Variables and Helpers](#variables-and-helpers)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Testing](#testing)

## Basic Setup

### Create a simple API
```javascript
import { Api } from 'hooked-api';

const api = new Api({
  name: 'my-api',
  version: '1.0.0'
});
```

### Create an API with logging
```javascript
const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { level: 'debug' }
});
```

## Adding Methods

### Add a simple API method
```javascript
await api.customize({
  apiMethods: {
    greet: async ({ params }) => `Hello ${params.name}!`
  }
});

// Usage
await api.greet({ name: 'World' }); // "Hello World!"
```

### Add method with hooks
```javascript
await api.customize({
  apiMethods: {
    getData: async ({ params, context, runHooks }) => {
      await runHooks('beforeFetch');
      context.data = await fetchData(params.id);
      await runHooks('afterFetch');
      return context.data;
    }
  }
});
```

## Working with Scopes

### Add a basic scope
```javascript
await api.addScope('users', {
  schema: { name: 'string', email: 'string' }
});
```

### Add scope with methods
```javascript
await api.customize({
  scopeMethods: {
    get: async ({ params, scopeName }) => {
      return await db.fetch(scopeName, params.id);
    }
  }
});

await api.addScope('users', {});
// Usage: await api.scopes.users.get({ id: 123 });
```

### Add scope with custom hooks
```javascript
await api.addScope('products', 
  { schema: { name: 'string', price: 'number' } },
  {
    hooks: {
      afterFetch: ({ context }) => {
        context.record.formattedPrice = `$${context.record.price}`;
      }
    }
  }
);
```

### Use scope aliases for better naming
```javascript
// For database-like APIs
api.setScopeAlias('tables', 'addTable');

await api.addTable('orders', { schema: { total: 'number' } });
// Usage: await api.tables.orders.get({ id: 1 });
```

## Using Hooks

### Add a simple hook
```javascript
await api.customize({
  hooks: {
    beforeSave: ({ context }) => {
      context.timestamp = new Date();
    }
  }
});
```

### Add hook with placement
```javascript
await api.customize({
  hooks: {
    'afterFetch': ({ context, log }) => {
      log.debug('Original data:', context.record);
    }
  }
});

// Later, add a hook that runs before the above
await api.customize({
  hooks: {
    afterFetch: [{
      placement: { beforeFunction: 'afterFetch' },
      handler: ({ context }) => {
        context.record.processed = true;
      }
    }]
  }
});
```

### Stop hook chain execution
```javascript
await api.customize({
  hooks: {
    validate: ({ context }) => {
      if (!context.record.isValid) {
        return false; // Stops remaining hooks
      }
    }
  }
});
```

## Creating Plugins

### Minimal plugin
```javascript
const myPlugin = {
  name: 'myPlugin',
  install: ({ addApiMethod }) => {
    addApiMethod('hello', async () => 'Hello from plugin!');
  }
};

await api.use(myPlugin);
```

### Plugin with dependencies
```javascript
const enhancedPlugin = {
  name: 'enhancedPlugin',
  dependencies: ['basePlugin'],
  install: ({ addHook, vars }) => {
    vars.enhanced = true;
    addHook('afterInit', 'enhance', {}, ({ context }) => {
      context.enhanced = true;
    });
  }
};
```

### Plugin with options
```javascript
const configPlugin = {
  name: 'configPlugin',
  install: ({ addApiMethod, pluginOptions }) => {
    addApiMethod('getConfig', async () => ({
      endpoint: pluginOptions.configPlugin?.endpoint || 'default'
    }));
  }
};

await api.use(configPlugin, { endpoint: 'https://api.example.com' });
```

### Plugin with hookable operations
```javascript
const httpPlugin = {
  name: 'httpPlugin',
  install: ({ api, runHooks }) => {
    api.handleRequest = async (req, res) => {
      const context = { req, res, handled: false };
      
      // Run hooks for this operation
      const shouldContinue = await runHooks('http:request', context, {
        url: req.url,
        method: req.method
      });
      
      if (!shouldContinue || context.handled) return;
      
      // Process request...
    };
  }
};

// Another plugin can hook into it
const authPlugin = {
  name: 'authPlugin',
  install: ({ addHook }) => {
    addHook('http:request', 'auth', {}, async ({ context, methodParams }) => {
      if (methodParams.url === '/login') {
        context.res.end('Login page');
        context.handled = true;
        return false;
      }
      return true;
    });
  }
};
```

## Variables and Helpers

### Set global variables
```javascript
await api.customize({
  vars: {
    apiKey: 'secret-key',
    timeout: 5000
  }
});
```

### Add helper functions
```javascript
await api.customize({
  helpers: {
    formatDate: (date) => date.toISOString(),
    delay: (ms) => new Promise(r => setTimeout(r, ms))
  }
});
```

### Use vars and helpers in methods
```javascript
await api.customize({
  apiMethods: {
    fetchData: async ({ vars, helpers }) => {
      await helpers.delay(100);
      return {
        key: vars.apiKey,
        date: helpers.formatDate(new Date())
      };
    }
  }
});
```

### Scope-specific vars override globals
```javascript
await api.customize({ vars: { timeout: 5000 } });

await api.addScope('slowEndpoint', 
  {},
  { vars: { timeout: 30000 } } // Override for this scope
);
```

## Logging

### Use logger in methods
```javascript
await api.customize({
  apiMethods: {
    process: async ({ params, log }) => {
      log.trace('Starting process');
      log.debug('Parameters:', params);
      
      try {
        const result = await doWork(params);
        log.info('Process completed');
        return result;
      } catch (error) {
        log.error('Process failed:', error);
        throw error;
      }
    }
  }
});
```

### Custom logger
```javascript
const customLogger = {
  log: (...args) => console.log('[CUSTOM]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args)
};

const api = new Api({
  name: 'my-api',
  version: '1.0.0',
  logging: { logger: customLogger }
});
```

## Error Handling

### Catch specific errors
```javascript
import { ValidationError, ScopeError } from 'hooked-api';

try {
  await api.addScope('123-invalid', {});
} catch (error) {
  if (error instanceof ValidationError) {
    console.log('Invalid name:', error.value);
  }
}
```

### Handle scope not found
```javascript
try {
  await api.scopes.nonexistent.get();
} catch (error) {
  if (error instanceof ScopeError) {
    console.log('Available scopes:', error.availableScopes);
  }
}
```

## Testing

### Reset registry between tests
```javascript
import { resetGlobalRegistryForTesting } from 'hooked-api';

beforeEach(() => {
  resetGlobalRegistryForTesting();
});
```

### Test a plugin
```javascript
test('plugin adds method', async () => {
  const api = new Api({ name: 'test', version: '1.0.0' });
  
  await api.use({
    name: 'testPlugin',
    install: ({ addApiMethod }) => {
      addApiMethod('getValue', async () => 42);
    }
  });
  
  const result = await api.getValue();
  expect(result).toBe(42);
});
```

## Common Patterns

### Authentication pattern
```javascript
await api.customize({
  vars: { currentUser: null },
  helpers: {
    requireAuth: (user) => {
      if (!user) throw new Error('Auth required');
    }
  },
  apiMethods: {
    secureMethod: async ({ vars, helpers }) => {
      helpers.requireAuth(vars.currentUser);
      // Proceed with secure operation
    }
  }
});
```

### Rate limiting pattern
```javascript
await api.customize({
  vars: { requests: new Map() },
  helpers: {
    checkRate: (key, limit = 10) => {
      const count = requests.get(key) || 0;
      if (count >= limit) throw new Error('Rate limit exceeded');
      requests.set(key, count + 1);
    }
  }
});
```

### Caching pattern
```javascript
api.customize({
  vars: { cache: new Map() },
  hooks: {
    beforeFetch: ({ context, vars }) => {
      const cached = vars.cache.get(context.cacheKey);
      if (cached) {
        context.result = cached;
        return false; // Skip remaining hooks
      }
    },
    afterFetch: ({ context, vars }) => {
      vars.cache.set(context.cacheKey, context.result);
    }
  }
});
```

### Transaction pattern
```javascript
api.customize({
  helpers: {
    transaction: async (fn) => {
      await db.beginTransaction();
      try {
        const result = await fn();
        await db.commit();
        return result;
      } catch (error) {
        await db.rollback();
        throw error;
      }
    }
  },
  apiMethods: {
    transfer: async ({ params, helpers }) => {
      return helpers.transaction(async () => {
        await debit(params.from, params.amount);
        await credit(params.to, params.amount);
      });
    }
  }
});
```

## Tips and Tricks

### 1. Use context for hook communication
```javascript
// Context is shared between all hooks and the method
context.processed = true;
context.metadata = { timestamp: Date.now() };
```

### 2. Leverage scope methods for DRY code
```javascript
// Define once, use for all scopes
api.customize({
  scopeMethods: {
    validate: async ({ params, scopeOptions }) => {
      return validateSchema(params, scopeOptions.schema);
    }
  }
});
```

### 3. Plugin naming for hook ordering
```javascript
// Name your plugins clearly for hook placement
addHook('process', 'validate', { 
  beforePlugin: 'DatabasePlugin' 
}, handler);
```

### 4. Use frozen options for security
```javascript
// Options are frozen - attempts to modify will fail
apiOptions.name = 'hacked'; // TypeError
```

### 5. Combine multiple patterns
```javascript
// Auth + Rate Limiting + Logging
api.customize({
  apiMethods: {
    protectedEndpoint: async ({ vars, helpers, log, params }) => {
      helpers.requireAuth(vars.currentUser);
      helpers.checkRate(vars.currentUser.id);
      log.info('Access granted', { user: vars.currentUser.id });
      return await processRequest(params);
    }
  }
});
```