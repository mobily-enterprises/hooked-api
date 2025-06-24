# Hooked API

A sophisticated library for creating versioned, pluggable, and resource-oriented APIs with a powerful hook system.

## Why Hooked API?

Traditional API libraries often struggle with:
- **Version Management**: Running multiple API versions simultaneously
- **Resource Organization**: Keeping endpoints and their logic organized
- **Extensibility**: Adding cross-cutting concerns like logging, caching, or authentication
- **Flexibility**: Adapting to different use cases without rewriting core logic

Hooked API solves these problems by providing:
- = **Semantic Versioning**: Built-in support for running multiple API versions side-by-side
- =� **Resource-Oriented Design**: Organize your API around resources, not just endpoints
- = **Plugin System**: Extend functionality through a powerful plugin architecture
- >� **Hook System**: Fine-grained control over execution flow
- <� **Global Resource Access**: Access any resource from anywhere with automatic version resolution

## Quick Example: Web Scraper API

Here's how you can build a web scraping API in minutes:

```javascript
import { Api } from 'hooked-api';

// Create an API instance for web scraping
const webApi = new Api({
  name: 'WEB_SCRAPER_API',
  version: '1.0.0'
});

// Install the URL loader plugin (provides the 'load' method)
webApi.use(UrlLoaderPlugin);

// Add resources - each with their own URL
webApi.addResource('exampleDotCom', {
  url: 'https://www.example.com'
});

webApi.addResource('googleHomepage', {
  url: 'https://www.google.com'
});

webApi.addResource('githubApi', {
  url: 'https://api.github.com'
});

// Load different URLs through their resources
const exampleContent = await webApi.instanceResources.exampleDotCom.load();
const googleContent = await webApi.instanceResources.googleHomepage.load();
const githubData = await webApi.instanceResources.githubApi.load();
```

## How It Works

### 1. The API Instance
Every API starts with creating an instance with a unique name and version:

```javascript
const api = new Api({
  name: 'MY_API',
  version: '1.0.0'
});
```

### 2. Resources
Resources are the building blocks of your API. Each resource can have its own configuration, methods, and data:

```javascript
api.addResource('users', {
  // Resource-specific configuration
  baseUrl: 'https://api.example.com/users',
  timeout: 5000
});
```

### 3. Plugins
Plugins add functionality to your API. They can add methods (implementers), hooks, and constants:

```javascript
// Creating the UrlLoaderPlugin
const UrlLoaderPlugin = {
  name: 'UrlLoaderPlugin',
  install(api) {
    // Add a 'load' method available to all resources
    api.implement('load', async function({ context, config, api }) {
      const url = config.resourceOptions.url;
      if (!url) {
        throw new Error(`Resource ${config.resourceName} has no URL configured`);
      }
      
      // Prepare context for hooks
      const hookContext = {
        ...context,
        url: url,
        resourceName: config.resourceName
      };
      
      // Execute hooks - other plugins can populate content
      const processedContext = await api.executeHook('beforeLoad', hookContext);
      
      // Only fetch if content wasn't provided by another plugin (e.g., cache)
      if (!processedContext.content) {
        const response = await fetch(url);
        processedContext.response = response;
        processedContext.content = await response.text();
      }
      
      // Execute hooks for post-processing
      await api.executeHook('afterLoad', processedContext);
      await api.executeHook('transform', processedContext);
      
      return processedContext.content;
    });
  }
};
```

Hooks will allow other plugins to interject in the workflow and enrich the basic behaviour.

### 4. The Magic: Dynamic Method Resolution

When you call `webApi.instanceResources.exampleDotCom.load()`:

1. The proxy system intercepts the `load` call
2. It looks for a `load` implementer (added by our plugin)
3. It executes the implementer with the correct context
4. The implementer receives the resource's configuration (including the URL)
5. The method fetches and returns the content

This means each resource can have different configurations but share the same methods!

## Creating Plugins

Plugins are objects with a `name` and an `install` function. When a plugin is installed, it receives a wrapped version of the API that provides a simplified interface:

### Plugin API Wrapper

The API object passed to plugins has an enhanced `hook` method that automatically includes the plugin name:

