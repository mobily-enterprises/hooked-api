import { Api } from '../index.js';
import { RestApiPlugin, MemoryStoragePlugin } from '../rest-api-plugin.js';

// Create the API instance
const api = new Api({
  name: 'my-app',
  version: '1.0.0'
});

// Install the REST API plugin
api.use(RestApiPlugin, {
  pageSize: 20,
  maxPageSize: 100,
  idProperty: 'id'
});

// Install a storage plugin (in-memory for this example)
api.use(MemoryStoragePlugin);

// Add validation plugin
const ValidationPlugin = {
  name: 'validation',
  install({ api }) {
    // Add validation for user creation
    api.addHook('validate:create', 'validateUser', ({ context, resource }) => {
      if (resource !== 'users') return;
      
      const { data } = context;
      
      if (!data.email || !data.email.includes('@')) {
        context.errors.push({
          field: 'email',
          message: 'Valid email is required'
        });
      }
      
      if (!data.name || data.name.length < 2) {
        context.errors.push({
          field: 'name',
          message: 'Name must be at least 2 characters'
        });
      }
    });
    
    // Add validation for user updates
    api.addHook('validate:update', 'validateUserUpdate', ({ context, resource }) => {
      if (resource !== 'users') return;
      
      const { data } = context;
      
      if (data.email !== undefined && !data.email.includes('@')) {
        context.errors.push({
          field: 'email',
          message: 'Valid email is required'
        });
      }
      
      if (data.name !== undefined && data.name.length < 2) {
        context.errors.push({
          field: 'name',
          message: 'Name must be at least 2 characters'
        });
      }
    });
  }
};

api.use(ValidationPlugin);

// Add audit logging plugin
const AuditPlugin = {
  name: 'audit',
  install({ api, options }) {
    const auditLog = [];
    
    // Log all operations
    api.addHook('after:operation', 'auditLog', ({ context }) => {
      auditLog.push({
        timestamp: new Date().toISOString(),
        method: context.method,
        resource: context.resource,
        id: context.id,
        user: options.audit?.user || 'anonymous'
      });
    });
    
    // Provide method to get audit log
    api.defineApiMethod('getAuditLog', () => auditLog);
  }
};

api.use(AuditPlugin, { user: 'john@example.com' });

// Add computed fields plugin
const ComputedFieldsPlugin = {
  name: 'computed-fields',
  install({ api }) {
    // Add initials to user objects
    api.addHook('transform:result', 'addInitials', ({ context, resource }) => {
      if (resource !== 'users' || !context.result) return;
      
      const user = context.result;
      if (user.name) {
        user.initials = user.name
          .split(' ')
          .map(part => part[0])
          .join('')
          .toUpperCase();
      }
    });
  }
};

api.use(ComputedFieldsPlugin);

// Define resources
api.addResource('users', {
  searchableFields: ['name', 'email'],
  defaultSort: 'name'
});

api.addResource('posts', {
  searchableFields: ['title', 'content'],
  defaultSort: '-createdAt'
}, {
  hooks: {
    'before:create': ({ context }) => {
      // Auto-set creation timestamp
      context.data.createdAt = new Date().toISOString();
      context.data.updatedAt = new Date().toISOString();
    },
    'before:update': ({ context }) => {
      // Auto-update timestamp
      context.data.updatedAt = new Date().toISOString();
    }
  }
});

// Example usage
async function demo() {
  console.log('=== REST API Demo ===\n');
  
  // Create users
  console.log('Creating users...');
  const user1 = await api.resources.users.create({
    data: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  });
  console.log('Created user:', user1);
  
  const user2 = await api.resources.users.create({
    data: {
      name: 'Jane Smith',
      email: 'jane@example.com'
    }
  });
  console.log('Created user:', user2);
  
  // Try invalid user (validation error)
  console.log('\nTrying to create invalid user...');
  try {
    await api.resources.users.create({
      data: {
        name: 'X',
        email: 'invalid-email'
      }
    });
  } catch (error) {
    console.log('Validation error:', error.message);
    console.log('Errors:', error.errors);
  }
  
  // Query users
  console.log('\nQuerying users...');
  const users = await api.resources.users.query({
    page: { size: 10, number: 1 }
  });
  console.log('Users:', users);
  
  // Update user
  console.log('\nUpdating user...');
  const updated = await api.resources.users.update({
    id: user1.id,
    data: { email: 'john.doe@example.com' }
  });
  console.log('Updated user:', updated);
  
  // Create posts
  console.log('\nCreating posts...');
  const post1 = await api.resources.posts.create({
    data: {
      title: 'Hello World',
      content: 'This is my first post',
      authorId: user1.id
    }
  });
  console.log('Created post:', post1);
  
  const post2 = await api.resources.posts.create({
    data: {
      title: 'Another Post',
      content: 'More content here',
      authorId: user2.id
    }
  });
  console.log('Created post:', post2);
  
  // Query posts
  console.log('\nQuerying posts...');
  const posts = await api.resources.posts.query();
  console.log('Posts:', posts);
  
  // Get audit log
  console.log('\nAudit Log:');
  const auditLog = await api.run.getAuditLog();
  console.log(JSON.stringify(auditLog, null, 2));
  
  // Delete a user
  console.log('\nDeleting user...');
  await api.resources.users.delete({ id: user2.id });
  console.log('User deleted');
  
  // Verify deletion
  console.log('\nVerifying deletion...');
  try {
    await api.resources.users.get({ id: user2.id });
  } catch (error) {
    console.log('User not found (as expected):', error.message);
  }
}

// Run the demo
demo().catch(console.error);