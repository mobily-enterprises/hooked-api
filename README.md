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

The API instance exposes only these public properties and methods:

- `api.use(plugin, options)` - Install plugins
- `api.customize(config)` - Add hooks, methods, vars, and helpers
- `api.addScope(name, options, extras)` - Add scopes with configuration
- `api.setScopeAlias(name)` - Create an alias for the scopes property
- `api.scopes` - Access to defined scopes (e.g., `api.scopes.users.get()`)
- `api.[aliasName]` - If setScopeAlias was called (e.g., `api.tables` for database APIs)
- `api.methodName()` - Direct calls to defined API methods


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
  scope,           // Current scope object (e.g., api.scopes.users when in 'authors' scope)
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
    scopes,             // Access to scopes
    name,               // Plugin name
    apiOptions,         // Frozen API configuration
    pluginOptions,      // Frozen plugin configurations
    context             // Empty context object
  }) => {
    // Plugin installation logic
  }
};
```

### Testing Utility

```javascript
import { resetGlobalRegistryForTesting } from 'hooked-api';

// In tests, clear all registered APIs
beforeEach(() => {
  resetGlobalRegistryForTesting();
});
```

