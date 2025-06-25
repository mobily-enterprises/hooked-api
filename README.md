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

// Customize with hooks, implementers, and constants
api.customize({
  implementers: {
    fetch: async ({ params, resource, api }) => {
      api.context.headers = {}
      
      const response = await fetch('https://example.com', {
        timeout: api.constants.get('TIMEOUT')
      });
      
      // Your custom implementation logic here
      return { 
        status: response.status,
        data: await response.json()
      };
    }
  },
  constants: {
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

// Customize with hooks, implementers, and constants
api.customize({
  implementers: {
    fetch: async ({ params, resource, api, context }) => {
      api.context.headers = {}
      
      await api.runHooks('beforeFetching', context)
      
      const response = await fetch('https://example.com', {
        timeout: api.constants.get('TIMEOUT')
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
  constants: {
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
    // Add constants
    api.constants.set('TIMEOUT', 5000);
    
    // Add implementers
    api.implement('fetch', async ({ params, resource, api, context }) => {
      api.context.headers = {}
      
      await api.runHooks('beforeFetching', context)
      
      const response = await fetch('https://example.com', {
        timeout: api.constants.get('TIMEOUT')
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

This plugin encapsulates all the functionality (constants, hooks, and implementers) but still only queries example.com.

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
    // Add base constants
    api.constants.set('TIMEOUT', 5000);
    
    // Add implementer that uses resource options
    api.implement('fetch', async ({ params, resource, api, context, options }) => {
      api.context.headers = {}
      
      await api.runHooks('beforeFetching', context, resource)
      
      // Use URL from resource options, or default to example.com
      const url = options.resources?.url || 'https://example.com';
      
      const response = await fetch(url, {
        timeout: api.constants.get('TIMEOUT')
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
    api.addHook('beforeFetching', 'logStart', {}, ({ context, resource }) => {
      console.log(`Starting fetch operation for resource: ${resource || 'default'}...`);
    });
    
    api.addHook('afterFetching', 'logComplete', {}, ({ context, resource }) => {
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
  constants: {
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

// You can still use the default (example.com)
const defaultData = await api.run.fetch();
console.log('Default response:', defaultData.source); // https://example.com
```

Each resource can have its own:
- Configuration options (like URL, API keys, etc.)
- Constants that override the base API constants
- Hooks that run only for that specific resource
- Implementers that override the base implementers



