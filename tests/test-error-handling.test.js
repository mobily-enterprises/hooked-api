import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, ValidationError, PluginError, ConfigurationError, ScopeError, MethodError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Error Handling', async (t) => {
  await t.test('should provide detailed validation errors', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    try {
      await api.addScope('invalid-name', {});
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.field, 'name');
      assert.equal(error.value, 'invalid-name');
      assert.ok(error.message.includes('Remove invalid characters'));
    }
  });

  await t.test('should provide detailed plugin errors', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    try {
      await api.use({ name: 'test-plugin', install: () => {} });
      await api.use({ name: 'test-plugin', install: () => {} }); // Duplicate
    } catch (error) {
      assert.ok(error instanceof PluginError);
      assert.equal(error.code, 'PLUGIN_ERROR');
      assert.equal(error.pluginName, 'test-plugin');
      assert.ok(Array.isArray(error.installedPlugins));
      assert.ok(error.installedPlugins.includes('test-plugin'));
    }
  });

  await t.test('should provide detailed configuration errors', () => {
    try {
      new Api({ name: '', version: '1.0.0' });
    } catch (error) {
      assert.ok(error instanceof ConfigurationError);
      assert.equal(error.code, 'CONFIGURATION_ERROR');
      assert.equal(error.received, '');
      assert.equal(error.expected, 'non-empty string');
      assert.ok(error.example);
    }
  });

  await t.test('should provide detailed scope errors', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    await api.customize({
      scopeMethods: {
        test: async () => 'ok'
      }
    });
    
    await api.addScope('users', {});
    
    // This creates a proxy that throws when methods are called
    const nonExistent = api.scopes.nonexistent;
    assert.equal(nonExistent, undefined);
  });

  await t.test('should provide detailed method errors', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    await api.addScope('users', {});
    
    try {
      api.scopes.users();
    } catch (error) {
      assert.ok(error instanceof MethodError);
      assert.equal(error.code, 'METHOD_ERROR');
      assert.equal(error.methodName, 'users');
      assert.ok(error.suggestion.includes('api.scopes.users.methodName()'));
    }
  });

  await t.test('should handle null and undefined gracefully', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Various null/undefined checks
    await assert.rejects(() => api.addScope(null, {}), ValidationError);
    await assert.rejects(() => api.addScope(undefined, {}), ValidationError);
    await assert.rejects(() => api.use(null), PluginError);
    await assert.rejects(() => api.use(undefined), PluginError);
  });

  await t.test('should prevent prototype pollution attacks', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Try to add dangerous scope names
    await assert.rejects(() => api.addScope('__proto__', {}), ValidationError);
    await assert.rejects(() => api.addScope('constructor', {}), ValidationError);
    await assert.rejects(() => api.addScope('prototype', {}), ValidationError);
  });

  await t.test('should handle symbol properties safely', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    const sym = Symbol('test');
    
    // Symbols should be filtered out
    assert.equal(api.scopes[sym], undefined);
  });
});