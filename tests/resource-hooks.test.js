import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Api, resetGlobalRegistryForTesting } from '../index.js';

describe('Resource-Specific Hooks', () => {
  beforeEach(() => {
    resetGlobalRegistryForTesting();
  });

  it('should run hooks only for specific resource', async () => {
    const api = new Api({
      name: 'test-hooks',
      version: '1.0.0'
    });
    
    api.customize({
      implementers: {
        process: async ({ api, resource }) => {
          let context = { messages: [] };
          context = await api.runHooks('validate', context, resource);
          return context.messages;
        }
      }
    });
    
    let userHookRan = false;
    let deptHookRan = false;
    
    api.addResource('users', {}, {
      hooks: {
        validate: async ({ context, resource }) => {
          userHookRan = true;
          context.messages.push(`Validated ${resource}`);
        }
      }
    });
    
    api.addResource('departments', {}, {
      hooks: {
        validate: async ({ context, resource }) => {
          deptHookRan = true;
          context.messages.push(`Validated ${resource}`);
        }
      }
    });
    
    const userMessages = await api.resources.users.process();
    assert.ok(userHookRan);
    assert.ok(!deptHookRan);
    assert.deepEqual(userMessages, ['Validated users']);
    
    userHookRan = false;
    deptHookRan = false;
    
    const deptMessages = await api.resources.departments.process();
    assert.ok(!userHookRan);
    assert.ok(deptHookRan);
    assert.deepEqual(deptMessages, ['Validated departments']);
  });

  it('should pass resource options to handlers', async () => {
    const api = new Api({
      name: 'test-options',
      version: '1.0.0'
    });
    
    api.customize({
      implementers: {
        getSchema: async ({ options, resource }) => {
          return resource ? options.resources.schema : null;
        }
      }
    });
    
    api.addResource('users', {
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        }
      }
    });
    
    const schema = await api.resources.users.getSchema();
    assert.equal(schema.type, 'object');
    assert.ok(schema.properties.name);
  });
});