import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Edge Cases - Hooks', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  it('should handle invalid hook parameters', () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    
    assert.throws(() => {
      api.addHook('test', '', 'func', {}, () => {});
    }, /requires a valid pluginName/);
    
    assert.throws(() => {
      api.addHook('test', null, 'func', {}, () => {});
    }, /requires a valid pluginName/);
    
    assert.throws(() => {
      api.addHook('test', '   ', 'func', {}, () => {});
    }, /requires a valid pluginName/);
    
    assert.throws(() => {
      api.addHook('test', 'plugin', '', {}, () => {});
    }, /requires a valid functionName/);
    
    assert.throws(() => {
      api.addHook('test', 'plugin', null, {}, () => {});
    }, /requires a valid functionName/);
    
    assert.throws(() => {
      api.addHook('test', 'plugin', 'func', {}, 'not-a-function');
    }, /handler must be a function/);
  });

  it('should handle multiple placement parameters', () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    api.addHook('test', 'plugin1', 'func1', {}, () => {});
    
    assert.throws(() => {
      api.addHook('test', 'plugin2', 'func2', {
        beforePlugin: 'plugin1',
        afterPlugin: 'plugin1'
      }, () => {});
    }, /can only specify one placement parameter/);
    
    assert.throws(() => {
      api.addHook('test', 'plugin2', 'func2', {
        beforeFunction: 'func1',
        afterFunction: 'func1'
      }, () => {});
    }, /can only specify one placement parameter/);
    
    assert.throws(() => {
      api.addHook('test', 'plugin2', 'func2', {
        beforePlugin: 'plugin1',
        beforeFunction: 'func1'
      }, () => {});
    }, /can only specify one placement parameter/);
  });

  it('should handle non-existent placement targets with warning', () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    
    // Capture console.warn
    const originalWarn = console.warn;
    const warnings = [];
    console.warn = (msg) => { warnings.push(msg); };
    
    try {
      api.addHook('test', 'plugin', 'func', {
        beforePlugin: 'non-existent'
      }, () => {});
      assert.ok(warnings[0].includes("placement target not found"));
      
      api.addHook('test', 'plugin', 'func', {
        afterPlugin: 'non-existent'
      }, () => {});
      assert.ok(warnings[1].includes("placement target not found"));
      
      api.addHook('test', 'plugin', 'func', {
        beforeFunction: 'non-existent'
      }, () => {});
      assert.ok(warnings[2].includes("placement target not found"));
      
      api.addHook('test', 'plugin', 'func', {
        afterFunction: 'non-existent'
      }, () => {});
      assert.ok(warnings[3].includes("placement target not found"));
      
      // All hooks should still be added
      assert.equal(api.hooks.get('test').length, 4);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('should handle hook execution with no handlers', async () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    const context = { value: 1 };
    const result = await api.runHooks('non-existent-hook', context);
    assert.equal(result, context);
  });

  it('should handle hook execution with null/undefined context', async () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    
    api.addHook('test', 'plugin', 'func', {}, async ({ context }) => {
      assert.equal(context, null);
    });
    
    await api.runHooks('test', null);
    
    api.addHook('test2', 'plugin', 'func', {}, async ({ context }) => {
      assert.equal(context, undefined);
    });
    
    await api.runHooks('test2', undefined);
  });

  it('should stop hook chain when handler returns false', async () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    let hook1Ran = false;
    let hook2Ran = false;
    let hook3Ran = false;
    
    api.addHook('test', 'plugin1', 'func1', {}, async () => {
      hook1Ran = true;
    });
    
    api.addHook('test', 'plugin2', 'func2', {}, async () => {
      hook2Ran = true;
      return false;
    });
    
    api.addHook('test', 'plugin3', 'func3', {}, async () => {
      hook3Ran = true;
    });
    
    await api.runHooks('test', {});
    
    assert.ok(hook1Ran);
    assert.ok(hook2Ran);
    assert.ok(!hook3Ran);
  });

  it('should handle hook errors', async () => {
    const api = new Api({ name: 'hook-test', version: '1.0.0' });
    
    api.addHook('test', 'plugin', 'func', {}, async () => {
      throw new Error('Hook error');
    });
    
    await assert.rejects(async () => {
      await api.runHooks('test', {});
    }, /Hook error/);
  });

  it('should require customize method for hooks', () => {
    const api = new Api({
      name: 'test',
      version: '1.0.0'
    });
    
    // Hooks should be added via customize
    api.customize({
      hooks: {
        test: () => {}
      }
    });
    
    assert.ok(api.hooks.has('test'));
  });

  it('should handle customize hooks with complex definitions', () => {
    const api = new Api({
      name: 'test',
      version: '1.0.0'
    });
    
    // Add plugin first so beforePlugin works
    api.use({
      name: 'other',
      install: () => {}
    });
    
    api.customize({
      hooks: {
        simple: () => {},
        complex: {
          handler: () => {},
          functionName: 'customName',
          beforePlugin: 'other',
          customParam: 'value'
        }
      }
    });
    
    assert.ok(api.hooks.has('simple'));
    assert.ok(api.hooks.has('complex'));
  });

  it('should pass correct parameters to hooks', async () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    api.addHook('test', 'plugin', 'func', {}, async ({ context, api: hookApi, name, options, params, resource }) => {
      assert.deepEqual(context, { value: 123 });
      assert.equal(hookApi, api);
      assert.equal(name, 'test');
      assert.deepEqual(options, api._options);
      assert.deepEqual(params, {});
      assert.equal(resource, null);
    });
    
    await api.runHooks('test', { value: 123 });
  });

  it('should handle hook placement edge cases', () => {
    const api = new Api({ name: 'test', version: '1.0.0' });
    
    // Add initial hooks
    api.addHook('test', 'p1', 'f1', {}, () => {});
    api.addHook('test', 'p1', 'f2', {}, () => {});
    api.addHook('test', 'p2', 'f3', {}, () => {});
    
    // Test afterPlugin with multiple hooks from same plugin
    api.addHook('test', 'p3', 'f4', { afterPlugin: 'p1' }, () => {});
    
    const handlers = api.hooks.get('test');
    assert.equal(handlers[2].pluginName, 'p3'); // Should be after last p1 hook
    assert.equal(handlers[2].functionName, 'f4');
  });
});