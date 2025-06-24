# Hooked API

A clean, extensible API framework with resources, hooks, and plugins.

## Basic API Creation

```javascript
import { Api } from 'hooked-api';

// Create a versioned API
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});
```

## Creating a Database Plugin

```javascript
const DatabasePlugin = {
  name: 'database',
  install({ api }) {
    // Add base implementations
    api.implement('get', async ({ params, resource, api }) => {
      const schema = params.schema;
      
      // Run validation hooks
      let context = { schema, resource };
      context = await api.runHooks('beforeValidate', context, resource);
      // ...Check the record using the schema...
      context = await api.runHooks('afterValidate', context, resource);
      
      // Run get hooks
      context = await api.runHooks('beforeGet', context, resource);
      
      // Simulate DB fetch
      const record = {
        id: Math.floor(Math.random() * 1000),
        resource: resource,
        data: { sample: 'data' }
      };
      context.record = record;
      
      context = await api.runHooks('afterGet', context, resource);
      
      // Send hooks
      context = await api.runHooks('beforeSend', context, resource);
      
      return context.record;
    });
    
    api.implement('query', async ({ params, resource, api }) => {
      const schema = params.schema;
      
      // Run validation hooks
      let context = { schema, resource, filters: params.filters || {} };
      context = await api.runHooks('beforeValidate', context, resource);
      // ...Check the query using the schema...
      context = await api.runHooks('afterValidate', context, resource);
      
      // Run query hooks
      context = await api.runHooks('beforeQuery', context, resource);
      
      // Simulate DB query
      const records = [
        { id: 1, resource: resource, data: { index: 0 } },
        { id: 2, resource: resource, data: { index: 1 } }
      ];
      context.records = records;
      
      context = await api.runHooks('afterQuery', context, resource);
      
      context = await api.runHooks('beforeSend', context, resource);
      
      return context.records;
    });
  }
};
```

## Using the Plugin

```javascript
// Create API with the database plugin
const api = new Api({
  name: 'myapp',
  version: '1.0.0'
});

api.use(DatabasePlugin);
```

## Adding Resources

```javascript
// Add users resource
api.addResource('users', {
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', required: true },
      email: { type: 'string', format: 'email' },
      age: { type: 'number', minimum: 0 }
    }
  }
});

// Add departments resource
api.addResource('departments', {
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', required: true },
      manager: { type: 'string' },
      budget: { type: 'number', minimum: 0 }
    }
  }
});

// Now you can use the resources
const user = await api.resources.users.get({ 
  schema: api.resources.users.schema 
});

const departments = await api.resources.departments.query({ 
  schema: api.resources.departments.schema,
  filters: { budget: { $gt: 10000 } }
});
```

## Adding Resource-Specific Hooks

```javascript
// Add a hook only for users resource
api.addResource('users', 
  {
    schema: { /* ... */ }
  },
  {
    hooks: {
      afterValidate: async ({ context, resource }) => {
        // This only runs for users resource
        console.log('Validating user-specific rules');
        
        // Add user-specific validation
        if (context.data && context.data.age < 18) {
          context.warnings = context.warnings || [];
          context.warnings.push('User is under 18');
        }
      },
      
      beforeSend: async ({ context, resource }) => {
        // Add user-specific transformations
        if (context.record) {
          context.record.fullName = `${context.record.data.firstName} ${context.record.data.lastName}`;
        }
      }
    }
  }
);
```

## Complete Example

```javascript
import { Api } from 'hooked-api';

// Create and configure the API
const api = new Api({
  name: 'company-db',
  version: '2.0.0'
});

// Install the database plugin
api.use(DatabasePlugin);

// Add resources with schemas
api.addResource('users', {
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', required: true },
      email: { type: 'string', format: 'email' }
    }
  }
});

api.addResource('departments', {
  schema: {
    type: 'object', 
    properties: {
      name: { type: 'string', required: true },
      budget: { type: 'number' }
    }
  }
});

// Add user-specific validation
api.addHook('afterValidate', 'users', 'checkUserAge', async ({ context, resource }) => {
  if (resource === 'users' && context.data?.age < 13) {
    throw new Error('Users must be 13 or older');
  }
});

// Use the API
const user = await api.resources.users.get({ schema: {} });
const depts = await api.resources.departments.query({ 
  schema: {},
  filters: { active: true } 
});
```