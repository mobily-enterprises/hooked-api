import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Handler Execution and Context Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('Handler Context Structure', () => {
    it('should provide complete context to implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let capturedContext;
      api.implement('capture', (context) => {
        capturedContext = context;
        return 'done';
      });
      
      const result = await api.run.capture({ foo: 'bar' });
      
      assert.equal(result, 'done');
      assert.ok(capturedContext);
      assert.deepEqual(capturedContext.context, {});
      assert.equal(capturedContext.api, api);
      assert.equal(capturedContext.name, 'capture');
      assert.deepEqual(capturedContext.options, { api: api.options });
      assert.deepEqual(capturedContext.params, { foo: 'bar' });
      assert.equal(capturedContext.resource, null);
    });

    it('should provide frozen options.api', async () => {
      const api = new Api({ 
        name: 'test', 
        version: '1.0.0',
        custom: 'value'
      });
      
      let capturedOptions;
      api.implement('test', ({ options }) => {
        capturedOptions = options;
      });
      
      await api.run.test();
      
      assert.ok(Object.isFrozen(capturedOptions.api));
      assert.equal(capturedOptions.api.custom, 'value');
      
      assert.throws(() => {
        capturedOptions.api.custom = 'modified';
      });
    });

    it('should handle all parameter types', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const testCases = [
        { params: undefined, expected: {} },
        { params: null, expected: null },
        { params: 'string', expected: 'string' },
        { params: 123, expected: 123 },
        { params: true, expected: true },
        { params: false, expected: false },
        { params: [], expected: [] },
        { params: { nested: { deep: 'value' } }, expected: { nested: { deep: 'value' } } },
        { params: new Date('2024-01-01'), expected: new Date('2024-01-01') },
        { params: /regex/, expected: /regex/ },
        { params: new Map([['key', 'value']]), expected: new Map([['key', 'value']]) },
        { params: new Set([1, 2, 3]), expected: new Set([1, 2, 3]) }
      ];
      
      for (const { params, expected } of testCases) {
        let captured;
        api.implement('test', ({ params }) => {
          captured = params;
        });
        
        await api.run.test(params);
        
        if (expected instanceof Date) {
          assert.equal(captured.getTime(), expected.getTime());
        } else if (expected instanceof RegExp) {
          assert.equal(captured.toString(), expected.toString());
        } else if (expected instanceof Map || expected instanceof Set) {
          assert.deepEqual([...captured], [...expected]);
        } else {
          assert.deepEqual(captured, expected);
        }
      }
    });
  });

  describe('Handler Execution Methods', () => {
    it('should execute via direct _run method', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('direct', ({ params }) => `direct: ${params.value}`);
      
      const result = await api._run('direct', { value: 'test' });
      assert.equal(result, 'direct: test');
    });

    it('should execute via proxy run.method syntax', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('proxy', ({ params }) => `proxy: ${params.value}`);
      
      const result = await api.run.proxy({ value: 'test' });
      assert.equal(result, 'proxy: test');
    });

    it('should execute via proxy run(method) syntax', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('call', ({ params }) => `call: ${params.value}`);
      
      const result = await api.run('call', { value: 'test' });
      assert.equal(result, 'call: test');
    });

    it('should handle async implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('async', async ({ params }) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return `async: ${params.value}`;
      });
      
      const result = await api.run.async({ value: 'test' });
      assert.equal(result, 'async: test');
    });

    it('should handle implementers returning promises', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('promise', ({ params }) => {
        return Promise.resolve(`promise: ${params.value}`);
      });
      
      const result = await api.run.promise({ value: 'test' });
      assert.equal(result, 'promise: test');
    });
  });

  describe('Handler Return Values', () => {
    it('should handle all types of return values', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const testCases = [
        { method: 'null', returns: null },
        { method: 'undefined', returns: undefined },
        { method: 'boolean', returns: true },
        { method: 'number', returns: 42 },
        { method: 'string', returns: 'result' },
        { method: 'array', returns: [1, 2, 3] },
        { method: 'object', returns: { key: 'value' } },
        { method: 'date', returns: new Date('2024-01-01') },
        { method: 'regexp', returns: /pattern/ },
        { method: 'error', returns: new Error('not thrown') },
        { method: 'function', returns: () => 'nested function' },
        { method: 'symbol', returns: Symbol('test') },
        { method: 'bigint', returns: BigInt(123) },
        { method: 'map', returns: new Map([['k', 'v']]) },
        { method: 'set', returns: new Set([1, 2, 3]) },
        { method: 'promise', returns: Promise.resolve('async value') }
      ];
      
      for (const { method, returns } of testCases) {
        api.implement(method, () => returns);
        const result = await api.run[method]();
        
        if (returns instanceof Date) {
          assert.equal(result.getTime(), returns.getTime());
        } else if (returns instanceof RegExp) {
          assert.equal(result.toString(), returns.toString());
        } else if (typeof returns === 'symbol') {
          assert.equal(typeof result, 'symbol');
        } else if (typeof returns === 'bigint') {
          assert.equal(result, returns);
        } else if (returns instanceof Map || returns instanceof Set) {
          assert.deepEqual([...result], [...returns]);
        } else if (returns instanceof Promise) {
          assert.equal(await result, 'async value');
        } else {
          assert.deepEqual(result, returns);
        }
      }
    });

    it('should handle circular references in return values', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('circular', () => {
        const obj = { name: 'circular' };
        obj.self = obj;
        return obj;
      });
      
      const result = await api.run.circular();
      assert.equal(result.self, result);
    });

    it('should handle very large return values', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('large', () => {
        return {
          bigArray: new Array(10000).fill('data'),
          bigString: 'x'.repeat(100000),
          deepNesting: JSON.parse(JSON.stringify({ level: 0 }, (key, value) => {
            if (key === 'level' && value < 100) {
              return { level: value + 1 };
            }
            return value;
          }))
        };
      });
      
      const result = await api.run.large();
      assert.equal(result.bigArray.length, 10000);
      assert.equal(result.bigString.length, 100000);
    });
  });

  describe('Handler Access to API Features', () => {
    it('should access constants from handler', async () => {
      const api = new Api({ 
        name: 'test', 
        version: '1.0.0'
      });
      
      api.customize({
        constants: {
          MAX_RETRIES: 3,
          TIMEOUT: 5000
        }
      });
      
      api.implement('useConstants', ({ api }) => {
        return {
          retries: api.constants.get('MAX_RETRIES'),
          timeout: api.constants.get('TIMEOUT'),
          missing: api.constants.get('NONEXISTENT')
        };
      });
      
      const result = await api.run.useConstants();
      assert.deepEqual(result, {
        retries: 3,
        timeout: 5000,
        missing: undefined
      });
    });

    it('should call other implementers from handler', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('helper', ({ params }) => `helper: ${params.value}`);
      api.implement('caller', async ({ api, params }) => {
        const helperResult = await api.run.helper({ value: params.input });
        return `caller got ${helperResult}`;
      });
      
      const result = await api.run.caller({ input: 'test' });
      assert.equal(result, 'caller got helper: test');
    });

    it('should run hooks from handler', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let hookRan = false;
      api.addHook('custom:hook', 'plugin', 'func', {}, () => {
        hookRan = true;
      });
      
      api.implement('triggerHook', async ({ api }) => {
        await api.runHooks('custom:hook', {});
        return 'hooks triggered';
      });
      
      const result = await api.run.triggerHook();
      assert.equal(result, 'hooks triggered');
      assert.ok(hookRan);
    });

    it('should access resources from handler', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users', {}, {
        implementers: {
          find: ({ params }) => ({ id: params.id, name: 'John' })
        }
      });
      
      api.implement('getUser', async ({ api, params }) => {
        return await api.resources.users.find({ id: params.userId });
      });
      
      const result = await api.run.getUser({ userId: 123 });
      assert.deepEqual(result, { id: 123, name: 'John' });
    });

    it('should access plugin options from handler', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'myPlugin',
        install: ({ api }) => {
          api.implement('pluginMethod', ({ options }) => {
            return options.myPlugin;
          });
        }
      };
      
      api.use(plugin, { setting: 'value', enabled: true });
      
      const result = await api.run.pluginMethod();
      assert.deepEqual(result, { setting: 'value', enabled: true });
    });
  });

  describe('Resource Handler Context', () => {
    it('should provide resource context to handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let captured;
      api.addResource('products', { table: 'products_table' }, {
        implementers: {
          capture: (context) => {
            captured = context;
            return 'captured';
          }
        }
      });
      
      await api.resources.products.capture({ test: true });
      
      assert.equal(captured.resource, 'products');
      assert.equal(captured.name, 'capture');
      assert.deepEqual(captured.params, { test: true });
      assert.deepEqual(captured.options.resources, { table: 'products_table' });
      assert.ok(captured.api);
      assert.deepEqual(captured.context, {});
    });

    it('should provide merged constants in resource context', async () => {
      const api = new Api({ 
        name: 'test', 
        version: '1.0.0'
      });
      
      api.customize({
        constants: { GLOBAL: 'global', SHARED: 'from global' }
      });
      
      api.addResource('items', {}, {
        constants: { 
          RESOURCE: 'resource', 
          SHARED: 'from resource' 
        },
        implementers: {
          getConstants: ({ api }) => ({
            global: api.constants.get('GLOBAL'),
            resource: api.constants.get('RESOURCE'),
            shared: api.constants.get('SHARED')
          })
        }
      });
      
      const result = await api.resources.items.getConstants();
      assert.deepEqual(result, {
        global: 'global',
        resource: 'resource',
        shared: 'from resource' // Resource overrides global
      });
    });

    it('should provide merged implementers in resource context', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('globalMethod', () => 'from global');
      api.implement('sharedMethod', () => 'global version');
      
      api.addResource('items', {}, {
        implementers: {
          resourceMethod: () => 'from resource',
          sharedMethod: () => 'resource version',
          callMethods: async ({ api }) => ({
            global: await api.run.globalMethod(),
            resource: await api.run.resourceMethod(),
            shared: await api.run.sharedMethod()
          })
        }
      });
      
      const result = await api.resources.items.callMethods();
      assert.deepEqual(result, {
        global: 'from global',
        resource: 'from resource',
        shared: 'resource version' // Resource overrides global
      });
    });
  });

  describe('Handler Error Scenarios', () => {
    it('should propagate sync errors from handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('syncError', () => {
        throw new Error('Sync error in handler');
      });
      
      await assert.rejects(
        api.run.syncError(),
        /Sync error in handler/
      );
    });

    it('should propagate async errors from handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('asyncError', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async error in handler');
      });
      
      await assert.rejects(
        api.run.asyncError(),
        /Async error in handler/
      );
    });

    it('should propagate promise rejections from handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('promiseReject', () => {
        return Promise.reject(new Error('Promise rejection in handler'));
      });
      
      await assert.rejects(
        api.run.promiseReject(),
        /Promise rejection in handler/
      );
    });

    it('should handle errors when accessing api features', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('badAccess', async ({ api }) => {
        // Try to call non-existent method
        return await api.run.nonExistent();
      });
      
      await assert.rejects(
        api.run.badAccess(),
        /No implementation found for method: nonExistent/
      );
    });
  });

  describe('Handler Execution Order and Timing', () => {
    it('should execute handlers sequentially when called in sequence', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const order = [];
      
      api.implement('first', async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push(1);
        return 'first';
      });
      
      api.implement('second', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(2);
        return 'second';
      });
      
      const result1 = await api.run.first();
      const result2 = await api.run.second();
      
      assert.equal(result1, 'first');
      assert.equal(result2, 'second');
      assert.deepEqual(order, [1, 2]);
    });

    it('should execute handlers concurrently when called in parallel', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const times = [];
      
      api.implement('slow', async () => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        times.push(Date.now() - start);
        return 'slow';
      });
      
      api.implement('fast', async () => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, 10));
        times.push(Date.now() - start);
        return 'fast';
      });
      
      const [result1, result2] = await Promise.all([
        api.run.slow(),
        api.run.fast()
      ]);
      
      assert.equal(result1, 'slow');
      assert.equal(result2, 'fast');
      // Fast should complete first (times[0]) before slow (times[1])
      assert.ok(times[0] < times[1]);
    });
  });

  describe('Handler Recursion and Nesting', () => {
    it('should handle recursive handler calls', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('factorial', async ({ api, params }) => {
        if (params.n <= 1) return 1;
        const sub = await api.run.factorial({ n: params.n - 1 });
        return params.n * sub;
      });
      
      const result = await api.run.factorial({ n: 5 });
      assert.equal(result, 120);
    });

    it('should handle deeply nested handler calls', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('nested', async ({ api, params }) => {
        if (params.depth === 0) return 'bottom';
        return await api.run.nested({ depth: params.depth - 1 });
      });
      
      const result = await api.run.nested({ depth: 100 });
      assert.equal(result, 'bottom');
    });

    it('should handle mutual recursion between handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('even', async ({ api, params }) => {
        if (params.n === 0) return true;
        return await api.run.odd({ n: params.n - 1 });
      });
      
      api.implement('odd', async ({ api, params }) => {
        if (params.n === 0) return false;
        return await api.run.even({ n: params.n - 1 });
      });
      
      assert.equal(await api.run.even({ n: 10 }), true);
      assert.equal(await api.run.even({ n: 11 }), false);
      assert.equal(await api.run.odd({ n: 10 }), false);
      assert.equal(await api.run.odd({ n: 11 }), true);
    });
  });

  describe('Handler with Complex State Management', () => {
    it('should handle stateful operations correctly', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Simulate a counter with state
      let counter = 0;
      
      api.implement('increment', () => ++counter);
      api.implement('decrement', () => --counter);
      api.implement('reset', () => { counter = 0; return counter; });
      api.implement('get', () => counter);
      
      assert.equal(await api.run.increment(), 1);
      assert.equal(await api.run.increment(), 2);
      assert.equal(await api.run.decrement(), 1);
      assert.equal(await api.run.get(), 1);
      assert.equal(await api.run.reset(), 0);
    });

    it('should handle concurrent state modifications', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const operations = [];
      
      api.implement('addOperation', ({ params }) => {
        operations.push(params.op);
      });
      
      // Run many concurrent operations
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(api.run.addOperation({ op: i }));
      }
      
      await Promise.all(promises);
      
      // All operations should be recorded
      assert.equal(operations.length, 100);
      assert.ok(operations.includes(0));
      assert.ok(operations.includes(99));
    });
  });

  describe('Handler Context Isolation', () => {
    it('should isolate context between different API instances', async () => {
      const api1 = new Api({ name: 'api1', version: '1.0.0' });
      const api2 = new Api({ name: 'api2', version: '1.0.0' });
      
      let context1, context2;
      
      api1.implement('capture', (ctx) => { context1 = ctx; });
      api2.implement('capture', (ctx) => { context2 = ctx; });
      
      await api1.run.capture();
      await api2.run.capture();
      
      assert.notEqual(context1.api, context2.api);
      assert.equal(context1.options.api.name, 'api1');
      assert.equal(context2.options.api.name, 'api2');
    });

    it('should provide fresh context for each handler invocation', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const contexts = [];
      
      api.implement('collectContext', ({ context }) => {
        context.modified = true;
        contexts.push(context);
      });
      
      await api.run.collectContext();
      await api.run.collectContext();
      await api.run.collectContext();
      
      assert.equal(contexts.length, 3);
      // Each should be a new object
      assert.notEqual(contexts[0], contexts[1]);
      assert.notEqual(contexts[1], contexts[2]);
      assert.notEqual(contexts[0], contexts[2]);
    });
  });

  describe('Handler Edge Cases', () => {
    it('should handle handlers that modify the API during execution', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('modifier', ({ api }) => {
        // Add new method during execution
        api.implement('dynamic', () => 'dynamically added');
        return 'modified';
      });
      
      const result = await api.run.modifier();
      assert.equal(result, 'modified');
      
      // Dynamic method should now be available
      const dynamicResult = await api.run.dynamic();
      assert.equal(dynamicResult, 'dynamically added');
    });

    it('should handle very long running handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('longRunning', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'completed';
      });
      
      const start = Date.now();
      const result = await api.run.longRunning();
      const duration = Date.now() - start;
      
      assert.equal(result, 'completed');
      assert.ok(duration >= 100);
    });

    it('should handle handlers with no return value', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('noReturn', () => {
        // Implicitly returns undefined
      });
      
      api.implement('explicitUndefined', () => {
        return undefined;
      });
      
      api.implement('explicitVoid', () => {
        return void 0;
      });
      
      assert.equal(await api.run.noReturn(), undefined);
      assert.equal(await api.run.explicitUndefined(), undefined);
      assert.equal(await api.run.explicitVoid(), undefined);
    });

    it('should handle Symbol method names', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const sym = Symbol('method');
      api.implement(sym, () => 'symbol method result');
      
      const result = await api._run(sym);
      assert.equal(result, 'symbol method result');
    });

    it('should handle handlers accessing undefined properties', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('undefinedAccess', ({ options, api, context }) => {
        return {
          undefinedOption: options.nonExistent,
          undefinedConstant: api.constants.get('nonExistent'),
          undefinedContext: context.nonExistent
        };
      });
      
      const result = await api.run.undefinedAccess();
      assert.deepEqual(result, {
        undefinedOption: undefined,
        undefinedConstant: undefined,
        undefinedContext: undefined
      });
    });
  });
});