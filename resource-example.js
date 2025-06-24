import { Api } from './index-cleaned.js';

// Create an API
const api = new Api({
  name: 'jsonapi',
  version: '1.0.0',
  implementers: {
    // Generic create that works for any resource
    create: async ({ params, resource }) => {
      console.log(`Creating in ${resource || 'API'} with:`, params);
      return { id: Math.random(), ...params, _resource: resource };
    },
    
    // API-level query
    query: async ({ params }) => {
      console.log('API-level query:', params);
      return [];
    }
  }
});

// Add a users resource with its own schema and overrides
api.addResource('users', 
  { 
    schema: { 
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' }
      }
    }
  },
  {
    // Resource-specific hooks
    beforeCreate: async ({ context, resource }) => {
      console.log(`Hook: validating user in resource ${resource}`);
      context.validated = true;
    }
  },
  {
    // Resource-specific implementation overrides API-level query
    query: async ({ params, resource }) => {
      console.log(`Custom query for ${resource}:`, params);
      return [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
    }
  }
);

// Add a posts resource (uses API-level implementations)
api.addResource('posts', 
  { 
    schema: { 
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' }
      }
    }
  }
);

// Use the API directly - no resource context
console.log('\n--- Direct API calls ---');
await api.run('create', { name: 'Direct' });
await api.run.query({ filter: 'all' });

// Use through resources
console.log('\n--- Resource calls ---');
await api.resources.users.create({ name: 'John', email: 'john@example.com' });
await api.resources.users.query({ active: true }); // Uses resource override

await api.resources.posts.create({ title: 'Hello', content: 'World' });
await api.resources.posts.query({ published: true }); // Uses API-level implementation

// Custom resource key
const api2 = new Api({
  name: 'customapi',
  version: '1.0.0',
  resourcesKey: 'entities', // Use 'entities' instead of 'resources'
  implementers: {
    test: async ({ resource }) => `Called on ${resource || 'API'}`
  }
});

api2.addResource('items', {});
console.log('\n--- Custom resource key ---');
console.log(await api2.entities.items.test());