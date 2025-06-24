import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Performance and Stress Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('API Creation Performance', () => {
    it('should handle creating many API instances efficiently', () => {
      const start = Date.now();
      const apis = [];
      
      for (let i = 0; i < 1000; i++) {
        apis.push(new Api({
          name: `api-${i}`,
          version: '1.0.0'
        }));
      }
      
      const duration = Date.now() - start;
      console.log(`Created 1000 APIs in ${duration}ms`);
      
      assert.ok(duration < 1000, `Too slow: ${duration}ms`);
      assert.equal(apis.length, 1000);
    });

    it('should handle large option objects efficiently', () => {
      const largeOptions = {
        name: 'test',
        version: '1.0.0'
      };
      
      // Add 10000 properties
      for (let i = 0; i < 10000; i++) {
        largeOptions[`prop${i}`] = {
          value: i,
          data: `data-${i}`,
          nested: { deep: i }
        };
      }
      
      const start = Date.now();
      const api = new Api(largeOptions);
      const duration = Date.now() - start;
      
      console.log(`Created API with 10000 options in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
      assert.equal(Object.keys(api.options).length, 10002); // + name + version
    });
  });

  describe('Registry Performance', () => {
    it('should handle large registry efficiently', () => {
      // Add many APIs to registry
      for (let i = 0; i < 1000; i++) {
        new Api({
          name: `registry-test-${i}`,
          version: '1.0.0'
        });
      }
      
      const start = Date.now();
      
      // Lookup performance
      for (let i = 0; i < 100; i++) {
        const found = Api.registry.get(`registry-test-${i}`, '1.0.0');
        assert.ok(found);
      }
      
      const duration = Date.now() - start;
      console.log(`100 registry lookups in ${duration}ms`);
      assert.ok(duration < 50, `Too slow: ${duration}ms`);
    });

    it('should handle version resolution performance', () => {
      const apiName = 'version-perf';
      
      // Add many versions
      for (let major = 0; major < 10; major++) {
        for (let minor = 0; minor < 10; minor++) {
          for (let patch = 0; patch < 10; patch++) {
            new Api({
              name: apiName,
              version: `${major}.${minor}.${patch}`
            });
          }
        }
      }
      
      const start = Date.now();
      
      // Test various version queries
      const queries = [
        'latest',
        '^1.0.0',
        '~2.3.0',
        '>=3.0.0 <4.0.0',
        '>5.0.0',
        '1.2.3'
      ];
      
      for (const query of queries) {
        for (let i = 0; i < 100; i++) {
          Api.registry.get(apiName, query);
        }
      }
      
      const duration = Date.now() - start;
      console.log(`600 version resolution queries in ${duration}ms`);
      assert.ok(duration < 200, `Too slow: ${duration}ms`);
    });

    it('should handle registry.list() with many APIs', () => {
      // Add many APIs
      for (let i = 0; i < 100; i++) {
        for (let v = 0; v < 10; v++) {
          new Api({
            name: `list-test-${i}`,
            version: `${v}.0.0`
          });
        }
      }
      
      const start = Date.now();
      const list = Api.registry.list();
      const duration = Date.now() - start;
      
      console.log(`Listed ${Object.keys(list).length} APIs in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
      assert.equal(Object.keys(list).length, 100);
    });
  });

  describe('Hook System Performance', () => {
    it('should handle many hooks efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add 1000 hooks
      for (let i = 0; i < 1000; i++) {
        api.addHook('perf:test', `plugin-${i}`, `func-${i}`, {}, ({ context }) => {
          context.count = (context.count || 0) + 1;
        });
      }
      
      const start = Date.now();
      const context = {};
      await api.runHooks('perf:test', context);
      const duration = Date.now() - start;
      
      console.log(`Ran 1000 hooks in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
      assert.equal(context.count, 1000);
    });

    it('should handle deeply nested hook execution', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const depth = 100;
      
      // Create chain of hooks that call each other
      for (let i = 0; i < depth; i++) {
        const currentLevel = i;
        api.addHook(`level-${i}`, 'plugin', `func-${i}`, {}, async ({ api, context }) => {
          context.depth = currentLevel;
          if (currentLevel < depth - 1) {
            await api.runHooks(`level-${currentLevel + 1}`, context);
          }
        });
      }
      
      const start = Date.now();
      const context = {};
      await api.runHooks('level-0', context);
      const duration = Date.now() - start;
      
      console.log(`Nested hook execution (depth ${depth}) in ${duration}ms`);
      assert.ok(duration < 200, `Too slow: ${duration}ms`);
      assert.equal(context.depth, depth - 1);
    });

    it('should handle concurrent hook executions', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add some hooks
      for (let i = 0; i < 10; i++) {
        api.addHook(`concurrent-${i}`, 'plugin', 'func', {}, async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return i;
        });
      }
      
      const start = Date.now();
      
      // Run hooks concurrently
      const promises = [];
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 100; j++) {
          promises.push(api.runHooks(`concurrent-${i}`, {}));
        }
      }
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`1000 concurrent hook executions in ${duration}ms`);
      assert.ok(duration < 1000, `Too slow: ${duration}ms`);
    });
  });

  describe('Resource System Performance', () => {
    it('should handle many resources efficiently', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const start = Date.now();
      
      // Add 1000 resources
      for (let i = 0; i < 1000; i++) {
        api.addResource(`resource-${i}`, {
          index: i,
          data: `resource-data-${i}`
        }, {
          implementers: {
            get: () => ({ id: i }),
            list: () => [],
            create: () => ({ id: i })
          },
          constants: {
            MAX_ITEMS: 100,
            PREFIX: `res-${i}`
          }
        });
      }
      
      const duration = Date.now() - start;
      console.log(`Added 1000 resources in ${duration}ms`);
      assert.ok(duration < 200, `Too slow: ${duration}ms`);
      assert.equal(api._resources.size, 1000);
    });

    it('should handle resource method calls efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add resources
      for (let i = 0; i < 100; i++) {
        api.addResource(`res-${i}`, {}, {
          implementers: {
            compute: ({ params }) => params.value * 2
          }
        });
      }
      
      const start = Date.now();
      
      // Call methods on resources
      const results = [];
      for (let i = 0; i < 100; i++) {
        for (let j = 0; j < 10; j++) {
          results.push(await api.resources[`res-${i}`].compute({ value: j }));
        }
      }
      
      const duration = Date.now() - start;
      console.log(`1000 resource method calls in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
      assert.equal(results.length, 1000);
    });

    it('should handle resource with many methods efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const implementers = {};
      for (let i = 0; i < 1000; i++) {
        implementers[`method${i}`] = () => i;
      }
      
      api.addResource('mega', {}, { implementers });
      
      const start = Date.now();
      
      // Call various methods
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(await api.resources.mega[`method${i}`]());
      }
      
      const duration = Date.now() - start;
      console.log(`100 calls to resource with 1000 methods in ${duration}ms`);
      assert.ok(duration < 50, `Too slow: ${duration}ms`);
    });
  });

  describe('Handler Performance', () => {
    it('should handle many implementers efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add 1000 implementers
      for (let i = 0; i < 1000; i++) {
        api.implement(`method-${i}`, () => i);
      }
      
      const start = Date.now();
      
      // Call 100 methods
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(await api.run[`method-${i}`]());
      }
      
      const duration = Date.now() - start;
      console.log(`100 method calls from 1000 implementers in ${duration}ms`);
      assert.ok(duration < 50, `Too slow: ${duration}ms`);
    });

    it('should handle complex handler operations efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('complex', ({ params }) => {
        // Simulate complex computation
        let result = 0;
        for (let i = 0; i < params.iterations; i++) {
          result += Math.sqrt(i) * Math.sin(i);
        }
        return result;
      });
      
      const start = Date.now();
      
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(api.run.complex({ iterations: 1000 }));
      }
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`100 complex computations in ${duration}ms`);
      assert.ok(duration < 500, `Too slow: ${duration}ms`);
    });

    it('should handle parameter passing efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const largeData = {
        array: new Array(10000).fill('data'),
        nested: {}
      };
      
      // Create deep nesting
      let current = largeData.nested;
      for (let i = 0; i < 100; i++) {
        current.next = {};
        current = current.next;
      }
      
      api.implement('passThrough', ({ params }) => params);
      
      const start = Date.now();
      
      for (let i = 0; i < 100; i++) {
        await api.run.passThrough(largeData);
      }
      
      const duration = Date.now() - start;
      console.log(`100 large parameter passes in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
    });
  });

  describe('Plugin System Performance', () => {
    it('should handle many plugins efficiently', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const start = Date.now();
      
      // Install 100 plugins
      for (let i = 0; i < 100; i++) {
        const plugin = {
          name: `plugin-${i}`,
          install: ({ api }) => {
            // Each plugin adds some hooks and methods
            api.addHook(`plugin${i}:hook`, 'func', () => {});
            api.implement(`plugin${i}Method`, () => i);
          }
        };
        
        api.use(plugin, { index: i });
      }
      
      const duration = Date.now() - start;
      console.log(`Installed 100 plugins in ${duration}ms`);
      assert.ok(duration < 200, `Too slow: ${duration}ms`);
      assert.equal(api._installedPlugins.size, 100);
    });

    it('should handle plugin with many operations efficiently', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const heavyPlugin = {
        name: 'heavy',
        install: ({ api }) => {
          // Add many hooks
          for (let i = 0; i < 100; i++) {
            api.addHook(`heavy:hook${i}`, `func${i}`, () => {});
          }
          
          // Add many methods
          for (let i = 0; i < 100; i++) {
            api.implement(`heavy${i}`, () => i);
          }
          
          // Add resources
          for (let i = 0; i < 10; i++) {
            api.addResource(`heavy${i}`);
          }
        }
      };
      
      const start = Date.now();
      api.use(heavyPlugin);
      const duration = Date.now() - start;
      
      console.log(`Installed heavy plugin in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should handle memory efficiently with many operations', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Perform many operations
      for (let i = 0; i < 100; i++) {
        api.implement(`mem${i}`, () => new Array(1000).fill(i));
      }
      
      // Call methods and let results be GC'd
      for (let i = 0; i < 100; i++) {
        await api.run[`mem${i}`]();
      }
      
      // Force some GC pressure
      global.gc && global.gc();
      
      // Should still be able to operate
      api.implement('final', () => 'done');
      const result = await api.run.final();
      assert.equal(result, 'done');
    });

    it('should not leak memory with repeated operations', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('operation', ({ params }) => {
        return new Array(params.size).fill('data');
      });
      
      // Perform many operations that allocate and release memory
      for (let i = 0; i < 1000; i++) {
        await api.run.operation({ size: 1000 });
      }
      
      // Should complete without memory issues
      assert.ok(true);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with number of APIs', () => {
      const measurements = [];
      
      for (const count of [10, 100, 1000]) {
        resetGlobalRegistryForTesting();
        
        const start = Date.now();
        
        for (let i = 0; i < count; i++) {
          new Api({
            name: `scale-${i}`,
            version: '1.0.0'
          });
        }
        
        const duration = Date.now() - start;
        measurements.push({ count, duration });
        console.log(`${count} APIs: ${duration}ms`);
      }
      
      // Check that time increases roughly linearly
      const ratio1 = measurements[1].duration / measurements[0].duration;
      const ratio2 = measurements[2].duration / measurements[1].duration;
      
      // Should be roughly 10x each time (with some tolerance)
      assert.ok(ratio1 < 15, `Poor scaling: ${ratio1}x for 10x APIs`);
      assert.ok(ratio2 < 15, `Poor scaling: ${ratio2}x for 10x APIs`);
    });

    it('should handle mixed load efficiently', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add various components
      for (let i = 0; i < 50; i++) {
        // Hooks
        api.addHook(`hook${i}`, 'p', 'f', {}, () => {});
        
        // Implementers
        api.implement(`method${i}`, () => i);
        
        // Resources
        api.addResource(`resource${i}`, {}, {
          implementers: {
            get: () => ({ id: i })
          }
        });
      }
      
      const start = Date.now();
      
      // Perform mixed operations
      const operations = [];
      
      for (let i = 0; i < 10; i++) {
        operations.push(api.runHooks(`hook${i}`, {}));
        operations.push(api.run[`method${i}`]());
        operations.push(api.resources[`resource${i}`].get());
      }
      
      await Promise.all(operations);
      
      const duration = Date.now() - start;
      console.log(`30 mixed operations in ${duration}ms`);
      assert.ok(duration < 100, `Too slow: ${duration}ms`);
    });
  });

  describe('Worst Case Scenarios', () => {
    it('should handle pathological hook ordering', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add hooks in reverse order with complex placement
      for (let i = 999; i >= 0; i--) {
        if (i < 999) {
          api.addHook('pathological', `p${i}`, `f${i}`, 
            { beforePlugin: `p${i + 1}` }, 
            () => {}
          );
        } else {
          api.addHook('pathological', `p${i}`, `f${i}`, {}, () => {});
        }
      }
      
      // Should have hooks in correct order
      const hooks = api.hooks.get('pathological');
      assert.equal(hooks.length, 1000);
      assert.equal(hooks[0].pluginName, 'p0');
      assert.equal(hooks[999].pluginName, 'p999');
    });

    it('should handle maximum nesting depth', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Create very deep call stack
      const maxDepth = 1000;
      
      api.implement('deep', async ({ api, params }) => {
        if (params.depth < maxDepth) {
          return await api.run.deep({ depth: params.depth + 1 });
        }
        return params.depth;
      });
      
      const result = await api.run.deep({ depth: 0 });
      assert.equal(result, maxDepth);
    });

    it('should handle extreme concurrency', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let counter = 0;
      api.implement('concurrent', async () => {
        const local = counter++;
        await new Promise(resolve => setImmediate(resolve));
        return local;
      });
      
      const start = Date.now();
      
      // Launch 10000 concurrent operations
      const promises = Array(10000).fill(0).map(() => api.run.concurrent());
      const results = await Promise.all(promises);
      
      const duration = Date.now() - start;
      console.log(`10000 concurrent operations in ${duration}ms`);
      
      // All should complete
      assert.equal(results.length, 10000);
      assert.equal(counter, 10000);
    });
  });
});