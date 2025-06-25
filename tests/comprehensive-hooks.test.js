import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Hook System Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('Hook Registration', () => {
    it('should add basic hooks', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const handler = () => {};
      api.addHook('test:hook', 'plugin1', 'function1', {}, handler);
      
      assert.ok(api.hooks.has('test:hook'));
      assert.equal(api.hooks.get('test:hook').length, 1);
      assert.equal(api.hooks.get('test:hook')[0].handler, handler);
      assert.equal(api.hooks.get('test:hook')[0].pluginName, 'plugin1');
      assert.equal(api.hooks.get('test:hook')[0].functionName, 'function1');
    });

    it('should validate hook parameters', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const handler = () => {};
      
      // Missing plugin name
      assert.throws(() => {
        api.addHook('test', '', 'func', {}, handler);
      }, /Hook 'test' requires a valid pluginName/);
      
      assert.throws(() => {
        api.addHook('test', null, 'func', {}, handler);
      }, /Hook 'test' requires a valid pluginName/);
      
      assert.throws(() => {
        api.addHook('test', '   ', 'func', {}, handler);
      }, /Hook 'test' requires a valid pluginName/);
      
      // Missing function name
      assert.throws(() => {
        api.addHook('test', 'plugin', '', {}, handler);
      }, /Hook 'test' requires a valid functionName/);
      
      assert.throws(() => {
        api.addHook('test', 'plugin', null, {}, handler);
      }, /Hook 'test' requires a valid functionName/);
      
      // Invalid handler
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {}, 'not a function');
      }, /Hook 'test' handler must be a function/);
      
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {}, null);
      }, /Hook 'test' handler must be a function/);
    });

    it('should handle hooks from customize method', () => {
      const handler1 = () => 'handler1';
      const handler2 = () => 'handler2';
      
      const api = new Api({
        name: 'test',
        version: '1.0.0'
      });
      
      // Add a plugin that 'other' can reference
      api.use({
        name: 'other',
        install: () => {}
      });
      
      api.customize({
        hooks: {
          'simple': handler1,
          'complex': {
            handler: handler2,
            functionName: 'customName',
            beforePlugin: 'other'
          }
        }
      });
      
      assert.equal(api.hooks.get('simple')[0].handler, handler1);
      assert.equal(api.hooks.get('simple')[0].functionName, 'simple');
      
      assert.equal(api.hooks.get('complex')[0].handler, handler2);
      assert.equal(api.hooks.get('complex')[0].functionName, 'customName');
    });

    it('should validate customize hook definitions', () => {
      const api = new Api({
        name: 'test',
        version: '1.0.0'
      });
      
      assert.throws(() => {
        api.customize({
          hooks: {
            'invalid': 123
          }
        });
      }, /Hook 'invalid' must be a function or object/);
      
      assert.throws(() => {
        api.customize({
          hooks: {
            'invalid': { handler: 'not a function' }
          }
        });
      }, /Hook 'invalid' must have a function handler/);
    });
  });

  describe('Hook Ordering and Placement', () => {
    it('should handle beforePlugin placement', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'plugin1', 'func1', {}, () => 1);
      api.addHook('test', 'plugin2', 'func2', {}, () => 2);
      api.addHook('test', 'plugin3', 'func3', { beforePlugin: 'plugin2' }, () => 3);
      
      const hooks = api.hooks.get('test');
      assert.equal(hooks[0].handler(), 1);
      assert.equal(hooks[1].handler(), 3); // Inserted before plugin2
      assert.equal(hooks[2].handler(), 2);
    });

    it('should handle afterPlugin placement', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'plugin1', 'func1', {}, () => 1);
      api.addHook('test', 'plugin2', 'func2', {}, () => 2);
      api.addHook('test', 'plugin3', 'func3', { afterPlugin: 'plugin1' }, () => 3);
      
      const hooks = api.hooks.get('test');
      assert.equal(hooks[0].handler(), 1);
      assert.equal(hooks[1].handler(), 3); // Inserted after plugin1
      assert.equal(hooks[2].handler(), 2);
    });

    it('should handle beforeFunction placement', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'plugin1', 'funcA', {}, () => 1);
      api.addHook('test', 'plugin2', 'funcB', {}, () => 2);
      api.addHook('test', 'plugin3', 'funcC', { beforeFunction: 'funcB' }, () => 3);
      
      const hooks = api.hooks.get('test');
      assert.equal(hooks[0].handler(), 1);
      assert.equal(hooks[1].handler(), 3); // Inserted before funcB
      assert.equal(hooks[2].handler(), 2);
    });

    it('should handle afterFunction placement', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'plugin1', 'funcA', {}, () => 1);
      api.addHook('test', 'plugin2', 'funcB', {}, () => 2);
      api.addHook('test', 'plugin3', 'funcC', { afterFunction: 'funcA' }, () => 3);
      
      const hooks = api.hooks.get('test');
      assert.equal(hooks[0].handler(), 1);
      assert.equal(hooks[1].handler(), 3); // Inserted after funcA
      assert.equal(hooks[2].handler(), 2);
    });

    it('should handle multiple same plugin/function names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'plugin', 'func', {}, () => 1);
      api.addHook('test', 'plugin', 'func', {}, () => 2);
      api.addHook('test', 'other', 'func', {}, () => 3);
      api.addHook('test', 'plugin', 'func', { afterPlugin: 'plugin' }, () => 4);
      
      const hooks = api.hooks.get('test');
      assert.equal(hooks[0].handler(), 1);
      assert.equal(hooks[1].handler(), 2);
      assert.equal(hooks[2].handler(), 4); // After last 'plugin'
      assert.equal(hooks[3].handler(), 3);
    });

    it('should throw on conflicting placements', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {
          beforePlugin: 'p1',
          afterPlugin: 'p2'
        }, () => {});
      }, /Hook 'test' can only specify one placement parameter/);
      
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {
          beforeFunction: 'f1',
          afterFunction: 'f2'
        }, () => {});
      }, /Hook 'test' can only specify one placement parameter/);
      
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {
          beforePlugin: 'p1',
          beforeFunction: 'f1'
        }, () => {});
      }, /Hook 'test' can only specify one placement parameter/);
    });

    it('should throw on non-existent placement targets', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'existing', 'func', {}, () => {});
      
      assert.throws(() => {
        api.addHook('test', 'new', 'func', { beforePlugin: 'nonexistent' }, () => {});
      }, /Hook 'test' placement target not found/);
      
      assert.throws(() => {
        api.addHook('test', 'new', 'func', { afterFunction: 'nonexistent' }, () => {});
      }, /Hook 'test' placement target not found/);
    });
  });

  describe('Hook Execution', () => {
    it('should execute hooks in order', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const calls = [];
      
      api.addHook('test', 'p1', 'f1', {}, () => calls.push(1));
      api.addHook('test', 'p2', 'f2', {}, () => calls.push(2));
      api.addHook('test', 'p3', 'f3', {}, () => calls.push(3));
      
      await api.runHooks('test', {});
      assert.deepEqual(calls, [1, 2, 3]);
    });

    it('should pass context through hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'p1', 'f1', {}, ({ context }) => {
        context.value = 1;
      });
      
      api.addHook('test', 'p2', 'f2', {}, ({ context }) => {
        context.value += 1;
      });
      
      const context = {};
      const result = await api.runHooks('test', context);
      assert.equal(result.value, 2);
      assert.equal(context.value, 2); // Same object
    });

    it('should handle async hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const calls = [];
      
      api.addHook('test', 'p1', 'f1', {}, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        calls.push(1);
      });
      
      api.addHook('test', 'p2', 'f2', {}, async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        calls.push(2);
      });
      
      await api.runHooks('test', {});
      assert.deepEqual(calls, [1, 2]); // Should maintain order despite timing
    });

    it('should stop chain when hook returns false', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const calls = [];
      
      api.addHook('test', 'p1', 'f1', {}, () => {
        calls.push(1);
      });
      
      api.addHook('test', 'p2', 'f2', {}, () => {
        calls.push(2);
        return false; // Stop chain
      });
      
      api.addHook('test', 'p3', 'f3', {}, () => {
        calls.push(3);
      });
      
      await api.runHooks('test', {});
      assert.deepEqual(calls, [1, 2]); // 3 should not run
    });

    it('should pass all hook parameters correctly', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      let captured;
      
      api.addHook('test:hook', 'plugin', 'func', { custom: 'param' }, (args) => {
        captured = args;
      });
      
      const context = { data: 'test' };
      await api.runHooks('test:hook', context);
      
      assert.deepEqual(captured.context, context);
      assert.equal(captured.api, api);
      assert.equal(captured.name, 'test:hook');
      assert.ok(captured.options);
      assert.deepEqual(captured.params, {}); // Always empty object
      assert.equal(captured.resource, null);
    });

    it('should handle non-existent hooks gracefully', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const result = await api.runHooks('nonexistent', { test: true });
      assert.deepEqual(result, { test: true });
    });

    it('should handle errors in hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'p1', 'f1', {}, () => {
        throw new Error('Hook error');
      });
      
      await assert.rejects(
        api.runHooks('test', {}),
        /Hook error/
      );
    });

    it('should handle various return values from hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const results = [];
      
      const values = [
        null,
        undefined,
        true,
        0,
        1,
        '',
        'string',
        [],
        {},
        Promise.resolve('async'),
        async () => 'function'
      ];
      
      for (const [i, value] of values.entries()) {
        api.addHook(`test${i}`, 'p', 'f', {}, () => value);
        
        const result = await api.runHooks(`test${i}`, {});
        results.push(result);
      }
      
      // Only false stops the chain, all other values continue
      assert.equal(results.length, values.length);
    });
  });

  describe('Hook Context with Resources', () => {
    it('should provide resource-specific api and options', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.constants.set('GLOBAL', 'global');
      api.addResource('items', { resourceProp: 'value' }, {
        constants: { RESOURCE: 'resource' }
      });
      
      let captured;
      api.addHook('test', 'p', 'f', {}, (args) => {
        captured = args;
      });
      
      await api.runHooks('test', {}, 'items');
      
      assert.equal(captured.resource, 'items');
      assert.equal(captured.api.constants.get('GLOBAL'), 'global');
      assert.equal(captured.api.constants.get('RESOURCE'), 'resource');
      assert.deepEqual(captured.options.resources, { resourceProp: 'value' });
    });

    it('should handle hooks without resource context', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let captured;
      api.addHook('test', 'p', 'f', {}, (args) => {
        captured = args;
      });
      
      await api.runHooks('test', {});
      
      assert.equal(captured.resource, null);
      assert.equal(captured.api, api);
      assert.ok(!captured.options.resources);
    });
  });

  describe('Complex Hook Scenarios', () => {
    it('should handle deeply nested hook chains', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const depth = [];
      
      // Create nested hook calls
      api.addHook('level1', 'p', 'f', {}, async ({ api }) => {
        depth.push(1);
        await api.runHooks('level2', {});
      });
      
      api.addHook('level2', 'p', 'f', {}, async ({ api }) => {
        depth.push(2);
        await api.runHooks('level3', {});
      });
      
      api.addHook('level3', 'p', 'f', {}, () => {
        depth.push(3);
      });
      
      await api.runHooks('level1', {});
      assert.deepEqual(depth, [1, 2, 3]);
    });

    it('should handle concurrent hook executions', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const results = [];
      
      for (let i = 0; i < 5; i++) {
        api.addHook(`hook${i}`, 'p', 'f', {}, async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          results.push(i);
        });
      }
      
      // Run all hooks concurrently
      await Promise.all([
        api.runHooks('hook0', {}),
        api.runHooks('hook1', {}),
        api.runHooks('hook2', {}),
        api.runHooks('hook3', {}),
        api.runHooks('hook4', {})
      ]);
      
      assert.equal(results.length, 5);
      assert.ok(results.includes(0));
      assert.ok(results.includes(1));
      assert.ok(results.includes(2));
      assert.ok(results.includes(3));
      assert.ok(results.includes(4));
    });

    it('should maintain hook isolation between API instances', async () => {
      const api1 = new Api({ name: 'api1', version: '1.0.0' });
      const api2 = new Api({ name: 'api2', version: '1.0.0' });
      
      const calls1 = [];
      const calls2 = [];
      
      api1.addHook('test', 'p', 'f', {}, () => calls1.push('api1'));
      api2.addHook('test', 'p', 'f', {}, () => calls2.push('api2'));
      
      await api1.runHooks('test', {});
      await api2.runHooks('test', {});
      
      assert.deepEqual(calls1, ['api1']);
      assert.deepEqual(calls2, ['api2']);
    });

    it('should handle hooks modifying the same context concurrently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('modify', 'p1', 'f1', {}, ({ context }) => {
        context.values = context.values || [];
        context.values.push(1);
      });
      
      api.addHook('modify', 'p2', 'f2', {}, ({ context }) => {
        context.values = context.values || [];
        context.values.push(2);
      });
      
      api.addHook('modify', 'p3', 'f3', {}, ({ context }) => {
        context.values = context.values || [];
        context.values.push(3);
      });
      
      const context = {};
      await api.runHooks('modify', context);
      
      assert.deepEqual(context.values, [1, 2, 3]);
    });
  });

  describe('Hook Performance and Limits', () => {
    it('should handle large number of hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      let counter = 0;
      
      // Add 1000 hooks
      for (let i = 0; i < 1000; i++) {
        api.addHook('massive', `p${i}`, `f${i}`, {}, () => {
          counter++;
        });
      }
      
      await api.runHooks('massive', {});
      assert.equal(counter, 1000);
    });

    it('should handle very long hook names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const longName = 'hook:' + 'a'.repeat(1000);
      
      api.addHook(longName, 'p', 'f', {}, () => {});
      assert.ok(api.hooks.has(longName));
    });

    it('should handle hooks with large contexts', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const largeContext = {
        bigArray: new Array(10000).fill('data'),
        bigObject: {}
      };
      
      for (let i = 0; i < 1000; i++) {
        largeContext.bigObject[`key${i}`] = `value${i}`;
      }
      
      let received;
      api.addHook('test', 'p', 'f', {}, ({ context }) => {
        received = context;
      });
      
      await api.runHooks('test', largeContext);
      assert.equal(received, largeContext);
      assert.equal(received.bigArray.length, 10000);
    });
  });

  describe('Hook Edge Cases', () => {
    it('should handle hooks with special characters in names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const specialNames = [
        'before:save',
        'after:delete',
        'error:validation',
        'user.created',
        'user-updated',
        'user_deleted',
        'user/action',
        'user\\event',
        'user@domain',
        'user#tag',
        'user$money',
        'user%percent',
        'user^power',
        'user&and',
        'user*star',
        'user(paren)',
        'user[bracket]',
        'user{brace}',
        'user|pipe',
        'user~tilde',
        'user`tick',
        'пользователь:создан',
        '用户:创建',
        '🎉:celebration'
      ];
      
      for (const name of specialNames) {
        assert.doesNotThrow(() => {
          api.addHook(name, 'p', 'f', {}, () => {});
        }, `Failed for hook name: ${name}`);
      }
    });

    it('should handle Symbol hook names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const sym = Symbol('hook');
      
      api.addHook(sym, 'p', 'f', {}, () => {});
      assert.ok(api.hooks.has(sym));
    });

    it('should prevent adding hooks during hook execution', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      let errorThrown = false;
      
      api.addHook('self-modifying', 'p', 'f', {}, ({ api }) => {
        // Should throw error when trying to add hook during execution
        assert.throws(() => {
          api.addHook('self-modifying', 'p2', 'f2', {}, () => {});
        }, {
          message: 'Cannot add hooks while hooks are executing'
        });
        errorThrown = true;
      });
      
      await api.runHooks('self-modifying', {});
      assert.equal(errorThrown, true, 'Should have thrown error when adding hook during execution');
      
      // Verify only one hook exists
      assert.equal(api.hooks.get('self-modifying').length, 1);
    });

    it('should handle circular references in hook parameters', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const context = { name: 'test' };
      context.self = context;
      
      let received;
      api.addHook('test', 'p', 'f', {}, ({ context }) => {
        received = context;
      });
      
      await api.runHooks('test', context);
      assert.equal(received.self, received);
    });

    it('should handle hooks with no operation', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Empty functions
      api.addHook('noop', 'p1', 'f1', {}, () => {});
      api.addHook('noop', 'p2', 'f2', {}, function() {});
      api.addHook('noop', 'p3', 'f3', {}, async () => {});
      api.addHook('noop', 'p4', 'f4', {}, async function() {});
      
      await assert.doesNotReject(api.runHooks('noop', {}));
    });

    it('should preserve hook handler properties', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const handler = () => {};
      handler.customProp = 'custom value';
      handler.metadata = { version: 1 };
      
      api.addHook('test', 'p', 'f', {}, handler);
      
      const registered = api.hooks.get('test')[0].handler;
      assert.equal(registered.customProp, 'custom value');
      assert.deepEqual(registered.metadata, { version: 1 });
    });
  });

  describe('Hook System Console Output', () => {
    it('should log when hook stops chain', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Capture console.log
      const originalLog = console.log;
      let logOutput = '';
      console.log = (msg) => { logOutput = msg; };
      
      try {
        api.addHook('stopper', 'myPlugin', 'myFunction', {}, () => false);
        await api.runHooks('stopper', {});
        
        assert.ok(logOutput.includes("Hook 'stopper' handler from plugin 'myPlugin' (function: 'myFunction') stopped the chain"));
      } finally {
        console.log = originalLog;
      }
    });
  });
});