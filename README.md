# Hooked API

A clean, extensible API framework with scopes, hooks, and plugins.

## Declare a simple function

Here's the simplest way to create an API with a single method:

```javascript
import { Api } from 'hooked-api';

const api = new Api({
  name: 'weather',
  version: '1.0.0',
  baseUrl: 'https://api.weather.com'
}, {
  apiMethods: {
    getCurrentWeather: async ({ params, apiOptions }) => {
      // The method has access to the API options
      console.log(`Using API: ${apiOptions.name} v${apiOptions.version}`);
      console.log(`Base URL: ${apiOptions.baseUrl}`);
      
      const response = await fetch(`${apiOptions.baseUrl}/current/${params.city}`);
      return response.json();
    }
  }
});

// Call the method
const weather = await api.getCurrentWeather({ city: 'London' });
```

## API features: Helpers and variables

```javascript
import { Api } from 'hooked-api';

const api = new Api({
  name: 'weather',
  version: '1.0.0',
  baseUrl: 'https://api.weather.com'
}, {
  apiMethods: {
    getCurrentWeather: async ({ params, apiOptions, vars, helpers }) => {
      // The method has access to API options, vars, and helpers
      console.log(`Using API: ${apiOptions.name} v${apiOptions.version}`);
      
      const response = await fetch(`${apiOptions.baseUrl}/current/${params.city}`);
      const data = await response.json();
      
      // Convert temperature based on user preference
      const temp = vars.useCelsius 
        ? data.fahrenheit ? helpers.toCelsius(data.fahrenheit) : data.celsius
        : data.fahrenheit || helpers.toFahrenheit(data.celsius);
      
      return {
        city: params.city,
        temperature: temp,
        unit: vars.useCelsius ? 'C' : 'F',
        timestamp: helpers.formatTimestamp(new Date())
      };
    }
  },
  vars: {
    useCelsius: true  // User preference for temperature unit
  },
  helpers: {
    toCelsius: (f) => Math.round((f - 32) * 5/9),
    toFahrenheit: (c) => Math.round(c * 9/5 + 32),
    formatTimestamp: (date) => date.toLocaleString('en-US', { 
      timeZone: 'UTC',
      hour12: false 
    })
  }
});

// Call the method
const weather = await api.getCurrentWeather({ city: 'London' });
console.log(`${weather.city}: ${weather.temperature}°${weather.unit} at ${weather.timestamp}`);
```

## More API features: hooks

API methods can be made more configurable by adding hooks. Hooks allow you to intercept and modify behavior at specific points in your method execution. The `context` object is used to maintain state between hooks, allowing them to share data throughout the method's lifecycle.

```javascript
import { Api } from 'hooked-api';

const api = new Api({
  name: 'weather',
  version: '1.0.0',
  baseUrl: 'https://api.weather.com'
}, {
  apiMethods: {
    getCurrentWeather: async ({ params, apiOptions, vars, helpers, context, runHooks }) => {
      // The method has access to API options, vars, helpers, and can run hooks
      console.log(`Using API: ${apiOptions.name} v${apiOptions.version}`);

      // Initialize headers as an object (not array - headers are key-value pairs)
      context.headers = {};

      // Run the before-fetch hook which can add headers
      await runHooks('before-fetch', context);
      
      context.response = await fetch(`${apiOptions.baseUrl}/current/${params.city}`, {
        headers: context.headers
      });
      context.data = await context.response.json();
      
      // Run the after-fetch hook
      await runHooks('after-fetch', context);

      // Convert temperature based on user preference
      const temp = vars.useCelsius 
        ? context.data.fahrenheit ? helpers.toCelsius(context.data.fahrenheit) : context.data.celsius
        : context.data.fahrenheit || helpers.toFahrenheit(context.data.celsius);
      
      context.result = {
        city: params.city,
        temperature: temp,
        unit: vars.useCelsius ? 'C' : 'F',
        timestamp: helpers.formatTimestamp(new Date())
      };
      
      // Run the before-return hook
      await runHooks('before-return', context);
      
      return context.result;
    }
  },
  vars: {
    useCelsius: true  // User preference for temperature unit
  },
  helpers: {
    toCelsius: (f) => Math.round((f - 32) * 5/9),
    toFahrenheit: (c) => Math.round(c * 9/5 + 32),
    formatTimestamp: (date) => date.toLocaleString('en-US', { 
      timeZone: 'UTC',
      hour12: false 
    })
  },
  hooks: {
    'before-fetch': ({ context }) => {
      console.log('hook called: before-fetch()');
      // Hook adds headers that will be used in the fetch request
      context.headers['X-API-Version'] = '1.0';
      context.headers['X-Request-ID'] = Math.random().toString(36).substring(7);
    },
    'after-fetch': ({ context }) => {
      console.log('hook called: after-fetch()');
      console.log(`Fetched data for: ${context.data.city || 'Unknown city'}`);
    },
    'before-return': ({ context }) => {
      console.log('hook called: before-return()');
      // Hooks can modify the context
      context.result.cached = false;
    }
  }
});

// Call the method
const weather = await api.getCurrentWeather({ city: 'London' });
console.log(`${weather.city}: ${weather.temperature}°${weather.unit} at ${weather.timestamp}`);
// Output will include:
// hook called: before-fetch()
// hook called: after-fetch()
// Fetched data for: London
// hook called: before-return()
// London: 15°C at 12/27/2024, 18:30:00
```

