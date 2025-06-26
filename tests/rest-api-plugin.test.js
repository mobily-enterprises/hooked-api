import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';
import { RestApiPlugin, MemoryStoragePlugin } from '../rest-api-plugin.js';

describe('REST API Plugin', () => {
  let api;
  
  beforeEach(() => {
    resetGlobalRegistryForTesting();
    api = new Api({ name: 'test-api', version: '1.0.0' });
    
    // Install plugins
    api.use(RestApiPlugin, { pageSize: 10 });
    api.use(MemoryStoragePlugin);
    
    // Add a users resource
    api.addResource('users', {
      searchableFields: ['name', 'email']
    });
  });
  
  describe('CRUD Operations', () => {
    it('should create a new resource', async () => {
      const user = await api.resources.users.create({
        data: {
          name: 'John Doe',
          email: 'john@example.com'
        }
      });
      
      assert.equal(user.name, 'John Doe');
      assert.equal(user.email, 'john@example.com');
      assert.ok(user.id);
    });
    
    it('should get a resource by id', async () => {
      // Create a user first
      const created = await api.resources.users.create({
        data: { name: 'Jane Doe', email: 'jane@example.com' }
      });
      
      // Get the user
      const user = await api.resources.users.get({ id: created.id });
      
      assert.equal(user.id, created.id);
      assert.equal(user.name, 'Jane Doe');
      assert.equal(user.email, 'jane@example.com');
    });
    
    it('should update a resource', async () => {
      // Create a user
      const created = await api.resources.users.create({
        data: { name: 'Initial Name', email: 'initial@example.com' }
      });
      
      // Update the user
      const updated = await api.resources.users.update({
        id: created.id,
        data: { name: 'Updated Name' }
      });
      
      assert.equal(updated.id, created.id);
      assert.equal(updated.name, 'Updated Name');
      assert.equal(updated.email, 'initial@example.com');
    });
    
    it('should delete a resource', async () => {
      // Create a user
      const created = await api.resources.users.create({
        data: { name: 'To Delete', email: 'delete@example.com' }
      });
      
      // Delete the user
      const result = await api.resources.users.delete({ id: created.id });
      
      assert.deepEqual(result, { data: null });
      
      // Verify it's gone
      await assert.rejects(
        api.resources.users.get({ id: created.id }),
        /Resource not found/
      );
    });
    
    it('should query resources with pagination', async () => {
      // Create multiple users
      for (let i = 0; i < 25; i++) {
        await api.resources.users.create({
          data: { name: `User ${i}`, email: `user${i}@example.com` }
        });
      }
      
      // Query first page
      const page1 = await api.resources.users.query({
        page: { size: 10, number: 1 }
      });
      
      assert.equal(page1.data.length, 10);
      assert.equal(page1.meta.total, 25);
      assert.equal(page1.meta.page.total, 3);
      
      // Query second page
      const page2 = await api.resources.users.query({
        page: { size: 10, number: 2 }
      });
      
      assert.equal(page2.data.length, 10);
      assert.equal(page2.meta.page.number, 2);
    });
  });
  
  describe('Hooks', () => {
    it('should run validation hooks on create', async () => {
      let validationRan = false;
      
      api.addHook('validate:create', 'test-plugin', 'validateEmail', {}, ({ context }) => {
        validationRan = true;
        if (!context.data.email) {
          context.errors.push({ field: 'email', message: 'Email is required' });
        }
      });
      
      // Try to create without email
      await assert.rejects(
        api.resources.users.create({ data: { name: 'No Email' } }),
        /Validation failed/
      );
      
      assert.ok(validationRan);
    });
    
    it('should run transform hooks on results', async () => {
      api.addHook('transform:result', 'test-plugin', 'addTimestamp', {}, ({ context }) => {
        if (context.result) {
          context.result.timestamp = new Date().toISOString();
        }
      });
      
      const user = await api.resources.users.create({
        data: { name: 'Test User', email: 'test@example.com' }
      });
      
      assert.ok(user.timestamp);
    });
    
    it('should run before/after operation hooks', async () => {
      const events = [];
      
      api.addHook('before:operation', 'test-plugin', 'trackBefore', {}, ({ context }) => {
        events.push(`before:${context.method}`);
      });
      
      api.addHook('after:operation', 'test-plugin', 'trackAfter', {}, ({ context }) => {
        events.push(`after:${context.method}`);
      });
      
      await api.resources.users.create({
        data: { name: 'Test', email: 'test@example.com' }
      });
      
      assert.deepEqual(events, ['before:create', 'after:create']);
    });
    
    it('should run after:get hooks on query results', async () => {
      let getHookCount = 0;
      
      api.addHook('after:get', 'test-plugin', 'countGet', {}, () => {
        getHookCount++;
      });
      
      // Create some users
      for (let i = 0; i < 3; i++) {
        await api.resources.users.create({
          data: { name: `User ${i}`, email: `user${i}@example.com` }
        });
      }
      
      // Query them
      await api.resources.users.query();
      
      // Should have run after:get for each result
      assert.equal(getHookCount, 3);
    });
  });
  
  describe('Resource-specific implementations', () => {
    it('should allow resource-specific hooks', async () => {
      let userHookRan = false;
      let postHookRan = false;
      
      // Add posts resource
      api.addResource('posts', {}, {
        hooks: {
          'before:create': ({ context }) => {
            postHookRan = true;
            context.data.createdAt = new Date().toISOString();
          }
        }
      });
      
      // Add user-specific hook
      api.addResource('profiles', {}, {
        hooks: {
          'before:create': ({ context }) => {
            userHookRan = true;
            context.data.type = 'profile';
          }
        }
      });
      
      await api.resources.posts.create({ data: { title: 'Test Post' } });
      await api.resources.profiles.create({ data: { name: 'Test Profile' } });
      
      assert.ok(postHookRan);
      assert.ok(userHookRan);
    });
    
    it('should use resource-specific storage if provided', async () => {
      // Add a resource with custom storage
      api.addResource('custom', {}, {
        helpers: {
          dataGet: async ({ id, resource }) => {
            return { id, custom: true };
          },
          dataCreate: async ({ data, resource }) => {
            return { id: 999, ...data, custom: true };
          }
        }
      });
      
      const created = await api.resources.custom.create({
        data: { name: 'Custom Item' }
      });
      
      assert.equal(created.id, 999);
      assert.ok(created.custom);
      
      const fetched = await api.resources.custom.get({ id: 123 });
      assert.equal(fetched.id, 123);
      assert.ok(fetched.custom);
    });
  });
  
  describe('Error handling', () => {
    it('should handle missing storage implementations', async () => {
      // Create API without storage plugin
      const apiNoStorage = new Api({ name: 'no-storage', version: '1.0.0' });
      apiNoStorage.use(RestApiPlugin);
      apiNoStorage.addResource('items');
      
      await assert.rejects(
        apiNoStorage.resources.items.get({ id: 1 }),
        /No storage implementation for get/
      );
    });
    
    it('should handle validation errors with details', async () => {
      api.addHook('validate:create', 'test-plugin', 'detailedValidation', {}, ({ context }) => {
        if (!context.data.name || context.data.name.length < 3) {
          context.errors.push({ 
            field: 'name', 
            message: 'Name must be at least 3 characters' 
          });
        }
        if (!context.data.email || !context.data.email.includes('@')) {
          context.errors.push({ 
            field: 'email', 
            message: 'Invalid email format' 
          });
        }
      });
      
      try {
        await api.resources.users.create({ data: { name: 'Jo' } });
        assert.fail('Should have thrown validation error');
      } catch (error) {
        assert.equal(error.message, 'Validation failed');
        assert.equal(error.errors.length, 2);
        assert.equal(error.errors[0].field, 'name');
        assert.equal(error.errors[1].field, 'email');
      }
    });
  });
});