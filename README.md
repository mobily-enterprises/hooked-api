# Hooked API

A clean, extensible API framework with resources, hooks, and plugins.

## Public API Surface

The API instance exposes only these public properties and methods:

- `api.use(plugin, options)` - Install plugins
- `api.customize(config)` - Add hooks, methods, vars, and helpers
- `api.resources` - Access to defined resources
- `api.methodName()` - Direct calls to defined API methods

All internal state is hidden behind underscore-prefixed properties (`_hooks`, `_vars`, etc.) to keep the API surface clean.

## Basic API Creation

Example of the most basic usage:

```javascript
import { Api } from 'hooked-api';

// Create a versioned API
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// Define global API methods (callable as api.methodName())
api.customize({
  apiMethods: {
    fetch: async ({ params, context, vars, helpers, resources, runHooks, options }) => {
      // Note: global methods do NOT receive 'resource' parameter
      context.headers = {}
      
      const response = await fetch('https://example.com', {
        timeout: vars.TIMEOUT,
        headers: context.headers
      });
      
      return { 
        status: response.status,
        data: await response.json()
      };
    }
  },
  vars: {
    TIMEOUT: 5000
  }
});

// Define resource methods (only callable on resources)
api.customize({
  resourceMethods: {
    list: async ({ params, context, vars, helpers, resources, runHooks, options, resource }) => {
      // Resource methods always receive the 'resource' parameter
      return `Listing items from resource: ${resource}`;
    }
  }
});
```

## Adding hooks

Hooks allow you to intercept and modify behavior at specific points in the request lifecycle. Here's an example showing how to add hooks and use them in apiMethods:

```javascript
import { Api } from 'hooked-api';

// Create a versioned API
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// Customize with hooks, apiMethods, and vars
api.customize({
  apiMethods: {
    fetch: async ({ params, resource, api, context }) => {
      api.context.headers = {}
      
      await api.runHooks('beforeFetching', context)
      
      const response = await fetch('https://example.com', {
        timeout: api.vars.TIMEOUT,
        headers: api.context.headers
      });
      
      context.response = response;
      await api.runHooks('afterFetching', context)
      
      // Your custom implementation logic here
      return { 
        status: response.status,
        data: await response.json()
      };
    }
  },
  hooks: {
    beforeFetching: ({ context }) => {
      console.log('Starting fetch operation...');
    },
    afterFetching: ({ context }) => {
      console.log(`Fetch completed with status: ${context.response?.status}`);
    }
  },
  vars: {
    TIMEOUT: 5000
  }
});
```

## Making a plugin

Plugins allow you to package and reuse functionality across different APIs. Here's how to convert the above functionality into a plugin:

```javascript
// Define the plugin
const exampleFetchPlugin = {
  name: 'exampleFetch',
  install: ({ addApiMethod, addResourceMethod, addHook, vars, helpers }) => {
    // Add vars
    vars.TIMEOUT = 5000;
    
    // Add global API method
    addApiMethod('fetch', async ({ params, context, vars, runHooks }) => {
      context.headers = {}
      
      await runHooks('beforeFetching', context)
      
      const response = await fetch('https://example.com', {
        timeout: vars.TIMEOUT,
        headers: context.headers
      });
      
      context.response = response;
      await runHooks('afterFetching', context)
      
      return { 
        status: response.status,
        data: await response.json()
      };
    });
    
    // Add resource method
    addResourceMethod('fetchFromResource', async ({ params, resource, options }) => {
      // This method includes resource context
      const url = options.resources?.url || 'https://example.com';
      return `Fetching from ${resource} at ${url}`;
    });
    
    // Add hooks
    addHook('beforeFetching', 'logStart', {}, ({ context }) => {
      console.log('Starting fetch operation...');
    });
    
    addHook('afterFetching', 'logComplete', {}, ({ context }) => {
      console.log(`Fetch completed with status: ${context.response?.status}`);
    });
  }
};

// Use the plugin
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

api.use(exampleFetchPlugin);

// Now you can use the fetch method
const result = await api.fetch();
```