## Scopes: Organizing Different Types of Data

As your API grows, you might need to handle different types of data with different structures. Scopes allow you to organize related endpoints that return different data formats. Let's expand our weather API to handle multiple data types:

```javascript
import { Api } from 'hooked-api';

// Define scopeMethods once - they're the same for all scopes
const weatherApi = new Api({ 
  name: 'weather-api', 
  version: '2.0.0' 
}, {
  // Define scope methods that work for ALL scopes
  scopeMethods: {
    get: async ({ params, context, scope, scopeOptions, runHooks }) => {
      // Generic fetch logic - same for all scopes
      context.requestParams = params;
      
      // Run scope-specific validation
      await runHooks('validate-request', context);
      
      // Fetch data (in real app, this would hit different endpoints based on scope)
      const response = await fetch(`${scopeOptions.endpoint}?city=${params.city}`);
      context.rawData = await response.json();
      
      // Transform data using scope-specific hooks
      await runHooks('transform-data', context);
      
      // Format for display using scope-specific hooks
      await runHooks('format-response', context);
      
      return context.formattedData;
    }
  },
  helpers: {
    celsiusToFahrenheit: (c) => Math.round(c * 9/5 + 32),
    formatDate: (date) => new Date(date).toLocaleDateString()
  }
});

// Add "current" scope for real-time weather
weatherApi.addScope('current', {
  endpoint: '/current',
  ttl: 300  // Cache for 5 minutes
}, {
  hooks: {
    'validate-request': ({ context, params }) => {
      if (!params.city) throw new Error('City is required for current weather');
    },
    'transform-data': ({ context }) => {
      // Transform raw data into current weather format
      context.transformedData = {
        city: context.rawData.name,
        temperature: Math.round(context.rawData.main.temp),
        humidity: context.rawData.main.humidity,
        windSpeed: context.rawData.wind.speed,
        conditions: context.rawData.weather[0].main.toLowerCase()
      };
    },
    'format-response': ({ context }) => {
      // Format for display
      context.formattedData = {
        ...context.transformedData,
        timestamp: new Date().toISOString(),
        display: `${context.transformedData.temperature}°F - ${context.transformedData.conditions}`
      };
    }
  }
});

// Add "forecast" scope for future predictions
weatherApi.addScope('forecast', {
  endpoint: '/forecast',
  ttl: 3600  // Cache for 1 hour
}, {
  helpers: {
    // Forecast-specific helper
    getDayName: (date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date).getDay()]
  },
  hooks: {
    'validate-request': ({ context, params }) => {
      if (!params.city) throw new Error('City is required for forecast');
      if (params.days && params.days > 7) {
        throw new Error('Forecast limited to 7 days');
      }
    },
    'transform-data': ({ context, params, helpers }) => {
      // Transform raw data into forecast format - completely different structure
      const days = params.days || 5;
      const forecasts = context.rawData.list.slice(0, days).map(item => ({
        date: helpers.formatDate(new Date(item.dt * 1000)),
        dayName: helpers.getDayName(new Date(item.dt * 1000)),
        high: Math.round(item.main.temp_max),
        low: Math.round(item.main.temp_min),
        conditions: item.weather[0].main.toLowerCase(),
        precipChance: (item.pop || 0) * 100
      }));
      
      context.transformedData = {
        city: context.rawData.city.name,
        days: days,
        forecasts: forecasts
      };
    },
    'format-response': ({ context }) => {
      // Format for display
      context.formattedData = {
        ...context.transformedData,
        summary: `${context.transformedData.days}-day forecast for ${context.transformedData.city}`
      };
    }
  }
});


// Usage - same method call, different data structures returned
const current = await weatherApi.scopes.current.get({ city: 'NYC' });
console.log(`Current: ${current.display}`);
// Returns: { temperature: 72, humidity: 65, windSpeed: 12, conditions: 'partly cloudy', ... }

const forecast = await weatherApi.scopes.forecast.get({ city: 'NYC', days: 3 });
console.log(`Forecast: ${forecast.summary}`);
// Returns: { forecasts: [...], days: 3, city: 'NYC', ... }
```

