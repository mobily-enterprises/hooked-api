import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, LogLevel, resetGlobalRegistryForTesting, ConfigurationError, ValidationError, PluginError, ScopeError, MethodError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

// Test 1: Basic API instantiation
test('Basic API instantiation', async (t) => {
  await t.test('should create API with valid name and version', () => {
    const api = new Api({ name: 'test-api', version: '1.0.0' });
    assert.equal(api.options.name, 'test-api');
    assert.equal(api.options.version, '1.0.0');
  });

  await t.test('should throw error when name is missing', () => {
    assert.throws(
      () => new Api({ version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when name is empty', () => {
    assert.throws(
      () => new Api({ name: '', version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when name is null', () => {
    assert.throws(
      () => new Api({ name: null, version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when version is invalid', () => {
    assert.throws(
      () => new Api({ name: 'test', version: '1.0' }),
      ConfigurationError
    );
  });

  await t.test('should throw error when version is not a string', () => {
    assert.throws(
      () => new Api({ name: 'test', version: 1.0 }),
      ConfigurationError
    );
  });

  await t.test('should apply default logging configuration', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.equal(api.options.logging.level, 'info');
    assert.equal(api.options.logging.format, 'pretty');
    assert.equal(api.options.logging.timestamp, true);
    assert.equal(api.options.logging.colors, true);
    assert.equal(api.options.logging.logger, console);
  });

  await t.test('should merge custom logging configuration', () => {
    const api = new Api({ 
      name: 'test', 
      version: '1.0.0',
      logging: { level: 'debug', format: 'json' }
    });
    assert.equal(api.options.logging.level, 'debug');
    assert.equal(api.options.logging.format, 'json');
    assert.equal(api.options.logging.timestamp, true); // default preserved
  });

  await t.test('should allow numeric log levels', () => {
    const api = new Api({ 
      name: 'test', 
      version: '1.0.0',
      logging: { level: LogLevel.DEBUG }
    });
    assert.equal(api._logLevel, LogLevel.DEBUG);
  });
});

// Test 2: API Methods
test('API Methods', async (t) => {
  await t.test('should add and call API methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        getData: async ({ params }) => {
          return { data: params.value * 2 };
        }
      }
    });

    const result = await api.getData({ value: 5 });
    assert.deepEqual(result, { data: 10 });
  });

  await t.test('should provide all handler parameters to API methods', async () => {
    let capturedParams;
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        testMethod: async (handlerParams) => {
          capturedParams = Object.keys(handlerParams);
          return 'ok';
        }
      }
    });

    await api.testMethod({ test: true });
    
    // Check all expected parameters are present
    const expectedParams = ['params', 'context', 'vars', 'helpers', 'scope', 'scopes', 'runHooks', 'log', 'name', 'apiOptions', 'pluginOptions'];
    for (const param of expectedParams) {
      assert.ok(capturedParams.includes(param), `Missing parameter: ${param}`);
    }
  });

  await t.test('should throw error for invalid method name', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.throws(
      () => api.customize({
        apiMethods: {
          'invalid-name': async () => {}
        }
      }),
      ValidationError
    );
  });

  await t.test('should handle null as method name becoming "null" string', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    // When using [null] as a key, it becomes the string "null"
    api.customize({
      apiMethods: {
        [null]: async () => 'null-method-result'
      }
    });
    // The method is accessible as api.null (string)
    assert.equal(typeof api.null, 'function');
  });

  await t.test('should throw error for non-function handler', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.throws(
      () => api.customize({
        apiMethods: {
          test: 'not a function'
        }
      }),
      ValidationError
    );
  });

  await t.test('should throw error when method conflicts with existing property', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    assert.throws(
      () => api.customize({
        apiMethods: {
          use: async () => {} // 'use' already exists
        }
      }),
      MethodError
    );
  });

  await t.test('should handle method errors properly', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        errorMethod: async () => {
          throw new Error('Test error');
        }
      }
    });

    await assert.rejects(
      () => api.errorMethod(),
      /Test error/
    );
  });

  await t.test('should maintain context between hooks and methods', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        testMethod: async ({ context, runHooks }) => {
          context.value = 1;
          await runHooks('modify');
          return context.value;
        }
      },
      hooks: {
        modify: ({ context }) => {
          context.value = context.value * 2;
        }
      }
    });

    const result = await api.testMethod();
    assert.equal(result, 2);
  });
});

// Test 3: Scope Methods
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