```javascript
// What you write in your plugin:
api.hook('beforeExecute', 'logCall', handler);

// What actually gets called:
api.hook('beforeExecute', 'YourPluginName', 'logCall', {}, handler);
```

This means you never have to repeat your plugin name when registering hooks, making the code cleaner and less error-prone.

```javascript
const LoggingPlugin = {
  name: 'LoggingPlugin',
  install(api) {
    // Add a before hook to log all method calls
    // Note: plugin name is automatically included!
    api.hook('beforeExecute', 'logMethodCall', async (context) => {
      console.log(`Calling ${context.method} on ${context.resourceName}`);
    });
  }
};

const CachingPlugin = {
  name: 'CachingPlugin',
  install(api) {
    const cache = new Map();
    
    // Hook into beforeLoad to check cache
    api.hook('beforeLoad', 'checkCache', async (context) => {
      const key = `${context.resourceName}:${context.url}`;
      if (cache.has(key)) {
        console.log(`Cache hit for ${key}`);
        context.content = cache.get(key);
        context.fromCache = true; // Signal that content is already loaded
      }
    });
    
    // Hook into afterLoad to store in cache
    api.hook('afterLoad', 'storeInCache', async (context) => {
      if (!context.fromCache && context.content) {
        const key = `${context.resourceName}:${context.url}`;
        cache.set(key, context.content);
      }
    });
  }
};

const AuthPlugin = {
  name: 'AuthPlugin',
  install(api, options) {
    // Add an API-wide constant
    api.addConstant('apiKey', options.apiKey);
    
    // Add auth headers to all requests
    api.hook('beforeExecute', 'addAuthHeaders', async (context) => {
      context.headers = context.headers || {};
      context.headers['Authorization'] = `Bearer ${api.constants.get('apiKey')}`;
    });
  }
};

const RateLimitPlugin = {
  name: 'RateLimitPlugin',
  install(api, options = {}) {
    const limits = new Map();
    const maxRequests = options.maxRequests || 10;
    const windowMs = options.windowMs || 60000; // 1 minute
    
    api.hook('beforeExecute', 'checkRateLimit', async (context) => {
      const key = context.resourceName;
      const now = Date.now();
      
      if (!limits.has(key)) {
        limits.set(key, { count: 0, resetTime: now + windowMs });
      }
      
      const limit = limits.get(key);
      if (now > limit.resetTime) {
        limit.count = 0;
        limit.resetTime = now + windowMs;
      }
      
      if (limit.count >= maxRequests) {
        throw new Error(`Rate limit exceeded for resource ${key}`);
      }
      
      limit.count++;
    });
  }
};
```

## Handler Signature

All implementers (methods) in Hooked API use a consistent signature with destructured parameters:

```javascript
api.implement('methodName', async ({ context, config, api }) => {
  // context - User-provided data (mutable, passed through hooks)
  // config - Metadata about the current execution
  // api - Operational capabilities
});
```

### What's in each parameter?

```javascript
{
  // context: User data passed to the method
  context: { ...userProvidedData },
  
  // config: All metadata about the execution
  config: {
    method: 'methodName',           // Current method being executed
    resourceName: 'users',          // Current resource (if applicable)
    apiOptions: { name, version },  // API-level configuration
    resourceOptions: { ... },       // Resource-level configuration
    apiConstants: Map,              // API-level constants
    resourceConstants: Map          // Resource-level constants
  },
  
  // api: Operational capabilities
  api: {
    resources: Proxy,               // Version-locked resource access
    executeHook: Function,          // Execute hooks
    constants: Map,                 // Quick access to API constants
    options: Object                 // Quick access to API options
  }
}
```

### Examples

```javascript
// Simple method - only needs context
api.implement('echo', async ({ context }) => {
  return context.message;
});

// Method that uses resources
api.implement('createUserWithProfile', async ({ context, api }) => {
  const user = await api.resources.users.create(context.userData);
  const profile = await api.resources.profiles.create({
    userId: user.id,
    ...context.profileData
  });
  return { user, profile };
});

// Method that uses configuration
api.implement('save', async ({ context, config }) => {
  const tableName = config.resourceOptions.tableName || config.resourceName;
  return db.insert(tableName, context);
});
```

