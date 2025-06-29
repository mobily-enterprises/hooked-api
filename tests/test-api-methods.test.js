import test from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting, ValidationError, MethodError } from '../index.js';

// Reset registry before each test to avoid conflicts
test.beforeEach(() => {
  resetGlobalRegistryForTesting();
});

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