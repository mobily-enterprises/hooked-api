import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Error Handling and Edge Cases Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('Constructor Error Handling', () => {
    it('should provide clear error messages for all validation failures', () => {
      // Name validation
      assert.throws(() => new Api(), {
        message: 'API instance must have a non-empty "name" property.'
      });
      
      assert.throws(() => new Api({ name: null }), {
        message: 'API instance must have a non-empty "name" property.'
      });
      
      assert.throws(() => new Api({ name: '  ' }), {
        message: 'API instance must have a non-empty "name" property.'
      });
      
      // Version validation
      assert.throws(() => new Api({ name: 'test', version: 'bad' }), {
        message: "Invalid version format 'bad' for API 'test'."
      });
      
      assert.throws(() => new Api({ name: 'test', version: null }), {
        message: "Invalid version format 'null' for API 'test'."
      });
    });

    it('should handle constructor throwing during property initialization', () => {
      // Test with getters that throw
      const badOptions = {
        name: 'test',
        version: '1.0.0',
        get hooks() { throw new Error('hooks getter error'); }
      };
      
      assert.throws(() => new Api(badOptions), /hooks getter error/);
    });
  });

  describe('Registry Error Handling', () => {
    it('should handle duplicate registration attempts', () => {
      const api1 = new Api({ name: 'duplicate', version: '1.0.0' });
      
      assert.throws(() => {
        new Api({ name: 'duplicate', version: '1.0.0' });
      }, {
        message: "API 'duplicate' version '1.0.0' is already registered."
      });
      
      // Same API instance trying to register again
      assert.throws(() => {
        api1.register();
      }, {
        message: "API 'duplicate' version '1.0.0' is already registered."
      });
    });

    it('should handle registry queries with invalid inputs', () => {
      assert.equal(Api.registry.get(null), null);
      assert.equal(Api.registry.get(undefined), null);
      assert.equal(Api.registry.get(''), null);
      assert.equal(Api.registry.get('nonexistent'), null);
      assert.equal(Api.registry.get('test', 'invalid-version'), null);
      
      assert.deepEqual(Api.registry.versions(null), []);
      assert.deepEqual(Api.registry.versions(undefined), []);
      assert.deepEqual(Api.registry.versions(''), []);
      assert.deepEqual(Api.registry.versions('nonexistent'), []);
    });

    it('should handle malformed version queries gracefully', () => {
      new Api({ name: 'test', version: '1.0.0' });
      
      // These should not throw, just return null
      assert.equal(Api.registry.get('test', ''), null); // Empty string
      assert.equal(Api.registry.get('test', '...'), null); // Invalid format
      
      // Note: semver behavior:
      // 'v1.0.0' is normalized to '1.0.0' - treated as exact version that doesn't exist
      assert.equal(Api.registry.get('test', 'v1.0.0'), null);
      
      // '1.0' is treated as range '>=1.0.0 <1.1.0-0' by semver
      // Since we have 1.0.0, this WILL match
      assert.equal(Api.registry.get('test', '1.0').options.version, '1.0.0');
      
      // Add more invalid inputs
      assert.equal(Api.registry.get('test', 'invalid'), null);
      assert.equal(Api.registry.get('test', '1.a.b'), null);
      assert.equal(Api.registry.get('test', 'abc123'), null);
    });
  });

  describe('Hook Error Handling', () => {
    it('should provide specific validation error messages', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Plugin name validation
      assert.throws(() => {
        api.addHook('test', '', 'func', {}, () => {});
      }, {
        message: "Hook 'test' requires a valid pluginName"
      });
      
      assert.throws(() => {
        api.addHook('test', null, 'func', {}, () => {});
      }, {
        message: "Hook 'test' requires a valid pluginName"
      });
      
      assert.throws(() => {
        api.addHook('test', undefined, 'func', {}, () => {});
      }, {
        message: "Hook 'test' requires a valid pluginName"
      });
      
      // Function name validation
      assert.throws(() => {
        api.addHook('test', 'plugin', '', {}, () => {});
      }, {
        message: "Hook 'test' requires a valid functionName"
      });
      
      assert.throws(() => {
        api.addHook('test', 'plugin', null, {}, () => {});
      }, {
        message: "Hook 'test' requires a valid functionName"
      });
      
      // Handler validation
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {}, null);
      }, {
        message: "Hook 'test' handler must be a function"
      });
      
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {}, 'string');
      }, {
        message: "Hook 'test' handler must be a function"
      });
      
      assert.throws(() => {
        api.addHook('test', 'plugin', 'func', {}, {});
      }, {
        message: "Hook 'test' handler must be a function"
      });
    });

    it('should handle errors in hook handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Synchronous error
      api.addHook('sync-error', 'p', 'f', {}, () => {
        throw new Error('Sync hook error');
      });
      
      await assert.rejects(
        api.runHooks('sync-error', {}),
        /Sync hook error/
      );
      
      // Async error
      api.addHook('async-error', 'p', 'f', {}, async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async hook error');
      });
      
      await assert.rejects(
        api.runHooks('async-error', {}),
        /Async hook error/
      );
      
      // Promise rejection
      api.addHook('promise-reject', 'p', 'f', {}, () => {
        return Promise.reject(new Error('Promise rejection'));
      });
      
      await assert.rejects(
        api.runHooks('promise-reject', {}),
        /Promise rejection/
      );
    });

    it('should handle placement errors with warning messages', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addHook('test', 'existing', 'func', {}, () => {});
      
      // Capture console.warn
      const originalWarn = console.warn;
      const warnings = [];
      console.warn = (msg) => { warnings.push(msg); };
      
      try {
        api.addHook('test', 'new', 'f', { beforePlugin: 'nonexistent' }, () => {});
        assert.ok(warnings[0].includes("placement target not found"));
        
        api.addHook('test', 'new', 'f', { afterPlugin: 'nonexistent' }, () => {});
        assert.ok(warnings[1].includes("placement target not found"));
        
        api.addHook('test', 'new', 'f', { beforeFunction: 'nonexistent' }, () => {});
        assert.ok(warnings[2].includes("placement target not found"));
        
        api.addHook('test', 'new', 'f', { afterFunction: 'nonexistent' }, () => {});
        assert.ok(warnings[3].includes("placement target not found"));
        
        // All hooks should still be added
        const hooks = api.hooks.get('test');
        assert.ok(hooks.length >= 5); // 1 existing + 4 new
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should handle multiple placement parameters error', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const placements = [
        { beforePlugin: 'p1', afterPlugin: 'p2' },
        { beforePlugin: 'p1', beforeFunction: 'f1' },
        { beforePlugin: 'p1', afterFunction: 'f1' },
        { afterPlugin: 'p1', beforeFunction: 'f1' },
        { afterPlugin: 'p1', afterFunction: 'f1' },
        { beforeFunction: 'f1', afterFunction: 'f2' },
        { beforePlugin: 'p1', afterPlugin: 'p2', beforeFunction: 'f1' },
        { beforePlugin: 'p1', afterPlugin: 'p2', beforeFunction: 'f1', afterFunction: 'f2' }
      ];
      
      for (const params of placements) {
        assert.throws(() => {
          api.addHook('test', 'plugin', 'func', params, () => {});
        }, {
          message: "Hook 'test' can only specify one placement parameter"
        });
      }
    });
  });

  describe('Resource Error Handling', () => {
    it('should handle duplicate resource registration', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      
      assert.throws(() => {
        api.addResource('users');
      }, {
        message: "Resource 'users' already exists"
      });
      
      // Even with different options
      assert.throws(() => {
        api.addResource('users', { different: true });
      }, {
        message: "Resource 'users' already exists"
      });
    });

    it('should handle missing resource access', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Direct method call
      await assert.rejects(
        api._runResource('nonexistent', 'method'),
        {
          message: "Resource 'nonexistent' not found"
        }
      );
      
      // Proxy access returns undefined (not an error)
      assert.equal(api.resources.nonexistent, undefined);
    });

    it('should handle missing implementers on resources', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('empty');
      
      await assert.rejects(
        api.resources.empty.nonexistent(),
        {
          message: "No implementation found for method: nonexistent on resource: empty"
        }
      );
    });

    it('should handle errors in resource implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('failing', {}, {
        implementers: {
          sync: () => { throw new Error('Sync implementer error'); },
          async: async () => { throw new Error('Async implementer error'); },
          promise: () => Promise.reject(new Error('Promise implementer error'))
        }
      });
      
      await assert.rejects(
        api.resources.failing.sync(),
        /Sync implementer error/
      );
      
      await assert.rejects(
        api.resources.failing.async(),
        /Async implementer error/
      );
      
      await assert.rejects(
        api.resources.failing.promise(),
        /Promise implementer error/
      );
    });

    it('should handle invalid hook definitions in resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.addResource('bad', {}, {
          hooks: {
            'invalid': 123
          }
        });
      }, {
        message: "Hook 'invalid' must be a function or object"
      });
      
      assert.throws(() => {
        api.addResource('bad', {}, {
          hooks: {
            'invalid': { handler: null }
          }
        });
      }, {
        message: "Hook 'invalid' must have a function handler"
      });
    });
  });

  describe('Implementer Error Handling', () => {
    it('should validate implementer is a function', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.implement('method', null);
      }, {
        message: "Implementation for 'method' must be a function."
      });
      
      assert.throws(() => {
        api.implement('method', 'string');
      }, {
        message: "Implementation for 'method' must be a function."
      });
      
      assert.throws(() => {
        api.implement('method', {});
      }, {
        message: "Implementation for 'method' must be a function."
      });
      
      assert.throws(() => {
        api.implement('method', []);
      }, {
        message: "Implementation for 'method' must be a function."
      });
    });

    it('should handle missing implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      await assert.rejects(
        api._run('nonexistent'),
        {
          message: "No implementation found for method: nonexistent"
        }
      );
      
      await assert.rejects(
        api.run.nonexistent(),
        {
          message: "No implementation found for method: nonexistent"
        }
      );
    });

    it('should handle errors in implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('failing', () => {
        throw new Error('Implementer error');
      });
      
      await assert.rejects(
        api.run.failing(),
        /Implementer error/
      );
    });
  });

  describe('Plugin Error Handling', () => {
    it('should validate plugin structure', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Not an object
      assert.throws(() => {
        api.use('string');
      }, {
        message: 'Plugin must be an object.'
      });
      
      assert.throws(() => {
        api.use(null);
      }, {
        message: 'Plugin must be an object.'
      });
      
      assert.throws(() => {
        api.use(undefined);
      }, {
        message: 'Plugin must be an object.'
      });
      
      assert.throws(() => {
        api.use(123);
      }, {
        message: 'Plugin must be an object.'
      });
      
      assert.throws(() => {
        api.use(() => {});
      }, {
        message: 'Plugin must be an object.'
      });
    });

    it('should validate plugin name', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.use({});
      }, {
        message: 'Plugin must have a non-empty "name" property.'
      });
      
      assert.throws(() => {
        api.use({ name: '' });
      }, {
        message: 'Plugin must have a non-empty "name" property.'
      });
      
      assert.throws(() => {
        api.use({ name: '  ' });
      }, {
        message: 'Plugin must have a non-empty "name" property.'
      });
      
      assert.throws(() => {
        api.use({ name: null });
      }, {
        message: 'Plugin must have a non-empty "name" property.'
      });
    });

    it('should validate plugin install function', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.use({ name: 'test' });
      }, {
        message: "Plugin 'test' must have an 'install' function."
      });
      
      assert.throws(() => {
        api.use({ name: 'test', install: 'not a function' });
      }, {
        message: "Plugin 'test' must have an 'install' function."
      });
    });

    it('should prevent reserved plugin names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.use({ name: 'api', install: () => {} });
      }, {
        message: "Plugin name 'api' is reserved."
      });
      
      assert.throws(() => {
        api.use({ name: 'resources', install: () => {} });
      }, {
        message: "Plugin name 'resources' is reserved."
      });
    });

    it('should prevent duplicate plugin installation', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'duplicate',
        install: () => {}
      };
      
      api.use(plugin);
      
      assert.throws(() => {
        api.use(plugin);
      }, {
        message: "Plugin 'duplicate' is already installed on API 'test'."
      });
    });

    it('should validate plugin dependencies', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'dependent',
        dependencies: ['required-plugin'],
        install: () => {}
      };
      
      assert.throws(() => {
        api.use(plugin);
      }, {
        message: "Plugin 'dependent' requires dependency 'required-plugin' which is not installed."
      });
    });

    it('should handle errors during plugin installation', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'failing',
        install: () => {
          throw new Error('Installation failed');
        }
      };
      
      assert.throws(() => {
        api.use(plugin);
      }, {
        message: "Failed to install plugin 'failing': Installation failed"
      });
      
      // Should not be marked as installed
      assert.ok(!api._installedPlugins.has('failing'));
    });

    it('should handle plugin install that modifies api incorrectly', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'bad-plugin',
        install: ({ api }) => {
          // Try to break the API
          api.hooks = null;
        }
      };
      
      api.use(plugin);
      
      // API should still work
      assert.ok(api.hooks instanceof Map);
      api.addHook('test', 'p', 'f', {}, () => {});
    });
  });

  describe('Vars Error Handling', () => {
    it('should handle vars through customize method', () => {
      const api = new Api({
        name: 'test',
        version: '1.0.0'
      });
      
      api.customize({
        vars: { KEY: 'value' }
      });
      
      assert.equal(api.vars.KEY, 'value');
    });

    it('should handle prototype pollution attempts via vars', () => {
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
      
      // Note: '__proto__' in object literal sets the prototype, not a property
      // Only constructor and prototype are stored as regular keys
      assert.equal(api.vars.__proto__, undefined);
      assert.equal(api.vars.constructor.polluted, true);
      assert.equal(api.vars.prototype.polluted, true);
      
      // Should not pollute
      assert.equal({}.polluted, undefined);
    });
  });

  describe('Proxy Error Handling', () => {
    it('should handle proxy traps safely for run', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Symbol access
      assert.equal(api.run[Symbol('test')], undefined);
      
      // Number access  
      assert.equal(api.run[123], undefined);
      
      // hasOwnProperty and other built-ins
      assert.equal(typeof api.run.hasOwnProperty, 'function');
      
      // Apply trap with no method
      await assert.rejects(
        api.run(),
        /No implementation found/
      );
    });

    it('should handle proxy traps safely for resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      
      // Symbol access on resources proxy
      assert.equal(api.resources[Symbol('test')], undefined);
      
      // Symbol access on specific resource
      assert.equal(api.resources.users[Symbol('test')], undefined);
      
      // Number access
      assert.equal(api.resources[123], undefined);
      assert.equal(api.resources.users[123], undefined);
    });
  });

  describe('Memory and Resource Cleanup', () => {
    it('should handle very large error messages', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const longMessage = 'A'.repeat(10000);
      api.implement('bigError', () => {
        throw new Error(longMessage);
      });
      
      try {
        await api.run.bigError();
        assert.fail('Should have thrown');
      } catch (error) {
        assert.equal(error.message, longMessage);
      }
    });

    it('should handle deeply nested errors', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('nested', () => {
        const error = new Error('Base error');
        let current = error;
        for (let i = 0; i < 100; i++) {
          const next = new Error(`Nested ${i}`);
          current.cause = next;
          current = next;
        }
        throw error;
      });
      
      await assert.rejects(
        api.run.nested(),
        /Base error/
      );
    });

    it('should handle stack overflow attempts', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Recursive hook registration
      let depth = 0;
      const maxDepth = 10000;
      
      assert.throws(() => {
        function addRecursive() {
          if (depth++ < maxDepth) {
            api.addHook(`hook${depth}`, 'p', 'f', {}, () => {});
            addRecursive();
          }
        }
        addRecursive();
      }, {
        name: 'RangeError'
      });
    });
  });

  describe('Edge Cases with undefined/null/empty values', () => {
    it('should handle undefined and null in all API methods', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // implement with null/undefined method name
      assert.throws(() => api.implement(null, () => {}));
      assert.throws(() => api.implement(undefined, () => {}));
      
      // run with null/undefined
      await assert.rejects(api._run(null));
      await assert.rejects(api._run(undefined));
      
      // runHooks with null/undefined
      await assert.doesNotReject(api.runHooks(null, {}));
      await assert.doesNotReject(api.runHooks(undefined, {}));
      
      // These should work - no validation on resource names
      api.addResource(null);
      api.addResource(undefined);
    });

    it('should handle empty strings in various places', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Empty hook name - should work
      api.addHook('', 'plugin', 'func', {}, () => {});
      assert.ok(api.hooks.has(''));
      
      // Empty method name - should work
      api.implement('', () => 'empty method');
      assert.equal(await api._run(''), 'empty method');
      
      // Empty resource name - should work
      api.addResource('');
      assert.ok(api._resources.has(''));
    });
  });

  describe('Type coercion edge cases', () => {
    it('should handle objects with toString/valueOf in all contexts', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const obj = {
        toString: () => 'stringified',
        valueOf: () => 42
      };
      
      // As hook name
      api.addHook(obj, 'p', 'f', {}, () => 'hook result');
      assert.ok(api.hooks.has(obj));
      
      // As method name
      api.implement(obj, () => 'method result');
      assert.equal(await api._run(obj), 'method result');
      
      // As resource name
      api.addResource(obj);
      assert.ok(api._resources.has(obj));
    });

    it('should handle arrays as keys', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const arr = [1, 2, 3];
      
      // Arrays get converted to strings in some contexts
      api.implement(arr, () => 'array method');
      api.addHook(arr, 'p', 'f', {}, () => {});
      api.addResource(arr);
      
      assert.equal(await api._run(arr), 'array method');
      assert.ok(api.hooks.has(arr));
      assert.ok(api._resources.has(arr));
    });
  });

  describe('Concurrent modification edge cases', () => {
    it('should handle modifications during iteration', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add initial hooks
      for (let i = 0; i < 5; i++) {
        api.addHook('modify', `p${i}`, `f${i}`, {}, ({ api }) => {
          // Try to modify during execution
          if (i === 2) {
            assert.throws(() => {
              api.addHook('modify', 'new', 'func', {}, () => {});
            }, /Cannot add hooks while hooks are executing/);
          }
        });
      }
      
      await api.runHooks('modify', {});
    });

    it('should handle api modification during plugin install', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const plugin = {
        name: 'modifier',
        install: ({ api }) => {
          // Add hooks during install
          api.addHook('test1', 'func1', () => {});
          api.addHook('test2', 'func2', () => {});
          
          // Add implementers
          api.implement('method1', () => {});
          api.implement('method2', () => {});
          
          // Add resources
          api.addResource('resource1');
          api.addResource('resource2');
        }
      };
      
      assert.doesNotThrow(() => api.use(plugin));
      assert.ok(api.hooks.has('test1'));
      assert.ok(api.implementers.has('method1'));
      assert.ok(api._resources.has('resource1'));
    });
  });

  describe('Error message interpolation edge cases', () => {
    it('should safely handle special characters in error messages', () => {
      const specialNames = [
        "test'with'quotes",
        'test"with"double',
        'test`with`backticks',
        'test\\with\\backslashes',
        'test\nwith\nnewlines',
        'test\twith\ttabs',
        'test${interpolation}',
        'test%s%d%format',
        'test\x00null\x00bytes',
        'test\u{1F600}emoji'
      ];
      
      for (const name of specialNames) {
        assert.throws(() => {
          new Api({ name, version: 'invalid' });
        }, (error) => {
          // Should include the name safely in the error message
          return error.message.includes(name) || error.message.includes('Invalid version format');
        });
      }
    });
  });

  describe('Extreme input sizes', () => {
    it('should handle extremely long API names', () => {
      const longName = 'a'.repeat(100000);
      
      assert.doesNotThrow(() => {
        const api = new Api({ name: longName, version: '1.0.0' });
        assert.equal(api.options.name, longName);
      });
    });

    it('should handle extremely deep option objects', () => {
      let deep = { value: 'bottom' };
      for (let i = 0; i < 1000; i++) {
        deep = { nested: deep };
      }
      
      assert.doesNotThrow(() => {
        new Api({
          name: 'test',
          version: '1.0.0',
          deepOption: deep
        });
      });
    });

    it('should handle large number of hooks efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add 10000 hooks
      for (let i = 0; i < 10000; i++) {
        api.addHook('stress', `p${i}`, `f${i}`, {}, () => {});
      }
      
      const start = Date.now();
      await api.runHooks('stress', {});
      const duration = Date.now() - start;
      
      // Should complete reasonably fast (less than 1 second)
      assert.ok(duration < 1000, `Took ${duration}ms to run 10000 hooks`);
    });
  });
});