Notice how:
- The `get` method is defined once in `scopeMethods` and works the same for all scopes
- Each scope uses **hooks** to customize validation, data transformation, and formatting
- Each scope returns completely different data structures despite using the same method

## Scope Methods: Shared Functionality Across Scopes

The power of scopes comes from having consistent methods across all scopes while using hooks to customize behavior. Here's the same weather API example from above, but with validation added:

```javascript
// Create API with scope methods defined upfront
const weatherApi = new Api({ 
  name: 'weather-api', 
  version: '2.0.0' 
}, {
  // Define scope methods that work for ALL scopes
  scopeMethods: {
    validate: async ({ params, context, runHooks }) => {
      context = context || {};
      context.params = params;
      context.errors = [];
      
      // Run scope-specific validation via hooks
      await runHooks('before-validate', context);
      await runHooks('validate', context);
      await runHooks('after-validate', context);
      
      if (context.errors.length > 0) {
        throw new Error(`Validation failed: ${context.errors.join(', ')}`);
      }
      
      return 'all good';
    },
    
    get: async ({ params, context, scope, scopeOptions, runHooks }) => {
      context.requestParams = params;
      
      // Call the validate method on the current scope
      await scope.validate(params);
      
      // Run scope-specific validation (could also be done in validate method)
      await runHooks('validate-request', context);
      
      // Fetch data (in real app, this would hit different endpoints based on scope)
      const response = await fetch(`${scopeOptions.endpoint}?city=${params.city}`);
      context.rawData = await response.json();
      
      // Transform data using scope-specific hooks
      await runHooks('transform-data', context);
      
      // Format for display using scope-specific hooks
      await runHooks('format-response', context);
      
      return context.formattedData;
    }
  },
  helpers: {
    celsiusToFahrenheit: (c) => Math.round(c * 9/5 + 32),
    formatDate: (date) => new Date(date).toLocaleDateString()
  }
});

// Add "current" scope for real-time weather
weatherApi.addScope('current', {
  endpoint: '/current',
  ttl: 300  // Cache for 5 minutes
}, {
  hooks: {
    'validate': ({ context, params }) => {
      if (!params.city) {
        context.errors.push('City is required for current weather');
      }
      if (params.city && params.city.length < 2) {
        context.errors.push('City name must be at least 2 characters');
      }
    },
    'validate-request': ({ context, params }) => {
      if (!params.city) throw new Error('City is required for current weather');
    },
    'transform-data': ({ context }) => {
      // Transform raw data into current weather format
      context.transformedData = {
        city: context.rawData.name,
        temperature: Math.round(context.rawData.main.temp),
        humidity: context.rawData.main.humidity,
        windSpeed: context.rawData.wind.speed,
        conditions: context.rawData.weather[0].main.toLowerCase()
      };
    },
    'format-response': ({ context }) => {
      // Format for display
      context.formattedData = {
        ...context.transformedData,
        timestamp: new Date().toISOString(),
        display: `${context.transformedData.temperature}°F - ${context.transformedData.conditions}`
      };
    }
  }
});

// Add "forecast" scope for future predictions  
weatherApi.addScope('forecast', {
  endpoint: '/forecast',
  ttl: 3600  // Cache for 1 hour
}, {
  helpers: {
    // Forecast-specific helper
    getDayName: (date) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(date).getDay()]
  },
  hooks: {
    'validate': ({ context, params }) => {
      if (!params.city) {
        context.errors.push('City is required for forecast');
      }
      if (params.days && (params.days < 1 || params.days > 7)) {
        context.errors.push('Days must be between 1 and 7');
      }
    },
    'validate-request': ({ context, params }) => {
      if (!params.city) throw new Error('City is required for forecast');
      if (params.days && params.days > 7) {
        throw new Error('Forecast limited to 7 days');
      }
    },
    'transform-data': ({ context, params, helpers }) => {
      // Transform raw data into forecast format - completely different structure
      const days = params.days || 5;
      const forecasts = context.rawData.list.slice(0, days).map(item => ({
        date: helpers.formatDate(new Date(item.dt * 1000)),
        dayName: helpers.getDayName(new Date(item.dt * 1000)),
        high: Math.round(item.main.temp_max),
        low: Math.round(item.main.temp_min),
        conditions: item.weather[0].main.toLowerCase(),
        precipChance: (item.pop || 0) * 100
      }));
      
      context.transformedData = {
        city: context.rawData.city.name,
        days: days,
        forecasts: forecasts
      };
    },
    'format-response': ({ context }) => {
      // Format for display
      context.formattedData = {
        ...context.transformedData,
        summary: `${context.transformedData.days}-day forecast for ${context.transformedData.city}`
      };
    }
  }
});
    
    list: async ({ params, context, scope, scopeOptions, runHooks }) => {
      context.params = params;
      
      // Apply filters
      await runHooks('apply-filters', context);
      
      // Fetch collection
      const response = await fetch(`${scopeOptions.endpoint}?${new URLSearchParams(context.filters || params)}`);
      context.items = await response.json();
      
      // Format items
      await runHooks('format-items', context);
      
      return context.items;
    },
    
  }
});

// Now add scopes with their specific hooks
weatherApi.addScope('current', {
  endpoint: 'https://api.weather.com/current'
}, {
  hooks: {
    'validate': ({ context, params }) => {
      if (!params.city) context.errors.push('City is required');
    },
    'after-fetch': ({ context }) => {
      // Transform to current weather format
      context.result = {
        temperature: context.data.temp,
        conditions: context.data.weather[0].description,
        timestamp: new Date().toISOString()
      };
    }
  }
});

weatherApi.addScope('alerts', {
  endpoint: 'https://api.weather.com/alerts'
}, {
  hooks: {
    'apply-filters': ({ context, params }) => {
      // Alerts have different filter logic
      context.filters = {
        ...params,
        severity: params.severity || 'all',
        active: true
      };
    },
    'format-items': ({ context }) => {
      // Format alert items differently
      context.items = context.items.map(alert => ({
        id: alert.id,
        type: alert.event,
        severity: alert.severity,
        areas: alert.affected_zones,
        expires: new Date(alert.expires).toLocaleString()
      }));
    }
  }
});

// Same methods, different behavior
const weather = await weatherApi.scopes.current.get({ city: 'NYC' });
// Returns: { temperature: 72, conditions: 'clear', timestamp: '...' }

const alerts = await weatherApi.scopes.alerts.list({ city: 'NYC', severity: 'severe' });
// Returns: [{ id: 1, type: 'tornado', severity: 'severe', ... }]
```