This plugin encapsulates all the functionality (vars, hooks, and apiMethods) but still only queries example.com.

## Adding another plugin

Plugins can work together to add functionality. Here's a plugin that adds authentication headers:

```javascript
// Define a plugin that adds auth headers
const authPlugin = {
  name: 'auth',
  install: ({ vars, addHook }) => {
    // Add auth token var
    vars.AUTH_TOKEN = 'Bearer your-api-token';
    
    // Add hook to inject auth header before fetching
    addHook('beforeFetching', 'addAuthHeader', ({ context, vars }) => {
      // Add authorization header
      context.headers['Authorization'] = vars.AUTH_TOKEN;
      context.headers['Content-Type'] = 'application/json';
      
      console.log('Auth header added');
    });
  }
};

// Use both plugins together
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

api.use(exampleFetchPlugin);  // First plugin handles fetching
api.use(authPlugin);          // Second plugin adds headers

// Now fetch will include auth headers automatically
const result = await api.fetch();
// The request will have Authorization and Content-Type headers
```




## API Methods vs Resource Methods

Hooked API distinguishes between two types of methods:

1. **API Methods** - Global methods callable directly on the API instance
2. **Resource Methods** - Methods that can only be called on resources

### API Methods
```javascript
// Define a global API method (only available through customize())
api.customize({
  apiMethods: {
    globalFetch: async ({ params, context, vars, helpers }) => {
      // No 'resource' parameter in global methods
      return `Fetching ${params.url}`;
    }
  }
});

// Call it directly on the API
const result = await api.globalFetch({ url: 'https://example.com' });
```

### Resource Methods
```javascript
// Define a resource method
api.addResourceMethod('list', async ({ params, resource, vars }) => {
  // Resource methods always receive 'resource' parameter
  return `Listing ${resource} with limit: ${params.limit || 10}`;
});

// Add a resource
api.addResource('users');

// Call the resource method
const users = await api.resources.users.list({ limit: 5 });
// Returns: "Listing users with limit: 5"

// Resource methods are NOT available on the main API
api.list(); // This will throw an error!
```

## Resources

Resources allow you to configure different endpoints or services with their own settings. Resources can have:
- Their own configuration options
- Resource-specific method implementations
- Custom vars and helpers that override the global ones

```javascript
// Create API with the base plugin
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// Plugin that adds resource-specific fetching
const flexibleFetchPlugin = {
  name: 'flexibleFetch',
  install: ({ addResourceMethod, addHook, vars }) => {
    // Add base vars
    vars.TIMEOUT = 5000;
    
    // Add resource method that uses resource options
    addResourceMethod('fetch', async ({ params, resource, context, vars, runHooks, options }) => {
      context.headers = {}

      await runHooks('beforeFetching', context)
      
      // Use URL from resource options, or default to example.com
      const url = options.resources?.url || 'https://example.com';
      
      const response = await fetch(url, {
        timeout: vars.TIMEOUT,
        headers: context.headers
      });
      
      context.response = response;
      await runHooks('afterFetching', context)
      
      return { 
        status: response.status,
        data: await response.json(),
        source: url,
        resource: resource
      };
    });
    
    // Add hooks
    addHook('beforeFetching', 'logStart', ({ context, resource }) => {
      console.log(`Starting fetch operation for resource: ${resource || 'default'}...`);
    });
    
    addHook('afterFetching', 'logComplete', ({ context, resource }) => {
      console.log(`Fetch completed for ${resource || 'default'} with status: ${context.response?.status}`);
    });
  }
};

// Use the flexible plugin
api.use(flexibleFetchPlugin);

// Add resources for different sites
api.addResource('github', {
  url: 'https://api.github.com'
}, {
  vars: {
    TIMEOUT: 10000  // Override timeout for GitHub
  }
});

api.addResource('jsonplaceholder', {
  url: 'https://jsonplaceholder.typicode.com/posts'
});

api.addResource('weather', {
  url: 'https://api.weatherapi.com/v1/current.json'
}, {
  hooks: {
    beforeFetching: ({ context }) => {
      console.log('Weather API request starting - remember to add API key!');
    }
  }
});

// Now you can fetch from different sites using resources
const githubData = await api.resources.github.fetch();
console.log('GitHub response:', githubData.source); // https://api.github.com

const posts = await api.resources.jsonplaceholder.fetch();
console.log('Posts response:', posts.source); // https://jsonplaceholder.typicode.com/posts

const weather = await api.resources.weather.fetch();
console.log('Weather response:', weather.source); // https://api.weatherapi.com/v1/current.json

// Direct api.fetch() won't work because fetch is now a resource method
api.fetch; // undefined - resource methods aren't available on the main API
```