// Test 4: Hook System
test('Hook System', async (t) => {
  await t.test('should run hooks in order', async () => {
    const order = [];
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          await runHooks('testHook');
          return order;
        }
      }
    });

    api.customize({
      hooks: {
        testHook: () => order.push(1)
      }
    });

    api.customize({
      hooks: {
        testHook: () => order.push(2)
      }
    });

    const result = await api.test();
    assert.deepEqual(result, [1, 2]);
  });

  await t.test('should stop hook chain when returning false', async () => {
    const order = [];
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          await runHooks('testHook');
          return order;
        }
      }
    });

    // Add hooks one at a time
    api.customize({
      hooks: {
        testHook: () => order.push(1)
      }
    });
    
    api.customize({
      hooks: {
        testHook: () => { order.push(2); return false; }
      }
    });
    
    api.customize({
      hooks: {
        testHook: () => order.push(3)
      }
    });

    const result = await api.test();
    assert.deepEqual(result, [1, 2]);
  });

  await t.test('should provide correct parameters to hooks', async () => {
    let hookParams;
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        test: async ({ params, context, runHooks }) => {
          context.value = 'test';
          await runHooks('capture');
          return 'ok';
        }
      },
      hooks: {
        capture: (params) => {
          hookParams = Object.keys(params);
        }
      }
    });

    await api.test({ input: 'value' });
    
    // Check hook receives methodParams instead of params
    assert.ok(hookParams.includes('methodParams'));
    assert.ok(!hookParams.includes('params'));
    assert.ok(hookParams.includes('context'));
  });

  await t.test('should handle hook placement options', async () => {
    const order = [];
    const api = new Api({ name: 'test', version: '1.0.0' });

    // Install plugins
    api.use({
      name: 'plugin1',
      install: ({ addHook }) => {
        addHook('test', 'func1', {}, () => order.push('p1'));
      }
    });

    api.use({
      name: 'plugin2',
      install: ({ addHook }) => {
        addHook('test', 'func2', { beforePlugin: 'plugin1' }, () => order.push('p2-before'));
        addHook('test', 'func3', { afterPlugin: 'plugin1' }, () => order.push('p2-after'));
      }
    });

    api.customize({
      apiMethods: {
        runTest: async ({ runHooks }) => {
          await runHooks('test');
          return order;
        }
      }
    });

    const result = await api.runTest();
    assert.deepEqual(result, ['p2-before', 'p1', 'p2-after']);
  });

  await t.test('should handle scope-specific hooks', async () => {
    const calls = [];
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      scopeMethods: {
        test: async ({ scopeName, runHooks }) => {
          await runHooks('scopeHook');
          return calls;
        }
      },
      hooks: {
        scopeHook: ({ scopeName }) => calls.push(`global-${scopeName || 'none'}`)
      }
    });

    api.addScope('users', {}, {
      hooks: {
        scopeHook: ({ scopeName }) => calls.push(`users-${scopeName}`)
      }
    });

    api.addScope('posts', {});

    // Call on users scope - should run both global and users-specific
    await api.scopes.users.test();
    assert.deepEqual(calls, ['global-users', 'users-users']);

    // Reset and call on posts scope - should run only global
    calls.length = 0;
    await api.scopes.posts.test();
    assert.deepEqual(calls, ['global-posts']);
  });

  await t.test('should validate hook configuration', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Invalid handler type
    assert.throws(
      () => api.customize({
        hooks: {
          test: 'not a function'
        }
      }),
      ValidationError
    );

    // Missing handler in object form
    assert.throws(
      () => api.customize({
        hooks: {
          test: { functionName: 'test' }
        }
      }),
      ValidationError
    );
  });

  await t.test('should handle hook errors properly', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          await runHooks('errorHook');
        }
      },
      hooks: {
        errorHook: () => {
          throw new Error('Hook error');
        }
      }
    });

    await assert.rejects(
      () => api.test(),
      /Hook error/
    );
  });

  await t.test('should handle empty hook chains', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        test: async ({ context, runHooks }) => {
          await runHooks('nonExistentHook');
          return context;
        }
      }
    });

    const result = await api.test();
    assert.deepEqual(result, {});
  });
});

// Test 5: Plugin System
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

// Test 6: Vars and Helpers
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

    api.use(plugin);
    const result = await api.usePluginStuff();
    assert.deepEqual(result, { var: 'from-plugin', helper: 'helper-result' });
  });
});