This pattern is particularly powerful for database-like APIs where:
- All tables use the same CRUD methods (`get`, `create`, `update`, `delete`, `list`)
- Each table has different validation rules, relationships, and formatting needs
- Hooks handle the table-specific logic

**Calling scope methods from other scope methods**: Scope methods can call other methods on the current scope directly using `scope.methodName()`. To call methods on other scopes, use `scopes[otherScopeName].methodName()` or the alias if one is set.

## Scope Aliases

You can create custom aliases for the `scope` property to make your API more domain-specific:

```javascript
const dbApi = new Api({ name: 'database', version: '1.0.0' }, {
  scopeMethods: {
    find: async ({ params, context, scope, scopes, scopeName, table }) => {
      // When alias is set, handlers receive it as a named parameter!
      // 'table' is the same as 'scopes' - the collection of all scopes
      console.log(scopes === table); // true
      
      // 'scope' is the current scope object (e.g., dbApi.scopes.users)
      // You can call methods directly on it:
      await scope.validate(params);
      
      // Access other scopes via the alias
      if (params.related) {
        return await table[params.related].find({ userId: params.id });
      }
      
      return `Finding in ${scopeName} where id = ${params.id}`;
    },
    
    validate: async ({ params, context, runHooks }) => {
      // Validation logic
      return true;
    }
  }
});

// Create an alias "table" that points to "scopes"
dbApi.setScopeAlias('table');

// Add database tables as scopes
dbApi.addScope('users', { tableName: 'app_users' });
dbApi.addScope('products', { tableName: 'products' });
dbApi.addScope('orders', { tableName: 'orders' });

// Now you can use either syntax:
await dbApi.scopes.users.find({ id: 123 });      // Original syntax
await dbApi.table.users.find({ id: 123 });      // Alias syntax - more intuitive for database

// And inside methods, you get the alias as a parameter
await dbApi.table.users.find({ id: 123, related: 'orders' });
// The handler can use 'table' parameter instead of 'scope'
```

