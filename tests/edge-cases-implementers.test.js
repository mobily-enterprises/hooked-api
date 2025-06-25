import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Edge Cases - Implementers', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  it('should throw error for non-function implementer', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    assert.throws(() => {
      api.implement('test', 'not-a-function');
    }, /Implementation for 'test' must be a function/);
    
    assert.throws(() => {
      api.implement('test', null);
    }, /Implementation for 'test' must be a function/);
    
    assert.throws(() => {
      api.implement('test', {});
    }, /Implementation for 'test' must be a function/);
  });

  it('should throw error when running non-existent method', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    await assert.rejects(async () => {
      await api.run('non-existent');
    }, /No implementation found for method: non-existent/);
    
    await assert.rejects(async () => {
      await api.run.nonExistent();
    }, /No implementation found for method: nonExistent/);
  });

  it('should handle customize implementers with non-function values', () => {
    const api = new Api({
      name: 'test',
      version: '1.0.0'
    });
    
    assert.throws(() => {
      api.customize({
        implementers: {
          test: 'not-a-function'
        }
      });
    }, /Implementation for 'test' must be a function/);
  });

  it('should pass correct parameters to implementers', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.implement('test', async ({ context, api: implApi, name, options, params, resource }) => {
      assert.deepEqual(context, {});
      assert.equal(implApi, api);
      assert.equal(name, 'test');
      assert.deepEqual(options, api._options);
      assert.deepEqual(params, { value: 123 });
      assert.equal(resource, null);
      return 'success';
    });
    
    const result = await api.run('test', { value: 123 });
    assert.equal(result, 'success');
  });

  it('should handle implementer errors', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.implement('test', async () => {
      throw new Error('Implementer error');
    });
    
    await assert.rejects(async () => {
      await api.run('test');
    }, /Implementer error/);
  });

  it('should handle null/undefined params', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.implement('test', async ({ params }) => {
      return params;
    });
    
    // No params - uses default {}
    const result1 = await api.run('test');
    assert.deepEqual(result1, {});
    
    // Null is NOT normalized - it stays null
    const result2 = await api.run('test', null);
    assert.deepEqual(result2, null);
    
    // Undefined uses default {}
    const result3 = await api.run('test', undefined);
    assert.deepEqual(result3, {});
  });

  it('should handle Symbol property access on run proxy', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Should not throw when accessing Symbol properties
    assert.equal(api.run[Symbol.iterator], undefined);
    assert.equal(api.run[Symbol.toStringTag], undefined);
    
    // Should still work with string properties
    api.implement('test', async () => 'works');
    const result = await api.run.test();
    assert.equal(result, 'works');
  });

  it('should handle property access for non-string types', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // The library PURPOSEFULLY returns undefined for numeric strings
    assert.equal(api.run[123], undefined);
    assert.equal(api.run['123'], undefined);
    
    // Non-numeric strings work as expected
    assert.equal(typeof api.run[null], 'function'); // 'null' is not numeric
    assert.equal(typeof api.run[undefined], 'function'); // 'undefined' is not numeric
    assert.equal(typeof api.run[{}], 'function'); // '[object Object]' is not numeric
    
    // Non-numeric method names work
    api.implement('null', () => 'null string');
    api.implement('undefined', () => 'undefined string');
    assert.equal(await api.run[null](), 'null string');
    assert.equal(await api.run[undefined](), 'undefined string');
    
    // But numeric strings cannot be used as method names
    api.implement('123', () => 'numeric');
    // This returns undefined, not a function
    assert.equal(api.run[123], undefined);
    assert.equal(api.run['123'], undefined);
  });

  it('should allow overwriting implementers', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.implement('test', async () => 'first');
    let result = await api.run('test');
    assert.equal(result, 'first');
    
    api.implement('test', async () => 'second');
    result = await api.run('test');
    assert.equal(result, 'second');
  });

  it('should handle complex params objects', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.implement('test', async ({ params }) => {
      return {
        array: params.array,
        nested: params.nested,
        fn: typeof params.fn
      };
    });
    
    const result = await api.run('test', {
      array: [1, 2, 3],
      nested: { deep: { value: 'test' } },
      fn: () => {}
    });
    
    assert.deepEqual(result.array, [1, 2, 3]);
    assert.deepEqual(result.nested, { deep: { value: 'test' } });
    assert.equal(result.fn, 'function');
  });

  it('should handle async and sync implementers', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Sync implementer
    api.implement('sync', ({ params }) => {
      return params.value * 2;
    });
    
    // Async implementer
    api.implement('async', async ({ params }) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return params.value * 3;
    });
    
    const syncResult = await api.run('sync', { value: 5 });
    assert.equal(syncResult, 10);
    
    const asyncResult = await api.run('async', { value: 5 });
    assert.equal(asyncResult, 15);
  });

  it('should handle implementers that modify context', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.implement('test', async ({ context }) => {
      // Context starts empty but implementer can modify it
      context.modified = true;
      context.value = 123;
      return context;
    });
    
    const result = await api.run('test');
    assert.deepEqual(result, { modified: true, value: 123 });
  });
});