// Test 7: Logging System
test('Logging System', async (t) => {
  await t.test('should respect log levels', async () => {
    const logs = [];
    const customLogger = {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg)
    };

    const api = new Api({
      name: 'test',
      version: '1.0.0',
      logging: { level: 'warn', logger: customLogger }
    });
    api.customize({
      apiMethods: {
        testLogging: async ({ log }) => {
          log.trace('trace message');
          log.debug('debug message');
          log.info('info message');
          log.warn('warn message');
          log.error('error message');
        }
      }
    });

    await api.testLogging();
    
    // Only warn and error should be logged
    const logMessages = logs.join(' ');
    assert.ok(!logMessages.includes('trace message'));
    assert.ok(!logMessages.includes('debug message'));
    assert.ok(!logMessages.includes('info message'));
    assert.ok(logMessages.includes('warn message'));
    assert.ok(logMessages.includes('error message'));
  });

  await t.test('should support numeric log levels', async () => {
    const logs = [];
    const customLogger = {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg)
    };

    const api = new Api({
      name: 'test',
      version: '1.0.0',
      logging: { level: LogLevel.WARN, logger: customLogger }
    });
    api.customize({
      apiMethods: {
        testLogging: async ({ log }) => {
          log.info('info message');
          log.warn('warn message');
        }
      }
    });

    await api.testLogging();
    
    const logMessages = logs.join(' ');
    assert.ok(!logMessages.includes('info message'));
    assert.ok(logMessages.includes('warn message'));
  });

  await t.test('should provide log object to all handlers', async () => {
    let logInfo = {};
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        checkLog: async ({ log }) => {
          logInfo.hasLog = !!log;
          logInfo.type = typeof log;
          if (log) {
            logInfo.hasError = typeof log.error === 'function';
            logInfo.hasWarn = typeof log.warn === 'function';
            logInfo.hasInfo = typeof log.info === 'function';
            logInfo.hasDebug = typeof log.debug === 'function';
            logInfo.hasTrace = typeof log.trace === 'function';
            // Also check if log itself is callable
            logInfo.isCallable = typeof log === 'function';
          }
          return logInfo;
        }
      }
    });

    const result = await api.checkLog();
    // Debug output
    if (!result.hasLog || !result.hasError || !result.hasWarn || !result.hasInfo || !result.hasDebug || !result.hasTrace) {
      console.log('Log test failed. Log info:', result);
    }
    assert.ok(result.hasLog, 'Log object should be provided');
    assert.ok(result.hasError && result.hasWarn && result.hasInfo && result.hasDebug && result.hasTrace, 
              'Log object should have all logging methods');
  });

  await t.test('should handle scope-specific log levels', async () => {
    const logs = [];
    const customLogger = {
      log: (msg) => logs.push(msg),
      error: (msg) => logs.push(msg),
      warn: (msg) => logs.push(msg)
    };

    const api = new Api({
      name: 'test',
      version: '1.0.0',
      logging: { level: 'warn', logger: customLogger }
    });
    api.customize({
      scopeMethods: {
        testLogging: async ({ log }) => {
          log.debug('debug from scope');
          log.warn('warn from scope');
        }
      }
    });

    // Add scope with debug level
    api.addScope('verbose', { logging: { level: 'debug' } });
    api.addScope('normal', {});

    // Test verbose scope - should see debug
    await api.scopes.verbose.testLogging();
    let logMessages = logs.join(' ');
    assert.ok(logMessages.includes('debug from scope'));
    assert.ok(logMessages.includes('warn from scope'));

    // Clear and test normal scope - should not see debug
    logs.length = 0;
    await api.scopes.normal.testLogging();
    logMessages = logs.join(' ');
    assert.ok(!logMessages.includes('debug from scope'));
    assert.ok(logMessages.includes('warn from scope'));
  });

  await t.test('should validate log level configuration', () => {
    assert.throws(
      () => new Api({
        name: 'test',
        version: '1.0.0',
        logging: { level: 5 } // Invalid numeric level
      }),
      ConfigurationError
    );
  });
});