## Public API Surface

The API instance exposes only these public properties and methods:

- `api.use(plugin, options)` - Install plugins
- `api.customize(config)` - Add hooks, methods, vars, and helpers
- `api.addScope(name, options, extras)` - Add scopes with configuration
- `api.setScopeAlias(name)` - Create an alias for the scopes property
- `api.scopes` - Access to defined scopes (e.g., `api.scopes.users.get()`)
- `api.methodName()` - Direct calls to defined API methods
- `api.[aliasName]` - If setScopeAlias was called (e.g., `api.table` for database APIs)

All internal state is hidden behind underscore-prefixed properties (`_hooks`, `_vars`, etc.) to keep the API surface clean.

## Basic API Creation

Example of the most basic usage:

```javascript
import { Api } from 'hooked-api';

// Create a versioned API with methods defined inline
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
}, {
  // You can define methods, vars, helpers, hooks, and scopeMethods as the second parameter
  apiMethods: {
    fetch: async ({ params, context, vars, helpers, scope, runHooks, apiOptions, pluginOptions }) => {
      // Note: global methods do NOT receive 'scope' parameter or 'scopeOptions' parameters
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
  // Define scope methods that will be available to all scopes
  scopeMethods: {
    validate: async ({ params, context, scope, scopeOptions, runHooks }) => {
      context = context || {};
      context.errors = [];
      
      // Run scope-specific validation hooks
      await runHooks('validate', context);
      
      if (context.errors.length > 0) {
        throw new Error(`Validation failed: ${context.errors.join(', ')}`);
      }
      
      return true;
    },
    
    get: async ({ params, context, scope, scopes, scopeOptions, runHooks, scopeName }) => {
      // This method will be available on all scopes: api.scopes.users.get(), api.scopes.posts.get(), etc.
      context = context || {};
      
      // Call validate method - now with clean syntax!
      await scope.validate(params);
      
      await runHooks('before-get', context);
      const result = await fetch(`${scopeOptions.endpoint}/${params.id}`);
      context.data = await result.json();
      await runHooks('after-get', context);
      return context.data;
    },
    
    list: async ({ params, context, scope, scopes, scopeOptions, runHooks, scopeName }) => {
      // Another method available to all scopes
      context = context || {};
      
      // Validate list parameters
      await scope.validate(params);
      
      await runHooks('before-list', context);
      const result = await fetch(scopeOptions.endpoint);
      context.items = await result.json();
      await runHooks('after-list', context);
      return context.items;
    }
  },
  vars: {
    TIMEOUT: 5000
  }
});

// You can also use customize() to add more methods later
api.customize({
  apiMethods: {
    processData: async ({ params }) => {
      // Process the data
      return params.data.map(item => item.toUpperCase());
    }
  },
  helpers: {
    formatDate: (date) => new Date(date).toLocaleDateString()
  }
});

// Define scope methods (only callable on scopes)
api.customize({
  scopeMethods: {
    list: async ({ params, context, vars, helpers, scope, runHooks, apiOptions, pluginOptions, scopeOptions, scope }) => {
      // Scope methods always receive 'scope' and 'scopeOptions' parameters
      return `Listing items from scope: ${scope}`;
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
    fetch: async ({ params, context, vars, helpers, scope, runHooks, apiOptions, pluginOptions }) => {
      context.headers = {}
      
      await runHooks('beforeFetching', context)
      
      const response = await fetch('https://example.com', {
        timeout: vars.TIMEOUT,
        headers: context.headers
      });
      
      context.response = response;
      await runHooks('afterFetching', context)
      
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
  install: ({ addApiMethod, addScopeMethod, addHook, vars, helpers, apiOptions, pluginOptions }) => {
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
    
    // Add scope method
    addScopeMethod('fetchFromScope', async ({ params, scope, scopeOptions }) => {
      // This method includes scope context
      const url = scopeOptions?.url || 'https://example.com';
      return `Fetching from ${scope} at ${url}`;
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




## API Methods vs Scope Methods

Hooked API distinguishes between two types of methods:

1. **API Methods** - Global methods callable directly on the API instance
2. **Scope Methods** - Methods that can only be called on scopes

### API Methods
```javascript
// Define a global API method (only available through customize())
api.customize({
  apiMethods: {
    globalFetch: async ({ params, context, vars, helpers }) => {
      // No 'scope' parameter in global methods
      return `Fetching ${params.url}`;
    }
  }
});

