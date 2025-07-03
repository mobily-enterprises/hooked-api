import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

test('Vars and Helpers', async (t) => {
  await t.test('should access vars and helpers in methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      vars: {
        testVar: 'test-value'
      },
      helpers: {
        double: (n) => n * 2
      },
      apiMethods: {
        useVarsAndHelpers: async ({ vars, helpers }) => {
          return {
            var: vars.testVar,
            doubled: helpers.double(5)
          };
        }
      }
    });

    const result = await api.useVarsAndHelpers();
    assert.deepEqual(result, { var: 'test-value', doubled: 10 });
  });

  await t.test('should allow modifying vars', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      vars: { counter: 0 },
      apiMethods: {
        increment: async ({ vars }) => {
          vars.counter++;
          return vars.counter;
        },
        getCounter: async ({ vars }) => vars.counter
      }
    });

    assert.equal(await api.increment(), 1);
    assert.equal(await api.increment(), 2);
    assert.equal(await api.getCounter(), 2);
  });

  await t.test('should protect against prototype pollution in vars', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        tryPollution: async ({ vars }) => {
          // These should be silently ignored
          vars.__proto__ = { polluted: true };
          vars.constructor = 'polluted';
          vars.prototype = 'polluted';
          
          return {
            proto: vars.__proto__,
            constructor: vars.constructor,
            prototype: vars.prototype
          };
        }
      }
    });

    const result = await api.tryPollution();
    assert.equal(result.proto, undefined);
    assert.equal(result.constructor, undefined);
    assert.equal(result.prototype, undefined);
  });

  await t.test('should share vars between methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      vars: { shared: 'initial' },
      apiMethods: {
        setVar: async ({ vars, params }) => {
          vars.shared = params.value;
        },
        getVar: async ({ vars }) => vars.shared
      }
    });

    await api.setVar({ value: 'updated' });
    const result = await api.getVar();
    assert.equal(result, 'updated');
  });

  await t.test('should allow plugins to set vars and helpers', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });

    const plugin = {
      name: 'vars-plugin',
      install: ({ vars, helpers, addApiMethod }) => {
        vars.pluginVar = 'from-plugin';
        helpers.pluginHelper = () => 'helper-result';

        addApiMethod('usePluginStuff', async ({ vars, helpers }) => ({
          var: vars.pluginVar,
          helper: helpers.pluginHelper()
        }));
      }
    };

    await api.use(plugin);
    const result = await api.usePluginStuff();
    assert.deepEqual(result, { var: 'from-plugin', helper: 'helper-result' });
  });
});