Each resource can have its own:
- Configuration options (like URL, API keys, etc.)
- Vars that override the base API vars
- Hooks that run only for that specific resource
- apiMethods that override the base apiMethods

## Options Structure

Hooked API uses three separate types of options:

### 1. API Options
These are the options passed when creating the API instance:
```javascript
const api = new Api({
  name: 'myapi',
  version: '1.0.0',
  customField: 'value'  // Any additional fields are preserved
});

// Available in handlers as:
api.customize({
  apiMethods: {
    method: ({ apiOptions }) => {
  console.log(apiOptions.name);        // 'myapi'
  console.log(apiOptions.version);     // '1.0.0'
      console.log(apiOptions.customField); // 'value'
    }
  }
});
```

### 2. Plugin Options
These are options passed when installing plugins:
```javascript
api.use(myPlugin, { apiKey: 'secret', timeout: 3000 });

// Available in the plugin install function:
const myPlugin = {
  name: 'myPlugin',
  install: ({ pluginOptions }) => {
    const options = pluginOptions.myPlugin; // { apiKey: 'secret', timeout: 3000 }
  }
};

// And in all handlers:
api.customize({
  apiMethods: {
    method: ({ pluginOptions }) => {
  const myOptions = pluginOptions.myPlugin;     // { apiKey: 'secret', timeout: 3000 }
      const otherOptions = pluginOptions.otherPlugin; // Options from other plugins
    }
  }
});
```

### 3. Resource Options
These are options specific to each resource:
```javascript
api.addResource('users', {
  url: 'https://api.example.com/users',
  rateLimit: 100
});

// Only available in resource methods and resource-aware hooks:
api.addResourceMethod('fetch', ({ resourceOptions }) => {
  console.log(resourceOptions.url);       // 'https://api.example.com/users'
  console.log(resourceOptions.rateLimit); // 100
});
```

## Additional Features Not Yet Covered

### Helpers

They are the exact same as vars

### API Registry System
```javascript
// Register multiple versions of APIs
const api1 = new Api({ name: 'myapi', version: '1.0.0' });
const api2 = new Api({ name: 'myapi', version: '2.0.0' });

// Find APIs by name and version
Api.registry.get('myapi', 'latest');        // Gets v2.0.0
Api.registry.get('myapi', '^1.0.0');        // Gets v1.0.0 (semver ranges)
Api.registry.list();                         // { myapi: ['2.0.0', '1.0.0'] }
Api.registry.versions('myapi');              // ['2.0.0', '1.0.0']
Api.registry.has('myapi', '1.0.0');         // true
```

### Hook Ordering Control
```javascript
// Control hook execution order with placement options
api.addHook('beforeFetch', 'myPlugin', 'validate', 
  { beforePlugin: 'auth' },     // Run before all 'auth' plugin hooks
  handler
);

api.addHook('beforeFetch', 'logging', 'log',
  { afterFunction: 'validate' }, // Run after the 'validate' function
  handler  
);
```

### Plugin Dependencies
```javascript
const advancedPlugin = {
  name: 'advanced',
  dependencies: ['auth', 'logging'], // Requires these plugins first
  install: ({ api }) => {
    // Can rely on auth and logging being available
  }
};
```

