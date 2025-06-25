import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Comprehensive Resource Tests', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  describe('Resource Registration', () => {
    it('should add basic resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      api.addResource('posts', { tableName: 'blog_posts' });
      api.addResource('comments', { moderationEnabled: true }, {});
      
      assert.ok(api._resources.has('users'));
      assert.ok(api._resources.has('posts'));
      assert.ok(api._resources.has('comments'));
    });

    it('should prevent duplicate resource names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      assert.throws(() => {
        api.addResource('users');
      }, /Resource 'users' already exists/);
    });

    it('should handle invalid resource names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const invalidNames = [null, undefined, '', 123, true, [], {}, Symbol('test')];
      
      // These should work - addResource doesn't validate names
      for (const name of invalidNames) {
        assert.doesNotThrow(() => {
          api.addResource(name);
        });
      }
    });

    it('should freeze resource options', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      const options = { mutable: true };
      
      api.addResource('frozen', options);
      
      const resource = api._resources.get('frozen');
      assert.ok(Object.isFrozen(resource.options));
      
      assert.throws(() => {
        resource.options.mutable = false;
      });
      
      // Original should not be frozen
      options.mutable = false;
      assert.equal(options.mutable, false);
    });

    it('should store resource implementers', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const implementers = {
        list: () => 'list result',
        get: () => 'get result',
        create: () => 'create result'
      };
      
      api.addResource('items', {}, { implementers });
      
      const resource = api._resources.get('items');
      assert.equal(resource.implementers.size, 3);
      assert.equal(resource.implementers.get('list')(), 'list result');
    });

    it('should store resource constants', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const constants = {
        MAX_ITEMS: 100,
        DEFAULT_PAGE_SIZE: 20,
        ALLOWED_STATUSES: ['active', 'inactive', 'pending']
      };
      
      api.addResource('items', {}, { constants });
      
      const resource = api._resources.get('items');
      assert.equal(resource.constants.size, 3);
      assert.equal(resource.constants.get('MAX_ITEMS'), 100);
      assert.deepEqual(resource.constants.get('ALLOWED_STATUSES'), ['active', 'inactive', 'pending']);
    });

    it('should handle resource hooks', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let hookCalled = false;
      const hooks = {
        'before:list': () => { hookCalled = true; }
      };
      
      api.addResource('items', {}, { hooks });
      
      // Verify hook was added to main hooks
      assert.ok(api.hooks.has('before:list'));
      assert.equal(api.hooks.get('before:list').length, 1);
    });

    it('should wrap resource hooks to only run for specific resource', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const calls = [];
      api.addResource('users', {}, {
        hooks: {
          'test:hook': () => { calls.push('users'); }
        }
      });
      
      api.addResource('posts', {}, {
        hooks: {
          'test:hook': () => { calls.push('posts'); }
        }
      });
      
      // Run hooks for users resource
      await api.runHooks('test:hook', {}, 'users');
      assert.deepEqual(calls, ['users']);
      
      // Run hooks for posts resource
      await api.runHooks('test:hook', {}, 'posts');
      assert.deepEqual(calls, ['users', 'posts']);
      
      // Run hooks for non-existent resource
      await api.runHooks('test:hook', {}, 'comments');
      assert.deepEqual(calls, ['users', 'posts']);
    });

    it('should handle complex resource hook definitions', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Add a plugin so beforePlugin works
      api.use({
        name: 'other-plugin',
        install: () => {}
      });
      
      const handler = () => {};
      const hooks = {
        'simple': handler,
        'complex': {
          handler,
          functionName: 'customName',
          beforePlugin: 'other-plugin'
        }
      };
      
      api.addResource('items', {}, { hooks });
      
      const addedHooks = api.hooks.get('complex');
      assert.equal(addedHooks.length, 1);
      assert.equal(addedHooks[0].functionName, 'customName');
    });

    it('should validate hook definitions in resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.throws(() => {
        api.addResource('bad1', {}, {
          hooks: {
            'invalid': 'not a function'
          }
        });
      }, /Hook 'invalid' must be a function or object/);
      
      assert.throws(() => {
        api.addResource('bad2', {}, {
          hooks: {
            'invalid': { handler: 'not a function' }
          }
        });
      }, /Hook 'invalid' must have a function handler/);
    });

    it('should handle resource with all features combined', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const resourceDef = {
        options: {
          tableName: 'products',
          softDelete: true
        },
        extras: {
          implementers: {
            list: () => [],
            get: (id) => ({ id }),
            create: (data) => ({ ...data, id: 1 })
          },
          constants: {
            MAX_PRICE: 999999,
            CATEGORIES: ['electronics', 'books', 'clothing']
          },
          hooks: {
            'before:create': ({ context }) => {
              context.timestamp = Date.now();
            }
          }
        }
      };
      
      api.addResource('products', resourceDef.options, resourceDef.extras);
      
      const resource = api._resources.get('products');
      assert.deepEqual(resource.options, resourceDef.options);
      assert.equal(resource.implementers.size, 3);
      assert.equal(resource.constants.size, 2);
    });
  });

  describe('Resource Access via Proxy', () => {
    it('should access resources through proxy syntax', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('list', () => 'global list');
      api.addResource('users', {}, {
        implementers: {
          list: () => 'users list'
        }
      });
      
      const result = await api.resources.users.list();
      assert.equal(result, 'users list');
    });

    it('should return undefined for non-existent resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      assert.equal(api.resources.nonExistent, undefined);
    });

    it('should handle resource methods with parameters', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users', {}, {
        implementers: {
          get: ({ params }) => ({ id: params.id, name: `User ${params.id}` })
        }
      });
      
      const result = await api.resources.users.get({ id: 123 });
      assert.deepEqual(result, { id: 123, name: 'User 123' });
    });

    it('should fall back to global implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('globalMethod', () => 'global result');
      api.addResource('users');
      
      const result = await api.resources.users.globalMethod();
      assert.equal(result, 'global result');
    });

    it('should handle apply trap on resource proxy', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('default', () => 'default handler');
      api.addResource('users');
      
      // This tests the apply trap when calling resources.users() directly
      const result = await api.resources.users('default');
      assert.equal(result, 'default handler');
    });

    it('should throw for non-existent methods on resources', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      
      await assert.rejects(
        api.resources.users.nonExistentMethod(),
        /No implementation found for method: nonExistentMethod on resource: users/
      );
    });

    it('should handle non-string property access on resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      
      assert.equal(api.resources.users[Symbol('test')], undefined);
      assert.equal(api.resources.users[123], undefined);
    });

    it('should preserve resource context in handlers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let capturedContext;
      api.addResource('products', { category: 'electronics' }, {
        implementers: {
          test: (handlerArgs) => {
            capturedContext = handlerArgs;
            return 'done';
          }
        }
      });
      
      await api.resources.products.test({ foo: 'bar' });
      
      assert.equal(capturedContext.resource, 'products');
      assert.deepEqual(capturedContext.params, { foo: 'bar' });
      assert.equal(capturedContext.name, 'test');
      assert.ok(capturedContext.api);
      assert.ok(capturedContext.options);
      assert.deepEqual(capturedContext.options.resources, { category: 'electronics' });
    });
  });

  describe('Resource API Building', () => {
    it('should merge constants correctly', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.constants.set('GLOBAL_CONST', 'global');
      api.constants.set('SHARED_CONST', 'global version');
      
      api.addResource('items', {}, {
        constants: {
          RESOURCE_CONST: 'resource',
          SHARED_CONST: 'resource version'
        },
        implementers: {
          test: ({ api }) => ({
            global: api.constants.get('GLOBAL_CONST'),
            resource: api.constants.get('RESOURCE_CONST'),
            shared: api.constants.get('SHARED_CONST')
          })
        }
      });
      
      const result = await api.resources.items.test();
      assert.deepEqual(result, {
        global: 'global',
        resource: 'resource',
        shared: 'resource version' // Resource overrides global
      });
    });

    it('should merge implementers correctly', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.implement('globalOnly', () => 'global only');
      api.implement('shared', () => 'global shared');
      
      api.addResource('items', {}, {
        implementers: {
          resourceOnly: () => 'resource only',
          shared: () => 'resource shared'
        }
      });
      
      // Test through resource context
      const resourceResult1 = await api.resources.items.globalOnly();
      assert.equal(resourceResult1, 'global only');
      
      const resourceResult2 = await api.resources.items.resourceOnly();
      assert.equal(resourceResult2, 'resource only');
      
      const resourceResult3 = await api.resources.items.shared();
      assert.equal(resourceResult3, 'resource shared'); // Resource overrides
    });

    it('should provide correct options structure', async () => {
      const api = new Api({ 
        name: 'test', 
        version: '1.0.0',
        custom: 'api option'
      });
      
      let capturedOptions;
      api.addResource('items', { resourceOption: 'value' }, {
        implementers: {
          capture: ({ options }) => {
            capturedOptions = options;
          }
        }
      });
      
      await api.resources.items.capture();
      
      assert.ok(capturedOptions.api);
      assert.ok(capturedOptions.resources);
      assert.equal(capturedOptions.api.custom, 'api option');
      assert.equal(capturedOptions.resources.resourceOption, 'value');
      assert.ok(Object.isFrozen(capturedOptions.api));
      assert.ok(Object.isFrozen(capturedOptions.resources));
    });

    it('should handle deeply nested resource options', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const deepOptions = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep'
              }
            }
          }
        }
      };
      
      api.addResource('deep', deepOptions);
      
      const resource = api._resources.get('deep');
      assert.equal(resource.options.level1.level2.level3.level4.value, 'deep');
    });
  });

  describe('Resource Error Handling', () => {
    it('should provide clear error for missing resource', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      await assert.rejects(
        api._runResource('nonExistent', 'method'),
        /Resource 'nonExistent' not found/
      );
    });

    it('should provide clear error for missing method on resource', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users');
      
      await assert.rejects(
        api._runResource('users', 'nonExistent'),
        /No implementation found for method: nonExistent on resource: users/
      );
    });

    it('should handle errors in resource implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users', {}, {
        implementers: {
          failing: () => { throw new Error('Resource method error'); }
        }
      });
      
      await assert.rejects(
        api.resources.users.failing(),
        /Resource method error/
      );
    });

    it('should handle async errors in resource implementers', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('users', {}, {
        implementers: {
          asyncFailing: async () => { 
            await new Promise(resolve => setTimeout(resolve, 10));
            throw new Error('Async resource error'); 
          }
        }
      });
      
      await assert.rejects(
        api.resources.users.asyncFailing(),
        /Async resource error/
      );
    });
  });

  describe('Resource Hook Integration', () => {
    it('should run resource-specific hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const calls = [];
      
      // Global hook
      api.addHook('test:hook', 'global', 'globalFunc', {}, ({ resource }) => {
        calls.push(`global-${resource || 'none'}`);
      });
      
      // Resource hooks
      api.addResource('users', {}, {
        hooks: {
          'test:hook': ({ resource }) => {
            calls.push(`users-${resource}`);
          }
        }
      });
      
      api.addResource('posts', {}, {
        hooks: {
          'test:hook': ({ resource }) => {
            calls.push(`posts-${resource}`);
          }
        }
      });
      
      // Run for users
      calls.length = 0;
      await api.runHooks('test:hook', {}, 'users');
      assert.deepEqual(calls, ['global-users', 'users-users']);
      
      // Run for posts
      calls.length = 0;
      await api.runHooks('test:hook', {}, 'posts');
      assert.deepEqual(calls, ['global-posts', 'posts-posts']);
      
      // Run without resource
      calls.length = 0;
      await api.runHooks('test:hook', {});
      assert.deepEqual(calls, ['global-none']);
    });

    it('should pass resource context to hooks', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let hookContext;
      api.addResource('products', { table: 'products_table' }, {
        constants: { MAX_PRICE: 1000 },
        hooks: {
          'capture:context': (context) => {
            hookContext = context;
          }
        }
      });
      
      await api.runHooks('capture:context', { custom: 'data' }, 'products');
      
      assert.equal(hookContext.resource, 'products');
      assert.deepEqual(hookContext.context, { custom: 'data' });
      assert.equal(hookContext.api.constants.get('MAX_PRICE'), 1000);
      assert.deepEqual(hookContext.options.resources, { table: 'products_table' });
    });

    it('should handle hook stopping in resources', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const calls = [];
      
      api.addResource('users', {}, {
        hooks: {
          'stoppable': () => {
            calls.push('first');
            return false; // Stop chain
          }
        }
      });
      
      api.addHook('stoppable', 'global', 'second', {}, () => {
        calls.push('second');
      });
      
      await api.runHooks('stoppable', {}, 'users');
      assert.deepEqual(calls, ['first']); // Second hook should not run
    });
  });

  describe('Complex Resource Scenarios', () => {
    it('should handle multiple resources with interdependencies', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Simulate a blog system
      api.addResource('users', {}, {
        implementers: {
          get: ({ params }) => ({ id: params.id, name: `User ${params.id}` })
        }
      });
      
      api.addResource('posts', {}, {
        implementers: {
          create: async ({ params, api }) => {
            // Access another resource
            const author = await api.resources.users.get({ id: params.authorId });
            return {
              id: 1,
              title: params.title,
              author: author.name
            };
          }
        }
      });
      
      const post = await api.resources.posts.create({
        title: 'Test Post',
        authorId: 42
      });
      
      assert.deepEqual(post, {
        id: 1,
        title: 'Test Post',
        author: 'User 42'
      });
    });

    it('should handle resource inheritance patterns', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Base CRUD operations
      const baseCrud = {
        list: () => [],
        get: ({ params }) => ({ id: params.id }),
        create: ({ params }) => ({ ...params, id: Date.now() }),
        update: ({ params }) => ({ ...params, updated: true }),
        delete: ({ params }) => ({ id: params.id, deleted: true })
      };
      
      // Add resources with base CRUD + custom methods
      api.addResource('users', {}, {
        implementers: {
          ...baseCrud,
          login: ({ params }) => ({ token: `token-${params.username}` }),
          logout: () => ({ success: true })
        }
      });
      
      api.addResource('posts', {}, {
        implementers: {
          ...baseCrud,
          publish: ({ params }) => ({ id: params.id, published: true }),
          unpublish: ({ params }) => ({ id: params.id, published: false })
        }
      });
      
      // Test base methods
      const user = await api.resources.users.create({ name: 'John' });
      assert.ok(user.id);
      assert.equal(user.name, 'John');
      
      // Test custom methods
      const loginResult = await api.resources.users.login({ username: 'john' });
      assert.equal(loginResult.token, 'token-john');
      
      const publishResult = await api.resources.posts.publish({ id: 123 });
      assert.deepEqual(publishResult, { id: 123, published: true });
    });

    it('should handle resource namespacing', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      // Simulate namespaced resources
      api.addResource('admin.users');
      api.addResource('admin.settings');
      api.addResource('public.users');
      api.addResource('public.posts');
      
      assert.ok(api._resources.has('admin.users'));
      assert.ok(api._resources.has('public.users'));
      assert.notEqual(
        api._resources.get('admin.users'),
        api._resources.get('public.users')
      );
    });

    it('should handle resources with symbols and special chars', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const specialNames = [
        'user-profiles',
        'user_profiles',
        'user.profiles',
        'user:profiles',
        'user/profiles',
        'user\\profiles',
        'user profiles',
        '$users',
        '_private',
        '123numbers',
        'кириллица',
        '中文资源',
        '🚀-resource'
      ];
      
      for (const name of specialNames) {
        assert.doesNotThrow(() => {
          api.addResource(name);
        }, `Failed for resource name: ${name}`);
      }
    });
  });

  describe('Resource Performance and Limits', () => {
    it('should handle large number of resources', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      for (let i = 0; i < 1000; i++) {
        api.addResource(`resource${i}`, { index: i });
      }
      
      assert.equal(api._resources.size, 1000);
      
      // Check random access
      const r500 = api._resources.get('resource500');
      assert.equal(r500.options.index, 500);
    });

    it('should handle resources with large options objects', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const largeOptions = {};
      for (let i = 0; i < 1000; i++) {
        largeOptions[`key${i}`] = `value${i}`;
      }
      
      api.addResource('large', largeOptions);
      
      const resource = api._resources.get('large');
      assert.equal(Object.keys(resource.options).length, 1000);
    });

    it('should handle rapid resource method calls', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      let counter = 0;
      api.addResource('counter', {}, {
        implementers: {
          increment: () => ++counter
        }
      });
      
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(api.resources.counter.increment());
      }
      
      await Promise.all(promises);
      assert.equal(counter, 100);
    });
  });

  describe('Resource Edge Cases', () => {
    it('should handle toString and valueOf on resource names', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const obj = {
        toString: () => 'stringified',
        valueOf: () => 'valued'
      };
      
      api.addResource(obj);
      assert.ok(api._resources.has(obj));
    });

    it('should handle resources with no implementers or options', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('empty');
      api.implement('fallback', () => 'fallback result');
      
      const result = await api.resources.empty.fallback();
      assert.equal(result, 'fallback result');
    });

    it('should handle circular references in resource options', () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      const options = { name: 'circular' };
      options.self = options;
      
      assert.doesNotThrow(() => {
        api.addResource('circular', options);
      });
    });

    it('should handle resource methods returning various types', async () => {
      const api = new Api({ name: 'test', version: '1.0.0' });
      
      api.addResource('types', {}, {
        implementers: {
          returnNull: () => null,
          returnUndefined: () => undefined,
          returnBoolean: () => true,
          returnNumber: () => 42,
          returnString: () => 'string',
          returnArray: () => [1, 2, 3],
          returnObject: () => ({ key: 'value' }),
          returnPromise: () => Promise.resolve('async'),
          returnFunction: () => () => 'function result',
          returnSymbol: () => Symbol('test'),
          returnError: () => new Error('not thrown'),
          returnCircular: () => {
            const obj = { a: 1 };
            obj.self = obj;
            return obj;
          }
        }
      });
      
      assert.equal(await api.resources.types.returnNull(), null);
      assert.equal(await api.resources.types.returnUndefined(), undefined);
      assert.equal(await api.resources.types.returnBoolean(), true);
      assert.equal(await api.resources.types.returnNumber(), 42);
      assert.equal(await api.resources.types.returnString(), 'string');
      assert.deepEqual(await api.resources.types.returnArray(), [1, 2, 3]);
      assert.deepEqual(await api.resources.types.returnObject(), { key: 'value' });
      assert.equal(await api.resources.types.returnPromise(), 'async');
      
      const func = await api.resources.types.returnFunction();
      assert.equal(func(), 'function result');
      
      const sym = await api.resources.types.returnSymbol();
      assert.equal(typeof sym, 'symbol');
      
      const err = await api.resources.types.returnError();
      assert.ok(err instanceof Error);
      
      const circular = await api.resources.types.returnCircular();
      assert.equal(circular.self, circular);
    });
  });
});