// Call it directly on the API
const result = await api.globalFetch({ url: 'https://example.com' });
```

### Scope Methods
```javascript
// Define a scope method (only available through customize())
api.customize({
  scopeMethods: {
    list: async ({ params, scope, vars, scopeOptions }) => {
      // Scope methods always receive 'scope' and 'scopeOptions' parameters
      return `Listing ${scope} with limit: ${params.limit || 10}`;
    }
  }
});

// Add a scope through a plugin
const userScopePlugin = {
  name: 'userScope',
  install: ({ addScope }) => {
    addScope('users');
  }
};
api.use(userScopePlugin);

// Call the scope method
const users = await api.scopes.users.list({ limit: 5 });
// Returns: "Listing users with limit: 5"

// Scope methods are NOT available on the main API
api.list(); // This will throw an error!
```

## Scopes

Scopes allow you to configure different endpoints or services with their own settings. Scopes can have:
- Their own configuration options
- Scope-specific method implementations
- Custom vars and helpers that override the global ones

```javascript
// Create API with the base plugin
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

// Plugin that adds scope-specific fetching
const flexibleFetchPlugin = {
  name: 'flexibleFetch',
  install: ({ addScopeMethod, addHook, vars, apiOptions, pluginOptions }) => {
    // Add base vars
    vars.TIMEOUT = 5000;
    
    // Add scope method that uses scope options
    addScopeMethod('fetch', async ({ params, scope, context, vars, runHooks, scopeOptions }) => {
      context.headers = {}

      await runHooks('beforeFetching', context)
      
      // Use URL from scope options, or default to example.com
      const url = scopeOptions?.url || 'https://example.com';
      
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
        scope: scope
      };
    });
    
    // Add hooks
    addHook('beforeFetching', 'logStart', ({ context, scope }) => {
      console.log(`Starting fetch operation for scope: ${scope || 'default'}...`);
    });
    
    addHook('afterFetching', 'logComplete', ({ context, scope }) => {
      console.log(`Fetch completed for ${scope || 'default'} with status: ${context.response?.status}`);
    });
  }
};