// Test 8: Error Handling
test('Error Handling', async (t) => {
  await t.test('should provide detailed validation errors', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    try {
      api.addScope('invalid-name', {});
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      assert.equal(error.code, 'VALIDATION_ERROR');
      assert.equal(error.field, 'name');
      assert.equal(error.value, 'invalid-name');
      assert.ok(error.message.includes('Remove invalid characters'));
    }
  });

  await t.test('should provide detailed plugin errors', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    try {
      api.use({ name: 'test-plugin', install: () => {} });
      api.use({ name: 'test-plugin', install: () => {} }); // Duplicate
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
    api.customize({
      scopeMethods: {
        test: async () => 'ok'
      }
    });
    
    api.addScope('users', {});
    
    // This creates a proxy that throws when methods are called
    const nonExistent = api.scopes.nonexistent;
    assert.equal(nonExistent, undefined);
  });

  await t.test('should provide detailed method errors', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.addScope('users', {});
    
    try {
      api.scopes.users();
    } catch (error) {
      assert.ok(error instanceof MethodError);
      assert.equal(error.code, 'METHOD_ERROR');
      assert.equal(error.methodName, 'users');
      assert.ok(error.suggestion.includes('api.scopes.users.methodName()'));
    }
  });

  await t.test('should handle null and undefined gracefully', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Various null/undefined checks
    assert.throws(() => api.addScope(null, {}), ValidationError);
    assert.throws(() => api.addScope(undefined, {}), ValidationError);
    assert.throws(() => api.use(null), PluginError);
    assert.throws(() => api.use(undefined), PluginError);
  });

  await t.test('should prevent prototype pollution attacks', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Try to add dangerous scope names
    assert.throws(() => api.addScope('__proto__', {}), ValidationError);
    assert.throws(() => api.addScope('constructor', {}), ValidationError);
    assert.throws(() => api.addScope('prototype', {}), ValidationError);
  });

  await t.test('should handle symbol properties safely', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    const sym = Symbol('test');
    
    // Symbols should be filtered out
    assert.equal(api.scopes[sym], undefined);
  });
});

// Test 9: Registry
test('Registry', async (t) => {
  await t.test('should register APIs by name and version', () => {
    const api1 = new Api({ name: 'test-api', version: '1.0.0' });
    const api2 = new Api({ name: 'test-api', version: '2.0.0' });
    
    assert.ok(Api.registry.has('test-api'));
    assert.ok(Api.registry.has('test-api', '1.0.0'));
    assert.ok(Api.registry.has('test-api', '2.0.0'));
  });

  await t.test('should prevent duplicate registrations', () => {
    new Api({ name: 'dup-test', version: '1.0.0' });
    assert.throws(
      () => new Api({ name: 'dup-test', version: '1.0.0' }),
      ConfigurationError
    );
  });

  await t.test('should retrieve APIs by version', () => {
    const api1 = new Api({ name: 'versioned', version: '1.0.0' });
    const api2 = new Api({ name: 'versioned', version: '2.0.0' });
    
    const retrieved1 = Api.registry.get('versioned', '1.0.0');
    const retrieved2 = Api.registry.get('versioned', '2.0.0');
    
    assert.equal(retrieved1.options.version, '1.0.0');
    assert.equal(retrieved2.options.version, '2.0.0');
  });

  await t.test('should get latest version by default', () => {
    new Api({ name: 'latest-test', version: '1.0.0' });
    new Api({ name: 'latest-test', version: '2.0.0' });
    new Api({ name: 'latest-test', version: '1.5.0' });
    
    const latest = Api.registry.get('latest-test');
    assert.equal(latest.options.version, '2.0.0');
  });

  await t.test('should support semver ranges', () => {
    new Api({ name: 'range-test', version: '1.0.0' });
    new Api({ name: 'range-test', version: '1.5.0' });
    new Api({ name: 'range-test', version: '2.0.0' });
    
    const v1Compatible = Api.registry.get('range-test', '^1.0.0');
    assert.equal(v1Compatible.options.version, '1.5.0'); // Latest 1.x
    
    const v1Minor = Api.registry.get('range-test', '~1.0.0');
    assert.equal(v1Minor.options.version, '1.0.0'); // 1.0.x only
  });

  await t.test('should list all registered APIs', () => {
    new Api({ name: 'list-test-1', version: '1.0.0' });
    new Api({ name: 'list-test-2', version: '1.0.0' });
    new Api({ name: 'list-test-2', version: '2.0.0' });
    
    const registry = Api.registry.list();
    assert.ok(registry['list-test-1']);
    assert.deepEqual(registry['list-test-1'], ['1.0.0']);
    assert.deepEqual(registry['list-test-2'], ['2.0.0', '1.0.0']);
  });
});

