# Hooked API

A clean, extensible API framework with scopes, hooks, and plugins.

## Plugin architecture

```Javascript
const api = new Api()

```


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
      
      const response = await fetch(`${apiOptions.baseUrl}/currentWeather/${params.city}`);
      return response.json();
    }
  }
});

// Call the method
const weather = await api.getCurrentWeather({ city: 'London' });
```

Anything defined in apiMethods will be automatically available as an API method.
Of course, you could do this by just plain Javascript:

```javascript
const api = {
    getCurrentWeather: async ({ params, apiOptions }) => {
       ...
    }
}
```

But you would miss out on all of the magic that this library offers.


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
      
      const response = await fetch(`${apiOptions.baseUrl}/currentWeather/${params.city}`, { timeout: vars.timeout });
      const data = await response.json();
      
      // Convert temperature based on user preference
      const temp = data.temperature
      
      return {
        city: params.city,
        temperature: temp,
        timestamp: helpers.formatTimestamp(new Date())
      };
    }
  },
  vars: {
    timeout: 10000
  },
  helpers: {
    formatTimestamp: (date) => date.toLocaleString('en-US', {  timeZone: 'UTC', hour12: false  })
  }
});

// Call the method
const weather = await api.getCurrentWeather({ city: 'London' });
console.log(`${weather.city}: ${weather.temperature}° at ${weather.timestamp}`);
```

As you can see, you can create variables (`vars`) and helpers (`helpers`) when you create the API, and you are able to
use those in the functions defined in `apiMethods`.

Again, nothing that cannot be done in plain Javascript.

## More API features: hooks

API methods can be made more configurable by adding hooks. Hooks allow you to intercept and modify behavior at specific points in your method execution. The `context` object is used to maintain state between hooks, allowing them to share data throughout the method's lifecycle.

