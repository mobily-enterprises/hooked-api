import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, ValidationError, ConfigurationError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Scope Aliases', async (t) => {
  await t.test('should create scope alias', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    await api.customize({
      scopeMethods: {
        get: async () => 'data'
      }
    });
    
    api.setScopeAlias('resources');
    await api.addScope('users', {});
    
    // Both should work
    assert.equal(await api.scopes.users.get(), 'data');
    assert.equal(await api.resources.users.get(), 'data');
    
    // Should be the same object
    assert.equal(api.scopes, api.resources);
  });

  await t.test('should create addScope alias', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.setScopeAlias('resources', 'addResource');
    
    // Both should work
    await api.addScope('users', {});
    await api.addResource('posts', {});
    
    assert.ok(api.scopes.users);
    assert.ok(api.scopes.posts);
  });

  await t.test('should validate alias names', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    assert.throws(
      () => api.setScopeAlias(''),
      ValidationError
    );
    
    assert.throws(
      () => api.setScopeAlias('use'), // Conflicts with existing property
      ConfigurationError
    );
  });

  await t.test('should handle null alias to skip setting', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // This should not throw
    api.setScopeAlias(null, 'addResource');
    
    // Only addResource alias should be created
    assert.equal(api.resources, undefined);
    assert.equal(typeof api.addResource, 'function');
  });

  await t.test('should make alias available in handler context', async () => {
    let capturedAlias;
    const api = new Api({ name: 'test', version: '1.0.0' });
    await api.customize({
      apiMethods: {
        checkAlias: async (context) => {
          capturedAlias = context.tables;
          return !!context.tables;
        }
      }
    });
    
    api.setScopeAlias('tables');
    await api.addScope('users', {});
    
    const result = await api.checkAlias();
    assert.ok(result);
    assert.equal(capturedAlias, api.scopes);
  });
});