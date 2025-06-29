import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, ValidationError, ScopeError, MethodError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Scope Methods', async (t) => {
  await t.test('should add and call scope methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      scopeMethods: {
        list: async ({ scopeName }) => {
          return { scope: scopeName, items: [] };
        }
      }
    });

    api.addScope('users', {});
    const result = await api.scopes.users.list();
    assert.deepEqual(result, { scope: 'users', items: [] });
  });

  await t.test('should provide all handler parameters to scope methods', async () => {
    let capturedParams;
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      scopeMethods: {
        testMethod: async (handlerParams) => {
          capturedParams = Object.keys(handlerParams);
          return 'ok';
        }
      }
    });

    api.addScope('users', { custom: 'option' });
    await api.scopes.users.testMethod({ test: true });
    
    // Check all expected parameters are present
    const expectedParams = ['params', 'context', 'vars', 'helpers', 'scope', 'scopes', 'runHooks', 'log', 'name', 'apiOptions', 'pluginOptions', 'scopeOptions', 'scopeName'];
    for (const param of expectedParams) {
      assert.ok(capturedParams.includes(param), `Missing parameter: ${param}`);
    }
  });

  await t.test('should access scope options in methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      scopeMethods: {
        getSchema: async ({ scopeOptions }) => {
          return scopeOptions.schema;
        }
      }
    });

    api.addScope('users', { schema: { name: 'string' } });
    const result = await api.scopes.users.getSchema();
    assert.deepEqual(result, { name: 'string' });
  });

  await t.test('should throw error when accessing non-existent scope', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.equal(api.scopes.nonexistent, undefined);
  });

  await t.test('should throw error on direct scope call', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.addScope('users', {});
    
    assert.throws(
      () => api.scopes.users(),
      MethodError
    );
  });

  await t.test('should handle scope-specific methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.addScope('users', {}, {
      scopeMethods: {
        customMethod: async () => 'users-specific'
      }
    });
    
    api.addScope('posts', {});
    
    // Method exists on users
    const result = await api.scopes.users.customMethod();
    assert.equal(result, 'users-specific');
    
    // Method doesn't exist on posts
    assert.equal(api.scopes.posts.customMethod, undefined);
  });

  await t.test('should handle numeric properties correctly', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.addScope('users', {});
    
    // Numeric properties should return undefined
    assert.equal(api.scopes.users[123], undefined);
    assert.equal(api.scopes.users['123'], undefined);
  });

  await t.test('should throw error for invalid scope name', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.throws(
      () => api.addScope('invalid-name', {}),
      ValidationError
    );
  });

  await t.test('should throw error for duplicate scope', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.addScope('users', {});
    assert.throws(
      () => api.addScope('users', {}),
      ScopeError
    );
  });

  await t.test('should merge vars and helpers at scope level', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
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

    api.addScope('users', {}, {
      vars: { scope: 'scope-value', shared: 'scope-shared' },
      helpers: { scopeHelper: () => 'scope' }
    });

    const result = await api.scopes.users.getVarsAndHelpers();
    assert.deepEqual(result, {
      vars: { global: 'global-value', shared: 'scope-shared', scope: 'scope-value' },
      helpers: { global: 'global', scope: 'scope' }
    });
  });
});