## Advanced Usage

### Version Management

```javascript
// Create multiple versions of the same API
const apiV1 = new Api({ name: 'USER_API', version: '1.0.0' });
const apiV2 = new Api({ name: 'USER_API', version: '2.0.0' });

// Both can have a 'users' resource with different implementations
apiV1.addResource('users');
apiV2.addResource('users');

// Access specific versions
await Api.resources.version('1.0.0').users.get(); // Uses v1
await Api.resources.users.get(); // Uses v2 (latest)

// Inside implementers, always use api.resources for version safety
apiV1.implement('crossResourceOperation', async ({ context, config, api }) => {
  // This ensures v1 uses v1 resources
  const users = await api.resources.users.list();
});
```

### Resource-Specific Implementers

```javascript
// Add a method only to a specific resource
api.addResource('posts', {}, {}, {
  // Resource-specific implementers
  publish: async function({ context, config, api }) {
    console.log(`Publishing post in ${config.resourceName}`);
    // Publish logic here
    
    // Can access other resources if needed
    const author = await api.resources.users.get(context.authorId);
    
    return { published: true, author };
  }
});

// Only available on posts resource
await api.instanceResources.posts.publish({ authorId: 123 });
// await api.instanceResources.users.publish(); // This would fail!
```

### Hook System

The hook system allows plugins to intercept and modify behavior:

```javascript
// Available hooks (you can define custom ones too):
// - beforeExecute: Before any method is executed
// - afterExecute: After any method is executed
// - beforeCreate, afterCreate: For create operations
// - beforeUpdate, afterUpdate: For update operations
// - beforeDelete, afterDelete: For delete operations

// Inside a plugin's install method:
api.hook('beforeCreate', 'validateUserData', async (context) => {
  if (!context.data.email) {
    throw new Error('Email is required');
  }
});

// With execution order control:
api.hook('beforeCreate', 'validateUserData', {
  afterPlugin: 'LoggingPlugin'  // Run after LoggingPlugin's hooks
}, async (context) => {
  // Validation logic here
});
```

## Real-World Example: Multi-Source Data API

```javascript
// Create a unified API for accessing data from multiple sources
const dataApi = new Api({
  name: 'UNIFIED_DATA_API',
  version: '1.0.0'
});

// Add plugins for common functionality
dataApi.use(LoggingPlugin);
dataApi.use(CachingPlugin);
dataApi.use(RateLimitPlugin, { maxRequests: 100, windowMs: 60000 });

// Add different data sources as resources
dataApi.addResource('weatherData', {
  url: 'https://api.weather.com/v1/current',
  type: 'rest'
});

dataApi.addResource('stockPrices', {
  url: 'wss://stream.stockmarket.com',
  type: 'websocket'
});

dataApi.addResource('newsArticles', {
  url: 'https://newsapi.org/v2/everything',
  type: 'rest',
  requiresAuth: true
});

// Add a universal data fetcher
dataApi.implement('fetch', async function({ context, config, api }) {
  const resourceConfig = config.resourceOptions;
  
  if (resourceConfig.type === 'rest') {
    const response = await fetch(resourceConfig.url, {
      headers: context.headers || {}
    });
    return response.json();
  } else if (resourceConfig.type === 'websocket') {
    // WebSocket implementation
    return new Promise((resolve) => {
      const ws = new WebSocket(resourceConfig.url);
      ws.on('message', (data) => {
        resolve(JSON.parse(data));
        ws.close();
      });
    });
  }
});

// Use the unified API
const weather = await dataApi.instanceResources.weatherData.fetch();
const stocks = await dataApi.instanceResources.stockPrices.fetch();
const news = await dataApi.instanceResources.newsArticles.fetch();
```

## Why Choose Hooked API?

1. **Clean Architecture**: Organize your code around resources and their behaviors
2. **Version Safety**: Run multiple API versions without conflicts
3. **Extensible**: Add new functionality without modifying existing code
4. **Type Safe**: Full TypeScript support (coming soon)
5. **Battle Tested**: Designed for production use with proper error handling
6. **Performance**: Efficient proxy-based system with minimal overhead

## Installation

```bash
npm install hooked-api
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
