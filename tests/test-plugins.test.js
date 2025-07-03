import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, PluginError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Plugin System', async (t) => {
  await t.test('should install and use plugins', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    let installed = false;

    const testPlugin = {
      name: 'test-plugin',
      install: () => {
        installed = true;
      }
    };

    await api.use(testPlugin);
    assert.ok(installed);
  });

  await t.test('should provide install context to plugins', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    let capturedContext;

    const testPlugin = {
      name: 'test-plugin',
      install: (context) => {
        capturedContext = Object.keys(context);
      }
    };

    await api.use(testPlugin);
    
    const expectedMethods = ['addApiMethod', 'addScopeMethod', 'addScope', 'setScopeAlias', 'addHook', 'vars', 'helpers', 'scopes', 'log', 'name', 'apiOptions', 'pluginOptions', 'context', 'api'];
    for (const method of expectedMethods) {
      assert.ok(capturedContext.includes(method), `Missing method: ${method}`);
    }
  });

  await t.test('should provide api reference to plugins', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    let capturedApi;
    let contextApi;

    const testPlugin = {
      name: 'test-plugin',
      install: (context) => {
        capturedApi = context.api;
        contextApi = context;
      }
    };

    await api.use(testPlugin);
    
    // Verify api property exists
    assert.ok(capturedApi, 'api property should exist in install context');
    
    // Verify it's the same API instance
    assert.equal(capturedApi, api, 'api property should be the same API instance');
    
    // Verify api has expected properties
    assert.equal(capturedApi.options.name, 'test', 'api should have correct name');
    assert.equal(capturedApi.options.version, '1.0.0', 'api should have correct version');
    
    // Verify api is accessible via context
    assert.equal(contextApi.api, api, 'api should be accessible via context.api');
  });

  await t.test('should allow plugins to add API methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const methodPlugin = {
      name: 'method-plugin',
      install: ({ addApiMethod }) => {
        addApiMethod('pluginMethod', async () => 'from plugin');
      }
    };

    await api.use(methodPlugin);
    const result = await api.pluginMethod();
    assert.equal(result, 'from plugin');
  });

  await t.test('should pass plugin options to handlers', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const optionsPlugin = {
      name: 'options-plugin',
      install: ({ addApiMethod }) => {
        addApiMethod('getOptions', async ({ pluginOptions }) => {
          return pluginOptions['options-plugin'];
        });
      }
    };

    await api.use(optionsPlugin, { test: 'value' });
    const result = await api.getOptions();
    assert.deepEqual(result, { test: 'value' });
  });

  await t.test('should check plugin dependencies', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const dependentPlugin = {
      name: 'dependent',
      dependencies: ['required-plugin'],
      install: () => {}
    };

    await assert.rejects(
      () => api.use(dependentPlugin),
      PluginError
    );
  });

  await t.test('should prevent duplicate plugin installation', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const plugin = {
      name: 'test-plugin',
      install: () => {}
    };

    await api.use(plugin);
    await assert.rejects(
      () => api.use(plugin),
      PluginError
    );
  });

  await t.test('should validate plugin structure', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    // Missing name
    await assert.rejects(
      () => api.use({ install: () => {} }),
      PluginError
    );

    // Missing install
    await assert.rejects(
      () => api.use({ name: 'test' }),
      PluginError
    );

    // Invalid install type
    await assert.rejects(
      () => api.use({ name: 'test', install: 'not a function' }),
      PluginError
    );
  });

  await t.test('should prevent reserved plugin names', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    await assert.rejects(
      () => api.use({ name: 'api', install: () => {} }),
      PluginError
    );

    await assert.rejects(
      () => api.use({ name: 'scopes', install: () => {} }),
      PluginError
    );
  });

  await t.test('should handle plugin installation errors', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const errorPlugin = {
      name: 'error-plugin',
      install: () => {
        throw new Error('Install failed');
      }
    };

    await assert.rejects(
      () => api.use(errorPlugin),
      PluginError
    );
  });

  await t.test('should allow plugins to use api reference for advanced functionality', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // First plugin creates a namespace
    const namespacePlugin = {
      name: 'namespace-plugin',
      install: ({ api, addApiMethod }) => {
        // Use api reference to access internal state
        api._pluginNamespaces = api._pluginNamespaces || {};
        api._pluginNamespaces['namespace-plugin'] = { data: [] };
        
        // Add method that uses the namespace
        addApiMethod('addToNamespace', async ({ params }) => {
          api._pluginNamespaces['namespace-plugin'].data.push(params);
          return api._pluginNamespaces['namespace-plugin'].data.length;
        });
      }
    };
    
    // Second plugin extends the first one using api reference
    const extensionPlugin = {
      name: 'extension-plugin',
      dependencies: ['namespace-plugin'],
      install: ({ api, addApiMethod }) => {
        // Access the namespace created by first plugin
        addApiMethod('getNamespaceData', async () => {
          return api._pluginNamespaces['namespace-plugin'].data;
        });
        
        // Check if specific methods exist on the api
        addApiMethod('hasMethod', async ({ params }) => {
          return typeof api[params] === 'function';
        });
      }
    };
    
    await api.use(namespacePlugin);
    await api.use(extensionPlugin);
    
    // Test the functionality
    const count1 = await api.addToNamespace('item1');
    assert.equal(count1, 1);
    
    const count2 = await api.addToNamespace('item2');
    assert.equal(count2, 2);
    
    const data = await api.getNamespaceData();
    assert.deepEqual(data, ['item1', 'item2']);
    
    // Test method checking
    assert.equal(await api.hasMethod('addToNamespace'), true);
    assert.equal(await api.hasMethod('nonExistentMethod'), false);
  });

  await t.test('should allow plugins to add hooks with auto-injected plugin name', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    const hookCalls = [];

    const hookPlugin = {
      name: 'hook-plugin',
      install: ({ addHook, addApiMethod }) => {
        // addHook auto-injects plugin name
        addHook('test', 'myHook', {}, ({ name }) => {
          hookCalls.push(name);
        });

        addApiMethod('runHookTest', async ({ runHooks }) => {
          await runHooks('test');
          return hookCalls;
        });
      }
    };

    await api.use(hookPlugin);
    const result = await api.runHookTest();
    assert.deepEqual(result, ['test']);
  });
});