Here is an example of how to improve this library providing hooks:

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

      // Initialize headers as an object (not array - headers are key-value pairs)
      context.headers = {};

      // Run the before-fetch hook which can add headers
      await runHooks('before-fetch', context);

      // Actually make the request, place the result in the context for other hooks to see
      context.response = await fetch(`${apiOptions.baseUrl}/currentWeather/${params.city}`, {
        headers: context.headers,
        timeout: vars.timeout
      });
      context.data = await context.response.json();
     
      // Run the after-fetch hook
      await runHooks('after-fetch', context);

      // Convert temperature based on user preference
      const temp = data.temperature
      
      return {
        city: params.city,
        temperature: temp,
        timestamp: helpers.formatTimestamp(new Date())
      };
    }
  },
  vars: {
    timeout: 10000
  },
  helpers: {
    formatTimestamp: (date) => date.toLocaleString('en-US', {  timeZone: 'UTC', hour12: false  })
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
console.log(`${weather.city}: ${weather.temperature}° at ${weather.timestamp}`);
```


Again, you might be wondering why you would provide hooks to your own library, since
we are configuring them ourselves.

## Scopes: Organizing Different Types of Data

As your API grows, you might need to handle different types of data with different structures. Scopes allow you to organize related endpoints that return different data formats.

Note that each endpoint will return different data.

If this were a database, the table would be 

Here is an example. Note how 'get' is now a `scopeMethod` rather than an `apiMethod`. This means that it will be
available under api.scope.get() rather than api.get()

```javascript
import { Api } from 'hooked-api';

// Define scopeMethods once - they're the same for all scopes
const weatherApi = new Api({ 
  name: 'weather-api', 
  version: '2.0.0',
  baseUrl: 'https://api.weather.com'
}, {
  
  // NOTE: This is scopeMethods, NOT apiMeethods
  scopeMethods: {
    get: async ({ params, apiOptions, vars, scope, helpers, context, runHooks, scopeOptions }) => {
      
      // Initialize headers as an object (not array - headers are key-value pairs)
      context.headers = {};

      // All scopes will have to access to scope.validate()
      if (!scope.validate()) {
        throw new Error('Validation error')
      }

      // Run the before-fetch hook which can add headers
      await runHooks('before-fetch', context)

      // Actually make the request; the URL will depend on the scope
      context.response = await fetch(`${apiOptions.baseUrl}/${scopeOptions.endpoint}/${params.city}`, {
        headers: context.headers,
        timeout: vars.timeout
      })
      context.data = await context.response.json()

      // Format for display using scope-specific hooks
      await runHooks('format-response', context)
      
      return context.formattedData
    },

    validate: async ({ params, apiOptions, vars, helpers }) => {
      return true
    },
  },

  vars: {
    timeout: 10000
  },

  helpers: {
    formatTimestamp: (date) => date.toLocaleString('en-US', {  timeZone: 'UTC', hour12: false  })
  },

});

// Add "current" scope for real-time weather
weatherApi.addScope('current', {
  endpoint: '/current',
}, {
  hooks: {
    'before-fetch': ({ context, params }) => {
      if (!params.city) throw new Error('City is required for current weather');
    },
    'format-response': ({ context }) => {
      // Format for display
      context.formattedData = {
        title: "Today's temperature",
        ...context.data,
        timestamp: new Date().toISOString(),
        display: `${context.transformedData.temperature}° - ${context.transformedData.conditions}`
      };
    }
  },
  scopeMethods: {
    validate() {
      // Validate will randomly fail
      return Math.random() * 10 < 5   
    }
  }
});

// Add "current" scope for real-time weather
weatherApi.addScope('forecast', {
  endpoint: '/forecast',
}, {
  hooks: {
    'before-fecth': ({ context, params }) => {
      if (!params.city) throw new Error('City is required for current weather');
    },
    'format-response': ({ context }) => {
      // Format for display
      context.formattedData = {
        ...context.data,
        title: "Weather forecast",
        timestamp: new Date().toISOString(),
        display: `Day 1: ${context.transformedData.day1}°\nDay 2: ${context.transformedData.day2}°\n`
      };
    }
  }
  // here validate() is not set for scopeMethods
});


// Usage - same method call, different data structures returned
const current = await weatherApi.scopes.current.get({ city: 'NYC' });
console.log(`Current: ${current.display}`);
// Returns: { temperature: 72, humidity: 65, windSpeed: 12, conditions: 'partly cloudy', ... }

const forecast = await weatherApi.scopes.forecast.get({ city: 'NYC'});
console.log(`Forecast: ${forecast.summary}`);
// Returns: { forecasts: [...], days: 3, city: 'NYC', ... }
```

Notice how:
- The `get` method is defined once in `scopeMethods` and works the same for all scopes
- Each scope uses **hooks** to customize validation, data transformation, and formatting
- Each scope returns completely different data structures despite using the same method
- Scope methods can call other scope methods. In this particular example, validate() will
  fail randomly for the /current scope.

## Scope Aliases

You can create custom aliases for the `scope` property to make your API more domain-specific:

```javascript
import { Api } from 'hooked-api';

// Define scopeMethods once - they're the same for all scopes
const weatherApi = new Api({...})

// (...)

// Create an alias "table" that points to "scopes"
dbApi.setScopeAlias('info');

// You can use "info" instead of "scopes"
const current = await weatherApi.info.current.get({ city: 'NYC' });
```

## Plugins

Plugins are what make this library actually useful and demonstrate its true extensibility. They allow you to bundle reusable functionalities (API methods, scope methods, hooks, vars, helpers, and even new scopes) into self-contained modules that can be easily added to any Api instance. This promotes code reuse, separation of concerns, and simplifies the development of complex API behaviors.

Imagine you want to add a logging mechanism, authentication features, or a specialized data transformation pipeline that can be applied across different API instances without rewriting the code. That's where plugins shine.

This is the weather code seen above, turned into a plugin.

```Javascript
// weatherCorePlugin.js
const weatherCorePlugin = {
  name: 'weatherCore',
  
  dependencies: [], // This plugin stands alone
  
  install: ({ addScopeMethod, addScope, vars, helpers, name: pluginName, apiOptions }) => {
    console.log(`[${pluginName}] Installing core weather functionalities.`);
    console.log(`[${pluginName}] Base URL for API: ${apiOptions.baseUrl}`);

    // Define common scope methods (like 'get' and 'validate') once
    addScopeMethod('get', async ({ params, apiOptions, vars, scope, helpers, context, runHooks, scopeOptions }) => {
      // Initialize headers as an object (not array - headers are key-value pairs)
      context.headers = {};

      if (!scope.validate()) {
        throw new Error('Validation error')
      }

      // Run the before-fetch hook which can add headers
      await runHooks('before-fetch', context);

      // Actually make the request; the URL will depend on the scope
      context.response = await fetch(`${apiOptions.baseUrl}/${scopeOptions.endpoint}/${params.city}`, { 
        headers: context.headers,
        timeout: vars.timeout
      });
      context.data = await context.response.json();

      // Format for display using scope-specific hooks
      await runHooks('format-response', context);
      
      return context.formattedData;
    });


    addScopeMethod('validate', async ({ params, apiOptions, vars, helpers }) => {
      return true
    })

    // Vars and helpers
    vars.timeout = 10000
    helpers.formatTimestamp = (date) => date.toLocaleString('en-US', {  timeZone: 'UTC', hour12: false  })
  },
};



export default weatherCorePlugin;
```

## Making a pre-plugged Api class

Most of the time (in fact, probably all of the time) you will want to distibute a ready-to-go class with a
plugin pre-packaged in it.
Here is what you do:

```Javascript
// ExtendedApi.js
import 'weatherCorePlugin' from './weatherCorePlugin.js' 
import { Api } from './Api.js'; // Adjust the path to your Api class

class ExtendedApi extends Api {

  constructor(apiOptions = {}, customizeOptions = {}) {
    
    // This will add the API to the registry
    super(apiOptions);

    // Use the core plugin by default
    this.use(weatherCorePlugin)

    // NOW, after setting all of the defaults, apply user-provided customizeOptions.
    // These will override any default customizations if keys conflict,
    this.customize(customizeOptions);
  }
}

export default ExtendedApi;
```

To use it:

```Javascript
import ExtendedApi from './ExtendedApi,js'

const api = new ExtendedApi({
  name: 'api',
  version: '1.0.0',
  baseUrl: 'https://example.com/'
})


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


## Basic API Creation

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

### Testing Utility

```javascript
import { resetGlobalRegistryForTesting } from 'hooked-api';

// In tests, clear all registered APIs
beforeEach(() => {
  resetGlobalRegistryForTesting();
});
```