### Hook Chain Control
```javascript
api.addHook('beforeFetch', 'guard', 'checkAccess', ({ context }) => {
  if (!context.authorized) {
    console.log('Access denied - stopping hook chain');
    return false; // Stops all subsequent hooks
  }
});
```

### Handler Context Full Structure

#### Global API Methods
```javascript
// Handler signature for global API methods:
({ 
  params,         // Parameters passed to the method call
  context,     // Mutable object for passing data between hooks
  vars,        // Variables proxy
  helpers,     // Helpers proxy
  resources,   // Access to resources
  runHooks,    // Function to run hooks
  name,        // The method name ('method' in this case)
  options      // Frozen config object
}) => {
  // NO resource parameter in global methods
});
```

#### Resource Methods
```javascript
api.addResourceMethod('method', ({ 
  params,      // Parameters passed to the method call
  context,     // Mutable object for passing data between hooks
  vars,        // Variables proxy (merged with resource vars)
  helpers,     // Helpers proxy (merged with resource helpers)
  resources,   // Access to resources
  runHooks,    // Function to run hooks
  name,        // The method name ('method' in this case)
  options,     // Frozen config (includes options.resources)
  resource     // Resource name (always provided)
}) => {
  // Resource methods always receive the resource parameter
});
```

#### Hook Handlers
```javascript
api.addHook('hookName', 'pluginName', 'functionName', ({ 
  params,      // Empty object for hooks
  context,     // The context object passed to runHooks
  vars,        // Variables (resource-aware if hook run with resource)
  helpers,     // Helpers (resource-aware if hook run with resource)
  resources,   // Access to resources
  runHooks,    // Function to run hooks (careful of recursion!)
  name,        // Hook name
  options,     // Frozen config
  resource     // Resource name or null
}) => {
  // Hook handler implementation
});
```

### Plugin Install Context
```javascript
const myPlugin = {
  name: 'myPlugin',
  install: ({
    addApiMethod,       // Add global API methods
    addResourceMethod,  // Define resource methods
    addResource,        // Add resources
    addHook,           // Add hooks (with plugin name auto-injected)
    runHooks,          // Run hooks
    vars,              // Variables proxy
    helpers,           // Helpers proxy
    resources,         // Access to resources
    name,              // Plugin name
    options,           // All options (frozen)
    context            // Empty context object
  }) => {
    // Plugin installation logic
  }
};
```

### Plugin Options Storage
```javascript
api.use(myPlugin, { apiKey: 'secret', timeout: 3000 });

// Inside the plugin or handlers:
const pluginOptions = options.myPlugin; // { apiKey: 'secret', timeout: 3000 }
```

### Resource-Specific Method Implementations
```javascript
api.addResource('special', { url: 'https://special.api.com' }, {
  resourceMethods: {
    fetch: async ({ params, resource, resourceOptions }) => {
      // This fetch only runs for api.resources.special.fetch()
      // Overrides the global resource method 'fetch'
      return `Special fetch for ${resource} at ${resourceOptions.url}`;
    },
    customMethod: async ({ params, resource }) => {
      // Resource-specific method not defined globally
      return `Custom method only for ${resource}`;
    }
  }
});

// These work:
await api.resources.special.fetch(); // Uses special implementation
await api.resources.special.customMethod(); // Uses resource-specific method

// This won't work:
await api.fetch(); // Error - fetch is a resource method, not an API method
```

### Direct Method Calls
```javascript
// Call methods directly on the API instance:
await api.fetch({ id: 123 });

// Dynamic method names using bracket notation:
const methodName = 'fetch';
await api[methodName]({ id: 123 });
```

### Testing Utility
```javascript
import { resetGlobalRegistryForTesting } from 'hooked-api';

// In tests, clear all registered APIs
beforeEach(() => {
  resetGlobalRegistryForTesting();
});
```



