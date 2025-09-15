import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, ValidationError, ScopeError, MethodError } from '../index.js';


test('Scope Methods', async (t) => {
  await t.test('should add and call scope methods', async () => {
    const api = new Api({ name: 'test' });
    await api.customize({
      scopeMethods: {
        list: async ({ scopeName }) => {
          return { scope: scopeName, items: [] };
        }
      }
    });

    await api.addScope('users', {});
    const result = await api.scopes.users.list();
    assert.deepEqual(result, { scope: 'users', items: [] });
  });

  await t.test('should provide all handler parameters to scope methods', async () => {
    let capturedParams;
    const api = new Api({ name: 'test' });
    await api.customize({
      scopeMethods: {
        testMethod: async (handlerParams) => {
          capturedParams = Object.keys(handlerParams);
          return 'ok';
        }
      }
    });

    await api.addScope('users', { custom: 'option' });
    await api.scopes.users.testMethod({ test: true });
    
    // Check all expected parameters are present
    const expectedParams = ['params', 'context', 'vars', 'helpers', 'scope', 'scopes', 'runHooks', 'log', 'name', 'apiOptions', 'pluginOptions', 'scopeOptions', 'scopeName'];
    for (const param of expectedParams) {
      assert.ok(capturedParams.includes(param), `Missing parameter: ${param}`);
    }
  });

  await t.test('should access scope options in methods', async () => {
    const api = new Api({ name: 'test' });
    await api.customize({
      scopeMethods: {
        getSchema: async ({ scopeOptions }) => {
          return scopeOptions.schema;
        }
      }
    });

    await api.addScope('users', { schema: { name: 'string' } });
    const result = await api.scopes.users.getSchema();
    assert.deepEqual(result, { name: 'string' });
  });

  await t.test('should throw error when accessing non-existent scope', async () => {
    const api = new Api({ name: 'test' });
    assert.equal(api.scopes.nonexistent, undefined);
  });

  await t.test('should throw error on direct scope call', async () => {
    const api = new Api({ name: 'test' });
    await api.addScope('users', {});
    
    assert.throws(
      () => api.scopes.users(),
      MethodError
    );
  });

  await t.test('should handle scope-specific methods', async () => {
    const api = new Api({ name: 'test' });
    
    await api.addScope('users', {
      scopeMethods: {
        customMethod: async () => 'users-specific'
      }
    });
    
    await api.addScope('posts', {});
    
    // Method exists on users
    const result = await api.scopes.users.customMethod();
    assert.equal(result, 'users-specific');
    
    // Method doesn't exist on posts
    assert.equal(api.scopes.posts.customMethod, undefined);
  });

  await t.test('should handle numeric properties correctly', async () => {
    const api = new Api({ name: 'test' });
    await api.addScope('users', {});
    
    // Numeric properties should return undefined
    assert.equal(api.scopes.users[123], undefined);
    assert.equal(api.scopes.users['123'], undefined);
  });

  await t.test('should throw error for invalid scope name', async () => {
    const api = new Api({ name: 'test' });
    await assert.rejects(
      () => api.addScope('invalid-name', {}),
      ValidationError
    );
  });

  await t.test('should throw error for duplicate scope', async () => {
    const api = new Api({ name: 'test' });
    await api.addScope('users', {});
    await assert.rejects(
      () => api.addScope('users', {}),
      ScopeError
    );
  });

  await t.test('should merge vars and helpers at scope level', async () => {
    const api = new Api({ name: 'test' });
    await api.customize({
      vars: { global: 'global-value', shared: 'global-shared' },
      helpers: { globalHelper: () => 'global' },
      scopeMethods: {
        getVarsAndHelpers: async ({ vars, helpers }) => {
          return {
            vars: { global: vars.global, shared: vars.shared, scope: vars.scope },
            helpers: { 
              global: helpers.globalHelper(), 
              scope: helpers.scopeHelper ? helpers.scopeHelper() : undefined 
            }
          };
        }
      }
    });

    await api.addScope('users', {
      vars: { scope: 'scope-value', shared: 'scope-shared' },
      helpers: { scopeHelper: () => 'scope' }
    });

    const result = await api.scopes.users.getVarsAndHelpers();
    assert.deepEqual(result, {
      vars: { global: 'global-value', shared: 'scope-shared', scope: 'scope-value' },
      helpers: { global: 'global', scope: 'scope' }
    });
  });

  await t.test('should iterate over scopes with for...in loop', async () => {
    const api = new Api({ name: 'test' });
    
    // Add multiple scopes
    await api.addScope('users');
    await api.addScope('posts');
    await api.addScope('comments');
    
    const scopeNames = [];
    for (const scopeName in api.scopes) {
      scopeNames.push(scopeName);
    }
    
    assert.deepEqual(scopeNames.sort(), ['comments', 'posts', 'users']);
  });

  await t.test('should support Object.keys() on scopes', async () => {
    const api = new Api({ name: 'test' });
    
    await api.addScope('users');
    await api.addScope('posts');
    
    const keys = Object.keys(api.scopes);
    assert.deepEqual(keys.sort(), ['posts', 'users']);
  });

  await t.test('should support Object.entries() on scopes', async () => {
    const api = new Api({ name: 'test' });
    
    await api.addScope('users');
    await api.addScope('posts');
    
    const entries = Object.entries(api.scopes);
    const entryNames = entries.map(([name]) => name).sort();
    assert.deepEqual(entryNames, ['posts', 'users']);
    
    // Each entry should be a tuple of [name, scopeProxy]
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(typeof entries[0][0], 'string');
    assert.strictEqual(typeof entries[0][1], 'function'); // Scope proxy is a function
  });

  await t.test('should not include dangerous properties in iteration', async () => {
    const api = new Api({ name: 'test' });
    
    await api.addScope('users');
    await api.addScope('posts');
    
    const keys = Object.keys(api.scopes);
    
    // Should not include prototype pollution properties
    assert.ok(!keys.includes('__proto__'));
    assert.ok(!keys.includes('constructor'));
    assert.ok(!keys.includes('prototype'));
  });

  await t.test('should handle empty scopes iteration', async () => {
    const api = new Api({ name: 'test' });
    
    const keys = Object.keys(api.scopes);
    assert.deepEqual(keys, []);
    
    const entries = Object.entries(api.scopes);
    assert.deepEqual(entries, []);
    
    // for...in should not iterate over empty scopes
    let iterationCount = 0;
    for (const scopeName in api.scopes) {
      iterationCount++;
    }
    assert.strictEqual(iterationCount, 0);
  });
});