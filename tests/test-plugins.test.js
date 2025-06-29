import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, PluginError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Plugin System', async (t) => {
  await t.test('should install and use plugins', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    let installed = false;

    const testPlugin = {
      name: 'test-plugin',
      install: () => {
        installed = true;
      }
    };

    api.use(testPlugin);
    assert.ok(installed);
  });

  await t.test('should provide install context to plugins', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    let capturedContext;

    const testPlugin = {
      name: 'test-plugin',
      install: (context) => {
        capturedContext = Object.keys(context);
      }
    };

    api.use(testPlugin);
    
    const expectedMethods = ['addApiMethod', 'addScopeMethod', 'addScope', 'setScopeAlias', 'addHook', 'vars', 'helpers', 'scopes', 'log', 'name', 'apiOptions', 'pluginOptions', 'context'];
    for (const method of expectedMethods) {
      assert.ok(capturedContext.includes(method), `Missing method: ${method}`);
    }
  });

  await t.test('should allow plugins to add API methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const methodPlugin = {
      name: 'method-plugin',
      install: ({ addApiMethod }) => {
        addApiMethod('pluginMethod', async () => 'from plugin');
      }
    };

    api.use(methodPlugin);
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

    api.use(optionsPlugin, { test: 'value' });
    const result = await api.getOptions();
    assert.deepEqual(result, { test: 'value' });
  });

  await t.test('should check plugin dependencies', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const dependentPlugin = {
      name: 'dependent',
      dependencies: ['required-plugin'],
      install: () => {}
    };

    assert.throws(
      () => api.use(dependentPlugin),
      PluginError
    );
  });

  await t.test('should prevent duplicate plugin installation', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const plugin = {
      name: 'test-plugin',
      install: () => {}
    };

    api.use(plugin);
    assert.throws(
      () => api.use(plugin),
      PluginError
    );
  });

  await t.test('should validate plugin structure', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    // Missing name
    assert.throws(
      () => api.use({ install: () => {} }),
      PluginError
    );

    // Missing install
    assert.throws(
      () => api.use({ name: 'test' }),
      PluginError
    );

    // Invalid install type
    assert.throws(
      () => api.use({ name: 'test', install: 'not a function' }),
      PluginError
    );
  });

  await t.test('should prevent reserved plugin names', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    assert.throws(
      () => api.use({ name: 'api', install: () => {} }),
      PluginError
    );

    assert.throws(
      () => api.use({ name: 'scopes', install: () => {} }),
      PluginError
    );
  });

  await t.test('should handle plugin installation errors', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const errorPlugin = {
      name: 'error-plugin',
      install: () => {
        throw new Error('Install failed');
      }
    };

    assert.throws(
      () => api.use(errorPlugin),
      PluginError
    );
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

    api.use(hookPlugin);
    const result = await api.runHookTest();
    assert.deepEqual(result, ['test']);
  });
});