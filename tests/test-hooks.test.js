import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, ValidationError } from '../index.js';


test('Hook System', async (t) => {
  await t.test('should run hooks in order', async () => {
    const order = [];
    const api = new Api({ name: 'test' });
    await api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          await runHooks('testHook');
          return order;
        }
      }
    });

    await api.customize({
      hooks: {
        testHook: () => order.push(1)
      }
    });

    await api.customize({
      hooks: {
        testHook: () => order.push(2)
      }
    });

    const result = await api.test();
    assert.deepEqual(result, [1, 2]);
  });

  await t.test('should stop hook chain when returning false', async () => {
    const order = [];
    const api = new Api({ name: 'test' });
    await api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          await runHooks('testHook');
          return order;
        }
      }
    });

    // Add hooks one at a time
    await api.customize({
      hooks: {
        testHook: () => order.push(1)
      }
    });
    
    await api.customize({
      hooks: {
        testHook: () => { order.push(2); return false; }
      }
    });
    
    await api.customize({
      hooks: {
        testHook: () => order.push(3)
      }
    });

    const result = await api.test();
    assert.deepEqual(result, [1, 2]);
  });

  await t.test('should return false from runHooks when chain is stopped', async () => {
    const api = new Api({ name: 'test' });
    let hookResult;
    await api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          hookResult = await runHooks('testHook');
          return hookResult;
        }
      }
    });

    await api.customize({
      hooks: {
        testHook: () => false
      }
    });

    const result = await api.test();
    assert.equal(result, false);
  });

  await t.test('should provide correct parameters to hooks', async () => {
    let hookParams;
    const api = new Api({ name: 'test' });
    await api.customize({
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
    
    // Check hook no longer receives methodParams or params
    assert.ok(!hookParams.includes('methodParams'));
    assert.ok(!hookParams.includes('params'));
    assert.ok(hookParams.includes('context'));
  });

  await t.test('should handle hook placement options', async () => {
    const order = [];
    const api = new Api({ name: 'test' });

    // Install plugins
    await api.use({
      name: 'plugin1',
      install: ({ addHook }) => {
        addHook('test', 'func1', {}, () => order.push('p1'));
      }
    });

    await api.use({
      name: 'plugin2',
      install: ({ addHook }) => {
        addHook('test', 'func2', { beforePlugin: 'plugin1' }, () => order.push('p2-before'));
        addHook('test', 'func3', { afterPlugin: 'plugin1' }, () => order.push('p2-after'));
      }
    });

    await api.customize({
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
    const api = new Api({ name: 'test' });
    await api.customize({
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

    await api.addScope('users', {}, {
      hooks: {
        scopeHook: ({ scopeName }) => calls.push(`users-${scopeName}`)
      }
    });

    await api.addScope('posts', {});

    // Call on users scope - should run both global and users-specific
    await api.scopes.users.test();
    assert.deepEqual(calls, ['global-users', 'users-users']);

    // Reset and call on posts scope - should run only global
    calls.length = 0;
    await api.scopes.posts.test();
    assert.deepEqual(calls, ['global-posts']);
  });

  await t.test('should validate hook configuration', async () => {
    const api = new Api({ name: 'test' });
    
    // Invalid handler type
    await assert.rejects(
      async () => await api.customize({
        hooks: {
          test: 'not a function'
        }
      }),
      ValidationError
    );

    // Missing handler in object form
    await assert.rejects(
      async () => await api.customize({
        hooks: {
          test: { functionName: 'test' }
        }
      }),
      ValidationError
    );
  });

  await t.test('should handle hook errors properly', async () => {
    const api = new Api({ name: 'test' });
    await api.customize({
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
    const api = new Api({ name: 'test' });
    await api.customize({
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

  await t.test('should stop hook chain in scope methods', async () => {
    const calls = [];
    const api = new Api({ name: 'test' });
    
    await api.customize({
      scopeMethods: {
        test: async ({ runHooks }) => {
          const result = await runHooks('scopeHook');
          calls.push('method-executed');
          return { result, calls };
        }
      }
    });

    await api.addScope('users', {}, {
      hooks: {
        scopeHook: () => {
          calls.push('hook1');
          return false;
        }
      }
    });

    const result = await api.scopes.users.test();
    assert.deepEqual(result.calls, ['hook1', 'method-executed']);
    assert.equal(result.result, false);
  });

  await t.test('should handle multiple hooks added separately', async () => {
    const calls = [];
    const api = new Api({ name: 'test' });
    
    await api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          await runHooks('multiHook');
          return calls;
        }
      }
    });

    // Add hooks one by one
    await api.customize({
      hooks: {
        multiHook: () => calls.push(1)
      }
    });
    
    await api.customize({
      hooks: {
        multiHook: () => calls.push(2)
      }
    });
    
    await api.customize({
      hooks: {
        multiHook: () => calls.push(3)
      }
    });

    const result = await api.test();
    assert.deepEqual(result, [1, 2, 3]);
  });

  await t.test('should stop chain with separate hook registrations', async () => {
    const calls = [];
    const api = new Api({ name: 'test' });
    
    await api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          const result = await runHooks('multiHook');
          return { calls, result };
        }
      }
    });

    // Add hooks one by one
    await api.customize({
      hooks: {
        multiHook: () => calls.push(1)
      }
    });
    
    await api.customize({
      hooks: {
        multiHook: () => { calls.push(2); return false; }
      }
    });
    
    await api.customize({
      hooks: {
        multiHook: () => calls.push(3)
      }
    });

    const result = await api.test();
    assert.deepEqual(result.calls, [1, 2]);
    assert.equal(result.result, false);
  });

  await t.test('should handle async hooks that return false', async () => {
    const calls = [];
    const api = new Api({ name: 'test' });
    
    await api.customize({
      apiMethods: {
        test: async ({ runHooks }) => {
          const result = await runHooks('asyncHook');
          return { calls, result };
        }
      }
    });

    // Add async hooks one by one
    await api.customize({
      hooks: {
        asyncHook: async () => { 
          await new Promise(resolve => setTimeout(resolve, 10));
          calls.push('async1');
        }
      }
    });
    
    await api.customize({
      hooks: {
        asyncHook: async () => { 
          await new Promise(resolve => setTimeout(resolve, 10));
          calls.push('async2');
          return false;
        }
      }
    });
    
    await api.customize({
      hooks: {
        asyncHook: async () => { 
          await new Promise(resolve => setTimeout(resolve, 10));
          calls.push('async3');
        }
      }
    });

    const result = await api.test();
    assert.deepEqual(result.calls, ['async1', 'async2']);
    assert.equal(result.result, false);
  });
});