// Use the flexible plugin
api.use(flexibleFetchPlugin);

// Add scopes for different sites
const scopePlugin = {
  name: 'multiScope',
  install: ({ addScope }) => {
    addScope('github', {
      url: 'https://api.github.com'
    }, {
      vars: {
        TIMEOUT: 10000  // Override timeout for GitHub
      }
    });

    addScope('jsonplaceholder', {
      url: 'https://jsonplaceholder.typicode.com/posts'
    });

    addScope('weather', {
      url: 'https://api.weatherapi.com/v1/current.json'
    }, {
      hooks: {
        beforeFetching: ({ context }) => {
          console.log('Weather API request starting - remember to add API key!');
        }
      }
    });
  }
};

api.use(scopePlugin);

// Now you can fetch from different sites using scopes
const githubData = await api.scopes.github.fetch();
console.log('GitHub response:', githubData.source); // https://api.github.com

const posts = await api.scopes.jsonplaceholder.fetch();
console.log('Posts response:', posts.source); // https://jsonplaceholder.typicode.com/posts

const weather = await api.scopes.weather.fetch();
console.log('Weather response:', weather.source); // https://api.weatherapi.com/v1/current.json

// Direct api.fetch() won't work because fetch is now a scope method
api.fetch; // undefined - scope methods aren't available on the main API
```

Each scope can have its own:
- Configuration options (like URL, API keys, etc.)
- Vars that override the base API vars
- Hooks that run only for that specific scope
- scopeMethods that override the base scopeMethods

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

### 3. Scope Options
These are options specific to each scope:
```javascript
// Add scope through a plugin:
const userPlugin = {
  name: 'userPlugin',
  install: ({ addScope }) => {
    addScope('users', {
      url: 'https://api.example.com/users',
      rateLimit: 100
    });
  }
};
api.use(userPlugin);

// Scope options are available in scope methods:
api.customize({
  scopeMethods: {
    fetch: ({ scopeOptions }) => {
      console.log(scopeOptions.url);       // 'https://api.example.com/users'
      console.log(scopeOptions.rateLimit); // 100
    }
  }
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
const orderedPlugin = {
  name: 'myPlugin',
  install: ({ addHook }) => {
    addHook('beforeFetch', 'validate', 
      { beforePlugin: 'auth' },     // Run before all 'auth' plugin hooks
      ({ context }) => {
        // Validation logic
      }
    );
    
    addHook('beforeFetch', 'log',
      { afterFunction: 'validate' }, // Run after the 'validate' function
      ({ context }) => {
        // Logging logic
      }
    );
  }
};

api.use(orderedPlugin);
```

### Plugin Dependencies
```javascript
const advancedPlugin = {
  name: 'advanced',
  dependencies: ['auth', 'logging'], // Requires these plugins first
  install: ({ addApiMethod, addScopeMethod, addHook, vars, helpers, apiOptions, pluginOptions }) => {
    // Can rely on auth and logging being available
  }
};
```

### Hook Chain Control
```javascript
api.customize({
  hooks: {
    beforeFetch: {
      handler: ({ context }) => {
        if (!context.authorized) {
          console.log('Access denied - stopping hook chain');
          return false; // Stops all subsequent hooks
        }
      },
      functionName: 'checkAccess'
    }
  }
});
```

### Handler Context Full Structure

#### Global API Methods
```javascript
// Handler signature for global API methods:
({ 
  params,         // Parameters passed to the method call
  context,        // Mutable object for passing data between hooks
  vars,           // Variables proxy
  helpers,        // Helpers proxy
  scope,          // null (no current scope for global methods)
  scopes,         // Access to all scopes (api.scopes)
  runHooks,       // Function to run hooks
  name,           // The method name ('method' in this case)
  apiOptions,     // Frozen API configuration
  pluginOptions,  // Frozen plugin configurations
  // If setScopeAlias was called:
  [aliasName]     // Same as 'scopes' but with custom name (e.g., 'tables')
}) => {
  // Global methods receive scopes proxy but no current scope
});
```

#### Scope Methods
```javascript
// Handler signature for scope methods:
({ 
  params,          // Parameters passed to the method call
  context,         // Mutable object for passing data between hooks
  vars,            // Variables proxy (merged with scope vars)
  helpers,         // Helpers proxy (merged with scope helpers)
  scope,           // Current scope object (e.g., api.scopes.users when in 'users' scope)
  scopes,          // All scopes proxy (api.scopes)
  runHooks,        // Function to run hooks
  name,            // The method name ('method' in this case)
  apiOptions,      // Frozen API configuration
  pluginOptions,   // Frozen plugin configurations
  scopeOptions,    // Frozen scope-specific options
  scopeName,       // Current scope name as string
  // If setScopeAlias was called:
  [aliasName]      // Same as 'scopes' but with custom name (e.g., 'tables')
}) => {
  // Scope methods can call other methods on the current scope directly:
  // await scope.validate(params)
});