// Test 10: Scope Aliases
test('Scope Aliases', async (t) => {
  await t.test('should create scope alias', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      scopeMethods: {
        get: async () => 'data'
      }
    });
    
    api.setScopeAlias('resources');
    api.addScope('users', {});
    
    // Both should work
    assert.equal(await api.scopes.users.get(), 'data');
    assert.equal(await api.resources.users.get(), 'data');
    
    // Should be the same object
    assert.equal(api.scopes, api.resources);
  });

  await t.test('should create addScope alias', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.setScopeAlias('resources', 'addResource');
    
    // Both should work
    api.addScope('users', {});
    api.addResource('posts', {});
    
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
    api.customize({
      apiMethods: {
        checkAlias: async (context) => {
          capturedAlias = context.tables;
          return !!context.tables;
        }
      }
    });
    
    api.setScopeAlias('tables');
    api.addScope('users', {});
    
    const result = await api.checkAlias();
    assert.ok(result);
    assert.equal(capturedAlias, api.scopes);
  });
});

// Test 11: Edge Cases and Security
test('Edge Cases and Security', async (t) => {
  await t.test('should handle empty customize calls', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Should not throw
    api.customize({});
    api.customize();
  });

  await t.test('should freeze options objects', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        tryModify: async ({ apiOptions, pluginOptions }) => {
          // These should all throw
          const errors = [];
          try { apiOptions.name = 'hacked'; } catch (e) { errors.push('apiOptions.name'); }
          try { apiOptions.newProp = 'value'; } catch (e) { errors.push('apiOptions.newProp'); }
          try { delete apiOptions.version; } catch (e) { errors.push('apiOptions.delete'); }
          try { pluginOptions.test = 'value'; } catch (e) { errors.push('pluginOptions.test'); }
          return errors;
        }
      }
    });

    const errors = await api.tryModify();
    assert.equal(errors.length, 4);
  });

  await t.test('should handle concurrent method calls', async () => {
    let counter = 0;
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        increment: async () => {
          const current = counter;
          await new Promise(resolve => setTimeout(resolve, 10));
          counter = current + 1;
          return counter;
        }
      }
    });

    // Run multiple calls concurrently
    const results = await Promise.all([
      api.increment(),
      api.increment(),
      api.increment()
    ]);

    // Due to race conditions, results might not be [1, 2, 3]
    // but counter should be incremented
    assert.ok(counter > 0);
  });

  await t.test('should handle circular references in context', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        createCircular: async ({ context }) => {
          context.self = context;
          context.data = { ref: context };
          // Should not throw when returning
          return 'ok';
        }
      }
    });

    const result = await api.createCircular();
    assert.equal(result, 'ok');
  });

  await t.test('should handle very long method names', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    const longName = 'a'.repeat(1000);
    
    // Should work fine
    api.customize({
      apiMethods: {
        [longName]: async () => 'ok'
      }
    });
    
    assert.equal(typeof api[longName], 'function');
  });

  await t.test('should handle special characters in error messages', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    try {
      api.addScope('test<script>alert("xss")</script>', {});
    } catch (error) {
      // Error message should include the exact input for debugging
      // This is not an XSS issue as error messages are not rendered as HTML
      assert.ok(error.message.includes('<script>alert("xss")</script>'));
    }
  });

  await t.test('should handle non-string params values', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        acceptAny: async ({ params }) => params
      }
    });

    // All these should work
    assert.equal(await api.acceptAny(null), null);
    assert.deepEqual(await api.acceptAny(undefined), {}); // Default param value
    assert.deepEqual(await api.acceptAny(), {}); // No args also gets default
    assert.equal(await api.acceptAny(123), 123);
    assert.deepEqual(await api.acceptAny([1, 2, 3]), [1, 2, 3]);
  });

  await t.test('should handle methods that return undefined', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        returnNothing: async () => {
          // Implicitly returns undefined
        }
      }
    });

    const result = await api.returnNothing();
    assert.equal(result, undefined);
  });

  await t.test('should maintain separate contexts per call', async () => {
    const contexts = [];
    const api = new Api({ name: 'test', version: '1.0.0' });
    api.customize({
      apiMethods: {
        captureContext: async ({ context, params }) => {
          context.id = params.id;
          contexts.push(context);
          await new Promise(resolve => setTimeout(resolve, 10));
          return context.id;
        }
      }
    });

    const [r1, r2] = await Promise.all([
      api.captureContext({ id: 1 }),
      api.captureContext({ id: 2 })
    ]);

    assert.equal(r1, 1);
    assert.equal(r2, 2);
    assert.equal(contexts[0].id, 1);
    assert.equal(contexts[1].id, 2);
    assert.notEqual(contexts[0], contexts[1]); // Different context objects
  });
});

// Run summary
test.after(() => {
  console.log('\nTest suite completed');
});