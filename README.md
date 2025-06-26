# Hooked API

A clean, extensible API framework with resources, hooks, and plugins.

## Basic API Creation

Example of the most basic usage:

```javascript
import { Api } from 'hooked-api';

// Create a versioned API
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// Customize with hooks, implementers, and vars
api.customize({
  implementers: {
    fetch: async ({ params, resource, api }) => {
      api.context.headers = {}
      
      const response = await fetch('https://example.com', {
        timeout: api.vars.TIMEOUT,
        headers: api.context.headers
      });
      
      // Your custom implementation logic here
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
```

## Adding hooks

Hooks allow you to intercept and modify behavior at specific points in the request lifecycle. Here's an example showing how to add hooks and use them in implementers:

```javascript
import { Api } from 'hooked-api';

// Create a versioned API
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// Customize with hooks, implementers, and vars
api.customize({
  implementers: {
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
  install: ({ api }) => {
    // Add vars
    api.vars.TIMEOUT = 5000;
    
    // Add implementers
    api.implement('fetch', async ({ params, resource, api, context }) => {
      api.context.headers = {}
      
      await api.runHooks('beforeFetching', context)
      
      const response = await fetch('https://example.com', {
        timeout: api.vars.TIMEOUT,
        headers: api.context.headers
      });
      
      context.response = response;
      await api.runHooks('afterFetching', context)
      
      return { 
        status: response.status,
        data: await response.json()
      };
    });
    
    // Add hooks
    api.addHook('beforeFetching', 'logStart', {}, ({ context }) => {
      console.log('Starting fetch operation...');
    });
    
    api.addHook('afterFetching', 'logComplete', {}, ({ context }) => {
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
const result = await api.run.fetch();
```

This plugin encapsulates all the functionality (vars, hooks, and implementers) but still only queries example.com.

## Adding another plugin

Plugins can work together to add functionality. Here's a plugin that adds authentication headers:

```javascript
// Define a plugin that adds auth headers
const authPlugin = {
  name: 'auth',
  install: ({ api }) => {
    // Add auth token var
    api.vars.AUTH_TOKEN = 'Bearer your-api-token';
    
    // Add hook to inject auth header before fetching
    api.addHook('beforeFetching', 'addAuthHeader', ({ context, api }) => {
      // Add authorization header
      api.context.headers['Authorization'] = api.vars.AUTH_TOKEN;
      api.context.headers['Content-Type'] = 'application/json';
      
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
const result = await api.run.fetch();
// The request will have Authorization and Content-Type headers
```




## Resources

Resources allow you to configure different endpoints or services with their own settings while reusing the same implementers. Here's how to use resources to query different sites:

```javascript
// Create API with the base plugin
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// First, let's modify our plugin to use resource-specific URLs
const flexibleFetchPlugin = {
  name: 'flexibleFetch',
  install: ({ api }) => {
    // Add base vars
    api.vars.TIMEOUT = 5000;
    
    // Add implementer that uses resource options
    api.implement('fetch', async ({ params, resource, api, context, options }) => {
      // Require a resource to be specified
      if (!resource) {
        throw new Error('flexibleFetch requires a resource. Use api.resources.resourceName.fetch()');
      }
      
      api.context.headers = {}

      await api.runHooks('beforeFetching', context, resource)
      
      // Use URL from resource options, or default to example.com
      const url = options.resources?.url || 'https://example.com';
      
      const response = await fetch(url, {
        timeout: api.vars.TIMEOUT,
        headers: api.context.headers
      });
      
      context.response = response;
      await api.runHooks('afterFetching', context, resource)
      
      return { 
        status: response.status,
        data: await response.json(),
        source: url
      };
    });
    
    // Add hooks
    api.addHook('beforeFetching', 'logStart', ({ context, resource }) => {
      console.log(`Starting fetch operation for resource: ${resource || 'default'}...`);
    });
    
    api.addHook('afterFetching', 'logComplete', ({ context, resource }) => {
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

// Direct api.run.fetch() will now throw an error
try {
  await api.run.fetch(); // Error: flexibleFetch requires a resource
} catch (e) {
  console.error(e.message);
}
```

Each resource can have its own:
- Configuration options (like URL, API keys, etc.)
- Vars that override the base API vars
- Hooks that run only for that specific resource
- Implementers that override the base implementers

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
```javascript
api.implement('method', ({ context, api, name, options, params, resource }) => {
  // context - Mutable object for passing data between hooks
  // api - The API instance (resource-aware for resource calls)
  // name - The method name ('method' in this case)
  // options - Frozen object with:
  //   - options.api - Original API config
  //   - options[pluginName] - Each plugin's options
  //   - options.resources - Resource config (if called via resource)
  // params - Parameters passed to the method call
  // resource - Resource name or null for direct calls
});
```

### Plugin Options Storage
```javascript
api.use(myPlugin, { apiKey: 'secret', timeout: 3000 });

// Inside the plugin or handlers:
const pluginOptions = options.myPlugin; // { apiKey: 'secret', timeout: 3000 }
```

### Resource-Specific Implementers
```javascript
api.addResource('special', { url: 'https://special.api.com' }, {
  implementers: {
    fetch: async (context) => {
      // This fetch only runs for api.resources.special.fetch()
      // Overrides the global fetch implementer
    }
  }
});
```

### Direct Method Calls
```javascript
// Three ways to call methods:
await api.run('fetch', { id: 123 });          // Function style
await api.run.fetch({ id: 123 });             // Property style
await api._run('fetch', { id: 123 });         // Internal (bypass proxy)
```

### Testing Utility
```javascript
import { resetGlobalRegistryForTesting } from 'hooked-api';

// In tests, clear all registered APIs
beforeEach(() => {
  resetGlobalRegistryForTesting();
});
```