// Example with alias:
api.setScopeAlias('table');
// Now handlers also receive 'table' parameter:
({ params, scope, scopes, scopeName, table }) => {
  // scope = current scope object (e.g., api.scopes.users)
  // scopes = all scopes proxy (api.scopes) 
  // table = same as scopes (alias for api.scopes)
  
  // Clean syntax:
  await scope.validate(params);  // Validate current scope
  await table.orders.get({ userId: params.id });  // Access other scopes via alias
}
```

#### Hook Handlers
```javascript
// Hook handler signature (when added via plugin or customize):
({ 
  params,          // Empty object for hooks
  context,         // The context object passed to runHooks
  vars,            // Variables (scope-aware if hook run with scope)
  helpers,         // Helpers (scope-aware if hook run with scope)
  scope,           // Current scope object if hook run in scope context, null otherwise
  scopes,          // All scopes proxy (api.scopes)
  runHooks,        // Function to run hooks (careful of recursion!)
  name,            // Hook name
  apiOptions,      // Frozen API configuration
  pluginOptions,   // Frozen plugin configurations
  scopeOptions,    // Frozen scope options (only if hook run with scope)
  scopeName,       // Scope name or null
  // If setScopeAlias was called:
  [aliasName]      // Same as 'scopes' but with custom name
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
    addScopeMethod,     // Define scope methods
    addScope,           // Add scopes
    setScopeAlias,      // Create scope alias
    addHook,            // Add hooks (with plugin name auto-injected)
    runHooks,           // Run hooks
    vars,               // Variables proxy
    helpers,            // Helpers proxy
    scope,              // Access to scopes
    name,               // Plugin name
    apiOptions,         // Frozen API configuration
    pluginOptions,      // Frozen plugin configurations
    context             // Empty context object
  }) => {
    // Plugin installation logic
  }
};
```

### Plugin Options Storage
```javascript
api.use(myPlugin, { apiKey: 'secret', timeout: 3000 });

// Inside the plugin install function:
install: ({ pluginOptions }) => {
  const myOptions = pluginOptions.myPlugin; // { apiKey: 'secret', timeout: 3000 }
}

// Inside handlers:
api.customize({
  apiMethods: {
    method: ({ pluginOptions }) => {
      const myOptions = pluginOptions.myPlugin; // { apiKey: 'secret', timeout: 3000 }
    }
  }
})
```

### Scope-Specific Method Implementations
```javascript
const specialScopePlugin = {
  name: 'specialScope',
  install: ({ addScope }) => {
    addScope('special', { url: 'https://special.api.com' }, {
      scopeMethods: {
        fetch: async ({ params, scope, scopeOptions }) => {
          // This fetch only runs for api.scopes.special.fetch()
          // Overrides the global scope method 'fetch'
          return `Special fetch for ${scope} at ${scopeOptions.url}`;
        },
        customMethod: async ({ params, scope }) => {
          // Scope-specific method not defined globally
          return `Custom method only for ${scope}`;
        }
      }
    });
  }
};

api.use(specialScopePlugin);

// These work:
await api.scopes.special.fetch(); // Uses special implementation
await api.scopes.special.customMethod(); // Uses scope-specific method

// This won't work:
await api.fetch(); // Error - fetch is a scope method, not an API method
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

